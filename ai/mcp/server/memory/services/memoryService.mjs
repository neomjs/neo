import chromaManager    from './chromaManager.mjs';
import {embedText}      from './textEmbeddingService.mjs';

/**
 * Retrieves all memories for a session and returns a paginated payload.
 * @param {Object} options
 * @param {String} options.sessionId
 * @param {Number} options.limit
 * @param {Number} options.offset
 * @returns {Promise<{total: number, results: Object[]}>}
 */
export async function listMemories({sessionId, limit, offset}) {
    const collection = await chromaManager.getMemoryCollection();

    const result = await collection.get({
        where  : {sessionId},
        include: ['metadatas']
    });

    const records = result.ids.map((id, index) => {
        const metadata = result.metadatas[index] || {};

        return {
            id,
            sessionId : metadata.sessionId,
            timestamp : metadata.timestamp,
            prompt    : metadata.prompt,
            thought   : metadata.thought,
            response  : metadata.response,
            type      : metadata.type
        };
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const total    = records.length;
    const paged    = records.slice(offset, offset + limit);

    return {
        total,
        results: paged
    };
}

/**
 * Executes a semantic search against the memory collection.
 * @param {Object} options
 * @param {String} options.query
 * @param {Number} options.nResults
 * @param {String} [options.sessionId]
 * @returns {Promise<{count: number, results: Object[]}>}
 */
export async function queryMemories({query, nResults, sessionId}) {
    const collection = await chromaManager.getMemoryCollection();
    const embedding  = await embedText(query);

    const searchResult = await collection.query({
        queryEmbeddings: [embedding],
        nResults,
        where          : sessionId ? {sessionId} : undefined,
        include        : ['metadatas']
    });

    const ids        = searchResult.ids?.[0] || [];
    const distances  = searchResult.distances?.[0] || [];
    const metadatas  = searchResult.metadatas?.[0] || [];

    const memories = ids.map((id, index) => {
        const metadata = metadatas[index] || {};
        const distance = Number(distances[index] ?? 0);
        const relevanceScore = Number((1 / (1 + distance)).toFixed(6));

        return {
            id,
            sessionId : metadata.sessionId,
            timestamp : metadata.timestamp,
            prompt    : metadata.prompt,
            thought   : metadata.thought,
            response  : metadata.response,
            type      : metadata.type,
            distance,
            relevanceScore
        };
    });

    return {
        count  : memories.length,
        results: memories
    };
}
