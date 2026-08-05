/**
 * @module ai/services/knowledge-base/retrievalProvenance
 * @summary Pure provenance decision for a query response: how many sources vector retrieval
 * contributed, and whether the answer came from the lexical rescue path alone. Extracted from
 * `QueryService` so the decision is witnessable without a Chroma collection.
 */

/**
 * @typedef {Object} RetrievalProvenance
 * @property {Number}  vectorSources Sources vector retrieval contributed, always present — so a
 * caller never reads an absent field as a grounded answer.
 * @property {Boolean} [rescueOnly] Present and `true` only when vector retrieval contributed nothing,
 * meaning every result came from the local lexical rescue path.
 * @property {String}  [warning] Present only alongside `rescueOnly`, naming the cause rather than the
 * state — an empty or unreachable collection presents identically to a healthy one otherwise.
 */

/**
 * @summary Builds the aggregate retrieval-provenance block for a query response.
 *
 * Per-row `lexicalRescueReasons` was already correct and already present, but a caller reading
 * `topResult` and a score has no reason to inspect every row's metadata — so a supplement standing
 * in for the entire primary read as a grounded answer for six days. This states it once, in one
 * place a caller cannot skip.
 *
 * The zero case is deliberately NOT an error and NOT empty results: the lexical rescue is a designed
 * capability and its hits may be exactly what the caller wanted. What must not happen is a caller
 * mistaking path and filename matches over on-disk sources for evidence of what the ingested corpus
 * holds — an empty or unreachable collection presents identically to a healthy one otherwise.
 *
 * The count MUST be captured before the rescue merge runs. Rescue both adds new sources and boosts
 * existing ones, so read afterwards the two are indistinguishable — and that indistinguishability is
 * the whole defect. Callers own that ordering; this function only reports what it is handed.
 *
 * @param {Number} vectorSourceCount Sources contributed by vector retrieval, counted BEFORE the
 * lexical rescue merge.
 * @returns {RetrievalProvenance}
 */
export function describeRetrievalProvenance(vectorSourceCount) {
    const retrieval = {vectorSources: vectorSourceCount};

    if (vectorSourceCount === 0) {
        retrieval.rescueOnly = true;
        retrieval.warning    =
            'Vector retrieval returned 0 sources — every result below comes from the local lexical ' +
            'rescue path (path/filename matching over on-disk sources), not from the ingested corpus. ' +
            'Treat these as unsourced: an empty or unreachable knowledge-base collection presents ' +
            'exactly this way. Check the knowledge-base healthcheck before relying on them.'
    }

    return retrieval;
}

export default describeRetrievalProvenance;
