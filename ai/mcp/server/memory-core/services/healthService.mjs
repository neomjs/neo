import chromaManager from './chromaManager.mjs';

/**
 * Verifies that the server is running and can successfully connect to the
 * ChromaDB vector database, including checking for collection existence and counts.
 * @returns {Promise<object>} A promise that resolves to the health check status object.
 */
export async function buildHealthResponse() {
    try {
        await chromaManager.client.heartbeat();

        let memoryCollection, summaryCollection;
        let memoryCount = 0, summaryCount = 0;

        try {
            memoryCollection = await chromaManager.getMemoryCollection();
            memoryCount = await memoryCollection.count();
        } catch (e) {
            // Collection does not exist, which is a valid state.
        }

        try {
            summaryCollection = await chromaManager.getSummaryCollection();
            summaryCount = await summaryCollection.count();
        } catch (e) {
            // Collection does not exist.
        }

        return {
            status: "healthy",
            database: {
                connected: true,
                collections: {
                    memories: {
                        name: aiConfig.memory.collectionName,
                        exists: !!memoryCollection,
                        count: memoryCount
                    },
                    summaries: {
                        name: aiConfig.sessions.collectionName,
                        exists: !!summaryCollection,
                        count: summaryCount
                    }
                }
            },
            version: "1.0.0", // TODO: Should come from package.json
            uptime: process.uptime()
        };
    } catch (error) {
        return {
            status: "unhealthy",
            database: {
                connected: false,
                error: error.message
            }
        };
    }
}