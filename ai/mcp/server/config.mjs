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
             * The date from which to start synchronizing issues and releases.
             * @type {string}
             */
            syncStartDate: '2025-06-15T00:00:00Z',
            /**
             * The path to the directory for release notes.
             * @type {string}
             */
            releaseNotesDir: path.resolve(process.cwd(), '.github', 'RELEASE_NOTES'),
            /**
             * The default version directory to use for archiving issues when no release is found.
             * @type {string}
             */
            defaultArchiveVersion: 'unversioned',
            /**
             * A prefix for issue filenames to prevent them from starting with a number (e.g., 'issue-').
             * @type {string}
             */
            issueFilenamePrefix: 'issue-',
            /**
             * The maximum number of issues to fetch from the GitHub API in a single sync.
             * @type {number}
             */
            maxIssues: 10000,
            /**
             * The maximum number of releases to fetch from the GitHub API.
             * @type {number}
             */
            maxReleases: 1000,
            /**
             * The maximum buffer size for the `gh` CLI command output.
             * @type {number}
             */
            maxGhOutputBuffer: 10 * 1024 * 1024, // 10 MB
            /**
             * The markdown delimiter used to separate the issue body from the comments section.
             * @type {string}
             */
            commentSectionDelimiter: '## Comments'
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
