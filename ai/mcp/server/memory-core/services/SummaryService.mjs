import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import logger               from '../logger.mjs';
import TextEmbeddingService from './TextEmbeddingService.mjs';

/**
 * @summary Service for handling deleting, listing, and querying session summaries.
 *
 * This service manages the high-level session summaries. It allows for retrieving past summaries to provide context,
 * searching summaries by content or metadata, and performing administrative tasks like deleting all summaries.
 *
 * @class Neo.ai.mcp.server.memory-core.services.SummaryService
 * @extends Neo.core.Base
 * @singleton
 */
class SummaryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.SummaryService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.SummaryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Deletes all session summaries.
     * @returns {Promise<{deleted: number, message: string}>}
     */
    async deleteAllSummaries() {
        try {
            const collection = await ChromaManager.getSummaryCollection();
            const count      = await collection.count();
            await ChromaManager.client.deleteCollection({ name: collection.name });
            await ChromaManager.getSummaryCollection(); // Re-creates it
            return { deleted: count, message: 'All summaries successfully deleted' };
        } catch (error) {
            logger.error('[SummaryService] Error deleting all summaries:', error);
            return {
                error  : 'Failed to delete all summaries',
                message: error.message,
                code   : 'SUMMARY_DELETE_ALL_ERROR'
            };
        }
    }

    /**
     * Retrieves summaries in reverse chronological order using a two-phase fetch strategy.
     *
     * Phase 1: Fetch ALL metadata (lightweight) to perform a global sort in memory.
     * Phase 2: Fetch full documents (heavy) only for the paginated slice.
     *
     * @param {Object} options
     * @param {Number} options.limit=50 The maximum number of summaries to return.
     * @param {Number} options.offset=0 The number of summaries to skip.
     * @returns {Promise<{count: number, total: number, summaries: Object[]}>}
     */
    async listSummaries({limit=50, offset=0} = {}) {
        try {
            const collection = await ChromaManager.getSummaryCollection();

            // Phase 1: Fetch ALL metadata (lightweight)
            const
                allRecords = [],
                batchSize  = aiConfig.summarizationBatchLimit || 2000;

            let batchOffset = 0,
                hasMore     = true;

            while (hasMore) {
                const batch = await collection.get({
                    limit  : batchSize,
                    offset : batchOffset,
                    include: ['metadatas'] // No documents
                });

                if (batch.ids.length === 0) {
                    hasMore = false;
                } else {
                    batch.ids.forEach((id, index) => {
                        allRecords.push({
                            id,
                            metadata: batch.metadatas[index]
                        });
                    });

                    batchOffset += batchSize;
                    if (batch.ids.length < batchSize) {
                        hasMore = false;
                    }
                }
            }

            // Phase 2: Sort and Slice
            // Sort by timestamp DESC
            allRecords.sort((a, b) => (b.metadata.timestamp || 0) - (a.metadata.timestamp || 0));

            const
                total     = allRecords.length,
                targetIds = allRecords.slice(offset, offset + limit).map(r => r.id);

            if (targetIds.length === 0) {
                return {count: 0, total, summaries: []};
            }

            // Phase 3: Fetch full documents for the slice
            const result = await collection.get({
                ids    : targetIds,
                include: ['metadatas', 'documents']
            });

            // Create a map for O(1) lookup instead of re-sorting
            const resultMap = new Map();
            result.ids.forEach((id, index) => {
                resultMap.set(id, {
                    metadata: result.metadatas[index] || {},
                    document: result.documents?.[index] || ''
                });
            });

            // Map in the correct order (already sorted from targetIds)
            const summaries = targetIds.map(id => {
                const data = resultMap.get(id);

                if (!data) {
                    return null;
                }

                const metadata   = data.metadata;
                const document   = data.document;
                const techSource = metadata.technologies || '';

                return {
                    id,
                    sessionId   : metadata.sessionId,
                    timestamp   : new Date(metadata.timestamp).toISOString(),
                    title       : metadata.title,
                    summary     : document,
                    category    : metadata.category,
                    memoryCount : Number(metadata.memoryCount) || 0,
                    quality     : Number(metadata.quality) || 0,
                    productivity: Number(metadata.productivity) || 0,
                    impact      : Number(metadata.impact) || 0,
                    complexity  : Number(metadata.complexity) || 0,
                    technologies: techSource
                        ? techSource.split(',').map(item => item.trim()).filter(Boolean)
                        : []
                };
            }).filter(Boolean);

            return {
                count: summaries.length,
                total,
                summaries
            };
        } catch (error) {
            logger.error('[SummaryService] Error listing summaries:', error);
            return {
                error  : 'Failed to list summaries',
                message: error.message,
                code   : 'SUMMARY_LIST_ERROR'
            };
        }
    }

    /**
     * Executes a semantic search across all session summaries.
     * @param {Object} options
     * @param {String} options.query      The search query string.
     * @param {Number} options.nResults   The number of results to return.
     * @param {String} [options.category] Optional category to filter results.
     * @returns {Promise<{query: string, count: number, results: Object[]}>}
     */
    async querySummaries({query, nResults, category}) {
        try {
            const collection = await ChromaManager.getSummaryCollection();
            const embedding  = await TextEmbeddingService.embedText(query);

            const queryArgs = {
                queryEmbeddings: [embedding],
                nResults,
                include        : ['metadatas', 'documents']
            };

            if (category) {
                queryArgs.where = {category};
            }

            const searchResult = await collection.query(queryArgs);

            const ids       = searchResult.ids?.[0] || [];
            const distances = searchResult.distances?.[0] || [];
            const metadatas = searchResult.metadatas?.[0] || [];
            const documents = searchResult.documents?.[0] || [];

            const summaries = ids.map((id, index) => {
                const metadata       = metadatas[index] || {};
                const document       = documents[index] || '';
                const distance       = Number(distances[index] ?? 0);
                const relevanceScore = Number((1 / (1 + distance)).toFixed(6));
                const techSource     = metadata.technologies || '';

                return {
                    id,
                    sessionId   : metadata.sessionId,
                    timestamp   : new Date(metadata.timestamp).toISOString(),
                    title       : metadata.title,
                    summary     : document,
                    category    : metadata.category,
                    memoryCount : Number(metadata.memoryCount) || 0,
                    quality     : Number(metadata.quality) || 0,
                    productivity: Number(metadata.productivity) || 0,
                    impact      : Number(metadata.impact) || 0,
                    complexity  : Number(metadata.complexity) || 0,
                    technologies: techSource
                        ? techSource.split(',').map(item => item.trim()).filter(Boolean)
                        : [],
                    distance,
                    relevanceScore
                };
            });

            return {
                query,
                count  : summaries.length,
                results: summaries
            };
        } catch (error) {
            logger.error('[SummaryService] Error querying summaries:', error);
            return {
                error  : 'Failed to query summaries',
                message: error.message,
                code   : 'SUMMARY_QUERY_ERROR'
            };
        }
    }
}

export default Neo.setupClass(SummaryService);
