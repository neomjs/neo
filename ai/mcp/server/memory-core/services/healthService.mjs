import chromaManager from './chromaManager.mjs';
import aiConfig from '../../config.mjs';

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

        // These calls will throw if the collection doesn't exist. We let the outer block catch it
        // if it's a connection issue, but for "not found", we handle it gracefully.
        memoryCollection = await chromaManager.getMemoryCollection().catch(() => null);
        if (memoryCollection) {
            memoryCount = await memoryCollection.count();
        }

        summaryCollection = await chromaManager.getSummaryCollection().catch(() => null);
        if (summaryCollection) {
            summaryCount = await summaryCollection.count();
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
