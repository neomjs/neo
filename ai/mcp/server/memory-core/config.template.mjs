import fs              from 'fs/promises';
import path            from 'path';
import Base            from '../../../../src/core/Base.mjs';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../../../');
const cwd        = neoRootDir;

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
    /**
     * Automatically trigger session summarization on startup.
     * @type {boolean}
     */
    autoSummarize: process.env.AUTO_SUMMARIZE !== 'false',
    /**
     * Automatically trigger GraphRAG extraction on startup.
     * @type {boolean}
     */
    autoDream: process.env.AUTO_DREAM !== 'false',
    /**
     * Automatically trigger FileSystem ingestion (Differential Graph Sync) on MCP server startup.
     * @type {boolean}
     */
    autoIngestFileSystem: process.env.AUTO_INGEST_FS === 'true',
    /**
     * Global debug flag for all MCP servers.
     * @type {boolean}
     */
    debug: false,
    /**
     * Transport protocol for the MCP server ('stdio' or 'sse').
     * @type {string}
     */
    transport: process.env.TRANSPORT || 'stdio',
    /**
     * Port for the SSE transport (only used if transport is 'sse').
     * @type {number}
     */
    ssePort: Number(process.env.SSE_PORT) || 3001,
    /**
     * Optional Express middleware function for authentication (only used if transport is 'sse').
     * @type {Function|null}
     */
    authMiddleware: null,
    /**
     * Authentication configuration for the server (OAuth 2.1 / OIDC).
     * Only used when transport is 'sse'.
     * @type {Object}
     */
    auth: {
        host        : process.env.AUTH_HOST || null,
        port        : Number(process.env.AUTH_PORT) || 8080,
        realm       : process.env.AUTH_REALM || 'master',
        issuerUrl   : process.env.AUTH_ISSUER_URL || null,
        clientId    : process.env.OAUTH_CLIENT_ID || null,
        clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    },
    /**
     * Explicit override provider for the core LLM Engine (e.g. summarization).
     * @type {string}
     */
    modelProvider: process.env.MODEL_PROVIDER || 'gemini',
    /**
     * Explicit override provider for the SQLite Native Database Engine.
     * @type {string}
     */
    neoEmbeddingProvider: process.env.NEO_EMBEDDING_PROVIDER || 'gemini',
    /**
     * Explicit override provider for the ChromaDB Engine.
     * @type {string}
     */
    chromaEmbeddingProvider: process.env.CHROMA_EMBEDDING_PROVIDER || 'gemini',
    /**
     * Settings for the Ollama integration
     */
    ollama: {
        host          : process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
        model         : process.env.OLLAMA_MODEL || 'gemma4:31b',
        embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding'
    },
    /**
     * Settings for the OpenAI-Compatible API integration (e.g., mlx-lm or mlx-openai-server)
     */
    openAiCompatible: {
        host          : process.env.OPENAI_COMPATIBLE_HOST || 'http://127.0.0.1:8000',
        model         : process.env.OPENAI_COMPATIBLE_MODEL || 'gemma4:31b',
        embeddingModel: process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'qwen3-embedding'
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
     * The target Storage Engine (Vector Database) to use.
     * Options: 'neo' (SQLite-Vec), 'chroma' (ChromaDB), or 'both'.
     */
    engine: 'neo',
    /**
     * Database Engine Definitions
     * This defines WHERE data is stored physically.
     */
    engines: {
        neo   : {
            dataDir : path.resolve(cwd, '.neo-ai-data/neo-sqlite'),
            filename: 'memory-core.sqlite'
        },
        chroma: {
            dataDir: path.resolve(cwd, '.neo-ai-data/chroma/memory-core'),
            host   : 'localhost',
            port   : 8001
        }
    },
    /**
     * Data Schema/Table Names
     * This defines WHAT the tables/collections are called logically.
     */
    collections: {
        memory : process.env.MEMORY_COLLECTION_NAME || 'neo-agent-memory',
        session: process.env.SESSION_COLLECTION_NAME || 'neo-agent-sessions',
        graph  : process.env.GRAPH_COLLECTION_NAME || 'neo-native-graph'
    },
    /**
     * Target markdown file used for autonomous agent-to-user reporting (offline jobs).
     * @type {string}
     */
    handoffFilePath: path.resolve(cwd, 'resources/content/sandman_handoff.md'),
    /**
     * The Hebbian decay factor applied every 24 hours to the edge graph (e.g., 0.98 for ~79 day half-life).
     * @type {number}
     */
    decayFactor: Number(process.env.GRAPH_DECAY_FACTOR) || 0.98,
    /**
     * Universal JSONL backup/export directory for all databases.
     * @type {string}
     */
    backupPath: path.resolve(cwd, '.neo-ai-data/backups')
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
        if (!filePath) {
            return;
        }

        try {
            const absolutePath = path.resolve(filePath);
            const ext          = path.extname(absolutePath);
            let customConfig;

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
