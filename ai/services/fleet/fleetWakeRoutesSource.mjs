import {redactCredentials} from './redactCredentials.mjs'

/**
 * @module ai/services/fleet/fleetWakeRoutesSource
 * @summary The DECOMPOSED per-seat wake-route read: one row per registered agent carrying each
 * axis of the wake path separately — subscription intent, seat-side route arming, delivery-lane
 * liveness, the last terminal delivery failure, and presence freshness — plus a capability
 * envelope declaring how much of that truth was reachable.
 *
 * The sibling wake view (`fleetWakeStateAdapter.readFleetWakeStateSnapshot`) FUSES its axes into
 * one taxonomy word per agent, which is right for a roster telltale and wrong for diagnosis: a
 * fused verdict cannot say WHICH leg broke, and a crash-loop that hides behind a healthy-looking
 * fused answer is precisely the incident class this surface exists to end. This source never
 * fuses: every axis answers as itself, with its own reason when it cannot answer.
 *
 * Fail-honest discipline, verbatim from the adapter it complements: every unreachable source
 * degrades to its own `unknown` with the reason preserved; an axis nobody can observe yet is a
 * typed `unobserved`, never a fabricated healthy default; and a throwing collaborator can never
 * take a sibling axis down with it. The source resolves no configuration — every read path is
 * injected at the composing entrypoint, and construction refuses to exist without the collaborators
 * it cannot honestly substitute.
 */

export const WAKE_ROUTES_SOURCE_LABEL = 'fleet:wakeRoutes'

const
    DELIVERY_STATES  = Object.freeze(['alive', 'down', 'unknown']),
    PRESENCE_STATES  = Object.freeze(['online', 'idle', 'dark', 'benched', 'neverConnected']),
    ARMED_UNOBSERVED = Object.freeze({
        state : 'unobserved',
        reason: 'seat-side route arming is not exposed to the fleet server yet'
    })

/**
 * @summary Builds the wake-routes read source over injected collaborators.
 * @param {Object} options
 * @param {Function} options.listAgents `() => Object[]` registry roster rows (each needs an `id`).
 * @param {Function} options.resolveViewerIdentity `() => String|null` — the authenticated viewer.
 * @param {Function|null} [options.listActiveSubscriptionIdentities] `() => Iterable<String>`
 *     (sync or async) yielding wake identities holding an ACTIVE subscription. Absent ⇒ the
 *     subscription axis is honestly unreadable for every seat.
 * @param {Function|null} [options.resolveDeliveryLiveness] `() => {alive: Boolean|'unknown',
 *     reason}` (sync or async) — the delivery-lane authority. Absent ⇒ axis unknown with reason.
 * @param {Function|null} [options.resolveTerminalDeliveryFailures] `() => {state:
 *     'observed'|'unknown', reason, byIdentity: Map}` (sync or async). Absent ⇒ axis unknown.
 * @param {Function|null} [options.readPresence] `() => Object` (sync or async) resolving the
 *     roster-presence report (`who_is_online` payload shape: `{agents: [{identity, state,
 *     reason, signals}]}`). Absent ⇒ the presence axis is a typed `unobserved`.
 * @param {Function} [options.wakeIdentityFor] `(agent) => String` roster row → wake identity.
 *     Default: `'@' + (githubUsername ?? id)` — the swarm's mailbox-identity convention.
 * @param {Function} [options.now] Clock override for tests.
 * @returns {{readWakeRoutes: Function}}
 */
