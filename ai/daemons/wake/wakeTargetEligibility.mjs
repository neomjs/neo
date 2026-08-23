import {IDENTITIES}                   from '../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module Neo.ai.daemons.wake.wakeTargetEligibility
 * @summary Two different questions about a wake identity, kept apart on purpose: may it RECEIVE a
 * wake, and should it HOLD a route.
 *
 * Extracted from the wake daemon rather than copied. Both the daemon and route tooling need the
 * participation rule, a second copy would drift, and the daemon is an entry point that exports
 * nothing. This module owns the graph read so the manifest builder does not have to — that builder
 * documents itself as importing nothing from the graph, and honouring it is what keeps host-edge
 * tooling runnable without the plane it is being wired to.
 *
 * **Conflating the two questions was a real defect.** Receive-permission is deliberately permissive:
 * an unknown identity stays eligible so forks and local custom agents keep working. Route-population
 * is a census of seats that ought to exist. Reusing the permission predicate as the census warned
 * about the human owner — permitted to receive a wake, and not a seat. It surfaced only when the
 * collector was run against the real roster: a fixture containing agents alone cannot reproduce it,
 * which is why the controls here read the live roster rather than a hand-built map.
 */

/**
 * @summary Canonical identity → participation status, over every roster entry.
 *
 * Permission, not census. This deliberately includes humans and system accounts, because
 * {@link isWakeTargetEligible} answers *may this receive a wake*, which is not *should this have a
 * route*. Do not reuse it as a route expectation.
 * @member {Map<String,String>} identityParticipationById
 */
export const identityParticipationById = new Map(
    IDENTITIES
        .filter(identity => identity.type === 'AgentIdentity')
        .map(identity => [
            normalizeAgentIdentityNodeId(identity.id),
            identity.properties?.participationStatus || 'active'
        ])
);

/**
 * @summary The identities expected to hold a wake route: active agent seats, canonical and sorted.
 *
 * `accountType` is the discriminator the roster already carries — `agent` for seats, `human` for the
 * owner, `system` for service accounts. Both filters are load-bearing: a retired agent is a seat
 * that should NOT be routed, and an active human is not a seat at all.
 *
 * Exported as canonical ids so a consumer can compare without normalising, which is what lets the
 * manifest builder stay free of graph imports.
 * @member {String[]} wakeSeatIdentities
 */
export const wakeSeatIdentities = IDENTITIES
    .filter(identity =>
        identity.type === 'AgentIdentity' &&
        identity.properties?.accountType === 'agent' &&
        (identity.properties?.participationStatus || 'active') === 'active')
    .map(identity => normalizeAgentIdentityNodeId(identity.id))
    .sort();

/**
 * @summary True when a wake subscription target may receive wake delivery.
 *
 * Unknown identities stay eligible for forks/local custom agents. Known repo identities with
 * non-active participationStatus are filtered before coalescing so they never create delivery
 * attempts or retries.
 *
 * Semantics unchanged from the daemon's original — deliberately. Tightening delivery permission is a
 * different decision from tightening a route census, and only the second is in scope here.
 * @param {String} identity Agent identity.
 * @param {Map<String,String>} [participation=identityParticipationById] Injectable for tests.
 * @returns {Boolean}
 */
export function isWakeTargetEligible(identity, participation=identityParticipationById) {
    if (!identity) return true;
    const normalizedIdentity  = normalizeAgentIdentityNodeId(identity),
          participationStatus = participation.get(normalizedIdentity);

    return !participationStatus || participationStatus === 'active';
}
