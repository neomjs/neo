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

import {redactCredentials} from './redactCredentials.mjs'

export const THROTTLE_STATES = Object.freeze(['none', 'overage', 'rate-limited', 'unknown'])

export const THROTTLE_SOURCE_LABEL = 'fleet:throttleState'

/**
 * @summary Reads the fleet-wide throttle-state observation snapshot: one taxonomy row per agent
 * plus a capability envelope declaring whether the truth source answered.
 *
 * Capability semantics mirror the wake sibling: `wired/observed` when the injected reader answered
 * in-contract for every agent, `degraded/none` when no reader exists (the platform's current
 * state), and `degraded/partial` when SOME truth flowed — a reader that threw for some agents or
 * returned out-of-contract values degrades the capability with the causes counted, so a broken
 * producer can never hide under `wired/observed`. Diagnostics are row-LOCAL and REDACTED before
 * any Body projection.
 *
 * **Freshness bound (the reader contract):** the reader runs synchronously *within* this snapshot,
 * so the envelope's `capturedAt` IS the observation-time bound for every row — a consumer never
 * has to guess row staleness relative to the envelope. A future watchdog producer that samples
 * asynchronously must either resolve within the snapshot call or report `unknown` for data it
 * cannot vouch for at call time; pre-sampled staleness beyond that bound is the producer's residual
 * to declare, never this adapter's to hide.
 * @param {Object} options={}
 * @param {Object[]} [options.agents] Registry roster rows; each needs an `id`.
 * @param {Function|null} [options.resolveThrottleState] `(agent) => 'none'|'overage'|'rate-limited'|'unknown'`
 *     (sync or async, resolving within the snapshot call). Absent ⇒ every row is honestly
 *     `unknown` — the documented platform truth until a watchdog-grade producer lands.
 * @param {Date|String} [options.capturedAt] Capture timestamp — the observation-time bound above.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, throttle, confidence, source}` (+ `reason` when `throttle` is `unknown`).
 */
export async function readFleetThrottleStateSnapshot({
    agents = [],
    resolveThrottleState = null,
    capturedAt = new Date()
} = {}) {
    const hasReader = Boolean(resolveThrottleState),
          states    = []

    let failedRows  = 0,
        invalidRows = 0

    for (const agent of asArray(agents)) {
        const agentId = agent?.id

        if (!agentId) continue

        // Diagnostics are ROW-LOCAL by contract: one agent's reader failure names only its own
        // row — sibling rows keep their own truth and their own reasons.
        let throttle  = 'unknown',
            rowReason = hasReader ? null : 'no throttle truth source exists yet: watchdog-signals producer not landed'

        if (hasReader) {
            try {
                const answer = await resolveThrottleState(agent)

                if (answer === 'unknown') {
                    rowReason = 'truth source answered unknown'
                } else if (THROTTLE_STATES.includes(answer)) {
                    throttle = answer
                } else {
                    // An out-of-contract answer is an INVALID result, not a quiet unknown — it is
                    // counted into the capability so a producer-contract violation is visible.
                    invalidRows++
                    rowReason = 'truth source returned an out-of-contract value'
                }
            } catch (error) {
                failedRows++
                rowReason = redactReason(error)
            }
        }

        const row = {
            agentId,
            throttle,
            confidence: throttle === 'unknown' ? 'none' : 'observed',
            source    : THROTTLE_SOURCE_LABEL
        }

        if (throttle === 'unknown') {
            row.reason = rowReason || 'throttle state unreadable'
        }

        states.push(row)
    }

    const fullyOk = hasReader && failedRows === 0 && invalidRows === 0

    return {
        capability: {
            source    : THROTTLE_SOURCE_LABEL,
            state     : fullyOk ? 'wired' : 'degraded',
            confidence: fullyOk ? 'observed' : (hasReader ? 'partial' : 'none'),
            capturedAt: toIsoString(capturedAt),
            reason    : fullyOk ? null : [
                hasReader ? null : 'no throttle truth source exists yet: watchdog-signals producer not landed',
                failedRows > 0 ? `throttle reader failed for ${failedRows} agent(s)` : null,
                invalidRows > 0 ? `throttle reader returned out-of-contract values for ${invalidRows} agent(s)` : null
            ].filter(Boolean).join('; ') || null
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

/**
 * @summary Bounds AND redacts a diagnostic before it can reach a Body-side projection: whitespace
 * collapsed and length capped here, credentials masked by the shared authority — a throwing
 * transport's dump can never leak internals into a row reason.
 *
 * The masking used to live inline, and this JSDoc used to promise that consolidating it into a
 * shared module "rides the post-merge alignment of the two producer branches". It didn't: the
 * private copy shipped, four siblings grew their own, and none of the five learned `github_pat_`
 * when that family arrived — every one leaked a fine-grained PAT verbatim into an operator-visible
 * reason. Bounding stays local because each adapter's caps differ; masking is the shared contract
 * because a per-adapter copy is exactly how the gap survived.
 *
 * @param {*} error
 * @returns {String|null}
 */
function redactReason(error) {
    if (error == null) return null

    return redactCredentials(normalizeReason(error))
}

function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
