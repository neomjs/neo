import Base            from '../../../../../src/core/Base.mjs';
import CollectionProxy from './CollectionProxy.mjs';
import GraphService    from '../services/GraphService.mjs';
import logger          from '../logger.mjs';

/**
 * StorageRouter acts as a transparent Proxy pattern for the underlying vector databases.
 * It reads aiConfig.engine ('neo', 'chroma', or 'both') and dispatches collection
 * calls (add, upsert, get, query) to the appropriate managers.
 * 
 * If 'both' is selected:
 *  - Writes are dispatched to both databases (mirroring).
 *  - Reads return from the primary database (Neo) to avoid duplication.
 *
 * @class Neo.ai.mcp.server.memory-core.managers.StorageRouter
 * @extends Neo.core.Base
 */
class StorageRouter extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.StorageRouter'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.StorageRouter',
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
     * Injects the Dual-Pass Re-Ranking Middleware into the CollectionProxy.
     * Pass 1: Uses ChromaDB\'s ANN search to fetch top K candidates.
     * Pass 2: Re-ranks based on topological weighting via the SQLite Native Edge Graph.
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
                logger.warn(`[StorageRouter] Pass 1 semantic retrieval failed, falling back to empty result: ${e.message}`);
                return {ids: [[]], distances: [[]], metadatas: [[]], documents: undefined};
            }

            const pass1Ids = searchResult?.ids?.[0];

            if (!pass1Ids || pass1Ids.length === 0) {
                return searchResult;
            }

            // Pass 2: Topological filtering/weighting
            const topology     = GraphService.getContextFrontier();
            const graphWeights = new Map();

            if (topology?.strategicNeighbors) {
                topology.strategicNeighbors.forEach(n => {
                    graphWeights.set(n.id, n.weight);
                    if (n.semanticVectorId) graphWeights.set(n.semanticVectorId, n.weight);
                });
            }

            const distances = searchResult.distances?.[0] || [];
            const metadatas = searchResult.metadatas?.[0] || [];
            const documents = searchResult.documents?.[0] || null;

            // Compute composite scores
            const rankedResults = pass1Ids.map((id, index) => {
                const vectorDist    = Number(distances[index] ?? 0);
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
