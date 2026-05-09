import aiConfig              from '../../mcp/server/memory-core/config.mjs';
import Base                  from '../../../src/core/Base.mjs';
import StorageRouter         from './managers/StorageRouter.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import RequestContextService, {SHARED_USER_ID, normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';


/**
 * @summary Service for handling deleting, listing, and querying session summaries.
 *
 * This service manages the high-level session summaries. It allows for retrieving past summaries to provide context,
 * searching summaries by content or metadata, and performing administrative tasks like deleting all summaries.
 *
 * **Multi-tenant isolation (Epic #9999, sub-epic #10016, ticket #10000):** When a request context
 * is active (SSE transport + OIDC Bearer token), `RequestContextService.getUserId()` returns the
 * authenticated tenant. Reads (`listSummaries`, `querySummaries`) apply `where: {userId}` so each
 * tenant only sees their own session summaries; `deleteAllSummaries` switches from the global
 * `collection.drop()` + re-create path to `collection.delete({where: {userId}})` so one tenant
 * can never wipe another tenant's data. In stdio mode `getUserId()` is `undefined`, the filters
 * are skipped, and the legacy drop-based `deleteAllSummaries` behavior is preserved for local dev.
 *
 * @class Neo.ai.services.memory-core.SummaryService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class SummaryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.SummaryService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.SummaryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await StorageRouter.ready();
    }

    /**
     * Deletes all session summaries.
     * @param {Object}       [options]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<{deleted: number, message: string}>}
     */
    async deleteAllSummaries({confirmation} = {}) {
        try {
            const collection = await StorageRouter.getSummaryCollection();
            const userId     = normalizeUserId(RequestContextService.getUserId());

            // Multi-tenant branch (#10000): when an authenticated user invokes this, only their
            // own summaries are deleted — the `collection.drop()` path would nuke every tenant's
            // data in a unified deployment. `collection.delete({where: {userId}})` scopes the
            // destructive operation to the current tenant's rows. Note: the filter intentionally
            // does NOT include SHARED_USER_ID (#10556) — deleting "all my summaries" must not
            // touch the shared commons even though reads include it via the additive $or filter.
            if (userId) {
                const before = await collection.get({
                    where  : {userId},
                    include: []
                });
                const toDeleteIds = before.ids || [];
                const deleted    = toDeleteIds.length;

                if (deleted > 0) {
                    await collection.delete({where: {userId}});
                }

                return {deleted, message: `Deleted ${deleted} summaries for the active tenant.`};
            }

            // Legacy single-tenant path (stdio mode, no request context): drop + recreate.
            const count = await collection.count();
            await collection.drop({confirmation});
            await StorageRouter.getSummaryCollection(); // Re-creates it
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
            const collection = await StorageRouter.getSummaryCollection();

            // Tenant read-filter (#10000) with additive shared-commons access (#10556): when a
            // request context resolves a userId, return both the tenant's own records AND records
            // tagged with SHARED_USER_ID (legacy pre-#10145 data backfilled by the migration runner,
            // plus any explicitly-shared future data). Undefined in stdio mode = legacy unfiltered.
            // normalizeUserId strips `@`-prefix so AgentIdentity nodeId vs ChromaDB userId never
            // self-filters.
            const userId = normalizeUserId(RequestContextService.getUserId());
            const where  = userId ? {$or: [{userId}, {userId: SHARED_USER_ID}]} : undefined;

            // Phase 1: Fetch ALL metadata (lightweight)
            const
                allRecords = [],
                batchSize  = aiConfig.summarizationBatchLimit || 2000;

            let batchOffset = 0,
                hasMore     = true;

            while (hasMore) {
                const getArgs = {
                    limit  : batchSize,
                    offset : batchOffset,
                    include: ['metadatas'] // No documents
                };
                if (where) getArgs.where = where;

                const batch = await collection.get(getArgs);

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

            // Phase 3: Fetch full documents for the slice.
            // The `where` tenant filter is re-applied as belt-and-suspenders — the ids list was
            // already derived from a tenant-scoped batch sweep, so this is redundant in the happy
            // path but blocks a class of misuse if the method is ever called with externally
            // supplied ids.
            const sliceGetArgs = {
                ids    : targetIds,
                include: ['metadatas', 'documents']
            };
            if (where) sliceGetArgs.where = where;

            const result = await collection.get(sliceGetArgs);

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
            const collection = await StorageRouter.getSummaryCollection();
            const queryArgs = {
                queryTexts: [query],
                nResults,
                include   : ['metadatas', 'documents']
            };

            // Tenant-scoped where clause (#10000) with additive shared-commons access (#10556).
            // normalizeUserId handles the AgentIdentity-vs-userId namespace boundary. When userId
            // resolves, the filter returns the tenant's own records PLUS SHARED_USER_ID-tagged
            // records (legacy commons + explicit shares); when no userId, the legacy single-tenant
            // pass-through is preserved for daemon contexts.
            const userId    = normalizeUserId(RequestContextService.getUserId());
            const tenantOr  = userId ? {$or: [{userId}, {userId: SHARED_USER_ID}]} : null;
            if (category && tenantOr) {
                queryArgs.where = {$and: [{category}, tenantOr]};
            } else if (category) {
                queryArgs.where = {category};
            } else if (tenantOr) {
                queryArgs.where = tenantOr;
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
