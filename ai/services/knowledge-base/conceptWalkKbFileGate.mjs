/**
 * @module ai/services/knowledge-base/conceptWalkKbFileGate
 * @summary The KB-side FILE resolver for concept-anchored retrieval's second surface — the
 * `ask_knowledge_base` analog of the memory-core `buildMemoryResolveCandidate` gate.
 *
 * Why FILE (not the no-op / federation I first, wrongly, proposed): the Native Edge Graph already
 * carries `CONCEPT → FILE` guide/source edges, and every KB document records the file it was
 * ingested from as `metadata.source`. So a concept walk that reaches a `FILE` neighbor resolves to
 * the KB doc whose `metadata.source` matches that file — a per-store enrichment, NOT MC↔KB
 * candidate federation (KB + MC share one Chroma deployment but separate collections).
 *
 * Security + purity: like the memory gate, this is pure and fully injectable so the authorization
 * (the KB's existing tenant filtering) lives in the injected `findKbDocBySource` — the resolver owns
 * only the FILE-label gate, the `file:`/`file-` id-dialect normalization, and the candidate shaping,
 * and fails closed on any lookup error. A non-`FILE` neighbor is rejected before any lookup.
 */

const FILE_LABEL = 'FILE';

/**
 * @summary Normalizes a graph FILE node id to its bare source path — the explicit `file:` vs `file-`
 * id-dialect boundary. Both prefixes map to the same `metadata.source` value; an id with neither is
 * returned unchanged (the caller's FILE-label gate already vouched it is a file node).
 * @param {String} nodeId A FILE node id, e.g. `file:src/vdom/Helper.mjs` or `file-src/vdom/Helper.mjs`.
 * @returns {String|null} The bare source path, or null when the id is empty.
 */
export function normalizeFileNodeIdToSource(nodeId) {
    const path = String(nodeId ?? '').replace(/^file[:-]/, '');

    return path.length ? path : null
}

/**
 * @summary Builds the `resolveCandidate` gate the retrieval wrap injects for the KB surface — resolve
 * a walk-reached FILE node to its authorized KB document, or return null (the wrap counts nulls as
 * `filteredOut`).
 *
 * @param {Object} options
 * @param {Function} options.findKbDocBySource `async (sourcePath) => authorizedKbDoc | null` — the
 *     caller's KB lookup that returns the doc for a source path ONLY when it passes the KB's existing
 *     tenant filtering (authorization stays caller-owned, exactly as the memory gate delegates to its
 *     collection). Absent → every FILE node resolves to null (fail-closed).
 * @returns {Function} `async (nodeId, {neighborLabel}) => kbDocCandidate | null`.
 */
export function buildKbFileResolveCandidate({findKbDocBySource}) {
    return async function resolveWalkKbDoc(nodeId, {neighborLabel} = {}) {
        // Only FILE neighbors map to KB documents — reject anything else with no lookup.
        if (neighborLabel !== FILE_LABEL) {
            return null
        }

        const source = normalizeFileNodeIdToSource(nodeId);

        if (!source) {
            return null
        }

        let doc = null;

        try {
            doc = await findKbDocBySource?.(source)
        } catch {
            return null // fail-closed: a lookup error never surfaces an unverified doc
        }

        if (!doc) {
            return null // not found, or filtered out by the KB's tenant authorization
        }

        return {...doc, source}
    }
}
