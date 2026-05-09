// IMPORTANT: `Neo` MUST be imported BEFORE any module that uses `Neo.gatekeep()` /
// `Neo.setupClass()` at module-load time (e.g. `src/core/Compare.mjs`, transitively
// pulled in via Base / LifecycleService / GraphService). Without this prelude the script
// crashes at module-load with `ReferenceError: Neo is not defined` (regression originally
// surfaced in `sweepExpiredTasks.mjs` and codified there). Ordering matters — these two
// side-effect imports must run first to populate `globalThis.Neo`.
import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';

import {spawn}         from 'child_process';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../src/core/Base.mjs';
import {
    Memory_GraphService     as GraphService,
    Memory_LifecycleService as LifecycleService
}                    from '../services.mjs';
import MailboxService from '../services/memory-core/MailboxService.mjs';
import logger        from '../mcp/server/memory-core/logger.mjs';
import {
    isGateOpen,
    readGateState
} from '../scripts/wakeSafetyGate.mjs';
import {
    inspectHeartbeatLock,
    releaseHeartbeatLock,
    HEARTBEAT_LOCK_PATH
} from '../scripts/heartbeatLock.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_IDENTITY         = '@neo-gemini-3-1-pro';

/**
 * @summary Neo-singleton heartbeat daemon for the Phase 1/3 wake substrate.
 *
 * Replaces the bash-shape `ai/scripts/swarm-heartbeat.sh#heartbeat_pulse` loop with the
 * canonical Neo-class shape that already houses `DreamService` and the 10+ services under
 * `ai/daemons/services/`. The bash script remains in place for the developer-interactive
 * agent-wrapper case (`AGENT_CMD="claude"` wrapper loop, ctrl-C-bound to operator session);
 * this singleton handles the **persistent-process** case where launchd / systemd keeps the
 * daemon alive across operator sleep + system reboot so autonomous recovery can fire.
 *
 * **Where direct module imports replace subprocess invocations** (#10789 AC3, "where feasible"):
 *
 *   - `MailboxService.sweepExpiredTasks()` — the expired-task sweep was previously a `node
 *     ai/scripts/sweepExpiredTasks.mjs` subprocess; calling MailboxService directly removes the
 *     ~2s Node-startup hop on every poll cycle.
 *   - `wakeSafetyGate.mjs` exports (`isGateOpen`, `readGateState`) — the bash `if ! node
 *     wakeSafetyGate.mjs check` shell-out is replaced with direct function calls.
 *   - `heartbeatLock.mjs` exports (`inspectHeartbeatLock`, `releaseHeartbeatLock`) — the bash
 *     stat-based concurrency-lock check is replaced with the JS implementation already shared
 *     with the producer side (#10319 `withHeartbeatLock`).
 *
 * **Where subprocess invocation is preserved** (out-of-scope for v1; follow-up tracked as
 * #10795): `checkSunsetted.mjs`, `resumeHarness.mjs`, `checkAllAgentIdle.mjs`,
 * `idleOutNudge.mjs`, `trioWakeCooldown.mjs` are CLI-shape (no exported function entrypoint)
 * and converting each to dual-mode (CLI + module-export) is sibling work. Their subprocess
 * cost (~2-5s per cycle, fires every 5min) is operationally tolerable.
 *
 * **Persistent-process management:** the file's bottom self-invoke pattern lets launchd /
 * systemd run `node ai/daemons/SwarmHeartbeatService.mjs` directly. SIGTERM / SIGINT trigger
 * a clean stop so operator `launchctl bootout` doesn't leave dangling timers.
 *
 * **Coexistence with `swarm-heartbeat.sh`:** the singleton and the shell wrapper share the
 * concurrency lock at `.neo-ai-data/heartbeat-concurrency.lock` (#10319), but operators must
 * not run BOTH at the same time — the lock prevents *agent-work-overlapping-with-pulse*, not
 * *two pulse producers*. Operator-territory: pick one or the other.
 *
 * @class Neo.ai.daemons.SwarmHeartbeatService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/swarm-heartbeat.sh           — sibling bash daemon (developer-interactive shape, preserved per AC10)
 * @see ai/scripts/checkSunsetted.mjs           — sunset detector (subprocess)
 * @see ai/scripts/resumeHarness.mjs            — fresh-session-spawn dispatcher (subprocess)
 * @see ai/scripts/wakeSafetyGate.mjs           — fail-closed safety gate (direct import)
 * @see ai/scripts/heartbeatLock.mjs            — concurrency-lock primitive (direct import)
 * @see learn/agentos/wake-substrate/PersistentProcessManagement.md
 */
