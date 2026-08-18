/**
 * @module ai/services/fleet/operatorSeatConflation
 * @summary The operator-seat conflation check, as one pure decision leaf: a fleet transport whose
 * resolved viewer claim IS a registered agent identity attributes every operator action to that
 * seat — messages an agent never wrote enter the identity graph as the agent's own words, the
 * worst pollution class a provenance-first substrate has. Admission itself is correct (the claim
 * is the credential's true subject); what is missing without this check is HONESTY about what
 * that subject means at an operator keyboard.
 *
 * The check is deliberately a pure function over two facts the caller already holds (the resolved
 * viewer identity + the registry's public agent list), so the boot path, the cockpit, and the
 * unit suite all consume the identical decision — no re-derivation, no drift.
 */

/**
 * @summary Decide whether a resolved viewer claim collides with a registered agent identity.
 *
 * Identity forms are canonicalized on both sides (`@`-prefix stripped, case preserved — agent
 * ids are case-sensitive registry keys). An empty registry answers `null` (cannot judge), never
 * `{conflated: false}` — absence of roster truth is not a clean bill.
 *
 * @param {Object} options
 * @param {String|null} options.viewerIdentity The transport's resolved viewer claim (`@`-form or bare).
 * @param {String[]} [options.registeredIds=[]] Registered agent identities (`@`-form or bare).
 * @returns {{conflated: Boolean, seatIdentity: String}|null} The decision, or `null` when either
 *     side is missing — the caller renders unknown as unknown.
 */
export function describeOperatorSeatConflation({viewerIdentity, registeredIds = []} = {}) {
    if (typeof viewerIdentity !== 'string' || !viewerIdentity.trim() || !Array.isArray(registeredIds) || registeredIds.length < 1) {
        return null
    }

    const
        bare      = id => String(id).trim().replace(/^@/, ''),
        viewer    = bare(viewerIdentity),
        conflated = registeredIds.some(id => bare(id) === viewer);

    return {conflated, seatIdentity: `@${viewer}`}
}

/**
 * @summary The boot-log sentence for a conflated seat — one place owns the wording, so the server
 * warn and any future surface say the same thing.
 * @param {String} seatIdentity The `@`-form seat the transport is bound to.
 * @returns {String}
 */
export function operatorSeatConflationWarning(seatIdentity) {
    return `OPERATOR-SEAT CONFLATION: the transport viewer (${seatIdentity}) is a REGISTERED AGENT identity — operator actions through this session will be attributed to that seat. Establish an operator-class credential (an explicit NEO_FLEET_PLANE_BEARER whose subject is the operator, or gh auth as the operator's own identity) so the transport fact becomes true.`
}

export default describeOperatorSeatConflation;
