import { ChromaClient } from 'chromadb';
import aiConfig from '../../config.mjs';

/**
 * Verifies that the server is running and can successfully connect to the
 * ChromaDB vector database.
 * @returns {Promise<object>} A promise that resolves to the health check status object.
 */
async function healthcheck() {
    const dbClient = new ChromaClient();
    const collectionName = aiConfig.knowledgeBase.collectionName;

    try {
        // The most reliable way to check the connection is to perform a lightweight operation.
        await dbClient.heartbeat();

        let collection = null;
        let documentCount = 0;

        try {
            // Suppress the console warning if the collection doesn't exist yet.
            const originalWarn = console.warn;
            console.warn = () => {};
            collection = await dbClient.getCollection({ name: collectionName });
            console.warn = originalWarn;

            if (collection) {
                documentCount = await collection.count();
            }
        } catch (e) {
            // Collection does not exist, which is a valid state.
        }

        return {
            status: "healthy",
            database: {
                connected: true,
                collectionName: collectionName,
                collectionExists: !!collection,
                documentCount: documentCount
            }
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

export { healthcheck };
