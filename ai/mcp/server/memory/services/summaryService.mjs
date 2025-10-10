import chromaManager from './chromaManager.mjs';

/**
 * Retrieves summaries in reverse chronological order and returns a page of results.
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

    const total = records.length;
    const slice = records.slice(offset, offset + limit);

    return {
        total,
        summaries: slice
    };
}
