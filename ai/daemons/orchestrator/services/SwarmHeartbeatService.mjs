// Class-only file. Entry-point bootstrap (Neo + core/_export + InstanceManager)
// lives in the Orchestrator entry point, which loads this class as its
// swarm-heartbeat lane. `Neo.setupClass(SwarmHeartbeatService)` at file bottom
// works via `globalThis.Neo` populated by the entry-point bootstrap chain.
import {spawn}         from 'child_process';
import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../../src/core/Base.mjs';
import AiConfig        from '../../../config.mjs';
import {
    Memory_GraphService     as GraphService,
    Memory_LifecycleService as LifecycleService
}                    from '../../../services.mjs';
import {getWakeRelevantNotifications} from '../../../services/github-workflow/HealthService.mjs';
import MailboxService                 from '../../../services/memory-core/MailboxService.mjs';
import RequestContextService          from '../../../mcp/server/shared/services/RequestContextService.mjs';
import logger                         from '../../../mcp/server/memory-core/logger.mjs';
import {
    isGateOpen,
    readGateState
} from '../../../scripts/lifecycle/wakeSafetyGate.mjs';
import {
    inspectHeartbeatLock,
    releaseHeartbeatLock
} from '../../../scripts/lifecycle/heartbeatLock.mjs';
import {checkSunsetted as checkSunsettedScript} from '../../../scripts/lifecycle/checkSunsetted.mjs';
import {normalizeAgentIdentityNodeId}           from '../../../graph/normalizeAgentIdentityNodeId.mjs';
import {
    resumeHarness as resumeHarnessScript
} from '../../../scripts/lifecycle/resumeHarness.mjs';
import {checkAllAgentIdle as checkAllAgentIdleScript}     from '../../../scripts/lifecycle/checkAllAgentIdle.mjs';
import {idleOutNudge as idleOutNudgeScript}               from '../../../scripts/lifecycle/idleOutNudge.mjs';
import WakeSubscriptionService                            from '../../../services/memory-core/WakeSubscriptionService.mjs';
import wakeDecisionServiceInstance, {WakeDecisionService} from './WakeDecisionService.mjs';
import {swarmWakeCooldown as swarmWakeCooldownScript}     from '../../../scripts/lifecycle/swarmWakeCooldown.mjs';
import {
    activeWakeSubscriptionStatusSql,
    isActiveWakeSubscriptionStatus,
    resolvedWakeSubscriptionStatusSql
} from '../../../services/memory-core/wakeSubscriptionStatusPolicy.mjs';
import {
    resolveTargets        as resolveHeartbeatTargets,
    VALID_TARGET_SOURCES
} from '../scheduling/swarmHeartbeat.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const PUSH_CAPABLE_TARGETS     = Object.freeze(['mcp-notifications', 'a2a-webhook', 'bridge-daemon']);

/**
 * @summary Resolves the heartbeat liveness file path shared with HealthService.
 *
 * `HealthService` reads the repo-root `.neo-ai-data/wake-daemon/heartbeat.alive`
 * mtime to project `features.wake.daemonRunning`. This producer must touch the
 * same path or health checks can remain stale while pulses execute. Tests and
 * operator probes can isolate the path via `NEO_HEARTBEAT_ALIVE_PATH`, matching
 * the consumer-side override contract.
 *
 * @returns {String}
 * @see ai/services/memory-core/HealthService.mjs
 */
function heartbeatAlivePath() {
    return AiConfig.wakeDaemonHeartbeatAlivePath;
}

/**
 * @summary Resolves the heartbeat CONCURRENCY lock path — the skip barrier, not the liveness file.
 *
 * `heartbeatLock.mjs` is deliberately Neo-free, so this entrypoint-side service supplies the
 * coordinate it no longer defaults. Both contenders — the producer wrapping expensive work and this
 * lane inspecting/clearing it — must read the same leaf, or the mutex stops being one.
 *
 * @returns {String}
 * @see ai/scripts/lifecycle/heartbeatLock.mjs
 */
function heartbeatLockPath() {
    return AiConfig.heartbeatConcurrencyLockPath;
}

