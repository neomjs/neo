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
 * Beacon-horizon derivation: the plane's verbose rows vouch the beacon horizons per seat
 * (`signals.turnPresence.freshUntil` / `.expiresAt`, verbatim from the TurnPresenceService
 * observation), and the `active-turn` grade DERIVES from those
 * vouched horizons evaluated at THIS snapshot's own `capturedAt` bound — never from the
 * producer-computed `fresh` boolean when horizons are present. The boolean was stamped at the
 * producer's clock; the envelope declares `capturedAt` as the observation-time bound for every
 * row, so the grade and the bound must share one clock value or the render lies by skew. Rows
 * whose producers vouch NO horizons (older projection, degraded tier) fall back to the vouched
 * boolean — absence of the horizon tier produces absence of refinement, never a verdict. No
 * second clock authority: this module evaluates vouched instants against a vouched bound; it
 * never re-computes liveness with windows of its own.
 */

import {redactCredentials} from './redactCredentials.mjs'

/**
 * The closed presence band vocabulary — the plane's shipped `who_is_online` embryo. This adapter
 * is the vocabulary's ONE exporting home; the decomposed wake-routes source imports it for its own
 * presence axis so the two consumers can never drift.
 * @type {String[]}
 */
export const PRESENCE_STATES = Object.freeze(['online', 'idle', 'dark', 'benched', 'neverConnected'])

/**
 * The GRADED render vocabulary this adapter emits — the banded recency contract derived from the
 * plane's verdicts plus the vouched beacon horizons: `active-turn` (a fresh turn-presence beacon —
 * mid-turn RIGHT NOW, regardless of add_memory staleness: the 70-minute-turn flap falsifier) ·
 * `fresh` (the plane says online: recent durable activity, no fresh beacon) · `recent` (the
 * plane's idle window) · `dark` (rostered, not recently seen), with the membership facts
 * (`benched` / `neverConnected`) passing through untouched — they are participation truth, not
 * recency grades. The grade DERIVES; it never re-computes liveness (no second clock authority).
 * @type {String[]}
 */
export const PRESENCE_BANDS = Object.freeze(['active-turn', 'fresh', 'recent', 'dark', 'benched', 'neverConnected'])

/**
 * @summary Grade one plane presence verdict + its vouched beacon signal onto the banded render
 * vocabulary. Pure and total: an out-of-vocabulary input state passes through unchanged (the
 * caller's own closed-set admission already refused it — this function never fabricates a grade).
 * @param {Object} options
 * @param {String} options.state The plane's own verdict (`online` · `idle` · `dark` · `benched` · `neverConnected`).
 * @param {Boolean} [options.beaconFresh=false] Whether the row's vouched turn-presence beacon is fresh.
 * @returns {String}
 */
export function gradePresenceBand({state, beaconFresh = false} = {}) {
    // membership facts are never recency-graded — a fresh beacon cannot rescue a benched seat
    // here any more than it may in the plane's own hard gate
    if (state === 'benched' || state === 'neverConnected') {
        return state
    }

    if (beaconFresh) {
        return 'active-turn'
    }

    return state === 'online' ? 'fresh' : state === 'idle' ? 'recent' : state
}

/**
 * @summary Derive one row's beacon freshness from its vouched horizons, evaluated at the
 * snapshot's observation bound. Pure and total — the ONE place beacon freshness is decided.
 *
 * Precedence: an expired observation (`expiresAt` at/behind the bound) vouches nothing,
 * whatever its `fresh` boolean claims; a present `freshUntil` governs against the bound (the
 * producer's boolean was stamped at the PRODUCER's clock — trusting it across the skew is how a
 * finished turn keeps rendering `active-turn`); horizons absent or unparseable fall back to the
 * vouched boolean (tier degradation: no horizon tier ⇒ no refinement, never a verdict); no
 * usable bound falls back the same way.
 * @param {Object} options
 * @param {Object|null} [options.turnPresence] The row's vouched beacon observation
 *     (`{fresh, freshUntil, expiresAt, …}`) — `null` when the seat emitted none.
 * @param {Number|null} [options.boundAt] The snapshot's observation bound as epoch ms.
 * @returns {Boolean}
 */
