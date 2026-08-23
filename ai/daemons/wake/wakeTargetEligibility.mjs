import {IDENTITIES}                   from '../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module Neo.ai.daemons.wake.wakeTargetEligibility
 * @summary The single definition of "may this identity receive a wake", plus the roster-versus-
 * manifest difference that detects a seat nobody routed.
 *
 * Extracted from the wake daemon rather than copied into the manifest builder. Both need the same
 * participation rule, and a second copy would drift — the builder would eventually warn about seats
 * the daemon is happily serving, or stay silent about ones it refuses. The daemon is an entry point
 * and exports nothing, so sharing required a module; this is that module and nothing more.
 */

/**
 * @summary Canonical identity → participation status, built from the repo's identity roster.
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
 * @summary True when a wake subscription target may receive wake delivery.
 *
 * Unknown identities stay eligible for forks/local custom agents. Known repo identities with
 * non-active participationStatus are filtered before coalescing so they never create delivery
 * attempts or retries.
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

/**
 * @summary Canonical, wake-eligible identities that no route serves.
 *
 * The absence this exists to make visible has no error state of its own: a manifest missing a seat
 * is simply smaller than the roster, and nothing reads a smaller set as information. That is how a
 * live seat spent its whole existence receiving another seat's wakes and none of its own — no
 * warning fired, because none was ever written.
 *
 * Anchored to {@link isWakeTargetEligible} on purpose. Most roster entries legitimately have no
 * route at any moment — benched, dark, never-connected — and warning about those would make this
 * noise on every build and get it ignored inside a week. Reusing the daemon's own predicate means
 * the warning fires for exactly the seats the daemon would try to deliver to, and for no others.
 *
 * Pure over its inputs (the roster is injectable) so the difference is testable without a live
 * plane, matching `collectThemeCoverageFailures`'s shape in the theme-coverage guard.
 *
 * @param {Object} options
 * @param {String[]} options.routedIdentities Identities the manifest actually carries a route for.
 * @param {Map<String,String>} [options.participation=identityParticipationById] Roster to test against.
 * @returns {String[]} Canonical ids, sorted, that are eligible and unrouted.
 */
export function collectUnroutedEligibleIdentities({routedIdentities=[], participation=identityParticipationById}={}) {
    const routed = new Set(routedIdentities.filter(Boolean).map(normalizeAgentIdentityNodeId));

    return [...participation.keys()]
        .filter(identity => !routed.has(identity) && isWakeTargetEligible(identity, participation))
        .sort()
}
