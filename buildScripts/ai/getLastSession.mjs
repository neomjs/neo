import {ChromaClient} from 'chromadb';
import aiConfig       from './aiConfig.mjs';

/**
 * @summary Finds the most recent agent session ID from the memory database.
 *
 * This script connects to the ChromaDB instance, retrieves all memories,
 * and identifies the session ID associated with the most recent memory entry.
 * It also checks if that session has already been summarized.
 */
class GetLastSession {
    static async run() {
        // 1. Initialize client
        const memoryConfig   = aiConfig.memory;
        const sessionsConfig = aiConfig.sessions;
        const dbClient       = new ChromaClient({host: memoryConfig.host, port: memoryConfig.port, ssl: false});

        // 2. Get collections
        let memoryCollection, sessionsCollection;
        try {
            memoryCollection   = await dbClient.getCollection({ name: memoryConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
            sessionsCollection = await dbClient.getCollection({ name: sessionsConfig.collectionName, embeddingFunction: aiConfig.dummyEmbeddingFunction });
        } catch (err) {
            console.error(`Could not connect to collections. Please ensure the memory server is running (\`npm run ai:server-memory\`).`);
            return;
        }

        // 3. Retrieve all memories
        const memories = await memoryCollection.get({
            include: ['metadatas']
        });

        if (memories.ids.length === 0) {
            console.log('No memories found.');
            return;
        }

        // 4. Find the most recent session
        let lastSessionId = null;
        let latestTimestamp = 0;

        for (const metadata of memories.metadatas) {
            if (metadata.timestamp) {
                const currentTimestamp = new Date(metadata.timestamp).getTime();
                if (currentTimestamp > latestTimestamp) {
                    latestTimestamp = currentTimestamp;
                    lastSessionId   = metadata.sessionId;
                }
            }
        }

        if (!lastSessionId) {
            console.log('Could not determine the last session ID.');
            return;
        }

        // 5. Check if the session is summarized
        const summaryId = `summary_${lastSessionId}`;
        const summary = await sessionsCollection.get({
            ids: [summaryId]
        });

        const isSummarized = summary.ids.length > 0;

        // 6. Output the result as JSON
        console.log(JSON.stringify({
            lastSessionId      : lastSessionId,
            isSummarized       : isSummarized,
            lastMemoryTimestamp: new Date(latestTimestamp).toISOString()
        }, null, 2));
    }
}

GetLastSession.run().catch(err => {
    console.error('Error getting last session:', err);
    process.exit(1);
});
