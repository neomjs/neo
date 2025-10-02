/**
 * @summary Initializes the ChromaDB database for the AI agent's persistent memory.
 *
 * This script is the first step in the "AI Knowledge Evolution" epic. Its sole purpose is to
 * set up the necessary infrastructure for the agent's memory. It connects to a dedicated
 * ChromaDB server instance (expected to be running via `npm run ai:server-memory`) and
 * creates a specific collection to store conversation history, decisions, and internal
 * thought processes.
 *
 * This is a one-time setup script. Running it multiple times is safe; it will not
 * re-create the collection if it already exists.
 *
 * @see {@link .github/ISSUE/ticket-setup-memory-chromadb.md}
 */

import {ChromaClient} from 'chromadb';
import aiConfig       from './aiConfig.mjs';

const memoryDBConfig = aiConfig.memory;

/**
 * Initializes and returns a ChromaDB client configured to connect to the agent's
 * memory server.
 * @returns {ChromaClient} The configured ChromaDB client instance.
 */
function initializeClient() {
    const serverUrl = `http://${memoryDBConfig.host}:${memoryDBConfig.port}`;
    console.log(`Initializing ChromaDB HTTP client at: ${serverUrl}`);

    // Instantiate the client using the host and port, as recommended by the API.
    // This avoids the deprecation warning associated with using the 'path' property for URLs.
    return new ChromaClient({
        host: memoryDBConfig.host,
        port: memoryDBConfig.port,
        ssl : false
    });
}

/**
 * Ensures the dedicated collection for agent memories exists in the ChromaDB instance.
 * If the collection is not found, it will be created.
 * @param {ChromaClient} client The ChromaDB client instance.
 * @returns {Promise<void>}
 */
async function createMemoryCollection(client) {
    const {collectionName, host, port} = memoryDBConfig;
    console.log(`Checking for collection: "${collectionName}"...`);

    try {
        const collections = await client.listCollections();
        const exists      = collections.some(c => c.name === collectionName);

        if (exists) {
            console.log(`Collection "${collectionName}" already exists.`);
        } else {
            console.log(`Creating collection: "${collectionName}"...`);
            await client.createCollection({name: collectionName});
            console.log(`Collection "${collectionName}" created successfully.`);
        }
    } catch (error) {
        // Provide a user-friendly error message if the connection fails.
        if (error.message.includes('Failed to connect') || error.message.includes('fetch failed')) {
            console.error(`
Error: Could not connect to the ChromaDB server at http://${host}:${port}.`);
            console.error('Please ensure the memory server is running by executing: npm run ai:server-memory\n');
            process.exit(1);
        }
        throw error;
    }
}

/**
 * Main execution function to orchestrate the database setup.
 * It initializes the client and creates the collection.
 * @returns {Promise<void>}
 */
async function setupMemoryDB() {
    try {
        const client = initializeClient();
        await createMemoryCollection(client);
        console.log('Agent memory database setup complete.');
    } catch (error) {
        console.error('Error setting up agent memory database:', error);
        process.exit(1);
    }
}

// Execute the setup process.
setupMemoryDB();
