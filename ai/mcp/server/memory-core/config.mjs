import fs   from 'fs/promises';
import path from 'path';
import Base from '../../../../src/core/Base.mjs';

const cwd = process.cwd();

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
    /**
     * Automatically trigger session summarization on startup.
     * @type {boolean}
     */
    autoSummarize: true,
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * A dummy embedding function to satisfy the ChromaDB API when embeddings are provided manually.
     *
     * NOTE: This verbose structure is strictly required to prevent the ChromaDB client from
     * flagging this as a "legacy" function, which triggers a persistent console warning:
     * "No embedding function configuration found for collection..."
     *
     * The `chromadb` library checks for the presence of `name`, `getConfig`, and `buildFromConfig`.
     * If any are missing, it defaults to legacy mode.
     * @returns {Object} The dummy embedding function satisfying IEmbeddingFunction
     */
    dummyEmbeddingFunction: {
        generate   : () => null,
        name       : 'dummy_embedding_function',
        getConfig  : () => ({}),
        constructor: {
            buildFromConfig: () => ({
                generate : () => null,
                name     : 'dummy_embedding_function',
                getConfig: () => ({})
            })
        }
    },
    /**
     * The name of the Google Generative AI model for content generation.
     * @type {string}
     */
    modelName: 'gemini-2.5-flash',
    /**
     * The name of the Google Generative AI model for text embeddings.
     * @type {string}
     */
    embeddingModel: 'gemini-embedding-001',
    /**
     * Pagination limit for fetching records during session summarization scans.
     * Controls the batch size for memory and summary retrieval.
     * @type {number}
     */
    summarizationBatchLimit: 2000,
    /**
     * Maximum number of concurrent session summarization requests.
     * Prevents hitting LLM/Embedding API rate limits during bulk operations.
     * @type {number}
     */
    summarizationConcurrency: 5,
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
        path: path.resolve(cwd, 'chroma-neo-memory-core'),
        /**
         * The path to store memory backups.
         * @type {string}
         */
        backupPath: path.resolve(cwd, 'dist/memory-backups')
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
        port: 8001,
        /**
         * The path to store session summary backups.
         * @type {string}
         */
        backupPath: path.resolve(cwd, 'dist/session-backups')
    }
};

/**
 * @summary Configuration manager for the Memory Core MCP server.
 *
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.memory-core.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The current configuration object.
     * Starts with defaults and can be updated via load().
     * @member {Object} data
     */
    data = null;

    /**
     * Initializes the configuration object by deep cloning the defaults.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = Neo.clone(defaultConfig, true);
    }

    /**
     * Loads configuration from a JSON file and merges it with defaults.
     * @param {String} filePath The path to the configuration file.
     * @returns {Promise<void>}
     */
    async load(filePath) {
        if (!filePath) return;

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let   customConfig;

            if (ext === '.mjs' || ext === '.js') {
                const module = await import(absolutePath);
                customConfig = module.default;
            } else {
                const content = await fs.readFile(absolutePath, 'utf-8');
                customConfig  = JSON.parse(content);
            }

            // Deep merge custom config into the data object
            Neo.merge(this.data, customConfig);

            console.log(`[Config] Loaded custom configuration from ${absolutePath}`);

        } catch (error) {
            console.error(`[Config] Failed to load configuration from ${filePath}:`, error.message);
            throw error;
        }
    }
}

const instance = Neo.setupClass(Config);

export default new Proxy(instance, {
    get(target, prop, receiver) {
        // 1. Prefer properties/methods on the instance itself (e.g. load, className)
        if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        // 2. Fallback to the data object (e.g. memoryDb.port)
        return target.data[prop];
    }
});
