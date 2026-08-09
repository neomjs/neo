/**
 * @module ai/services/fleet/fleetPresenceStateAdapter
 * @summary Maps the plane's roster-presence report onto the Fleet roster DTO — the presence axis
 * of the truth-preserving presence contract, the THIRD independent signal beside the
 * wake and throttle telltales: presence-fresh ≠ wake-route-healthy ≠ identity-bound, and no axis
 * ever infers another.
 *
 * The truth source is the identity-proven plane client's `who_is_online` report (the shipped band
 * embryo: `online | idle | dark | benched | neverConnected`, plus per-row activity recency),
 * injected through the SAME bulk `readPresence` seam the decomposed wake-routes source consumes —
 * one producer contract, two consumers, never a second authority. Host mode has no presence
 * surface yet: an absent reader leaves every row honestly `unknown` under a `degraded/none`
 * capability. That is the tier-degradation rendering contract at the producer boundary: *a
 * liveness tier a deployment cannot emit produces ABSENCE OF SIGNAL, never a verdict* — "we cannot
 * see presence" stays mechanically distinguishable from "the fleet is dark".
 *
 * Row-local honesty mirrors the wake-routes presence axis exactly: a seat missing from a HEALTHY
 * report answers `unknown` for itself (with its own reason) without degrading its siblings or the
 * capability — the producer answered in-contract; absence of one seat is that row's truth. Only a
 * missing, throwing, or out-of-contract PRODUCER degrades the capability envelope.
 *
 * Band refinement residual (deliberate): the ticket's full beacon-horizon vocabulary
 * (`active-turn / fresh / recent / dark` from `freshUntil`/`expiresAt`) lands when the plane's
 * verbose rows vouch those horizons per seat; until then this axis carries the plane's emitted
 * band set plus `lastSeenAt` recency verbatim — rendered tiers are named, absent tiers stay
 * absent, and nothing here manufactures a finer band than the producer emitted.
 */

import {redactCredentials} from './redactCredentials.mjs'

/**
 * The closed presence band vocabulary — the plane's shipped `who_is_online` embryo. This adapter
 * is the vocabulary's ONE exporting home; the decomposed wake-routes source imports it for its own
 * presence axis so the two consumers can never drift.
 * @type {String[]}
 */
export const PRESENCE_STATES = Object.freeze(['online', 'idle', 'dark', 'benched', 'neverConnected'])

export const PRESENCE_SOURCE_LABEL = 'fleet:presenceState'

/**
 * @summary Reads the fleet-wide presence snapshot: one band row per registered agent plus a
 * capability envelope declaring whether the presence producer answered.
 *
 * Capability semantics: `wired/observed` when the bulk reader answered in-contract (individual
 * seats absent from the report stay row-local `unknown` — the producer still answered);
 * `degraded/none` when no reader exists for this mode or the reader threw / answered out of
 * contract. There is no `partial` tier here by design: the producer is ONE bulk report, so it
 * either vouched the snapshot or it did not — per-seat gaps are row truth, not producer health.
 *
 * **Freshness bound (the reader contract):** the reader runs synchronously *within* this snapshot,
 * so the envelope's `capturedAt` IS the observation-time bound for every row. `lastSeenAt` carries
 * the producer's per-seat activity recency verbatim; staleness beyond the snapshot bound is the
 * producer's residual to declare, never this adapter's to hide.
 * @param {Object} options={}
 * @param {Object[]} [options.agents] Registry roster rows; each needs an `id`.
 * @param {Function|null} [options.readPresence] `() => Promise<Object>` resolving the
 *     roster-presence report (`who_is_online` payload shape: `{agents: [{identity, state, reason,
 *     signals}]}` — the same seam `wireFleetWakeRoutesSource` consumes). Absent ⇒ every row is
 *     honestly `unknown` under a degraded capability (host mode's documented truth until a host
 *     presence surface lands).
 * @param {Function} [options.presenceIdentityFor] `(agent) => String` roster row → presence report
 *     identity. Defaults to the wake seam's identity shape: `@<githubUsername ?? id>`.
 * @param {Date|String} [options.capturedAt] Capture timestamp — the observation-time bound above.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, presence, lastSeenAt, confidence, source}` (+ `reason` when `presence` is
 *     `unknown`).
 */
export async function readFleetPresenceSnapshot({
    agents = [],
    readPresence = null,
    presenceIdentityFor = agent => `@${agent.githubUsername ?? agent.id}`,
    capturedAt = new Date()
} = {}) {
    const hasReader = typeof readPresence === 'function',
          states    = []

    let byIdentity = null,
        readReason = hasReader
            ? null
            : 'no presence truth source exists for this mode: plane mode injects the who_is_online reader; a host presence surface has not landed'

    if (hasReader) {
        try {
            const payload = await readPresence()

            if (!Array.isArray(payload?.agents)) {
                readReason = 'presence answer unreadable'
            } else {
                byIdentity = new Map()

                for (const row of payload.agents) {
                    // Out-of-vocabulary rows are skipped, not admitted: a producer emitting a band
                    // this contract does not know must not leak an open enum to every consumer —
                    // the affected seat answers `unknown` via the absent-row path below instead.
                    if (typeof row?.identity !== 'string' || !PRESENCE_STATES.includes(row.state)) continue

                    byIdentity.set(row.identity, {
                        state     : row.state,
                        lastSeenAt: row.signals?.activityRecency?.lastActivityAt ?? null,
                        reason    : typeof row.reason === 'string' ? redactReason(row.reason) : null
                    })
                }
            }
        } catch (error) {
            readReason = redactReason(error) || 'presence read failed'
        }
    }

    for (const agent of asArray(agents)) {
        const agentId = agent?.id

        if (!agentId) continue

        let presence   = 'unknown',
            lastSeenAt = null,
            rowReason  = readReason

        if (byIdentity) {
            const row = byIdentity.get(presenceIdentityFor(agent))

            if (row) {
                presence   = row.state
                lastSeenAt = row.lastSeenAt
                rowReason  = row.reason
            } else {
                rowReason = 'seat absent from the presence report'
            }
        }

        const entry = {
            agentId,
            presence,
            lastSeenAt,
            confidence: presence === 'unknown' ? 'none' : 'observed',
            source    : PRESENCE_SOURCE_LABEL
        }

        if (presence === 'unknown') {
            entry.reason = rowReason || 'presence unreadable'
        }

        states.push(entry)
    }

    const producerAnswered = Boolean(byIdentity)

    return {
        capability: {
            source    : PRESENCE_SOURCE_LABEL,
            state     : producerAnswered ? 'wired' : 'degraded',
            confidence: producerAnswered ? 'observed' : 'none',
            capturedAt: toIsoString(capturedAt),
            reason    : producerAnswered ? null : readReason
        },
        states
    }
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}

function redactReason(value) {
    if (value == null) return null

    const text = String(value?.message || value || '').replace(/\s+/g, ' ').trim().slice(0, 240)

    return text ? redactCredentials(text) : null
}

function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}
