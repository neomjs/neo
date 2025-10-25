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
     * The local persistence path for the agent knowledge-base server.
     * @type {string}
     */
    path: path.resolve(process.cwd(), 'chroma'),
    /**
     * The path to the generated knowledge base JSONL file.
     * @type {string}
     */
    dataPath: path.resolve(process.cwd(), 'dist/ai-knowledge-base.jsonl'),
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
};

export const SCORE_WEIGHTS = {
    BASE_INCREMENT: 1,
    SOURCE_PATH_MATCH: 40,
    FILE_NAME_MATCH: 30,
    CLASS_NAME_MATCH: 20,
    GUIDE_MATCH: 50,
    BLOG_MATCH: 5,
    NAME_PART_MATCH: 30,
    TICKET_PENALTY: -70,
    RELEASE_PENALTY: -50,
    BASE_FILE_BONUS: 20,
    RELEASE_EXACT_MATCH: 1000,
    INHERITANCE_BOOST: 80,
    INHERITANCE_DECAY: 0.6,
};

export default config;
