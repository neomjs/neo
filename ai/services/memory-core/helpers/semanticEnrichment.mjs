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
 * @returns {Function} `async ({query}) => {themes: Object[], degraded: Boolean, reason: (String|null)}`.
 */
export function makeSemanticEnrichment({queryMemories, nResults = 100} = {}) {
    if (typeof queryMemories !== 'function') {
        throw new Error('makeSemanticEnrichment: an injected `queryMemories` function is required')
    }

    return async function enrich({query} = {}) {
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

        // pass the raw relevance-ranked records through, tagged as theme evidence — the synthesis prompt
        // decides which fields to foreground; this adapter makes no assumption about the record shape.
        return {themes: results.map(record => ({...record, type: 'memory'})), degraded: false, reason: null}
    }
}
