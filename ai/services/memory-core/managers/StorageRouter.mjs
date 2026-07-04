import Base            from '../../../../src/core/Base.mjs';
import CollectionProxy from './CollectionProxy.mjs';
import GraphService    from '../GraphService.mjs';
import logger          from '../../../mcp/server/memory-core/logger.mjs';
import aiConfig        from '../../../mcp/server/memory-core/config.mjs';

/**
 * StorageRouter acts as a transparent Proxy pattern for the underlying vector databases.
 * It reads aiConfig.engine ('chroma' or 'hybrid') and dispatches collection
 * calls (add, upsert, get, query) to the appropriate managers.
 *
 * If 'hybrid' is selected:
 *  - Writes are dispatched to both databases (mirroring).
 *  - Reads return from the primary database (Neo) to avoid duplication.
 *
 * @class Neo.ai.services.memory-core.managers.StorageRouter
 * @extends Neo.core.Base
 */
class StorageRouter extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.managers.StorageRouter'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.managers.StorageRouter',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getMemoryCollection() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'memory' });
        this.injectQueryReRanker(proxy, 'memory');
        return proxy;
    }

    /**
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getSummaryCollection() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'summary' });
        this.injectQueryReRanker(proxy, 'summary');
        return proxy;
    }

    /**
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getGraphCollection() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'graph' });
        return proxy;
    }

    /**
     * @summary Resolves the temporal-summary collection (the pyramid's durable L1/L2 window
     * records). Semantic window queries ("what happened this week") ride the same re-ranker
     * the session-summary path uses.
     * @returns {Promise<CollectionProxy>} A proxy respecting aiConfig.engine
     */
    async getTemporalSummaryCollection() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'temporalSummary' });
        this.injectQueryReRanker(proxy, 'temporalSummary');
        return proxy;
    }

    /**
     * @summary On-demand probe of each collection's vector-query (HNSW) path.
     *
     * A populated-but-corrupt collection passes `count()` but throws on `query()` (e.g. a desynced
     * HNSW segment raising "Error finding id"). `injectQueryReRanker` catches that and stamps a
     * `_degraded` marker; this probe surfaces it per collection. It deliberately lives as a method +
     * `ai/scripts/maintenance/probeCollectionQueryHealth.mjs` script — NOT a healthcheck field and NOT
     * an MCP tool — so the always-on "is it healthy?" poll stays terse and the per-collection query
     * cost (plus its response-schema bytes) is paid only when an operator opts in.
     *
     * @returns {Promise<Object>} `{status: 'healthy'|'degraded', collections: {memory, summary}}`
     */
    async probeCollectionQueryHealth() {
        const dimension   = aiConfig.vectorDimension || 4096,
              probe       = new Array(dimension).fill(0),
              collections = {},
              probes      = [
                  {type: 'memory',  get: () => this.getMemoryCollection()},
                  {type: 'summary', get: () => this.getSummaryCollection()}
              ];

        // Unit vector — non-degenerate for ANN distance; the content is irrelevant to the probe,
        // which only cares whether the query path traverses the vector segment without throwing.
        probe[0] = 1;

        let degraded = null;

        for (const {type, get} of probes) {
            try {
                const collection = await get();
                const count      = await collection.count().catch(() => 0);
                const res        = await collection.query({queryEmbeddings: [probe], nResults: 1});

                if (res?._degraded) {
                    collections[type] = {status: 'degraded', count, signature: res._degradedSignature, error: res._degradedReason};
                    degraded = degraded || `${type}: ${res._degradedReason}`;
                } else {
                    collections[type] = {status: 'healthy', count};
                }
            } catch (e) {
                collections[type] = {status: 'degraded', error: e.message};
                degraded = degraded || `${type}: ${e.message}`;
            }
        }

        return degraded
            ? {status: 'degraded', error: degraded, collections}
            : {status: 'healthy', collections};
    }

    /**
     * @summary Injects the Dual-Pass Re-Ranking Middleware into the CollectionProxy.
     *
     * Pass 1: Uses ChromaDB\'s ANN search to fetch top K candidates.
     * Pass 2: Re-ranks based on topological weighting via the SQLite Native Edge Graph.
     *
     * **Degraded-result contract:** if the Pass-1 ChromaDB query throws (e.g. a desynced HNSW
     * segment raising "Error finding id"), the middleware stays non-throwing but returns a
     * `_degraded: true` result carrying `_degradedReason` / `_degradedCollection` /
     * `_degradedSignature`. Tool-facing callers (`SummaryService.querySummaries`,
     * `MemoryService.queryMemories`) MUST surface this as a degraded envelope rather than
     * collapsing it into a silent empty `{count:0}` — a degraded query path and a genuine
     * no-match must remain distinguishable to the caller.
     *
     * @param {CollectionProxy} proxy
     * @param {String} collectionType
     */
    injectQueryReRanker(proxy, collectionType) {
        const originalQuery = proxy.query.bind(proxy);

        proxy.query = async (args) => {
            const originalNResults = args.nResults || 10;
            const expandedNResults = originalNResults * 3;

            // Pass 1: Semantic retrieval — wrapped in try/catch to prevent
            // embedding function failures from crashing the entire query pipeline.
            let searchResult;

            try {
                const pass1Args = {...args, nResults: expandedNResults};
                searchResult    = await originalQuery(pass1Args);
            } catch (e) {
                // A populated-but-corrupt collection throws here (e.g. ChromaDB "Error finding id" on a
                // desynced HNSW segment). Returning a bare clean-empty result would be indistinguishable
                // from a genuine no-match and silently hide the failure for days. Stay non-throwing (the
                // Pass-2 pipeline resilience this catch exists for is preserved), but stamp a `_degraded`
                // marker — symmetric to the success path's `_reRanked` — so the tool-facing callers can
                // surface a degraded envelope instead of a silent `{count:0}`.
                const isCorruptionSignature = /Error finding id/i.test(e.message);

                logger.error(`[StorageRouter] Pass 1 semantic retrieval failed on the '${collectionType}' collection${isCorruptionSignature ? ' (HNSW corruption signature "Error finding id")' : ''}: ${e.message}`);

                return {
                    ids                : [[]], distances: [[]], metadatas: [[]], documents: undefined,
                    _degraded          : true,
                    _degradedReason    : e.message,
                    _degradedCollection: collectionType,
                    _degradedSignature : isCorruptionSignature ? 'chroma-error-finding-id' : 'chroma-query-error'
                };
            }

            const pass1Ids = searchResult?.ids?.[0];

            if (!pass1Ids || pass1Ids.length === 0) {
                return searchResult;
            }

            // Pass 2: Topological filtering/weighting
            const topology     = GraphService.getContextFrontier();
            const graphWeights = new Map();

            if (topology?.strategicNeighbors) {
                if (Array.isArray(topology.strategicNeighbors)) {
                    topology.strategicNeighbors.forEach(n => {
                        graphWeights.set(n.id, n.weight);
                        if (n.semanticVectorId) graphWeights.set(n.semanticVectorId, n.weight);
                    });
                } else {
                    logger.warn(`[StorageRouter] topology.strategicNeighbors is not iterable (type: ${typeof topology.strategicNeighbors}). Skipping re-ranking weights.`);
                }
            }

            const distances = searchResult.distances?.[0] || [];
            const metadatas = searchResult.metadatas?.[0] || [];
            const documents = searchResult.documents?.[0] || null;

            // Compute composite scores
            const rankedResults = pass1Ids.map((id, index) => {
                const vectorDist = Number(distances[index] ?? 0);
                // Vector distance (lower is better, typically L2 in ChromaDB) -> score
                const semanticScore = 1 / (1 + vectorDist);

                let topologyMultiplier = 1.0;

                // Boost for active frontend context
                if (graphWeights.has(id)) {
                    topologyMultiplier += graphWeights.get(id);
                }

                // General structural importance (Gravity)
                const gravity = GraphService.getNodeGravity(id);
                if (gravity && (gravity.in_degree > 0 || gravity.out_degree > 0)) {
                    topologyMultiplier += Math.log10(1 + gravity.in_degree + gravity.out_degree) * 0.1;
                }

                return {
                    id,
                    distance      : vectorDist,
                    metadata      : metadatas[index],
                    document      : documents ? documents[index] : null,
                    compositeScore: semanticScore * topologyMultiplier
                };
            });

            // Sort by composite score descending
            rankedResults.sort((a, b) => b.compositeScore - a.compositeScore);

            // Slice the requested top K
            const topK = rankedResults.slice(0, originalNResults);

            // Re-pack into ChromaDB format
            return {
                ids      : [topK.map(r => r.id)],
                distances: [topK.map(r => r.distance)],
                metadatas: [topK.map(r => r.metadata)],
                documents: searchResult.documents ? [topK.map(r => r.document)] : undefined,
                _reRanked: true
            };
        };
    }

    /**
     * Used by export/import processes to target specific or all active engines
     * @returns {Promise<Object[]>}
     */
    async getActiveManagers() {
        const proxy = Neo.create(CollectionProxy, { collectionType: 'memory' });
        return proxy.getManagers();
    }

    /**
     * Ensure the active engines are booted
     */
    async initAsync() {
        await super.initAsync();
        const proxy = Neo.create(CollectionProxy, { collectionType: 'memory' });
        await proxy.getManagers();
    }
}

export default Neo.setupClass(StorageRouter);
