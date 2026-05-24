import {IDENTITIES}                   from '../../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId} from '../../../scripts/lifecycle/resumeHarness.mjs';

/**
 * Valid `targetSource` enum values for `resolveTargets`. Exported so
 * `SwarmHeartbeatService.beforeSetTargetSource` and unit tests share one
 * source-of-truth and stay drift-free.
 */
export const VALID_TARGET_SOURCES = Object.freeze([
    'self',
    'active-local-team',
    'active-subscribers',
    'disabled'
]);

/**
 * Swarm-heartbeat due-trigger projection. Returns a trigger descriptor when the
 * configured interval has elapsed since `lastRunAt`; null otherwise. Pure function.
 *
 * @param {Object} options
 * @param {Object} [options.state] Current task state for the swarm-heartbeat lane (`{lastRunAt}`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.swarmHeartbeatIntervalMs Periodic interval; `<= 0` disables.
 * @returns {Object|null} A swarm-heartbeat task trigger or null when no work is due.
 */
export function getDueTask({state, now, swarmHeartbeatIntervalMs}) {
    const lastRunAt = state?.lastRunAt ?? 0;
    if (swarmHeartbeatIntervalMs > 0 && now - lastRunAt >= swarmHeartbeatIntervalMs) {
        return {
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : `periodic-heartbeat:${swarmHeartbeatIntervalMs}`
        };
    }
    return null;
}

/**
 * @summary Resolve the per-pulse identity set the swarm-heartbeat lane should target.
 *
 * Five-step precedence chain:
 *
 *   1. Explicit `explicitTargets` list (highest precedence; bypasses source-based logic).
 *      Sourced from `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
 *   2. `targetSource` enum (`'self'|'active-local-team'|'active-subscribers'|'disabled'`),
 *      env-overridable via `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`.
 *   3. Default `'self'` when `targetSource` is nullish — the deployment-portable safe default.
 *   4. `'active-local-team'` reads `identityRoots.IDENTITIES` filtered on
 *      `type === 'AgentIdentity'` AND `properties.participationStatus === 'active'`. The
 *      registry is team-shaped; external forks customizing `identityRoots.mjs` get their
 *      own team filter for free.
 *   5. Cloud/fork safety: external workspaces with no config default to `'self'`; unknown
 *      `targetSource` values fail-closed to `'self'` with a warn log. The lane never
 *      silently fans out to maintainer identities. Operators must explicitly opt-in to
 *      `'active-local-team'` to receive cross-team pulses.
 *
 * `'active-subscribers'` delegates to the injected `activeSubscribersProvider` callable
 * (the existing `WAKE_SUBSCRIPTION` SQL discovery in
 * `SwarmHeartbeatService.getWakeSubscriptionIdentities()`); union with `selfIdentity`
 * keeps the harness owner in the pulse set.
 *
 * `'disabled'` returns `[]` plus an info log. Downstream `pulse()` skips per-identity
 * work (sunset detection, idle-out nudge) while identity-agnostic substrate maintenance
 * (TTL sweep, all-agent-idle detection, liveness touch) still runs.
 *
 * Pure function: side effects limited to logger calls. Output is deduplicated and
 * order-preserving; each target is normalized via `normalizeAgentIdentityNodeId` so
 * the slot holds canonical `@<id>` form.
 *
 * @param {Object}         opts
 * @param {String}         opts.selfIdentity                  Primary identity (orchestrator harness owner).
 * @param {String|null}    [opts.targetSource=null]           Resolver source enum (see {@link VALID_TARGET_SOURCES}).
 * @param {String[]|null}  [opts.explicitTargets=null]        Explicit target list (wins when non-empty).
 * @param {Function}       [opts.activeSubscribersProvider]   Async `() => Promise<String[]>` for `'active-subscribers'`.
 * @param {Object}         [opts.logger=console]              Logger; defaults to console.
 * @returns {Promise<String[]>}  Normalized canonical `@<identity>` strings (deduplicated, order-preserving).
 */
export async function resolveTargets({
    selfIdentity,
    targetSource             = null,
    explicitTargets          = null,
    activeSubscribersProvider = null,
    logger                   = console
} = {}) {
    const log = (level, msg) => {
        const fn = typeof logger?.[level] === 'function' ? logger[level] : console[level];
        fn?.call(logger, msg);
    };

    const normalizedSelf = selfIdentity ? normalizeAgentIdentityNodeId(selfIdentity) : null;

    /**
     * Self-fallback: returns `[selfIdentity]` when present, otherwise emits an
     * observable info log and returns `[]`. Silent `[]` would satisfy no-leak but
     * miss the disables-with-log property; the log surfaces the misconfiguration so
     * operators can set `NEO_AGENT_IDENTITY` or explicitly opt-in to
     * `targetSource='disabled'`.
     */
    const selfFallback = (resolvedFrom) => {
        if (!normalizedSelf) {
            log('info', `[resolveSwarmHeartbeatTargets] '${resolvedFrom}' resolved to self but selfIdentity is null — disabled (no pulse targets). Set NEO_AGENT_IDENTITY or orchestrator.swarmHeartbeat.targetSource='disabled' explicitly to silence this notice.`);
            return [];
        }
        return [normalizedSelf];
    };

    // Step 1: explicit env target list (override-all). Empty array / null falls through.
    if (Array.isArray(explicitTargets) && explicitTargets.length > 0) {
        const seen = new Set();
        const out  = [];
        for (const raw of explicitTargets) {
            const id = normalizeAgentIdentityNodeId(raw);
            if (id && !seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        }
        return out;
    }

    // Step 2 + 3: targetSource enum (nullish → 'self')
    const source = targetSource || 'self';

    switch (source) {
        case 'self':
            return selfFallback('self');

        case 'disabled':
            log('info', '[resolveSwarmHeartbeatTargets] disabled — no pulse targets');
            return [];

        case 'active-local-team': {
            const seen = new Set();
            const out  = [];
            for (const entry of IDENTITIES) {
                if (entry.type !== 'AgentIdentity') continue;
                if (entry.properties?.participationStatus !== 'active') continue;
                const id = normalizeAgentIdentityNodeId(entry.id);
                if (id && !seen.has(id)) {
                    seen.add(id);
                    out.push(id);
                }
            }
            return out;
        }

        case 'active-subscribers': {
            if (typeof activeSubscribersProvider !== 'function') {
                log('warn', `[resolveSwarmHeartbeatTargets] targetSource='active-subscribers' requires activeSubscribersProvider; falling back to 'self'`);
                return selfFallback('active-subscribers-missing-provider');
            }
            const subscribers = (await activeSubscribersProvider()) || [];
            const seen = new Set();
            const out  = [];
            if (normalizedSelf) {
                seen.add(normalizedSelf);
                out.push(normalizedSelf);
            }
            for (const raw of subscribers) {
                const id = normalizeAgentIdentityNodeId(raw);
                if (id && !seen.has(id)) {
                    seen.add(id);
                    out.push(id);
                }
            }
            return out;
        }

        default:
            log('warn', `[resolveSwarmHeartbeatTargets] Unknown targetSource '${source}' (valid: ${VALID_TARGET_SOURCES.join('|')}); falling back to 'self'`);
            return selfFallback('unknown-source-fallback');
    }
}
