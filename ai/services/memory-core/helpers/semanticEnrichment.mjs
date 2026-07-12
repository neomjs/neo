/**
 * @module ai/services/memory-core/helpers/semanticEnrichment
 * @summary Adapts Memory Core's `queryMemories` (relevance-ranked semantic search) into a BEST-EFFORT theme
 * enrichment for the temporal Bird View — recovers what a window was *about*, never what it *contained*.
 *
 * Enrichment is strictly additive: it surfaces semantic/theme evidence the concise narrative can foreground,
 * and it is capped and relevance-ranked, so it can NEVER prove window completeness. The load-bearing
 * consequence: this adapter's `degraded` flag is entirely SEPARATE from the chronological coverage spine.
 * An enrichment failure means fewer themes to foreground — it must never withhold the narrative, degrade
 * `coverage`, or make a complete window look incomplete. Completeness is the recency spine's job alone.
 */

/**
 * @summary Extracts a safe message string from a thrown value.
 * @param {*} error
 * @returns {String}
 */
function errMsg(error) {
    return error instanceof Error ? error.message : String(error)
}

/**
 * @summary Builds a best-effort `enrich({query})` closure over an injected `queryMemories`.
 * @param {Object} options
 * @param {Function} options.queryMemories The bound Memory Core method (injected — keeps this testable).
 * @param {Number} [options.nResults=100] Result cap (the tool caps at 100; enrichment is a sample, never a census).
 * @returns {Function} `async ({query, windowStart, windowEnd}) => {themes, degraded, reason}` — themes are
 * window-bound to [windowStart, windowEnd) so enrichment never imports a theme from outside the window.
 */
export function makeSemanticEnrichment({queryMemories, nResults = 100} = {}) {
    if (typeof queryMemories !== 'function') {
        throw new Error('makeSemanticEnrichment: an injected `queryMemories` function is required')
    }

    return async function enrich({query, windowStart, windowEnd} = {}) {
        if (typeof query !== 'string' || query.length === 0) {
            return {themes: [], degraded: true, reason: 'no-query'}
        }

        let result;

        try {
            result = await queryMemories({query, nResults})
        } catch (error) {
            // best-effort: a semantic-search failure yields no themes but NEVER touches coverage
            return {themes: [], degraded: true, reason: `enrichment-failed: ${errMsg(error)}`}
        }

        if (result?.error) {
            return {themes: [], degraded: true, reason: `enrichment-error: ${result.error}`}
        }

        const results = Array.isArray(result?.results) ? result.results : [];

        // Window-bind the enrichment: a relevance-ranked semantic search returns matches from ANY time, so
        // an out-of-window record would import a theme this window was never about (a false-narrative
        // vector). Keep only records whose ISO `timestamp` is inside [windowStart, windowEnd); a record
        // with no verifiable timestamp is dropped — it cannot be proven in-window.
        // No window passed → pass-through (a direct best-effort call); a resolved window → strictly bind.
        const startMs  = windowStart == null ? -Infinity : new Date(windowStart).getTime(),
              endMs    = windowEnd   == null ?  Infinity : new Date(windowEnd).getTime(),
              inWindow = windowStart == null && windowEnd == null ? results : results.filter(record => {
                  const ts = new Date(record?.timestamp).getTime();
                  return !Number.isNaN(ts) && ts >= startMs && ts < endMs
              });

        // pass the in-window relevance-ranked records through, tagged as theme evidence — the synthesis
        // prompt decides which fields to foreground; this adapter makes no assumption about record shape.
        return {themes: inWindow.map(record => ({...record, type: 'memory'})), degraded: false, reason: null}
    }
}
