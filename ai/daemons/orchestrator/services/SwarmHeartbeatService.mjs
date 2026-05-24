// Class-only file. Entry-point bootstrap (Neo + core/_export + InstanceManager)
// lives in the Orchestrator entry point, which loads this class as its
// swarm-heartbeat lane. `Neo.setupClass(SwarmHeartbeatService)` at file bottom
// works via `globalThis.Neo` populated by the entry-point bootstrap chain.
import {spawn}         from 'child_process';
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../../src/core/Base.mjs';
import {
    Memory_GraphService     as GraphService,
    Memory_LifecycleService as LifecycleService
}                    from '../../../services.mjs';
import MailboxService from '../../../services/memory-core/MailboxService.mjs';
import logger        from '../../../mcp/server/memory-core/logger.mjs';
import {
    isGateOpen,
    readGateState
} from '../../../scripts/lifecycle/wakeSafetyGate.mjs';
import {
    inspectHeartbeatLock,
    releaseHeartbeatLock,
    HEARTBEAT_LOCK_PATH
} from '../../../scripts/lifecycle/heartbeatLock.mjs';
import {checkSunsetted as checkSunsettedScript}     from '../../../scripts/lifecycle/checkSunsetted.mjs';
import {
    normalizeAgentIdentityNodeId,
    resumeHarness as resumeHarnessScript
} from '../../../scripts/lifecycle/resumeHarness.mjs';
import {checkAllAgentIdle as checkAllAgentIdleScript} from '../../../scripts/lifecycle/checkAllAgentIdle.mjs';
import {idleOutNudge as idleOutNudgeScript}         from '../../../scripts/lifecycle/idleOutNudge.mjs';
import {trioWakeCooldown as trioWakeCooldownScript} from '../../../scripts/lifecycle/trioWakeCooldown.mjs';
import {
    resolveTargets        as resolveHeartbeatTargets,
    VALID_TARGET_SOURCES
} from '../scheduling/swarmHeartbeat.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const PUSH_CAPABLE_TARGETS     = Object.freeze(['mcp-notifications', 'a2a-webhook', 'bridge-daemon']);