class SwarmHeartbeatService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.SwarmHeartbeatService'
         * @protected
         */
        className: 'Neo.ai.daemons.SwarmHeartbeatService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Whether the poll loop is running.
         * @member {Boolean} isPolling_=false
         * @protected
         * @reactive
         */
        isPolling_: false,
        /**
         * Active setTimeout handle for the next pulse; null when not scheduled.
         * @member {Object|null} pollHandle_=null
         * @protected
         * @reactive
         */
        pollHandle_: null,
        /**
         * Identity this daemon polls for (e.g. `@neo-gemini-3-1-pro`).
         * @member {String|null} identity_=null
         * @protected
         * @reactive
         */
        identity_: null,
        /**
         * Interval between pulses in milliseconds.
         * @member {Number} pollIntervalMs_=300000
         * @protected
         * @reactive
         */
        pollIntervalMs_: DEFAULT_POLL_INTERVAL_MS
    }

    /**
     * Start the heartbeat poll loop. Idempotent — calling start() while already
     * polling is a no-op. Boots the LifecycleService + GraphService once before
     * scheduling the first pulse so SQLite queries on subsequent cycles can run
     * without per-cycle init overhead.
     * @param {Object} [options]
     * @param {String} [options.identity] Agent identity (defaults to NEO_AGENT_IDENTITY env or @neo-gemini-3-1-pro)
     * @param {Number} [options.pollIntervalMs] Poll interval in ms (defaults to POLL_INTERVAL env*1000 or 5min)
     * @returns {Promise<void>}
     */
    async start({identity, pollIntervalMs} = {}) {
        if (this.isPolling) {
            logger.debug('[SwarmHeartbeatService] Already polling; start() is a no-op.');
            return;
        }

        this.identity = identity
            || process.env.NEO_AGENT_IDENTITY
            || DEFAULT_IDENTITY;

        const envInterval = parseInt(process.env.POLL_INTERVAL, 10);
        this.pollIntervalMs = pollIntervalMs
            || (Number.isFinite(envInterval) && envInterval > 0 ? envInterval * 1000 : DEFAULT_POLL_INTERVAL_MS);

        await LifecycleService.initAsync();
        await GraphService.initAsync();

        this.isPolling = true;
        logger.info(`[SwarmHeartbeatService] Starting heartbeat for ${this.identity} (interval: ${this.pollIntervalMs}ms)`);

        this.scheduleNext()
    }

    /**
     * Stop the heartbeat poll loop. Idempotent. Cancels any pending setTimeout
     * so a clean SIGTERM under launchd doesn't leave timers wedging the event loop.
     * @returns {void}
     */
    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null
        }
        this.isPolling = false;
        logger.info('[SwarmHeartbeatService] Heartbeat stopped.')
    }

    /**
     * Schedule the next pulse. Called after each pulse completes (success or failure)
     * so a single thrown error doesn't break the loop.
     * @protected
     */
    scheduleNext() {
        if (!this.isPolling) return;
        this.pollHandle = setTimeout(() => this.pulse().catch(err => {
            logger.error('[SwarmHeartbeatService] Pulse threw uncaught error:', err);
            this.scheduleNext()
        }), this.pollIntervalMs)
    }

    /**
     * Execute one heartbeat pulse. Mirrors `swarm-heartbeat.sh#heartbeat_pulse` step-for-step:
     *
     *   1. Concurrency-lock skip (active lock = expensive work in flight, skip pulse;
     *      stale lock = clear and continue per #10319).
     *   2. TTL sweep (`MailboxService.sweepExpiredTasks` — direct call, no subprocess).
     *   3. Sunset detection via `checkSunsetted.mjs` subprocess.
     *      - sunset=true + gate-open → fresh-session-spawn via `resumeHarness.mjs`.
     *      - sunset=true + gate-closed → log + skip (no spawn).
     *      - recommended_action=idle_out_nudge + gate-open → `idleOutNudge.mjs`.
     *   4. All-agent-idle detection via `checkAllAgentIdle.mjs`.
     *      - allIdle=true + gate-open → `trioWakeCooldown.mjs`.
     *   5. Heartbeat-bypass detection: identities with push-capable subscriptions
     *      (mcp-notifications / a2a-webhook) skip the token-economy fast-path because
     *      they receive wakes via push.
     *   6. Token-economy gate: skip pulse if mailbox unread + open issues both zero.
     *   7. Tmux-inject pulse prompt to `$TMUX_SESSION` (preserved from shell shape).
     *
     * Wraps the entire body in try/finally so `scheduleNext()` always fires — a
     * single-cycle failure must not stop the daemon.
     * @returns {Promise<void>}
     */
    async pulse() {
        try {
            const lockState = await this.checkHeartbeatLock();
            if (lockState.active) {
                return
            }
            if (lockState.stale) {
                logger.warn(`[SwarmHeartbeatService] Clearing stale concurrency lock (${lockState.ageMs}ms old)`);
                await this.clearHeartbeatLock()
            }

            // Step 2: TTL sweep — direct MailboxService call (was subprocess in bash shape).
            // Substrate maintenance: fires every cycle regardless of token-economy gate.
            let expired = 0;
            try {
                const result = await this.sweepExpiredTasks();
                expired = result?.sweptCount || 0;
                if (expired > 0) {
                    logger.info(`[SwarmHeartbeatService] sweep: ${expired} task(s) transitioned to Expired`)
                }
            } catch (err) {
                logger.error('[SwarmHeartbeatService] sweepExpiredTasks failed:', err)
            }

            // Step 3: Sunset detection (subprocess — checkSunsetted.mjs is CLI-shape).
            const sunsetJson = await this.runScriptJson('checkSunsetted.mjs', [this.identity]);
            if (sunsetJson?.sunsetted) {
                if (!await this.checkGateOpen()) {
                    const gateState = await this.readGate();
                    logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping fresh-session-spawn for ${this.identity}. Sunset reason: ${sunsetJson.reason}. Gate reason: ${gateState.reason}`);
                    return
                }
                logger.info(`[SwarmHeartbeatService] Phase 1 Recovery Triggered for ${this.identity}. Reason: ${sunsetJson.reason}`);
                await this.runScript('resumeHarness.mjs', [
                    this.identity,
                    sunsetJson.reason || '',
                    sunsetJson.originSessionId || '',
                    String(sunsetJson.abandonedCount || 0)
                ]);
                return
            }

            const recommendedAction = sunsetJson?.recommended_action || 'no_action';
            if (recommendedAction === 'idle_out_nudge') {
                if (!await this.checkGateOpen()) {
                    const gateState = await this.readGate();
                    logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping idle-out nudge for ${this.identity}. Gate reason: ${gateState.reason}`);
                    return
                }
                logger.info(`[SwarmHeartbeatService] Idle-out nudge triggered for ${this.identity}`);
                await this.runScript('idleOutNudge.mjs', [this.identity]);
                return
            }

            // Step 4: All-agent-idle detection (subprocess).
            const cycleId = String(Math.floor(Date.now() / 1000));
            const allIdleJson = await this.runScriptJson('checkAllAgentIdle.mjs', [cycleId]);
            if (allIdleJson?.allIdle) {
                logger.info(`[SwarmHeartbeatService] AllAgentIdle detected: ${JSON.stringify(allIdleJson)}`);
                if (!await this.checkGateOpen()) {
                    const gateState = await this.readGate();
                    logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping trio wake dispatch. Gate reason: ${gateState.reason}`)
                } else {
                    await this.runScript('trioWakeCooldown.mjs', [JSON.stringify(allIdleJson)])
                }
            }

            // Step 5: Heartbeat-bypass detection.
            if (await this.isPushCapable(this.identity)) {
                return
            }

            // Step 6: Token-economy gate. Skip pulse-injection if no actionable state.
            const unread = await this.getUnreadCount();
            const issues = await this.getIssuesCount();
            if (unread === 0 && issues === 0) {
                return
            }

            // Step 7: Tmux-inject the pulse prompt.
            const minutes = Math.round(this.pollIntervalMs / 60000);
            let prompt = `[SYSTEM HEARTBEAT] Last wake: T-${minutes}min. Mailbox unread: ${unread}. Open issues assigned: ${issues}.`;
            if (expired > 0) {
                prompt += ` Tasks expired this cycle: ${expired}.`
            }
            await this.injectTmux(prompt)
        } finally {
            this.scheduleNext()
        }
    }

    /**
     * Test-stubbable seam over the module-level `inspectHeartbeatLock` import. ES module
     * bindings can't be reassigned at import-site, so unit tests stub via instance-method
     * override (`this.checkHeartbeatLock = async () => ({...})`). Production path is a
     * direct passthrough.
     * @returns {Promise<{active: Boolean, stale: Boolean, ageMs: Number|null}>}
     * @protected
     */
    async checkHeartbeatLock() {
        return inspectHeartbeatLock()
    }

    /**
     * Test-stubbable seam over `releaseHeartbeatLock`.
     * @returns {Promise<void>}
     * @protected
     */
    async clearHeartbeatLock() {
        return releaseHeartbeatLock()
    }

    /**
     * Test-stubbable seam over `MailboxService.sweepExpiredTasks`.
     * @returns {Promise<{success: Boolean, sweptCount: Number}>}
     * @protected
     */
    async sweepExpiredTasks() {
        return MailboxService.sweepExpiredTasks()
    }

    /**
     * Test-stubbable seam over `wakeSafetyGate.isGateOpen`.
     * @returns {Promise<Boolean>}
     * @protected
     */
    async checkGateOpen() {
        return isGateOpen()
    }

    /**
     * Test-stubbable seam over `wakeSafetyGate.readGateState`.
     * @returns {Promise<{state: String, reason: String, trippedAt: ?String, trippedBy: ?String}>}
     * @protected
     */
    async readGate() {
        return readGateState()
    }

    /**
     * SQLite query: count of unread MESSAGE-label nodes addressed to the polled identity
     * or AGENT:* broadcast. Mirrors `swarm-heartbeat.sh#get_unread_count` 1:1.
     * @returns {Promise<Number>}
     * @protected
     */
    async getUnreadCount() {
        try {
            const db = GraphService.db.storage.db;
            const stmt = db.prepare(`
                SELECT count(DISTINCT n.id) as count
                FROM Nodes n
                JOIN Edges e ON n.id = e.source AND e.type = 'SENT_TO'
                WHERE json_extract(n.data, '$.label') = 'MESSAGE'
                  AND json_extract(n.data, '$.properties.readAt') IS NULL
                  AND e.target IN (?, 'AGENT:*')
            `);
            const row = stmt.get(this.identity);
            return row?.count || 0
        } catch (err) {
            logger.error('[SwarmHeartbeatService] getUnreadCount failed:', err);
            return 0
        }
    }

    /**
     * Issue-count via `gh issue list --assignee @me`. Subprocess — gh is the only
     * authoritative source for `@me`-resolution; not feasible to inline.
     * @returns {Promise<Number>}
     * @protected
     */
    async getIssuesCount() {
        try {
            const output = await this.runCmd('gh', ['issue', 'list', '--assignee', '@me', '--state', 'open', '--json', 'number']);
            const parsed = JSON.parse(output || '[]');
            return Array.isArray(parsed) ? parsed.length : 0
        } catch {
            return 0
        }
    }

    /**
     * Check whether the polled identity has a push-capable subscription
     * (`harnessTarget IN ('mcp-notifications', 'a2a-webhook')` and not `degraded`).
     * @param {String} identity
     * @returns {Promise<Boolean>}
     * @protected
     */
    async isPushCapable(identity) {
        try {
            const db = GraphService.db.storage.db;
            const stmt = db.prepare(`
                SELECT count(*) as count
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.harnessTarget') IN ('mcp-notifications', 'a2a-webhook')
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
            `);
            const row = stmt.get(identity);
            return (row?.count || 0) > 0
        } catch (err) {
            logger.error('[SwarmHeartbeatService] isPushCapable query failed:', err);
            return false
        }
    }

    /**
     * Inject the pulse prompt into the configured tmux session. No-op when tmux
     * is not running OR `$TMUX_SESSION` doesn't exist.
     * @param {String} prompt
     * @returns {Promise<void>}
     * @protected
     */
    async injectTmux(prompt) {
        const session = process.env.TMUX_SESSION || 'neo-agent';
        try {
            // tmux has-session exits 0 if session exists, 1 otherwise
            await this.runCmd('tmux', ['has-session', '-t', session]);
            await this.runCmd('tmux', ['send-keys', '-t', session, prompt, 'C-m'])
        } catch {
            // Session absent or tmux unavailable — silently no-op (matches shell behavior)
        }
    }

    /**
     * Spawn a node subprocess for the named script and return its stdout.
     * Used for CLI-shape recovery scripts that haven't been refactored to
     * dual-mode export (#10795).
     * @param {String} scriptName Name of script under `ai/scripts/`
     * @param {String[]} [args=[]]
     * @returns {Promise<String>} stdout content
     * @protected
     */
    async runScript(scriptName, args = []) {
        const scriptPath = path.resolve(__dirname, '../scripts', scriptName);
        return this.runCmd('node', [scriptPath, ...args])
    }

    /**
     * Spawn a node subprocess for the named script, parse its stdout as JSON,
     * and return the parsed object (or null on parse failure).
     * @param {String} scriptName
     * @param {String[]} [args=[]]
     * @returns {Promise<Object|null>}
     * @protected
     */
    async runScriptJson(scriptName, args = []) {
        try {
            const stdout = await this.runScript(scriptName, args);
            if (!stdout || !stdout.trim()) return null;
            return JSON.parse(stdout.trim())
        } catch (err) {
            logger.error(`[SwarmHeartbeatService] ${scriptName} failed:`, err.message);
            return null
        }
    }

    /**
     * Generic subprocess runner. Resolves with stdout on exit code 0; rejects otherwise.
     * Stderr is captured for diagnostics but not parsed.
     * @param {String} command
     * @param {String[]} [args=[]]
     * @returns {Promise<String>}
     * @protected
     */
    runCmd(command, args = []) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', chunk => { stdout += chunk.toString() });
            child.stderr.on('data', chunk => { stderr += chunk.toString() });
            child.on('error', reject);
            child.on('exit', code => {
                if (code === 0) {
                    resolve(stdout)
                } else {
                    reject(new Error(`${command} exited with code ${code}: ${stderr.trim() || '(no stderr)'}`))
                }
            })
        })
    }
}

const SwarmHeartbeatServiceSingleton = Neo.setupClass(SwarmHeartbeatService);
export default SwarmHeartbeatServiceSingleton;

// Self-invoke entrypoint (#10789 AC4): `node ai/daemons/SwarmHeartbeatService.mjs` under
// launchd / systemd directly drives the daemon. SIGTERM / SIGINT trigger a clean stop so
// `launchctl bootout` / `systemctl stop` don't leave dangling timers. The setTimeout chain
// keeps the event loop alive between pulses; no explicit keepalive primitive needed.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    const cleanShutdown = signal => {
        logger.info(`[SwarmHeartbeatService] Received ${signal}; stopping.`);
        SwarmHeartbeatServiceSingleton.stop();
        process.exit(0)
    };
    process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
    process.on('SIGINT',  () => cleanShutdown('SIGINT'));

    SwarmHeartbeatServiceSingleton.start().catch(err => {
        logger.error('[SwarmHeartbeatService] Daemon start failed:', err);
        process.exit(1)
    })
}

export {HEARTBEAT_LOCK_PATH, DEFAULT_POLL_INTERVAL_MS, DEFAULT_IDENTITY};