export function createFleetWakeRoutesSource({
    listAgents,
    resolveViewerIdentity,
    listActiveSubscriptionIdentities = null,
    resolveDeliveryLiveness = null,
    resolveTerminalDeliveryFailures = null,
    readPresence = null,
    wakeIdentityFor = agent => `@${agent.githubUsername ?? agent.id}`,
    now = () => new Date()
} = {}) {
    if (typeof listAgents !== 'function') {
        throw new TypeError('createFleetWakeRoutesSource requires a listAgents collaborator')
    }
    if (typeof resolveViewerIdentity !== 'function') {
        throw new TypeError('createFleetWakeRoutesSource requires a resolveViewerIdentity collaborator')
    }

    /**
     * @summary Reads one decomposed wake-route snapshot across the registered roster.
     * @returns {Promise<Object>} `{capability, viewer, count, seats}` — see the module note.
     */
    async function readWakeRoutes() {
        const
            viewer       = safeViewer(resolveViewerIdentity),
            subscription = await readSubscriptionAxis(listActiveSubscriptionIdentities),
            delivery     = await readDeliveryAxis(resolveDeliveryLiveness),
            failures     = await readFailuresAxis(resolveTerminalDeliveryFailures),
            presence     = await readPresenceAxis(readPresence)

        let agents

        try {
            agents = await listAgents()
        } catch (error) {
            // No roster means no rows CAN exist — that is a source-level degrade, not an empty fleet.
            return {
                capability: {
                    source    : WAKE_ROUTES_SOURCE_LABEL,
                    state     : 'degraded',
                    confidence: 'none',
                    capturedAt: toIsoString(now()),
                    reason    : redactReason(error) || 'fleet roster unreadable'
                },
                viewer,
                count: 0,
                seats: []
            }
        }

        const seats = []

        for (const agent of Array.isArray(agents) ? agents : []) {
            if (!agent?.id) continue

            const identity = wakeIdentityFor(agent)

            seats.push({
                agentId      : agent.id,
                agentIdentity: identity,
                subscription : subscription.rowFor(identity),
                armed        : {...ARMED_UNOBSERVED},
                delivery     : {state: delivery.state, reason: delivery.reason},
                lastFailure  : failures.rowFor(identity),
                presence     : presence.rowFor(identity)
            })
        }

        // Axis availability decides the envelope: every axis answering = wired/observed; some =
        // degraded/partial (the reason names each silent axis); none = degraded/none. "We cannot
        // see" stays distinguishable from "the route is down" — per axis AND per envelope.
        const
            axisOk   = [subscription.ok, delivery.ok, failures.ok, presence.ok],
            fullyOk  = axisOk.every(Boolean),
            anyTruth = axisOk.some(Boolean)

        return {
            capability: {
                source    : WAKE_ROUTES_SOURCE_LABEL,
                state     : fullyOk ? 'wired' : 'degraded',
                confidence: fullyOk ? 'observed' : (anyTruth ? 'partial' : 'none'),
                capturedAt: toIsoString(now()),
                reason    : fullyOk ? null : [
                    subscription.ok ? null : `subscription axis: ${subscription.reason}`,
                    delivery.ok     ? null : `delivery axis: ${delivery.reason}`,
                    failures.ok     ? null : `failure axis: ${failures.reason}`,
                    presence.ok     ? null : `presence axis: ${presence.reason}`
                ].filter(Boolean).join('; ') || null
            },
            viewer,
            count: seats.length,
            seats
        }
    }

    return {readWakeRoutes}
}

/**
 * @summary Resolves the subscription axis once per snapshot: a bulk identity scan becomes a
 * per-seat membership answer. A missing reader or a failed scan degrades EVERY seat's axis with
 * the same reason — never a fabricated `none`.
 * @param {Function|null} listActiveSubscriptionIdentities
 * @returns {Promise<{ok: Boolean, reason: String|null, rowFor: Function}>}
 * @private
 */
async function readSubscriptionAxis(listActiveSubscriptionIdentities) {
    if (typeof listActiveSubscriptionIdentities !== 'function') {
        const reason = 'subscription read path unavailable'

        return {ok: false, reason, rowFor: () => ({state: 'unknown', reason})}
    }

    try {
        const identities = new Set(await listActiveSubscriptionIdentities())

        return {
            ok    : true,
            reason: null,
            rowFor: identity => identities.has(identity)
                ? {state: 'active', reason: null}
                : {state: 'none', reason: null}
        }
    } catch (error) {
        const reason = redactReason(error) || 'subscription scan failed'

        return {ok: false, reason, rowFor: () => ({state: 'unknown', reason})}
    }
}

/**
 * @summary Resolves the delivery-lane axis under the injected-resolver contract: `alive` must be
 * `true`/`false`/`'unknown'`; a throw or an out-of-contract answer degrades to `unknown` with the
 * reason preserved — an injected authority can never fabricate a state.
 * @param {Function|null} resolveDeliveryLiveness
 * @returns {Promise<{ok: Boolean, state: String, reason: String|null}>}
 * @private
 */
