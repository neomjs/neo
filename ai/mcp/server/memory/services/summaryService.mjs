import chromaManager   from './chromaManager.mjs';
import {embedText}     from './textEmbeddingService.mjs';

/**
 * Retrieves summaries in reverse chronological order.
 * @param {Object} options
 * @param {Number} options.limit
 * @param {Number} options.offset
 * @returns {Promise<{total: number, summaries: Object[]}>}
 */
export async function listSummaries({limit, offset}) {
    const collection = await chromaManager.getSummaryCollection();

    const result = await collection.get({
        include: ['metadatas', 'documents']
    });

    const records = result.ids.map((id, index) => {
        const metadata   = result.metadatas[index] || {};
        const document   = result.documents?.[index] || '';
        const techSource = metadata.technologies || '';

        return {
            id,
            sessionId  : metadata.sessionId,
            timestamp  : metadata.timestamp,
            title      : metadata.title,
            summary    : document,
            category   : metadata.category,
            memoryCount: Number(metadata.memoryCount) || 0,
            quality    : Number(metadata.quality) || 0,
            productivity: Number(metadata.productivity) || 0,
            impact     : Number(metadata.impact) || 0,
            complexity : Number(metadata.complexity) || 0,
            technologies: techSource
                ? techSource.split(',').map(item => item.trim()).filter(Boolean)
                : []
        };
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total    = records.length;
    const paged    = records.slice(offset, offset + limit);

    return {
        total,
        summaries: paged
    };
}

/**
 * Executes a semantic search across all session summaries.
 * @param {Object} options
 * @param {String} options.query
 * @param {Number} options.nResults
 * @param {String} [options.category]
 * @returns {Promise<{count: number, summaries: Object[]}>}
 */
export async function querySummaries({query, nResults, category}) {
    const collection = await chromaManager.getSummaryCollection();
    const embedding  = await embedText(query);

    const searchResult = await collection.query({
        queryEmbeddings: [embedding],
        nResults,
        where          : category ? {category} : undefined,
        include        : ['metadatas', 'documents']
    });

    const ids        = searchResult.ids?.[0] || [];
    const distances  = searchResult.distances?.[0] || [];
    const metadatas  = searchResult.metadatas?.[0] || [];
    const documents  = searchResult.documents?.[0] || [];

    const summaries = ids.map((id, index) => {
        const metadata = metadatas[index] || {};
        const document = documents[index] || '';
        const distance = Number(distances[index] ?? 0);
        const relevanceScore = Number((1 / (1 + distance)).toFixed(6));
        const techSource = metadata.technologies || '';

        return {
            id,
            sessionId  : metadata.sessionId,
            timestamp  : metadata.timestamp,
            title      : metadata.title,
            summary    : document,
            category   : metadata.category,
            memoryCount: Number(metadata.memoryCount) || 0,
            quality    : Number(metadata.quality) || 0,
            productivity: Number(metadata.productivity) || 0,
            impact     : Number(metadata.impact) || 0,
            complexity : Number(metadata.complexity) || 0,
            technologies: techSource
                ? techSource.split(',').map(item => item.trim()).filter(Boolean)
                : [],
            distance,
            relevanceScore
        };
    });

    return {
        count    : summaries.length,
        summaries: summaries
    };
}
