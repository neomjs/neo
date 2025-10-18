import aiConfig from '../../config.mjs';
import chromaManager from './chromaManager.mjs';
import DatabaseLifecycleService from './databaseLifecycleService.mjs';

export async function buildHealthResponse() {
    const processStatus = DatabaseLifecycleService.getDatabaseStatus();
    try {
        await chromaManager.client.heartbeat();

        let memoryCollection, summaryCollection;
        let memoryCount = 0, summaryCount = 0;

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
                process: processStatus,
                connection: {
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
                }
            },
            version: "1.0.0", // TODO: Should come from package.json
            uptime: process.uptime()
        };
    } catch (error) {
        return {
            status: "unhealthy",
            database: {
                process: processStatus,
                connection: {
                    connected: false,
                    error: error.message
                }
            }
        };
    }
}
