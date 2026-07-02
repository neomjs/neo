import {conceptClusterKey} from './conceptNeighborhoodProbe.mjs';

/**
 * @module ai/services/graph/conceptAnchoredRetrieval
 * @summary Concept-anchored retrieval enrichment — the GP-v2 consumer-1 wrap (#14504; ticket-ref-ok: owning-leaf anchor).
 *
 * Owner contract: WRAP, never replace — the flat embedding path stays byte-identical when the
 * `conceptWalk` flag is absent; this module only ADDS walk-derived candidates that have re-entered
 * the caller's own RLS/tenant/trust filter chain. Resolver design is LEXICAL-FIRST by measured
 * necessity: only 8.2% of live CONCEPT nodes carry a `semanticVectorId` (probe artifact,
 * 2026-07-02), so cluster-key matching over node ids is the full-coverage first slice; semantic
 * assist over the vectored subset is the recall-extender once the canonical spine lands.
 *
 * Alias tolerance: resolution operates on cluster KEYS (the merged probe module's normalizer), so a query hits
 * every minted alias of a fragmented concept (the 5-alias golden-path case) in one entry.
 */

/**
 * The retrieval-event schema consumed by the measurement substrate (#14506 slice 2; ticket-ref-ok: sibling-leaf feed).
 * Transport is logger-emission for now — the durable feed is the measurement leaf's decision (#14506; ticket-ref-ok: sibling-leaf boundary); minting a data file
 * here would repeat the data-home class without its convergence. Schema is the contract.
 */
export const RETRIEVAL_EVENT_SCHEMA = Object.freeze({
    event           : 'concept-walk-retrieval',
    query           : 'String — the caller query, verbatim',
    resolvedConcepts: 'String[] — cluster keys that matched',
    walkContributed : 'Boolean — did any walk candidate survive filtering',
    candidatesAdded : 'Number — walk candidates appended after dedup + filters',
    filteredOut     : 'Number — walk candidates dropped by tenant/tombstone/trust filters'
});

/**
 * @summary Tokenizes a retrieval query into candidate cluster-key fragments.
 * @param {String} query Caller query.
 * @returns {String[]} Lowercased tokens of length >= 3, order-preserved, deduped.
 */
export function tokenizeQuery(query) {
    const tokens = String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 3);

    return [...new Set(tokens)]
}

/**
 * @summary Resolves a query to concept alias-clusters via lexical cluster-key matching.
 *
 * Match ladder (best per cluster wins): exact full-query key (1.0) > adjacent-token bigram key
 * (0.8) > single-token key containment (0.5). Deterministic, read-only, zero graph writes.
 *
 * @param {Object} options
 * @param {Object} options.graphService Bound GraphService instance (or seam-compatible adapter).
 * @param {String} options.query Caller query.
 * @param {Number} [options.limit=5] Max clusters returned.
 * @param {Number} [options.scanLimit=25000] CONCEPT/CLASS rows scanned per label.
 * @returns {Object[]} `[{clusterKey, members: String[], matchType, score}]` best-first.
 */
export function resolveConcepts({graphService, query, limit = 5, scanLimit = 25000}) {
    const
        tokens   = tokenizeQuery(query),
        fullKey  = conceptClusterKey(String(query || '')),
        bigrams  = tokens.slice(0, -1).map((t, i) => `${t}-${tokens[i + 1]}`),
        clusters = new Map();

    if (!tokens.length) return [];

    for (const type of ['CONCEPT', 'CLASS']) {
        let records = [];

        try {
            records = graphService.listNodeRecordsByType({type, limit: scanLimit})?.records || []
        } catch {
            records = []
        }

        for (const record of records) {
            const id = record?.id;

            if (!id) continue;

            const key     = conceptClusterKey(id);
            const cluster = clusters.get(key) ?? {clusterKey: key, members: new Set(), matchType: null, score: 0};

            cluster.members.add(id);

            let matchType = null,
                score     = 0;

            if (fullKey && key === fullKey) {
                matchType = 'exact-key';
                score     = 1.0
            } else if (bigrams.includes(key)) {
                matchType = 'bigram-key';
                score     = 0.8
            } else if (tokens.some(t => key === t || key.includes(`${t}-`) || key.includes(`-${t}`) || key.startsWith(`${t}`) && key.length <= t.length + 1)) {
                matchType = 'token';
                score     = 0.5
            }

            if (score > cluster.score) {
                cluster.matchType = matchType;
                cluster.score     = score
            }

            clusters.set(key, cluster)
        }
    }

    return [...clusters.values()]
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score || a.clusterKey.localeCompare(b.clusterKey))
        .slice(0, limit)
        .map(c => ({clusterKey: c.clusterKey, members: [...c.members].sort(), matchType: c.matchType, score: c.score}))
}
