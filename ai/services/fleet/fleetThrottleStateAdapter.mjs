/**
 * @module ai/services/fleet/fleetThrottleStateAdapter
 * @summary Maps per-agent throttle observations onto the Fleet roster DTO — the throttle axis of
 * the S2 telltale taxonomy (`none | overage | rate-limited | unknown`), sibling of the wake axis.
 *
 * The hard truth about this axis, evaluated at authoring time and binding on this contract: **no
 * trustworthy throttle truth source exists in the platform yet.** Every candidate fails honestly:
 * the lifecycle service's `failureReason` is content-generic (spawn/error-class strings) and a
 * rate-limited harness typically keeps RUNNING (parked), producing no failure record at all;
 * stderr content is deliberately not retained (byte counts only, by secret-hygiene design); A2A
 * self-reports are prose, not producer-grade telemetry; provider usage APIs need credentials,
 * polling, and per-provider adapters; harness session files are heterogeneous and undocumented.
 *
 * This adapter therefore ships the CONTRACT and the SEAM: an injected `resolveThrottleState`
 * reader (the future watchdog-signals producer plugs in here — e.g. a spawn-wrapper stderr-pattern
 * watchdog or harness-emitted status files), taxonomy normalization (anything outside the four
 * values degrades to `unknown`), and the capability envelope that keeps "we cannot see"
 * distinguishable from "nothing is throttled". With no reader injected — today's platform truth —
 * every row is honestly `unknown` under a `degraded/none` capability. Absence of truth is never
 * rendered as `none`.
 */

export const THROTTLE_STATES = Object.freeze(['none', 'overage', 'rate-limited', 'unknown'])

export const THROTTLE_SOURCE_LABEL = 'fleet:throttleState'

/**
 * @summary Reads the fleet-wide throttle-state observation snapshot: one taxonomy row per agent
 * plus a capability envelope declaring whether the truth source answered.
 *
 * Capability semantics mirror the wake sibling: `wired/observed` when the injected reader answered
 * for every agent, `degraded/none` when no reader exists (the platform's current state), and
 * `degraded/partial` when the reader answered for some agents and failed for others.
 * @param {Object} options={}
 * @param {Object[]} [options.agents] Registry roster rows; each needs an `id`.
 * @param {Function|null} [options.resolveThrottleState] `(agent) => 'none'|'overage'|'rate-limited'|'unknown'`
 *     (sync or async). Absent ⇒ every row is honestly `unknown` — the documented platform truth
 *     until a watchdog-grade producer lands and injects here.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, throttle, confidence, source}` (+ `reason` when `throttle` is `unknown`).
 */
export async function readFleetThrottleStateSnapshot({
    agents = [],
    resolveThrottleState = null,
    capturedAt = new Date()
} = {}) {
    let sourceOk      = Boolean(resolveThrottleState),
        sourceFailure = resolveThrottleState ? null : 'no throttle truth source exists yet: watchdog-signals producer not landed',
        anyFailed     = false

    const states = []

    for (const agent of asArray(agents)) {
        const agentId = agent?.id

        if (!agentId) continue

        let throttle = 'unknown',
            reason   = sourceFailure

        if (resolveThrottleState) {
            try {
                throttle = normalizeThrottleState(await resolveThrottleState(agent))
                reason   = throttle === 'unknown' ? 'truth source answered unknown' : null
            } catch (error) {
                anyFailed = true
                reason    = normalizeReason(error)
            }
        }

        const row = {
            agentId,
            throttle,
            confidence: throttle === 'unknown' ? 'none' : 'observed',
            source    : THROTTLE_SOURCE_LABEL
        }

        if (throttle === 'unknown') {
            row.reason = reason || 'throttle state unreadable'
        }

        states.push(row)
    }

    const fullyOk = sourceOk && !anyFailed

    return {
        capability: {
            source    : THROTTLE_SOURCE_LABEL,
            state     : fullyOk ? 'wired' : 'degraded',
            confidence: fullyOk ? 'observed' : (sourceOk ? 'partial' : 'none'),
            capturedAt: toIsoString(capturedAt),
            reason    : fullyOk ? null : (sourceOk ? 'throttle truth source failed for some agents' : sourceFailure)
        },
        states
    }
}

/**
 * @summary Clamps a reader's answer to the taxonomy — anything else degrades to `unknown`, so a
 * future producer can never smuggle a fifth state (or a typo) into the telltale contract.
 * @param {*} value
 * @returns {'none'|'overage'|'rate-limited'|'unknown'}
 */
export function normalizeThrottleState(value) {
    return THROTTLE_STATES.includes(value) && value !== 'unknown' ? value : 'unknown'
}

function normalizeReason(error) {
    return String(error?.message || error || 'source unavailable').replace(/\s+/g, ' ').slice(0, 240)
}

function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
