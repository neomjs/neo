/**
 * @module ai/services/memory-core/helpers/recentTurnsFetchPage
 * @summary Adapts Memory Core's `queryRecentTurns` into the `fetchPage` seam the chronological window-source
 * spine walks — the one impure edge that turns the recency-cursor contract into paginable window sources.
 *
 * `queryRecentTurns({agentIdentity, before, limit}) => {turns:[{id, timestamp, …}], nextCursor:{timestamp,id}|null}`
 * returns reverse-chronological turns and a compound `{timestamp, id}` cursor to pass back as `before`. This
 * factory binds that method behind a `fetchPage({identity, cursor})` closure so the pure spine
 * ({@link enumerateChronologicalWindowSources}) can exhaust it identity-by-identity. `queryRecentTurns`
 * signals failure by RETURNING `{error, message}` (it never vetoes a turn save by throwing); this adapter
 * converts that into a thrown error so the spine's per-identity walk degrades the coverage manifest rather
 * than silently treating an errored page as an exhausted one.
 */

/**
 * @summary Builds a `fetchPage({identity, cursor})` closure over an injected `queryRecentTurns`.
 * @param {Object} options
 * @param {Function} options.queryRecentTurns The bound Memory Core method (injected — keeps this testable).
 * @param {Number} [options.limit=100] Page size (the method caps at its own bound; 100 matches the tool cap).
 * @returns {Function} `async ({identity, cursor}) => {items: [{id, timestamp, type}], nextCursor}`.
 */
export function makeRecentTurnsFetchPage({queryRecentTurns, limit = 100} = {}) {
    if (typeof queryRecentTurns !== 'function') {
        throw new Error('makeRecentTurnsFetchPage: an injected `queryRecentTurns` function is required')
    }

    return async function fetchPage({identity, cursor}) {
        const result = await queryRecentTurns({agentIdentity: identity, before: cursor, limit});

        // queryRecentTurns returns an error envelope instead of throwing — surface it as a throw so the
        // spine's per-identity catch degrades coverage (an errored page must never look exhausted).
        if (result?.error) {
            throw new Error(`query_recent_turns failed for ${identity}: ${result.message || result.error}`)
        }

        const turns = Array.isArray(result?.turns) ? result.turns : [];

        // Preserve the fidelity fields the downstream synthesis + citation-prominence read: a turn IS a
        // `memory` record, so it is typed as such — citationProminence classifies memory/session/adr/pr,
        // and the previous `'turn'` literal fell to its default and could NEVER earn direct citation.
        // sessionId, impact, and summary carry through for prominence + session drill-down. Explicit
        // (not a spread) so the window-source item stays a known shape.
        return {
            items: turns.map(turn => ({
                id       : turn.id,
                timestamp: turn.timestamp,
                type     : 'memory',
                sessionId: turn.sessionId,
                impact   : turn.impact,
                summary  : turn.summary
            })),
            nextCursor: result?.nextCursor ?? null
        }
    }
}
