import chromaManager from './chromaManager.mjs';

/**
 * Retrieves all memories for a session, sorted chronologically, and returns a page of results.
 * @param {Object} options
 * @param {String} options.sessionId
 * @param {Number} options.limit
 * @param {Number} options.offset
 * @returns {Promise<{total: number, memories: Object[]}>}
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

    const total = records.length;
    const slice = records.slice(offset, offset + limit);

    return {
        total,
        memories: slice
    };
}
