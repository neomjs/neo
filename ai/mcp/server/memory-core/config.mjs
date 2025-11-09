import path from 'path';

const config = {
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * A dummy embedding function to satisfy the ChromaDB API when embeddings are provided manually.
     * @returns {null}
     */
    dummyEmbeddingFunction: {
        generate: () => null
    },
    /**
     * The name of the Google Generative AI model for text embeddings.
     * @type {string}
     */
    embeddingModel: 'text-embedding-004',
    /**
     * Configuration for the AI agent's persistent memory database.
     */
    memoryDb: {
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
        path: path.resolve(process.cwd(), 'chroma-memory'),
        /**
         * The path to store memory backups.
         * @type {string}
         */
        backupPath: path.resolve(process.cwd(), 'dist/memory-backups')
    },
    /**
     * Configuration for the AI agent's session summary database.
     */
    sessionDb: {
        /**
         * The name of the ChromaDB collection for session summaries.
         * @type {string}
         */
        collectionName: 'neo-agent-sessions',
        /**
         * The hostname of the ChromaDB server for session summaries.
         * @type {string}
         */
        host: 'localhost',
        /**
         * The port the ChromaDB server for session summaries is listening on.
         * @type {number}
         */
        port: 8001
    }
};

export default config;
