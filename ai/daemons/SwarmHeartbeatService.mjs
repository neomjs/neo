// Class-only file (#11058 split). Entry-point bootstrap (Neo + core/_export +
// InstanceManager) lives in the Orchestrator entry point (`ai/scripts/orchestrator-daemon.mjs`),
// which loads this class as the swarm-heartbeat lane (#11766 fold). `Neo.setupClass(SwarmHeartbeatService)`
// at file bottom works via `globalThis.Neo` populated by the entry-point bootstrap chain.
import {spawn}         from 'child_process';
import fs              from 'fs/promises';
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
import {checkSunsetted as checkSunsettedScript}     from '../scripts/checkSunsetted.mjs';
import {resumeHarness as resumeHarnessScript}       from '../scripts/resumeHarness.mjs';
import {checkAllAgentIdle as checkAllAgentIdleScript} from '../scripts/checkAllAgentIdle.mjs';
import {idleOutNudge as idleOutNudgeScript}         from '../scripts/idleOutNudge.mjs';
import {trioWakeCooldown as trioWakeCooldownScript} from '../scripts/trioWakeCooldown.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_IDENTITY         = '@neo-gemini-3-1-pro';

/**
 * @summary Neo-singleton swarm-heartbeat lane for the Phase 1/3 wake substrate.
 *
 * Folded into the Orchestrator daemon as a config-gated scheduled lane (#11766): the
 * Orchestrator owns the persistent process and the scheduler, calling `initAsync()` once
 * at start and `pulse()` once per cadence tick. This class is no longer a standalone
 * daemon — it has no self-scheduling loop and no entry-point wrapper of its own. The
 * Orchestrator's `runIfDue` lane provides the cadence gate and per-pulse failure
 * isolation that the old self-rescheduling loop used to provide.
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
 * **Where dual-mode script imports replace subprocess invocations** (#10795):
 * `checkSunsetted.mjs`, `resumeHarness.mjs`, `checkAllAgentIdle.mjs`, `idleOutNudge.mjs`,
 * and `trioWakeCooldown.mjs` now expose module entrypoints while preserving their CLI
 * wrappers for manual use. The lane calls those exports directly to avoid 2-5s Node
 * startup hops per pulse.
 *
 * @class Neo.ai.daemons.SwarmHeartbeatService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs              — the daemon this lane is folded into (#11766)
 * @see ai/scripts/checkSunsetted.mjs            — sunset detector (subprocess)
 * @see ai/scripts/resumeHarness.mjs             — fresh-session-spawn dispatcher (subprocess)
 * @see ai/scripts/wakeSafetyGate.mjs            — fail-closed safety gate (direct import)
 * @see ai/scripts/heartbeatLock.mjs             — concurrency-lock primitive (direct import)
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
         * Whether one-time async init has completed. Guards `initAsync()` against
         * re-running the LifecycleService / GraphService boot on a second call.
         * @member {Boolean} isInitialized_=false
         * @protected
         * @reactive
         */
        isInitialized_: false,
        /**
         * Identity this lane polls for (e.g. `@neo-gemini-3-1-pro`).
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
     * One-time async init for the swarm-heartbeat lane. Idempotent — a second call
     * while already initialized is a no-op. Boots the LifecycleService + GraphService
     * once so SQLite queries on subsequent `pulse()` cadence ticks run without
     * per-pulse init overhead. The Orchestrator owns the scheduler; this method does
     * NOT start a loop.
     * @param {Object} [options]
     * @param {String} [options.identity] Agent identity (defaults to NEO_AGENT_IDENTITY env or @neo-gemini-3-1-pro)
     * @param {Number} [options.pollIntervalMs] Pulse cadence in ms, used only for the prompt's elapsed-time label (defaults to POLL_INTERVAL env*1000 or 5min)
     * @returns {Promise<void>}
     */
    async initAsync({identity, pollIntervalMs} = {}) {
        if (this.isInitialized) {
            logger.debug('[SwarmHeartbeatService] Already initialized; initAsync() is a no-op.');
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

        this.isInitialized = true;
        logger.info(`[SwarmHeartbeatService] Initialized swarm-heartbeat lane for ${this.identity} (interval: ${this.pollIntervalMs}ms)`)
    }

    /**
     * Execute one heartbeat pulse. Preserves the step sequence of the retired
     * `swarm-heartbeat.sh#heartbeat_pulse` shell loop (folded into this lane per #11766):
     *
     *   0. Liveness touch (`touchLivenessFile()`) — runs BEFORE the lock check so a
     *      lock-skipped pulse still signals `daemonRunning` to `HealthService`, matching
     *      the shell loop's touch-before-lock ordering.
     *   1. Concurrency-lock skip (active lock = expensive work in flight, skip pulse;
     *      stale lock = clear and continue per #10319).
     *   2. TTL sweep (`MailboxService.sweepExpiredTasks` — direct call, no subprocess).
     *   3. Sunset detection via `checkSunsetted.mjs` direct export.
     *      - sunset=true + gate-open → fresh-session-spawn via `resumeHarness.mjs` direct export.
     *      - sunset=true + gate-closed → log + skip (no spawn).
     *      - recommended_action=idle_out_nudge + gate-open → `idleOutNudge.mjs`.
     *   4. All-agent-idle detection via `checkAllAgentIdle.mjs` direct export.
     *      - allIdle=true + gate-open → `trioWakeCooldown.mjs` direct export.
     *   5. Heartbeat-bypass detection: identities with push-capable subscriptions
     *      (mcp-notifications / a2a-webhook) skip the token-economy fast-path because
     *      they receive wakes via push.
     *   6. Token-economy gate: skip pulse if mailbox unread + open issues both zero.
     *   7. Tmux-inject pulse prompt to `$TMUX_SESSION` (preserved from shell shape).
     *
     * No try/finally: the Orchestrator lane executor wraps this call in its own
     * try/catch, so a single-pulse failure is isolated by the scheduler — it does not
     * need to self-reschedule.
     * @returns {Promise<void>}
     */
    async pulse() {
        // Step 0: liveness signal — touch before the lock check so a lock-skipped pulse
        // still updates the `heartbeat.alive` mtime `HealthService.daemonRunning` reads.
        await this.touchLivenessFile();

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

        // Step 3: Sunset detection (direct module export; CLI wrapper preserved for shell consumers).
        const sunsetJson = await this.checkSunsetted(this.identity);
        if (sunsetJson?.sunsetted) {
            if (!await this.checkGateOpen()) {
                const gateState = await this.readGate();
                logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping fresh-session-spawn for ${this.identity}. Sunset reason: ${sunsetJson.reason}. Gate reason: ${gateState.reason}`);
                return
            }
            logger.info(`[SwarmHeartbeatService] Phase 1 Recovery Triggered for ${this.identity}. Reason: ${sunsetJson.reason}`);
            await this.resumeHarness(
                this.identity,
                sunsetJson.reason || '',
                sunsetJson.originSessionId || '',
                sunsetJson.abandonedCount || 0
            );
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
            await this.idleOutNudge(this.identity);
            return
        }

        // Step 4: All-agent-idle detection. `checkAllAgentIdle.mjs` owns the
        // logical cycle id so the cooldown key remains stable across pulses.
        const allIdleJson = await this.checkAllAgentIdle();
        if (allIdleJson?.allIdle) {
            logger.info(`[SwarmHeartbeatService] AllAgentIdle detected: ${JSON.stringify(allIdleJson)}`);
            if (!await this.checkGateOpen()) {
                const gateState = await this.readGate();
                logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping trio wake dispatch. Gate reason: ${gateState.reason}`)
            } else {
                await this.trioWakeCooldown(allIdleJson)
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
    }

    /**
     * @summary Touch the heartbeat-liveness file `HealthService` reads for `daemonRunning`.
     *
     * Restores the producer side of the `.neo-ai-data/wake-daemon/heartbeat.alive` mtime
     * contract that `swarm-heartbeat.sh` owned before the #11766 fold (#10783). Path
     * resolution mirrors `HealthService.heartbeatAlivePath()` — the `NEO_HEARTBEAT_ALIVE_PATH`
     * override, else the canonical path. A touch failure is swallowed: a missing liveness
     * signal must never abort a pulse.
     * @protected
     * @returns {Promise<void>}
     */
    async touchLivenessFile() {
        const alivePath = process.env.NEO_HEARTBEAT_ALIVE_PATH
            || path.resolve(__dirname, '../../.neo-ai-data/wake-daemon/heartbeat.alive');
        const now = new Date();
        try {
            await fs.utimes(alivePath, now, now)
        } catch (err) {
            if (err.code === 'ENOENT') {
                try {
                    await fs.mkdir(path.dirname(alivePath), {recursive: true});
                    await fs.writeFile(alivePath, '')
                } catch (writeErr) {
                    logger.error('[SwarmHeartbeatService] heartbeat-liveness touch failed:', writeErr.message)
                }
            } else {
                logger.error('[SwarmHeartbeatService] heartbeat-liveness touch failed:', err.message)
            }
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
     * Test-stubbable seam over `checkSunsetted.mjs`'s dual-mode module export.
     * @param {String} identity
     * @returns {Promise<Object|null>}
     * @protected
     */
    async checkSunsetted(identity) {
        try {
            return await checkSunsettedScript(identity)
        } catch (err) {
            logger.error('[SwarmHeartbeatService] checkSunsetted.mjs failed:', err.message);
            return null
        }
    }

    /**
     * Test-stubbable seam over `resumeHarness.mjs`'s dual-mode module export.
     * @param {String} identity
     * @param {String} reason
     * @param {String} originSessionId
     * @param {Number} abandonedCount
     * @returns {Promise<void>}
     * @protected
     */
    async resumeHarness(identity, reason, originSessionId, abandonedCount) {
        return resumeHarnessScript(identity, reason, originSessionId, abandonedCount)
    }

    /**
     * Test-stubbable seam over `idleOutNudge.mjs`'s dual-mode module export.
     * @param {String} identity
     * @returns {Promise<void>}
     * @protected
     */
    async idleOutNudge(identity) {
        return idleOutNudgeScript(identity)
    }

    /**
     * Test-stubbable seam over `checkAllAgentIdle.mjs`'s dual-mode module export.
     * @returns {Promise<Object|null>}
     * @protected
     */
    async checkAllAgentIdle() {
        try {
            return await checkAllAgentIdleScript()
        } catch (err) {
            logger.error('[SwarmHeartbeatService] checkAllAgentIdle.mjs failed:', err.message);
            return null
        }
    }

    /**
     * Test-stubbable seam over `trioWakeCooldown.mjs`'s dual-mode module export.
     * @param {Object} signal
     * @returns {Promise<Object|void>}
     * @protected
     */
    async trioWakeCooldown(signal) {
        return trioWakeCooldownScript(signal)
    }

    /**
     * SQLite query: count of unread MESSAGE-label nodes addressed to the polled identity.
     * Direct DMs use MESSAGE.properties.readAt; #11029 broadcasts use per-recipient
     * DELIVERED_TO.readAt edges, with a legacy fallback for old broadcasts lacking receipts.
     * @returns {Promise<Number>}
     * @protected
     */
    async getUnreadCount() {
        try {
            const db = GraphService.db.storage.db;
            const stmt = db.prepare(`
                WITH unread_messages AS (
                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_TO'
                      AND e.target = ?
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(n.data, '$.properties.readAt') IS NULL

                    UNION

                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'DELIVERED_TO'
                      AND e.target = ?
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(e.data, '$.properties.readAt') IS NULL

                    UNION

                    SELECT n.id AS messageId
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_TO'
                      AND e.target = 'AGENT:*'
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(n.data, '$.properties.readAt') IS NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM Edges de
                          WHERE de.source = n.id AND de.type = 'DELIVERED_TO'
                      )
                )
                SELECT count(DISTINCT messageId) as count
                FROM unread_messages
            `);
            const row = stmt.get(this.identity, this.identity);
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
     * Preserved for external command wrappers and any future CLI-only utilities.
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

export default Neo.setupClass(SwarmHeartbeatService);

export {HEARTBEAT_LOCK_PATH, DEFAULT_POLL_INTERVAL_MS, DEFAULT_IDENTITY};