async function readDeliveryAxis(resolveDeliveryLiveness) {
    if (typeof resolveDeliveryLiveness !== 'function') {
        return {ok: false, state: 'unknown', reason: 'delivery liveness read path unavailable'}
    }

    let answer

    try {
        answer = await resolveDeliveryLiveness()
    } catch (error) {
        return {ok: false, state: 'unknown', reason: redactReason(error) || 'delivery liveness read failed'}
    }

    const alive = answer?.alive

    if (alive === true)  return {ok: true, state: 'alive', reason: null}
    if (alive === false) return {ok: true, state: 'down', reason: redactReason(answer.reason)}

    return {
        ok    : false,
        state : 'unknown',
        reason: redactReason(answer?.reason) || (alive === 'unknown'
            ? 'delivery liveness resolver answered unknown'
            : 'delivery liveness resolver returned an out-of-contract value')
    }
}

/**
 * @summary Resolves the terminal-failure axis: `state` must be `'observed'`/`'unknown'` with a
 * `byIdentity` Map — anything else degrades to `unknown` for every seat. Observed-with-no-receipt
 * is a first-class healthy answer, distinct from unreadable.
 * @param {Function|null} resolveTerminalDeliveryFailures
 * @returns {Promise<{ok: Boolean, reason: String|null, rowFor: Function}>}
 * @private
 */
async function readFailuresAxis(resolveTerminalDeliveryFailures) {
    const degraded = reason => ({
        ok    : false,
        reason,
        rowFor: () => ({state: 'unknown', reason, receipt: null})
    })

    if (typeof resolveTerminalDeliveryFailures !== 'function') {
        return degraded('terminal delivery read path unavailable')
    }

    let answer

    try {
        answer = await resolveTerminalDeliveryFailures()
    } catch (error) {
        return degraded(redactReason(error) || 'terminal delivery read failed')
    }

    if ((answer?.state !== 'observed' && answer?.state !== 'unknown') || !(answer?.byIdentity instanceof Map)) {
        return degraded('terminal delivery resolver returned an out-of-contract value')
    }

    if (answer.state === 'unknown') {
        return degraded(redactReason(answer.reason) || 'terminal delivery resolver answered unknown')
    }

    return {
        ok    : true,
        reason: null,
        rowFor: identity => {
            const receipt = answer.byIdentity.get(identity)?.[0] || null

            return {
                state  : 'observed',
                reason : receipt ? `terminal wake delivery failure: ${receipt.errorClass}` : null,
                receipt: receipt ? {errorClass: receipt.errorClass, failedAt: receipt.failedAt} : null
            }
        }
    }
}

/**
 * @summary Resolves the presence axis from the roster-presence report. Absent reader ⇒ typed
 * `unobserved` (nobody asked — never rendered as absence); malformed or throwing reader ⇒
 * `unknown` with the reason; a seat missing from a healthy report answers `unknown` for itself
 * without degrading its siblings.
 * @param {Function|null} readPresence
 * @returns {Promise<{ok: Boolean, reason: String|null, rowFor: Function}>}
 * @private
 */
async function readPresenceAxis(readPresence) {
    if (typeof readPresence !== 'function') {
        const reason = 'presence read path unavailable'

        return {ok: false, reason, rowFor: () => ({state: 'unobserved', lastSeenAt: null, reason})}
    }

    let payload

    try {
        payload = await readPresence()
    } catch (error) {
        const reason = redactReason(error) || 'presence read failed'

        return {ok: false, reason, rowFor: () => ({state: 'unknown', lastSeenAt: null, reason})}
    }

    if (!Array.isArray(payload?.agents)) {
        const reason = 'presence answer unreadable'

        return {ok: false, reason, rowFor: () => ({state: 'unknown', lastSeenAt: null, reason})}
    }

    const byIdentity = new Map()

    for (const row of payload.agents) {
        if (typeof row?.identity !== 'string' || !PRESENCE_STATES.includes(row.state)) continue

        byIdentity.set(row.identity, {
            state     : row.state,
            lastSeenAt: row.signals?.activityRecency?.lastActivityAt ?? null,
            reason    : typeof row.reason === 'string' ? redactReason(row.reason) : null
        })
    }

    return {
        ok    : true,
        reason: null,
        rowFor: identity => byIdentity.get(identity) ??
            {state: 'unknown', lastSeenAt: null, reason: 'seat absent from the presence report'}
    }
}

function safeViewer(resolveViewerIdentity) {
    try {
        const viewer = resolveViewerIdentity()

        return typeof viewer === 'string' && viewer.length > 0 ? viewer : null
    } catch {
        return null
    }
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

export default createFleetWakeRoutesSource;