/**
 * @summary Durable dedup state path for GitHub-notification heartbeat wakes.
 *
 * Reuses the wake-daemon data directory resolved by the existing heartbeat
 * liveness path, avoiding a new config leaf while keeping the state alongside
 * the other wake-delivery cursors.
 * @returns {String}
 */
function githubNotificationWakeStatePath() {
    return path.join(path.dirname(heartbeatAlivePath()), 'github-notification-wake-ids.json')
}

/**
 * @summary Whether a git remote URL points at GitHub.
 * @param {String} remoteUrl
 * @returns {Boolean}
 */
function isGitHubRemoteUrl(remoteUrl = '') {
    return /(?:^|@|\/\/)github\.com[:/][^/:\s]+\/[^/\s]+/.test(String(remoteUrl).trim())
}

/**
 * @summary Extracts a pull request candidate number from GitHub notification subject URLs.
 * @param {String} url GitHub API or web URL for an issue / pull request subject.
 * @returns {Number|null}
 */
function extractPullRequestNumberFromNotificationUrl(url = '') {
    const match = String(url).match(/\/(?:issues|pulls)\/(\d+)(?:$|[/?#])/);
    if (!match) return null;

    const number = Number(match[1]);
    return Number.isSafeInteger(number) && number > 0 ? number : null
}

/**
 * @summary Builds a compact heartbeat-pulse payload for GitHub notification wake digests.
 *
 * The heartbeat-pulse GraphLog row has no JSON payload column, so source content rides inside the
 * pulse id as URL-safe base64. The wake daemon decodes only this `github-notification.` prefix; all
 * other heartbeat pulses keep their existing opaque UUID semantics.
 * @param {Object[]} notifications Wake-relevant GitHub notification projections.
 * @returns {String}
 */
function buildGitHubNotificationPulseId(notifications = []) {
    const latest = notifications[notifications.length - 1] || {};
    const json   = JSON.stringify({
        source: 'github-notification',
        count : notifications.length,
        latest: {
            id         : latest.id,
            reason     : latest.reason,
            type       : latest.type,
            title      : latest.title,
            url        : latest.url,
            pullRequest: latest.pullRequest
        }
    });
    return `github-notification.${Buffer.from(json).toString('base64url')}`
}

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
 * and `swarmWakeCooldown.mjs` now expose module entrypoints while preserving their CLI
 * wrappers for manual use. The lane calls those exports directly to avoid 2-5s Node
 * startup hops per pulse.
 *
 * `initAsync()` is framework-owned. External callers use `await service.ready()`
 * to wait for initialization rather than invoking lifecycle hooks directly.
 *
 * Singleton scope is intentional: initialization only waits for peer services,
 * while `identity` and `pollIntervalMs` are pulse-time runtime config. The
 * Orchestrator sets those config slots before awaiting readiness. There is
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
         * Interval between pulses in milliseconds. Parent (Orchestrator) assigns
         * this to the orchestrator's `swarmHeartbeatIntervalMs` value, which
         * already honors the `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS` env
         * override. Plain config: there are no get/set hooks for this slot.
         * @member {Number} pollIntervalMs=300000
         */
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
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
     * Resolved wake-daemon data member injected by the Orchestrator composition root.
     * @member {String|null} wakeDaemonDir=null
     */
    wakeDaemonDir = null
    /**
     * Resolved harness-state directory injected by the Orchestrator composition root.
     * @member {String|null} harnessStateDir=null
     */
    harnessStateDir = null

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
     *      - allIdle=true + gate-open → `swarmWakeCooldown.mjs` direct export.
     *   5. GitHub notification wake-content ingestion. When the current workspace
     *      is GitHub-backed, unread `mention` / `review_requested` notifications
     *      are deduped by GitHub notification id and emitted once through the
     *      same Shape B heartbeat-pulse transport. Non-GitHub deployments log and
     *      no-op.
     *   6. Per-identity 3-signal-decision-gated heartbeat-pulse emit. For each
     *      identity in `pulseIdentities`, query A2A activity
     *      timestamps + readiness sentinels + orchestrator-local backoff window,
     *      compose via `WakeDecisionService.decideWake({active, idle, ready})`, and
     *      emit a Shape B `WakeSubscriptionService.emitHeartbeatPulse({targetIdentity})`
     *      iff the decision is `wake: true`. Bridge-daemon dispatches via its existing
     *      adapter set (osascript / codex-app-server / antigravity-cli / claude-cli).
     *      Replaces old steps 5/6/7 (push-capability bypass + token-economy gate +
     *      tmux-inject) which conflated three concerns and silently no-op'd for
     *      non-tmux harnesses.
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
                logger.warn(`[SwarmHeartbeatService] Wake safety gate closed; skipping swarm wake dispatch. Gate reason: ${gateState.reason}`)
            } else {
                await this.swarmWakeCooldown(allIdleJson)
            }
        }

        // Step 5: GitHub notification wake-content ingestion. The notification
        // source is gated by repo remote and deduped by GitHub notification id;
        // it never mutates GitHub's own notification read/unread state.
        await this.emitGitHubNotificationWakes(pulseIdentities);

        // Step 6: Per-identity 3-signal-decision-gated heartbeat-pulse emit.
        // Replaces old push-capability bypass + token-economy gate + tmux-inject
        // with a unified Shape B emit path.
        // Wake = active AND idle AND ready (per WakeDecisionService.decideWake).
        const now = Date.now();
        for (const identity of pulseIdentities) {
            const recentActivityTimestamps = await this.getRecentActivityTimestamps(identity, now);
            const sentinelMessages         = await this.getReadinessSentinelMessages(identity);
            const activeReadinessSentinel  = WakeDecisionService.parseActiveReadinessSentinels(sentinelMessages, now);
            const activeBackoffWindow      = this.getActiveBackoffWindow(identity, now);

            const decision = WakeDecisionService.decideWake({
                identity,
                currentTimeMs: now,
                recentActivityTimestamps,
                activeReadinessSentinel,
                activeBackoffWindow
            });

            if (decision.wake) {
                try {
                    await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: identity});
                } catch (err) {
                    logger.error(`[SwarmHeartbeatService] Failed to emit heartbeat pulse for ${identity}: ${err.message}`);
                }
            } else {
                logger.debug(`[SwarmHeartbeatService] Skip pulse for ${identity}: ${decision.reason}`);
            }
        }
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
        const alivePath = heartbeatAlivePath();
        const now       = new Date();
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
        return inspectHeartbeatLock({lockPath: heartbeatLockPath()})
    }

    /**
     * Test-stubbable seam over `releaseHeartbeatLock`.
     * @returns {Promise<void>}
     * @protected
     */
    async clearHeartbeatLock() {
        return releaseHeartbeatLock({lockPath: heartbeatLockPath()})
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
        return isGateOpen({wakeDaemonDir: this.wakeDaemonDir})
    }

    /**
     * Test-stubbable seam over `wakeSafetyGate.readGateState`.
     * @returns {Promise<{state: String, reason: String, trippedAt: ?String, trippedBy: ?String}>}
     * @protected
     */
    async readGate() {
        return readGateState({wakeDaemonDir: this.wakeDaemonDir})
    }

    /**
     * Test-stubbable seam over `checkSunsetted.mjs`'s dual-mode module export.
     * @param {String} identity
     * @returns {Promise<Object|null>}
     * @protected
     */
    async checkSunsetted(identity) {
        try {
            return await checkSunsettedScript(identity, {wakeDaemonDir: this.wakeDaemonDir})
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
        let harnessTargetMetadata;
        try {
            harnessTargetMetadata = await this.getResumeHarnessTargetMetadata(identity);
        } catch (err) {
            logger.error(
                `[SwarmHeartbeatService] Skipping resumeHarness for ${identity}: ` +
                `failed to resolve wake route metadata (${err.message}).`
            );
            return
        }

        return resumeHarnessScript(identity, reason, originSessionId, abandonedCount, {
            deploymentMode : AiConfig.orchestrator.deploymentMode,
            env            : {},
            harnessStateDir: this.harnessStateDir,
            harnessTargetMetadata,
            wakeDaemonDir  : this.wakeDaemonDir
        })
    }

    /**
     * @summary Resolve the active bridge-daemon route metadata used by resumeHarness.
     *
     * Central swarm heartbeat runs in the Orchestrator process, not inside the target harness. It
     * therefore cannot rely on the target harness's process environment for `userDataDir` routing.
     * The bootstrapped wake subscription is the current route authority: prefer an active
     * bridge-daemon `SENT_TO_ME` subscription with an instance-address tuple, falling back to the
     * latest active bridge route so default-instance resumes keep their legacy behavior.
     *
     * @param {String} identity Agent identity node id.
     * @returns {Promise<Object>} Harness target metadata or an empty object when no active route exists.
     * @throws {Error} When the route lookup itself fails; callers fail closed instead of resuming
     *     through generic app activation.
     * @protected
     */
    async getResumeHarnessTargetMetadata(identity) {
        return RequestContextService.run({agentIdentityNodeId: identity}, async () => {
            const result     = await WakeSubscriptionService.list({});
            const candidates = (result?.subscriptions || [])
                .filter(subscription =>
                    subscription.trigger === 'SENT_TO_ME' &&
                    subscription.harnessTarget === 'bridge-daemon' &&
                    isActiveWakeSubscriptionStatus(subscription.status)
                )
                .sort((a, b) =>
                    Date.parse(b.updatedAt || b.createdAt || '') -
                    Date.parse(a.updatedAt || a.createdAt || '')
                );

            const addressed = candidates.find(subscription =>
                this.hasInstanceAddressMetadata(subscription.harnessTargetMetadata || {})
            );

            return {
                ...((addressed || candidates[0])?.harnessTargetMetadata || {})
            };
        })
    }

    /**
     * @summary Whether wake route metadata carries a complete generic instance address.
     * @param {Object} metadata Harness target metadata.
     * @returns {Boolean}
     * @protected
     */
    hasInstanceAddressMetadata(metadata = {}) {
        const addressType = metadata.addressType || (metadata.userDataDir ? 'userDataDir' : null),
              address     = metadata.instanceAddress || (addressType === 'userDataDir' ? metadata.userDataDir : null);

        return Boolean(addressType && address)
    }

    /**
     * Test-stubbable seam over `idleOutNudge.mjs`'s dual-mode module export.
     * @param {String} identity
     * @returns {Promise<void>}
     * @protected
     */
    async idleOutNudge(identity) {
        return idleOutNudgeScript(identity, {wakeDaemonDir: this.wakeDaemonDir})
    }

    /**
     * Test-stubbable seam over `checkAllAgentIdle.mjs`'s dual-mode module export.
     * @returns {Promise<Object|null>}
     * @protected
     */
    async checkAllAgentIdle() {
        try {
            return await checkAllAgentIdleScript({wakeDaemonDir: this.wakeDaemonDir})
        } catch (err) {
            logger.error('[SwarmHeartbeatService] checkAllAgentIdle.mjs failed:', err.message);
            return null
        }
    }

    /**
     * Test-stubbable seam over `swarmWakeCooldown.mjs`'s dual-mode module export.
     * @param {Object} signal
     * @returns {Promise<Object|void>}
     * @protected
     */
    async swarmWakeCooldown(signal) {
        return swarmWakeCooldownScript(signal, {wakeDaemonDir: this.wakeDaemonDir})
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
            selfIdentity                 : this.identity,
            targetSource                 : this.targetSource,
            explicitTargets              : this.explicitTargets,
            activeSubscribersProvider    : () => this.getWakeSubscriptionIdentities(),
            activeA2aParticipantsProvider: () => this.getActiveA2aParticipants(),
            logger
        });
    }

    /**
     * @summary SQLite query: distinct AgentIdentity nodes with A2A `MESSAGE` activity
     * (sent OR received) within the last 3h.
     *
     * Per-MC-instance derived candidate-discovery — no team-registry coupling. External
     * workspaces only ever see their own MC's A2A activity, so default fan-out is
     * tenant-safe. Implements the activity-derived discovery side of the 3-signal
     * model — sibling to per-identity `getRecentActivityTimestamps`.
     *
     * **3-branch UNION mirrors mailbox semantics:**
     * - `SENT_TO` → direct-message recipients (`AGENT:*` sentinel excluded — broadcasts don't
     *   land at a real identity; the per-recipient `DELIVERED_TO` edges are the actual recipients)
     * - `DELIVERED_TO` → per-recipient broadcast targets (the canonical fan-out edge)
     * - `SENT_BY`  → agent message senders (so an active sender lands in the candidate set even
     *   if no one has replied yet within 3h; the `@system` lifecycle sender is excluded)
     *
     * @returns {Promise<String[]>} Normalized canonical `@<identity>` strings, deduplicated.
     * @protected
     */
    async getActiveA2aParticipants() {
        try {
            const cutoffMs  = Date.now() - 3 * 60 * 60 * 1000;
            const cutoffIso = new Date(cutoffMs).toISOString();
            const db        = this.getGraphDb();
            const stmt      = db.prepare(`
                SELECT DISTINCT identity FROM (
                    SELECT e.target AS identity
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_TO'
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(n.data, '$.properties.sentAt') >= ?
                      AND e.target IS NOT NULL
                      AND e.target != 'AGENT:*'
                    UNION
                    SELECT e.target AS identity
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'DELIVERED_TO'
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(n.data, '$.properties.sentAt') >= ?
                      AND e.target IS NOT NULL
                    UNION
                    SELECT e.target AS identity
                    FROM Edges e
                    JOIN Nodes n ON n.id = e.source
                    WHERE e.type = 'SENT_BY'
                      AND json_extract(n.data, '$.label') = 'MESSAGE'
                      AND json_extract(n.data, '$.properties.sentAt') >= ?
                      AND e.target IS NOT NULL
                )
            `);
            return stmt.all(cutoffIso, cutoffIso, cutoffIso)
                .map(row => row.identity)
                .filter(Boolean)
                .map(identity => normalizeAgentIdentityNodeId(identity))
                .filter(identity => identity !== '@system')
                .filter(Boolean);
        } catch (err) {
            logger.error('[SwarmHeartbeatService] getActiveA2aParticipants failed:', err);
            return [];
        }
    }

    /**
     * SQLite query: active `WAKE_SUBSCRIPTION` identities that can receive an in-place wake.
     * @returns {Promise<String[]>}
     * @protected
     */
    async getWakeSubscriptionIdentities() {
        try {
            const db   = this.getGraphDb();
            const stmt = db.prepare(`
                SELECT DISTINCT json_extract(data, '$.properties.agentIdentity') as identity
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.trigger') = 'SENT_TO_ME'
                  AND ${activeWakeSubscriptionStatusSql()}
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
     * @summary Ingest GitHub mention/review-request notifications as once-per-id
     * heartbeat wake signals.
     *
     * The GitHub notification feed belongs to the current local GitHub account, so
     * this first slice maps it only to the configured primary `identity` when that
     * identity is part of the current heartbeat target set. Multi-agent username
     * routing is intentionally left out of this PR rather than guessing from
     * maintainer handles.
     *
     * @param {String[]} pulseIdentities Identities active for this heartbeat pulse.
     * @returns {Promise<void>}
     * @protected
     */
    async emitGitHubNotificationWakes(pulseIdentities = []) {
        const targetIdentity = this.identity;
        if (!targetIdentity || !pulseIdentities.includes(targetIdentity)) {
            logger.debug('[SwarmHeartbeatService] GitHub notification ingestion skipped: primary identity is not in pulse target set.');
            return
        }

        if (!await this.hasGitHubRemote()) return;

        const state = await this.readGitHubNotificationWakeState();
        if (!state) return; // corrupt/unreadable state: fail closed to avoid wake storms

        const notifications = await this.getGitHubNotifications();
        if (notifications.length === 0) return;

        const durableSeenIds  = Array.isArray(state[targetIdentity]) ? state[targetIdentity] : [],
              volatileSeenIds = this.getVolatileGitHubNotificationSeenIds(targetIdentity),
              seenIds         = new Set([...durableSeenIds, ...volatileSeenIds]);
        const unseen = notifications.filter(notification => !seenIds.has(notification.id));
        if (unseen.length === 0) return;

        const result = await WakeSubscriptionService.emitHeartbeatPulse({
            targetIdentity,
            pulseId: buildGitHubNotificationPulseId(unseen)
        });
        if (result?.status !== 'emitted') {
            logger.info(`[SwarmHeartbeatService] GitHub notification wake skipped for ${targetIdentity}: heartbeat pulse ${result?.status || 'unknown'} (${result?.reason || 'no reason'}).`);
            return
        }

        for (const notification of unseen) {
            seenIds.add(notification.id)
        }

        state[targetIdentity] = [...seenIds].slice(-200);
        try {
            await this.writeGitHubNotificationWakeState(state);
            this.clearVolatileGitHubNotificationSeenIds(targetIdentity)
        } catch (err) {
            this.rememberVolatileGitHubNotificationSeenIds(targetIdentity, state[targetIdentity]);
            logger.error(
                `[SwarmHeartbeatService] Failed to persist GitHub notification wake-state after emitting for ${targetIdentity}; ` +
                `retaining ids in process memory to avoid wake storms: ${err.message}`
            )
        }

        logger.info(`[SwarmHeartbeatService] GitHub notification wake emitted for ${targetIdentity}: ${unseen.length} new notification(s).`)
    }

    /**
     * @summary Returns process-local GitHub notification ids retained after persist failures.
     *
     * Durable state is the source of truth. This fallback covers the post-emit /
     * pre-persist failure window so a transient or persistent filesystem failure
     * cannot re-emit the same GitHub notification on every heartbeat until the
     * orchestrator restarts.
     * @param {String} identity
     * @returns {Set<String>}
     * @protected
     */
    getVolatileGitHubNotificationSeenIds(identity) {
        const map = this._volatileGitHubNotificationSeenIds;
        return new Set(map?.get(identity) || [])
    }

    /**
     * @summary Retains emitted GitHub notification ids in process memory after a persist failure.
     * @param {String} identity
     * @param {String[]} ids
     * @returns {void}
     * @protected
     */
    rememberVolatileGitHubNotificationSeenIds(identity, ids = []) {
        if (!this._volatileGitHubNotificationSeenIds) {
            this._volatileGitHubNotificationSeenIds = new Map()
        }

        const previous = this._volatileGitHubNotificationSeenIds.get(identity) || [],
              merged   = [...new Set([...previous, ...ids].filter(Boolean))].slice(-200);

        this._volatileGitHubNotificationSeenIds.set(identity, merged)
    }

    /**
     * @summary Clears process-local GitHub notification ids once durable persist succeeds.
     * @param {String} identity
     * @returns {void}
     * @protected
     */
    clearVolatileGitHubNotificationSeenIds(identity) {
        this._volatileGitHubNotificationSeenIds?.delete(identity)
    }

    /**
     * @summary Whether the current workspace is backed by a GitHub remote.
     * @returns {Promise<Boolean>}
     * @protected
     */
    async hasGitHubRemote() {
        try {
            const remoteUrl = await this.getGitRemoteUrl();
            const enabled   = isGitHubRemoteUrl(remoteUrl);
            if (!enabled) {
                logger.info('[SwarmHeartbeatService] GitHub notification ingestion disabled: no GitHub remote detected.')
            }
            return enabled
        } catch (err) {
            logger.info(`[SwarmHeartbeatService] GitHub notification ingestion disabled: failed to resolve git remote (${err.message}).`);
            return false
        }
    }

    /**
     * Test-stubbable seam over git remote detection.
     * @returns {Promise<String>}
     * @protected
     */
    async getGitRemoteUrl() {
        return (await this.runCmd('git', ['config', '--get', 'remote.origin.url'])).trim()
    }

    /**
     * Test-stubbable seam over GitHub notification fetch.
     * @returns {Promise<Object[]>}
     * @protected
     */
    async getGitHubNotifications() {
        try {
            const output        = await this.runCmd('gh', ['api', 'notifications?participating=true']);
            const notifications = getWakeRelevantNotifications(JSON.parse(output || '[]'));
            return await this.enrichGitHubNotificationsWithPullRequestState(notifications)
        } catch (err) {
            logger.warn(`[SwarmHeartbeatService] GitHub notification fetch failed: ${err.message}`);
            return []
        }
    }

    /**
     * @summary Adds live PR state echoes to wake-relevant GitHub notifications when resolvable.
     * @param {Object[]} notifications Wake-relevant notification projections.
     * @returns {Promise<Object[]>}
     * @protected
     */
    async enrichGitHubNotificationsWithPullRequestState(notifications = []) {
        const enriched = [];

        for (const notification of notifications) {
            if (notification.type !== 'PullRequest') {
                enriched.push(notification);
                continue;
            }

            const number = extractPullRequestNumberFromNotificationUrl(notification.url);
            if (!number) {
                enriched.push(notification);
                continue;
            }

            const pullRequest = await this.resolvePullRequestState(number);
            enriched.push(pullRequest ? {...notification, pullRequest} : notification);
        }

        return enriched
    }

    /**
     * @summary Resolves live GitHub pull request state for wake payload echoes.
     * @param {Number} number Pull request number.
     * @returns {Promise<Object|null>}
     * @protected
     */
    async resolvePullRequestState(number) {
        try {
            const output = await this.runCmd('gh', ['pr', 'view', String(number), '--json', 'state,mergedAt']);
            const parsed = JSON.parse(output || '{}');
            if (!parsed?.state) return null;

            return {
                number,
                state    : parsed.state,
                mergedAt : parsed.mergedAt || null,
                checkedAt: new Date().toISOString()
            }
        } catch (err) {
            logger.warn(`[SwarmHeartbeatService] PR state echo omitted for #${number}: ${err.message}`);
            return null
        }
    }

    /**
     * @summary Reads durable GitHub notification wake-state.
     * @returns {Promise<Object|null>} Object map, `{}` when missing, or null when malformed.
     * @protected
     */
    async readGitHubNotificationWakeState() {
        const statePath = githubNotificationWakeStatePath();
        try {
            const parsed = JSON.parse(await fs.readFile(statePath, 'utf8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            logger.error('[SwarmHeartbeatService] GitHub notification wake-state malformed; ingestion disabled for this pulse.');
            return null
        } catch (err) {
            if (err.code === 'ENOENT') return {};
            logger.error(`[SwarmHeartbeatService] Failed to read GitHub notification wake-state: ${err.message}`);
            return null
        }
    }

    /**
     * @summary Persists durable GitHub notification wake-state.
     * @param {Object} state
     * @returns {Promise<void>}
     * @protected
     */
    async writeGitHubNotificationWakeState(state) {
        const statePath = githubNotificationWakeStatePath();
        await fs.mkdir(path.dirname(statePath), {recursive: true});
        await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
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
            const db   = this.getGraphDb();
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
            const db   = this.getGraphDb();
            const stmt = db.prepare(`
                SELECT count(*) as count
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = ?
                  AND json_extract(data, '$.properties.trigger') = 'SENT_TO_ME'
                  AND json_extract(data, '$.properties.harnessTarget') IN (${PUSH_CAPABLE_TARGETS.map(() => '?').join(', ')})
                  AND ${resolvedWakeSubscriptionStatusSql()} != 'degraded'
            `);
            const row = stmt.get(identity, ...PUSH_CAPABLE_TARGETS);
            return (row?.count || 0) > 0
        } catch (err) {
            logger.error('[SwarmHeartbeatService] isPushCapable query failed:', err);
            return false
        }
    }

    /**
     * Query A2A graph for recent message-activity timestamps adjacent to the identity.
     *
     * Activity-signal input for `WakeDecisionService.decideWake`. Returns millisecond
     * timestamps of any A2A activity (sent OR received) by this identity within the
     * last 3h, archived-excluded.
     *
     * `MailboxService.listMessages()` is caller-identity-scoped: it reads
     * `RequestContextService.getAgentIdentityNodeId()` at entry and throws if
     * no identity is bound. The orchestrator daemon owns no implicit identity,
     * so we explicitly bind to the polled identity (the box owner) for the
     * duration of the query — semantically clean (it's their outbox + inbox)
     * and matches the precedent in `idleOutNudge.mjs` + `KbAlertingService.mjs`.
     *
     * @param {String} identity Target agent identity.
     * @param {Number} currentTimeMs Current time (cutoff anchor).
     * @returns {Promise<Number[]>} Activity timestamps in milliseconds.
     * @protected
     */
    async getRecentActivityTimestamps(identity, currentTimeMs) {
        const cutoffMs = currentTimeMs - 3 * 60 * 60 * 1000;
        try {
            return await RequestContextService.run({agentIdentityNodeId: identity}, async () => {
                const sentResult     = await MailboxService.listMessages({box: 'outbox', fromIdentity: identity, limit: 100, includeArchived: false});
                const receivedResult = await MailboxService.listMessages({box: 'inbox',  to: identity,           limit: 100, includeArchived: false});

                const messages = [
                    ...(sentResult?.messages || []),
                    ...(receivedResult?.messages || [])
                ];

                return messages
                    .map(m => Date.parse(m.sentAt || ''))
                    .filter(ts => Number.isFinite(ts) && ts >= cutoffMs);
            });
        } catch (err) {
            logger.error(`[SwarmHeartbeatService] getRecentActivityTimestamps failed for ${identity}: ${err.message}`);
            return [];
        }
    }

    /**
     * Query for `[wake-readiness]` sentinel messages addressed to this identity.
     * Filtered server-side by `taggedConcepts: ['wake-readiness']` so the parser
     * runs over the narrow candidate set only.
     *
     * Same `RequestContextService.run` binding rationale as
     * `getRecentActivityTimestamps`. Returns `listMessages` summary objects
     * (shape: `{messageId, task, sentAt, ...}`) — `WakeDecisionService.parseReadinessSentinel`
     * accepts the summary shape directly (no per-message adapter needed).
     *
     * @param {String} identity Target agent identity.
     * @returns {Promise<Object[]>} Candidate sentinel summary messages.
     * @protected
     */
    async getReadinessSentinelMessages(identity) {
        try {
            return await RequestContextService.run({agentIdentityNodeId: identity}, async () => {
                const result = await MailboxService.listMessages({
                    to             : identity,
                    taggedConcepts : ['wake-readiness'],
                    limit          : 20,
                    includeArchived: false
                });
                return result?.messages || [];
            });
        } catch (err) {
            logger.error(`[SwarmHeartbeatService] getReadinessSentinelMessages failed for ${identity}: ${err.message}`);
            return [];
        }
    }

    /**
     * Query the WakeDecisionService singleton for an active backoff window
     * for the identity. Returns null if no window active or service unconfigured.
     *
     * @param {String} identity Target agent identity.
     * @param {Number} currentTimeMs Current time (TTL anchor).
     * @returns {Object|null} `{expiresAtMs, reason, recordedAtMs}` or null.
     * @protected
     */
    getActiveBackoffWindow(identity, currentTimeMs) {
        if (!wakeDecisionServiceInstance?.backoffState) return null;
        try {
            return wakeDecisionServiceInstance.getActiveBackoffWindow(identity, currentTimeMs);
        } catch (err) {
            logger.error(`[SwarmHeartbeatService] getActiveBackoffWindow failed for ${identity}: ${err.message}`);
            return null;
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
            const child  = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
            let   stdout = '';
            let   stderr = '';
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

export {
    DEFAULT_POLL_INTERVAL_MS,
    heartbeatAlivePath,
    heartbeatLockPath,
    githubNotificationWakeStatePath,
    isGitHubRemoteUrl,
    extractPullRequestNumberFromNotificationUrl
};
