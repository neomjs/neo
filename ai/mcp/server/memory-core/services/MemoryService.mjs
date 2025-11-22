import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import crypto               from 'crypto';
import logger               from '../logger.mjs';
import SessionService       from './SessionService.mjs';
import TextEmbeddingService from './TextEmbeddingService.mjs';

/**
 * Service for handling adding, listing, and querying agent memories.
 * @class AI.mcp.server.memory-core.services.MemoryService
 * @extends Neo.core.Base
 * @singleton
 */
class MemoryService extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory-core.services.MemoryService'
         * @protected
         */
        className: 'AI.mcp.server.memory-core.services.MemoryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Adds a new memory to the collection.
     * @param {Object} options
     * @param {String} options.prompt
     * @param {String} options.response
     * @param {String} options.thought
     * @param {String} options.sessionId
     * @returns {Promise<{id: string, sessionId: string, timestamp: string, message: string}>}
     */
    async addMemory({ prompt, response, thought, sessionId }) {
        try {
            const collection   = await ChromaManager.getMemoryCollection();
            const combinedText = `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
            const now          = Date.now();
            const timestamp    = new Date(now).toISOString();
            const memoryId     = crypto.randomUUID();
            const embedding    = await TextEmbeddingService.embedText(combinedText);

            if (!sessionId) {
                sessionId = SessionService.currentSessionId;
            }

            await collection.add({
                ids: [memoryId],
                embeddings: [embedding],
                metadatas: [{
                    prompt,
                    response,
                    thought,
                    sessionId,
                    timestamp: now,
                    type: 'agent-interaction'
                }],
                documents: [combinedText]
            });

            return { id: memoryId, sessionId, timestamp, message: "Memory successfully added" };
        } catch (error) {
            logger.error('[MemoryService] Error adding memory:', error);
            return {
                error  : 'Failed to add memory',
                message: error.message,
                code   : 'MEMORY_ADD_ERROR'
            };
        }
    }

    /**
     * Retrieves all memories for a session and returns a paginated payload.
     * @param {Object} options
     * @param {String} options.sessionId
     * @param {Number} options.limit
     * @param {Number} options.offset
     * @returns {Promise<{sessionId: string, count: number, total: number, memories: Object[]}>}
     */
    async listMemories({sessionId, limit, offset}) {
        try {
            if (!sessionId) {
                return { sessionId, count: 0, total: 0, memories: [] };
            }

            const collection = await ChromaManager.getMemoryCollection();

            const result = await collection.get({
                where  : {sessionId},
                include: ['metadatas']
            });

            const records = result.ids.map((id, index) => {
                const metadata = result.metadatas[index] || {};

                return {
                    id,
                    sessionId: metadata.sessionId,
                    timestamp: metadata.timestamp,
                    prompt   : metadata.prompt,
                    thought  : metadata.thought,
                    response : metadata.response,
                    type     : metadata.type
                };
            }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const total = records.length;
            const memories = records.slice(offset, offset + limit);

            return {
                sessionId,
                count: memories.length,
                total,
                memories
            };
        } catch (error) {
            logger.error('[MemoryService] Error listing memories:', error);
            return {
                error  : 'Failed to list memories',
                message: error.message,
                code   : 'MEMORY_LIST_ERROR'
            };
        }
    }

    /**
     * Executes a semantic search against the memory collection.
     * @param {Object} options
     * @param {String} options.query
     * @param {Number} options.nResults
     * @param {String} [options.sessionId]
     * @returns {Promise<{query: string, count: number, results: Object[]}>}
     */
    async queryMemories({query, nResults, sessionId}) {
        try {
            const collection = await ChromaManager.getMemoryCollection();
            const embedding  = await TextEmbeddingService.embedText(query);

            const queryArgs = {
                queryEmbeddings: [embedding],
                nResults,
                include        : ['metadatas']
            };

            if (sessionId) {
                queryArgs.where = {sessionId};
            }

            const searchResult = await collection.query(queryArgs);

            const ids       = searchResult.ids?.[0] || [];
            const distances = searchResult.distances?.[0] || [];
            const metadatas = searchResult.metadatas?.[0] || [];

            const memories = ids.map((id, index) => {
                const metadata       = metadatas[index] || {};
                const distance       = Number(distances[index] ?? 0);
                const relevanceScore = Number((1 / (1 + distance)).toFixed(6));

                return {
                    id,
                    sessionId: metadata.sessionId,
                    timestamp: metadata.timestamp,
                    prompt   : metadata.prompt,
                    thought  : metadata.thought,
                    response : metadata.response,
                    type     : metadata.type,
                    distance,
                    relevanceScore
                };
            });

            return {
                query,
                count  : memories.length,
                results: memories
            };
        } catch (error) {
            logger.error('[MemoryService] Error querying memories:', error);
            return {
                error  : 'Failed to query memories',
                message: error.message,
                code   : 'MEMORY_QUERY_ERROR'
            };
        }
    }
}

export default Neo.setupClass(MemoryService);
