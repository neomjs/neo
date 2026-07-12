/**
 * @module ai/services/memory-core/helpers/citationProminence
 * @summary Annotates enumerated sources with citation **prominence** — which of them the concise narrative
 * foregrounds and direct-cites — WITHOUT ever changing which sources are admitted.
 *
 * This is the fidelity discipline of the temporal Bird View: high-impact sessions and accepted ADRs earn a
 * direct citation, and a resolved pull request earns prominence only through a NAMED fidelity marker
 * (an accepted-ADR link, an epic label, or high-impact review metadata) — never an invented universal PR
 * impact score. The load-bearing separation: prominence is NOT admission. Every enumerated source stays in
 * the coverage manifest and remains drill-down-citable; prominence only decides emphasis, so a low-impact
 * session is never silently dropped from the window it belongs to.
 */

const PROMINENT_SESSION_IMPACT = 90;

/**
 * @summary Decides whether one source earns direct-citation prominence in the narrative.
 * @param {Object} source A source record `{id, type, impact?, accepted?, acceptedAdrLink?, epicLabel?, highImpactReview?}`.
 * @returns {Boolean}
 */
function isProminentSource(source) {
    switch (source?.type) {
        case 'session':
        case 'memory':
            // high-impact sessions (>= the direct-cite threshold) cite directly
            return Number(source.impact) >= PROMINENT_SESSION_IMPACT;
        case 'adr':
            // accepted ADRs cite directly
            return source.accepted === true;
        case 'pull-request':
            // PR fidelity flows through a NAMED source only — accepted-ADR link, epic label, or high-impact
            // review metadata. NO invented universal PR impact score.
            return Boolean(source.acceptedAdrLink || source.epicLabel || source.highImpactReview);
        default:
            return false
    }
}

/**
 * @summary Annotates each source with `prominent` (direct-citation emphasis) — admission is untouched.
 * @param {Object[]} sources Enumerated window sources (the complete, admitted manifest).
 * @returns {Object[]} The same sources, order preserved, each with a `prominent` boolean.
 */
export function annotateCitationProminence(sources) {
    return (Array.isArray(sources) ? sources : []).map(source => ({...source, prominent: isProminentSource(source)}))
}

/**
 * @summary Partitions the annotated sources into `{prominent, context}` for prompt construction.
 *
 * The narrative foregrounds `prominent` and direct-cites it; `context` remains available for coverage and
 * drill-down but is not foregrounded. Both halves together are exactly the admitted manifest — nothing is
 * dropped, so `prominent.length + context.length === sources.length`.
 * @param {Object[]} sources Enumerated window sources.
 * @returns {{prominent: Object[], context: Object[]}}
 */
export function partitionByProminence(sources) {
    const annotated = annotateCitationProminence(sources);

    return {
        prominent: annotated.filter(source => source.prominent),
        context  : annotated.filter(source => !source.prominent)
    }
}