export function beaconFreshAtBound({turnPresence, boundAt = null} = {}) {
    if (!turnPresence || typeof turnPresence !== 'object') {
        return false
    }

    const booleanFallback = turnPresence.fresh === true

    if (!Number.isFinite(boundAt)) {
        return booleanFallback
    }

    const expiresAt = toTime(turnPresence.expiresAt)

    // the expired-observation veto precedes EVERY other signal — including the boolean
    // fallback for degraded horizon tiers: a row whose freshUntil is absent or malformed
    // must still lose a validly expired observation, or the fallback re-opens the exact
    // producer-clock trust this helper exists to close
    if (expiresAt !== null && expiresAt <= boundAt) {
        return false
    }

    const freshUntil = toTime(turnPresence.freshUntil)

    if (freshUntil === null) {
        return booleanFallback
    }

    return freshUntil > boundAt
}

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
 *     identity. The default canonicalizes into the report's `@<login>` shape while accepting the
 *     registry's FULL production input domain: `defineAgent` stores `githubUsername` unchanged and
 *     requires only truthiness, so a persisted `@neo-gpt` and a bare `neo-gpt` are BOTH accepted
 *     spellings of one seat — leading `@`s are stripped before the single canonical prefix, so an
 *     answered plane row is never converted into a fabricated `seat absent` by spelling alone.
 * @param {Date|String} [options.capturedAt] Capture timestamp — the observation-time bound above.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, presence, lastSeenAt, confidence, source}` (+ `reason` when `presence` is
 *     `unknown`).
 */
export async function readFleetPresenceSnapshot({
    agents = [],
    readPresence = null,
    presenceIdentityFor = presenceIdentityForAgent,
    capturedAt = new Date()
} = {}) {
    const hasReader = typeof readPresence === 'function',
          // ONE resolved bound: the same instant the envelope declares as `capturedAt` is the
          // instant every beacon horizon is evaluated against — bound and declaration can never
          // drift apart by clock skew or a second `new Date()`
          capturedAtIso = toIsoString(capturedAt),
          capturedAtMs  = new Date(capturedAtIso).getTime(),
          states        = []

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
                        state      : row.state,
                        // the vouched beacon observation (horizons + boolean): the ONLY input the
                        // recency grade adds over the plane's own verdict — evaluated at the
                        // snapshot bound below, never trusted at the producer's clock
                        beaconFresh: beaconFreshAtBound({turnPresence: row.signals?.turnPresence, boundAt: capturedAtMs}),
                        lastSeenAt : row.signals?.activityRecency?.lastActivityAt ?? null,
                        reason     : typeof row.reason === 'string' ? redactReason(row.reason) : null
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
                // the emitted band is the GRADED vocabulary: the plane's verdict refined by the
                // vouched beacon (a fresh beacon grades active-turn even over stale add_memory —
                // the long-turn flap falsifier), membership facts passing through untouched
                presence   = gradePresenceBand({state: row.state, beaconFresh: row.beaconFresh})
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
            capturedAt: capturedAtIso,
            reason    : producerAnswered ? null : readReason
        },
        states
    }
}

/**
 * @summary The default registry-row → presence-report identity join, canonicalized over the
 * registry's production input domain: `FleetRegistryService.defineAgent` stores `githubUsername`
 * unchanged (truthiness is its only requirement), so `neo-gpt` and `@neo-gpt` are both accepted
 * persisted spellings of one seat. Leading `@`s are stripped before the single canonical prefix —
 * a spelling variant must never convert an ANSWERED plane row into a fabricated `seat absent`.
 * Exported so the wake-routes sibling (and the family repair of the shared join pattern) can adopt
 * the same canonicalization instead of growing a second divergent one.
 * @param {Object} agent Registry roster row.
 * @returns {String} `@<login>` — the presence report's identity shape.
 */
export function presenceIdentityForAgent(agent) {
    return `@${String(agent.githubUsername ?? agent.id).replace(/^@+/, '')}`
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}

function toTime(value) {
    if (value == null) return null

    const time = new Date(value).getTime()

    return Number.isNaN(time) ? null : time
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
