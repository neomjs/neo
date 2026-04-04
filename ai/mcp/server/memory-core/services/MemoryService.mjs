import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import crypto               from 'crypto';
import GraphService         from './GraphService.mjs';
import logger               from '../logger.mjs';
import SessionService       from './SessionService.mjs';
import TextEmbeddingService from './TextEmbeddingService.mjs';

/**
 * @summary Service for handling adding, listing, and querying agent memories.
 *
 * This service acts as the primary interface for interacting with the 'memories' collection in ChromaDB.
 * It handles the creation of new memory entries (including embedding generation), retrieving memories by session,
 * and performing semantic searches to find relevant past interactions.
 *
 * @class Neo.ai.mcp.server.memory-core.services.MemoryService
 * @extends Neo.core.Base
 * @singleton
 */
class MemoryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.MemoryService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.MemoryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Adds a new memory to the collection.
     * @param {Object} options
     * @param {String} options.prompt    The user's prompt.
     * @param {String} options.response  The agent's response.
     * @param {String} options.thought   The agent's internal thought process.
     * @param {String} options.sessionId The ID of the session this memory belongs to.
     * @param {String} [options.agent]   The agent profile (e.g. 'antigravity').
     * @param {String} [options.model]   The model name (e.g. 'gemini-3.1-pro').
     * @returns {Promise<{id: string, sessionId: string, timestamp: string, message: string}>}
     */
    async addMemory({prompt, response, thought, sessionId, agent, model}) {
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

            const metadata = {
                prompt,
                response,
                thought,
                sessionId,
                timestamp: now,
                type: 'agent-interaction'
            };

            if (agent) metadata.agent = agent;
            if (model) metadata.model = model;

            await collection.add({
                ids: [memoryId],
                embeddings: [embedding],
                metadatas: [metadata],
                documents: [combinedText]
            });

            return {id: memoryId, sessionId, timestamp, message: "Memory successfully added"};
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
     * @param {String} options.sessionId The ID of the session to list memories for.
     * @param {Number} options.limit     The maximum number of memories to return.
     * @param {Number} options.offset    The number of memories to skip.
     * @returns {Promise<{sessionId: string, count: number, total: number, memories: Object[]}>}
     */
    async listMemories({sessionId, limit=100, offset=0} = {}) {
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
                    timestamp: new Date(metadata.timestamp).toISOString(),
                    prompt   : metadata.prompt,
                    thought  : metadata.thought,
                    response : metadata.response,
                    type     : metadata.type,
                    agent    : metadata.agent || null,
                    model    : metadata.model || null
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
     * @param {String} options.query       The search query string.
     * @param {Number} options.nResults    The number of results to return.
     * @param {String} [options.sessionId] Optional session ID to filter results.
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
                    timestamp: new Date(metadata.timestamp).toISOString(),
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

    /**
     * Executes the Context Priming Engine to fetch the highly scaled topological frontier
     * and maps vectors back to extract specific underlying episodic knowledge logic.
     * @returns {Promise<Object>}
     */
    async getContextFrontier() {
        try {
            // 1. Traverse Graph Topology
            const topology = GraphService.getContextFrontier();
            if (!topology) {
                return {
                    message: "No context frontier configured. Graph topology returns null."
                };
            }

            // 2. Unpack mapping to map context to Chroma db entries
            const { frontier, strategicNeighbors } = topology;
            const semanticContexts = [];

            // We grab context blocks from summaries, as that is where DreamService extracts episodic graph nodes from
            const collection = await ChromaManager.getSummaryCollection();

            for (const neighbor of strategicNeighbors) {
                if (neighbor.semanticVectorId) {
                    try {
                        const result = await collection.get({
                            ids: [neighbor.semanticVectorId],
                            include: ['documents', 'metadatas']
                        });

                        if (result.documents && result.documents.length > 0) {
                            semanticContexts.push({
                                nodeId: neighbor.id,
                                name: neighbor.name,
                                relationship: neighbor.relationship,
                                weight: neighbor.weight,
                                content: result.documents[0],
                                metadata: result.metadatas ? result.metadatas[0] : null
                            });
                        }
                    } catch (e) {
                         logger.warn(`[MemoryService] Failed to fetch vector ${neighbor.semanticVectorId} for node ${neighbor.id}`);
                    }
                }
            }

            return {
                topology,
                semanticContexts
            };

        } catch (error) {
            logger.error('[MemoryService] Error running getContextFrontier:', error);
            return {
                error  : 'Failed to retrieve context frontier',
                message: error.message,
                code   : 'CONTEXT_FRONTIER_ERROR'
            };
        }
    }
}

export default Neo.setupClass(MemoryService);
