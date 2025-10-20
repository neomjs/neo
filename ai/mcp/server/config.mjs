import path from 'path';

const aiConfig = {
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
     * Configuration for the GitHub workflow server.
     */
    githubWorkflow: {
        /**
         * The minimum required version of the GitHub CLI (`gh`).
         * @type {string}
         */
        minGhVersion: '2.0.0',
        /**
         * Configuration for the issue synchronization service.
         */
        issueSync: {
            /**
             * The path to the directory for active issues.
             * @type {string}
             */
            issuesDir: path.resolve(process.cwd(), '.github', 'ISSUES'),
            /**
             * The path to the directory for archived issues.
             * @type {string}
             */
            archiveDir: path.resolve(process.cwd(), '.github', 'ISSUE_ARCHIVE'),
            /**
             * The path to the synchronization metadata file.
             * @type {string}
             */
            metadataFile: path.resolve(process.cwd(), '.github', '.sync-metadata.json'),
            /**
             * Labels that, when present on an issue, will cause it to be ignored and deleted locally.
             * @type {string[]}
             */
            droppedLabels: ['dropped', 'wontfix', 'duplicate'],
            /**
             * The release schedule used for archiving closed issues. Must be sorted newest first.
             * @type {Array<{version: string, cutoffDate: string}>}
             */
            releases: [
                { version: 'v11.0', cutoffDate: '2025-11-01' },
                { version: 'v10.9', cutoffDate: '2025-08-01' },
                { version: 'v10.8', cutoffDate: '2025-05-01' },
            ]
        }
    },
    /**
     * Configuration for the project's main knowledge base.
     */
    knowledgeBase: {
        /**
         * The hostname of the ChromaDB server for the knowledge base.
         * @type {string}
         */
        host: 'localhost',
        /**
         * The port the ChromaDB server for the knowledge base is listening on.
         * @type {number}
         */
        port: 8000,
        /**
         * The path to the generated knowledge base JSONL file.
         * @type {string}
         */
        path: path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl'),
        /**
         * The name of the ChromaDB collection for the knowledge base.
         * @type {string}
         */
        collectionName: 'neo-knowledge-base',
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
    },
    /**
     * Configuration for the Memory Core server.
     */
    memoryCore: {
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
            path: path.resolve(process.cwd(), './chroma-memory'),
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
    }
};

export default aiConfig;
