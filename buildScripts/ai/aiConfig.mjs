import path from 'path';

const aiConfig = {
    /**
     * Configuration for the AI agent's persistent memory database.
     */
    memory: {
        /**
         * The name of the ChromaDB collection for agent memories.
         * @type {string}
         */
        collectionName: 'neo-agent-memory',
        /**
         * The hostname of the ChromaDB server for agent memory.
         * @type {string}
         */
        host: 'localhost',
        /**
         * The port the ChromaDB server for agent memory is listening on.
         * @type {number}
         */
        port: 8001,
        /**
         * The local persistence path for the agent memory server.
         * @type {string}
         */
        path: path.resolve(process.cwd(), './chroma-memory'),
        /**
         * The path to store memory backups.
         * @type {string}
         */
        backupPath: path.resolve(process.cwd(), 'dist/memory-backups')
    },
    /**
     * Configuration for the project's main knowledge base.
     */
    knowledgeBase: {
        /**
         * The path to the generated knowledge base JSONL file.
         * @type {string}
         */
        path: path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl'),
        /**
         * The name of the ChromaDB collection for the knowledge base.
         * @type {string}
         */
        collectionName: 'neo_knowledge',
        /**
         * The name of the Google Generative AI model for text embeddings.
         * @type {string}
         */
        embeddingModel: 'text-embedding-004',
        /**
         * The number of chunks to process in a single batch when embedding.
         * @type {number}
         */
        batchSize: 100,
        /**
         * The maximum number of times to retry a failed embedding batch.
         * @type {number}
         */
        maxRetries: 5,
        /**
         * The number of results to fetch from ChromaDB for a query.
         * @type {number}
         */
        nResults: 100
    }
};

export default aiConfig;
