import {IDENTITIES}                   from '../../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId} from '../../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * Valid `targetSource` enum values for `resolveTargets`. Exported so
 * `SwarmHeartbeatService.beforeSetTargetSource` and unit tests share one
 * source-of-truth and stay drift-free.
 */
export const VALID_TARGET_SOURCES = Object.freeze([
    'self',
    'active-local-team',
    'active-subscribers',
    'active-a2a-participants',
    'disabled'
]);

const identityParticipationById = new Map(
    IDENTITIES
        .filter(identity => identity.type === 'AgentIdentity')
        .map(identity => [
            normalizeAgentIdentityNodeId(identity.id),
            identity.properties?.participationStatus || 'active'
        ])
);

/**
 * @summary True when heartbeat target discovery may include the identity.
 *
 * Unknown identities are allowed for forks/local custom agents. Known repo
 * identities with a non-active participationStatus are excluded; explicit
 * target lists remain the operator override for diagnostics.
 * @param {String} id Normalized agent identity.
 * @returns {Boolean}
 */
function isHeartbeatTargetEligible(id) {
    const participationStatus = identityParticipationById.get(id);
    return !participationStatus || participationStatus === 'active';
}

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
 * Precedence chain:
 *
 *   1. Explicit `explicitTargets` list (highest precedence; bypasses source-based logic).
 *      Sourced from `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGETS` (comma-separated handles).
 *   2. `targetSource` enum (see {@link VALID_TARGET_SOURCES} — 5 values), env-overridable
 *      via `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE`.
 *   3. Code-side null→self fallback when `targetSource` is nullish (the deployment-portable
 *      safety net for the rare case where the tracked template default is bypassed). The
 *      tracked default in `ai/config.template.mjs` is `'active-a2a-participants'`.
 *
 * **Per-source semantics:**
 *
 * - **`'self'`** — pulses only the active harness owner (`selfIdentity`); deployment-
 *   portable minimal-fan-out shape.
 * - **`'active-local-team'`** — reads `identityRoots.IDENTITIES` filtered on
 *   `type === 'AgentIdentity'` AND `properties.participationStatus === 'active'`. Team-
 *   registry coupled (suitable for Neo team workspace; external forks customize
 *   `identityRoots.mjs` to get their own team filter for free).
 * - **`'active-subscribers'`** — delegates to injected `activeSubscribersProvider`
 *   (the existing `WAKE_SUBSCRIPTION` SQL discovery in
 *   `SwarmHeartbeatService.getWakeSubscriptionIdentities()`); union with `selfIdentity`.
 *   Subscription-presence-based — degrades on dormant subscribers. Known repo identities
 *   are still gated by `participationStatus === 'active'` so stale subscriptions cannot
 *   wake operator-benched harnesses.
 * - **`'active-a2a-participants'`** — delegates to injected
 *   `activeA2aParticipantsProvider` (the `SwarmHeartbeatService.getActiveA2aParticipants()`
 *   3h `MESSAGE`-edge query); union with `selfIdentity`. Activity-derived — per-MC-instance
 *   discovery, tenant-safe (no team-registry coupling), self-healing 3h sliding window.
 *   Known repo identities are still gated by `participationStatus === 'active'`. This is
 *   the tracked template default.
 * - **`'disabled'`** — returns `[]` plus an info log. Downstream `pulse()` skips per-identity
 *   work (sunset detection, idle-out nudge) while identity-agnostic substrate maintenance
 *   (TTL sweep, all-agent-idle detection, liveness touch) still runs.
 *
 * Cloud/fork safety: external workspaces never silently fan out to maintainer identities.
 * `'active-a2a-participants'` and `'active-subscribers'` are per-MC-instance derived (each
 * deployment's MC has its own A2A activity and subscriptions); only `'active-local-team'`
 * has team-registry coupling and must be operator-opted-into.
 *
 * Pure function: side effects limited to logger calls. Output is deduplicated and
 * order-preserving; each target is normalized via `normalizeAgentIdentityNodeId` so
 * the slot holds canonical `@<id>` form.
 *
 * @param {Object}         opts
 * @param {String}         opts.selfIdentity                       Primary identity (orchestrator harness owner).
 * @param {String|null}    [opts.targetSource=null]                Resolver source enum (see {@link VALID_TARGET_SOURCES}).
 * @param {String[]|null}  [opts.explicitTargets=null]             Explicit target list (wins when non-empty).
 * @param {Function}       [opts.activeSubscribersProvider]        Async `() => Promise<String[]>` for `'active-subscribers'`.
 * @param {Function}       [opts.activeA2aParticipantsProvider]    Async `() => Promise<String[]>` for `'active-a2a-participants'`.
 * @param {Object}         [opts.logger=console]                   Logger; defaults to console.
 * @returns {Promise<String[]>}  Normalized canonical `@<identity>` strings (deduplicated, order-preserving).
 */
export async function resolveTargets({
    selfIdentity,
    targetSource                  = null,
    explicitTargets               = null,
    activeSubscribersProvider     = null,
    activeA2aParticipantsProvider = null,
    logger                        = console
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
        if (!isHeartbeatTargetEligible(normalizedSelf)) return [];
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
            const seen        = new Set();
            const out         = [];
            if (normalizedSelf) {
                seen.add(normalizedSelf);
                out.push(normalizedSelf);
            }
            for (const raw of subscribers) {
                const id = normalizeAgentIdentityNodeId(raw);
                if (id && !isHeartbeatTargetEligible(id)) continue;
                if (id && !seen.has(id)) {
                    seen.add(id);
                    out.push(id);
                }
            }
            return out;
        }

        case 'active-a2a-participants': {
            // Activity-derived candidate discovery:
            // pulse candidate set is auto-discovered from A2A graph activity within the
            // 3h `active` window (`getRecentActivityTimestamps` per-identity sibling).
            // Per-MC-instance derived; no team-registry coupling (safe for external
            // workspaces — they only ever see their own activity).
            if (typeof activeA2aParticipantsProvider !== 'function') {
                log('warn', `[resolveSwarmHeartbeatTargets] targetSource='active-a2a-participants' requires activeA2aParticipantsProvider; falling back to 'self'`);
                return selfFallback('active-a2a-participants-missing-provider');
            }
            const participants = (await activeA2aParticipantsProvider()) || [];
            const seen         = new Set();
            const out          = [];
            if (normalizedSelf) {
                seen.add(normalizedSelf);
                out.push(normalizedSelf);
            }
            for (const raw of participants) {
                const id = normalizeAgentIdentityNodeId(raw);
                if (id && !isHeartbeatTargetEligible(id)) continue;
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