/**
 * @summary Neo-singleton swarm-heartbeat lane for Agent OS wake maintenance.
 *
 * The Orchestrator owns the persistent process and scheduler. It awaits
 * `service.ready()` once during startup and calls `pulse()` on cadence ticks.
 * This class has no self-scheduling loop and no entry-point wrapper of its own;
 * the Orchestrator cadence lane owns timing and per-pulse failure isolation.
 *
 * Direct module imports replace subprocess invocations where the imported
 * primitive already owns a stable programmatic API:
 *
 *   - `MailboxService.sweepExpiredTasks()` — the expired-task sweep was previously a `node
 *     ai/scripts/lifecycle/sweepExpiredTasks.mjs` subprocess; calling MailboxService directly removes the
 *     ~2s Node-startup hop on every poll cycle.
 *   - `wakeSafetyGate.mjs` exports (`isGateOpen`, `readGateState`) — the bash `if ! node
 *     wakeSafetyGate.mjs check` shell-out is replaced with direct function calls.
 *   - `heartbeatLock.mjs` exports (`inspectHeartbeatLock`, `releaseHeartbeatLock`) — the bash
 *     stat-based concurrency-lock check is replaced with the shared JS implementation.
 *
 * Dual-mode lifecycle scripts keep their CLI wrappers for manual use while
 * exposing module entrypoints for the heartbeat lane:
 * `checkSunsetted.mjs`, `resumeHarness.mjs`, `checkAllAgentIdle.mjs`, `idleOutNudge.mjs`,
 * and `trioWakeCooldown.mjs` now expose module entrypoints while preserving their CLI
 * wrappers for manual use. The lane calls those exports directly to avoid 2-5s Node
 * startup hops per pulse.
 *
 * `initAsync()` is framework-owned. External callers use `await service.ready()`
 * to wait for initialization rather than invoking lifecycle hooks directly.
 *
 * Singleton scope is intentional: initialization only waits for peer services,
 * while `identity` and `pollIntervalMs` are pulse-time runtime config. The
 * Orchestrator sets those reactive configs before awaiting readiness. There is
 * one Orchestrator daemon per host, so the service-to-parent relationship does
 * not share mutable pulse state across multiple scheduler owners.
 *
 * @class Neo.ai.daemons.SwarmHeartbeatService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs                        — daemon that owns this scheduled lane
 * @see ai/scripts/lifecycle/checkSunsetted.mjs            — sunset detector (subprocess)
 * @see ai/scripts/lifecycle/resumeHarness.mjs             — fresh-session-spawn dispatcher (subprocess)
 * @see ai/scripts/lifecycle/wakeSafetyGate.mjs            — fail-closed safety gate (direct import)
 * @see ai/scripts/lifecycle/heartbeatLock.mjs             — concurrency-lock primitive (direct import)
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
         * Primary identity this lane pulses for. Consumed by the resolver as
         * `selfIdentity` for `'self'` and `'active-subscribers'` sources. Parent
         * (Orchestrator) sets this via reactive config assignment before
         * `await service.ready()` in `start()`. `beforeSetIdentity` normalizes via
         * `normalizeAgentIdentityNodeId` so the slot holds canonical `@<identity>`
         * form; null/empty values store `null` so external workspaces with no
         * configured identity surface the misconfiguration through the resolver's
         * disables-with-log path rather than silently inheriting a default.
         * @member {String|null} identity_=null
         * @reactive
         */
        identity_: null,
        /**
         * Interval between pulses in milliseconds. Parent (Orchestrator) sets this
         * via reactive config assignment to the orchestrator's
         * `swarmHeartbeatIntervalMs` value, which already honors the
         * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS` env override.
         * @member {Number} pollIntervalMs_=300000
         * @reactive
         */
        pollIntervalMs_: DEFAULT_POLL_INTERVAL_MS,
        /**
         * Target-resolver source enum consumed by `getPulseIdentities()` per pulse.
         * Controls which identity set the lane pulses for. `'self'` (default) is
         * deployment-portable — external workspaces pulse only the harness owner.
         * `'active-local-team'` reads `identityRoots` (team profile). `'active-subscribers'`
         * unions self with active `WAKE_SUBSCRIPTION` identities. `'disabled'` skips
         * all per-identity pulse work (substrate maintenance still runs). Parent
         * (Orchestrator) sets this via reactive assignment from
         * `AiConfig.orchestrator.swarmHeartbeat.targetSource` (env override
         * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`). Invalid values coerce
         * to `null` via `beforeSetTargetSource`; the resolver then applies its own
         * `'self'` fallback. See {@link VALID_TARGET_SOURCES}.
         * @member {String|null} targetSource_=null
         * @reactive
         */
        targetSource_: null,
        /**
         * Explicit identity list — top-of-precedence resolver override. When set and
         * non-empty, the resolver bypasses `targetSource` and pulses these targets
         * verbatim (post-normalization). Parent (Orchestrator) sources this from
         * `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
         * Empty arrays and non-arrays coerce to `null` via `beforeSetExplicitTargets`;
         * the resolver then falls through to `targetSource` semantics.
         * @member {String[]|null} explicitTargets_=null
         * @reactive
         */
        explicitTargets_: null
    }

    /**
     * Normalizes identity to canonical `@<identity>` form. Returns `null` for
     * empty values so unconfigured deployments surface the misconfiguration via
     * the resolver's disables-with-log path rather than silently inheriting a
     * maintainer identity. External operators must set `NEO_AGENT_IDENTITY` (or
     * `swarmHeartbeat.targetSource: 'disabled'`) to activate pulses.
     * @param {String|null} value
     * @returns {String|null}
     */
    beforeSetIdentity(value) {
        if (!value) return null;
        return normalizeAgentIdentityNodeId(value);
    }

    /**
     * Validates `targetSource` against {@link VALID_TARGET_SOURCES}. Invalid values
     * coerce to `null` (+ warn); the resolver then applies its own 'self' fallback.
     * Keeping the coercion at config-set time means downstream `getPulseIdentities()`
     * sees only validated values + the resolver's `default:` branch is reachable only
     * via direct programmatic misuse, not via operator config.
     * @param {String|null} value
     * @returns {String|null}
     */
    beforeSetTargetSource(value) {
        if (value === null || value === undefined || value === '') return null;
        if (!VALID_TARGET_SOURCES.includes(value)) {
            logger.warn(`[SwarmHeartbeatService] Invalid targetSource '${value}' (valid: ${VALID_TARGET_SOURCES.join('|')}); coercing to null`);
            return null;
        }
        return value;
    }

    /**
     * Normalizes `explicitTargets` to canonical `@<identity>` form. Empty arrays and
     * non-arrays coerce to `null` so the resolver falls through to `targetSource`
     * semantics. Per-element normalization mirrors `beforeSetIdentity` so the slot
     * stores invariant canonical form.
     * @param {String[]|null} value
     * @returns {String[]|null}
     */
    beforeSetExplicitTargets(value) {
        if (!Array.isArray(value) || value.length === 0) return null;
        const out = value.map(normalizeAgentIdentityNodeId).filter(Boolean);
        return out.length > 0 ? out : null;
    }

    /**
     * One-time async init triggered by Neo.create() framework lifecycle.
     * Identity-agnostic: awaits peer-service readiness (LifecycleService +
     * GraphService) so SQLite queries on subsequent `pulse()` cadence ticks
     * run without per-pulse init overhead. External callers use
     * `await service.ready()` to wait for completion rather than calling
     * lifecycle hooks directly.
     *
     * Note: `this.identity` / `this.pollIntervalMs` are NOT read here — they
     * are pulse-time runtime config the parent (Orchestrator) sets before
     * `await service.ready()` in `start()`. `pulse()` reads them per tick.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await LifecycleService.ready();
        await GraphService.ready()
    }

    /**
     * Execute one heartbeat pulse. The step order preserves the established
     * heartbeat contract while running inside the Orchestrator scheduler:
     *
     *   0. Liveness touch (`touchLivenessFile()`) — runs BEFORE the lock check so a
     *      lock-skipped pulse still signals `daemonRunning` to `HealthService`, matching
     *      the shell loop's touch-before-lock ordering.
     *   1. Concurrency-lock skip (active lock = expensive work in flight, skip pulse;
     *      stale lock = clear and continue).
     *   2. TTL sweep (`MailboxService.sweepExpiredTasks` — direct call, no subprocess).
     *   3. Sunset detection via `checkSunsetted.mjs` direct export.
     *      - sunset=true + gate-open → fresh-session-spawn via `resumeHarness.mjs` direct export.
     *      - sunset=true + gate-closed → log + skip (no spawn).
     *      - recommended_action=idle_out_nudge + gate-open → `idleOutNudge.mjs`.
     *      - runs for the primary identity plus every active WAKE_SUBSCRIPTION
     *        identity, so Codex/Claude/Gemini routes are monitored by subscription
     *        reality rather than by the Orchestrator process owner's env var.
     *   4. All-agent-idle detection via `checkAllAgentIdle.mjs` direct export.
     *      - allIdle=true + gate-open → `trioWakeCooldown.mjs` direct export.
     *   5. Heartbeat-bypass detection: identities with push-capable subscriptions
     *      (mcp-notifications / a2a-webhook / bridge-daemon) skip the token-economy fast-path because
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

        // Step 3: Sunset / idle-out detection (direct module exports; CLI wrappers preserved for shell consumers).
        const pulseIdentities = await this.getPulseIdentities();
        for (const identity of pulseIdentities) {
            const sunsetJson = await this.checkSunsetted(identity);
            if (sunsetJson?.sunsetted) {
                if (!await this.checkGateOpen()) {
                    const gateState = await this.readGate();
                    logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping fresh-session-spawn for ${identity}. Sunset reason: ${sunsetJson.reason}. Gate reason: ${gateState.reason}`);
                    continue
                }
                logger.info(`[SwarmHeartbeatService] Phase 1 Recovery Triggered for ${identity}. Reason: ${sunsetJson.reason}`);
                await this.resumeHarness(
                    identity,
                    sunsetJson.reason || '',
                    sunsetJson.originSessionId || '',
                    sunsetJson.abandonedCount || 0
                );
                continue
            }

            const recommendedAction = sunsetJson?.recommended_action || 'no_action';
            if (recommendedAction === 'idle_out_nudge') {
                if (!await this.checkGateOpen()) {
                    const gateState = await this.readGate();
                    logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping idle-out nudge for ${identity}. Gate reason: ${gateState.reason}`);
                    continue
                }
                logger.info(`[SwarmHeartbeatService] Idle-out nudge triggered for ${identity}`);
                await this.idleOutNudge(identity)
            }
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
     * Produces the `.neo-ai-data/wake-daemon/heartbeat.alive` mtime signal used by
     * `HealthService`. Path resolution mirrors `HealthService.heartbeatAlivePath()`:
     * `NEO_HEARTBEAT_ALIVE_PATH` override first, then the canonical path. A touch
     * failure is swallowed because a missing liveness signal must never abort a pulse.
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
     * @summary Resolves the per-pulse identity set via the {@link resolveHeartbeatTargets} resolver.
     *
     * Delegates to the pure-function resolver in `scheduling/swarmHeartbeat.mjs`, which
     * consumes the reactive `targetSource` and `explicitTargets` configs and falls back to
     * the deployment-portable `'self'` source when no operator config is present. The
     * `'active-subscribers'` source unions the harness owner with active `WAKE_SUBSCRIPTION`
     * identities discovered via `getWakeSubscriptionIdentities()`.
     *
     * @returns {Promise<String[]>}
     * @protected
     */
    async getPulseIdentities() {
        return await resolveHeartbeatTargets({
            selfIdentity             : this.identity,
            targetSource             : this.targetSource,
            explicitTargets          : this.explicitTargets,
            activeSubscribersProvider: () => this.getWakeSubscriptionIdentities(),
            logger
        });
    }

    /**
     * SQLite query: active `WAKE_SUBSCRIPTION` identities that can receive an in-place wake.
     * @returns {Promise<String[]>}
     * @protected
     */
    async getWakeSubscriptionIdentities() {
        try {
            const db = this.getGraphDb();
            const stmt = db.prepare(`
                SELECT DISTINCT json_extract(data, '$.properties.agentIdentity') as identity
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.trigger') = 'SENT_TO_ME'
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
                  AND COALESCE(json_extract(data, '$.properties.harnessTarget'), '') != 'disabled'
                  AND json_extract(data, '$.properties.agentIdentity') IS NOT NULL
            `);
            return stmt.all()
                .map(row => row.identity)
                .filter(Boolean)
                .map(identity => normalizeAgentIdentityNodeId(identity))
        } catch (err) {
            logger.error('[SwarmHeartbeatService] getWakeSubscriptionIdentities failed:', err);
            return []
        }
    }

    /**
     * Test-stubbable seam over the SDK GraphService database handle.
     * @returns {Object} better-sqlite3 database handle
     * @protected
     */
    getGraphDb() {
        return GraphService.db.storage.db
    }

    /**
     * SQLite query: count of unread MESSAGE-label nodes addressed to the polled identity.
     * Direct DMs use MESSAGE.properties.readAt; broadcasts use per-recipient
     * DELIVERED_TO.readAt edges, with a legacy fallback for old broadcasts lacking receipts.
     * @returns {Promise<Number>}
     * @protected
     */
    async getUnreadCount() {
        try {
            const db = this.getGraphDb();
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
     * (`harnessTarget IN ('mcp-notifications', 'a2a-webhook', 'bridge-daemon')` and not `degraded`).
     * @param {String} identity
     * @returns {Promise<Boolean>}
     * @protected
     */
    async isPushCapable(identity) {
        try {
            const db = this.getGraphDb();
            const stmt = db.prepare(`
                SELECT count(*) as count
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.trigger') = 'SENT_TO_ME'
                  AND json_extract(data, '$.properties.harnessTarget') IN (${PUSH_CAPABLE_TARGETS.map(() => '?').join(', ')})
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
            `);
            const row = stmt.get(identity, ...PUSH_CAPABLE_TARGETS);
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

export {HEARTBEAT_LOCK_PATH, DEFAULT_POLL_INTERVAL_MS};
