import fs              from 'fs/promises';
import path            from 'path';
import {fileURLToPath} from 'url';
import Base            from '../../../../src/core/Base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Default configuration object.
 * Defines the structure and default values for the server configuration.
 */
const defaultConfig = {
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
        generate: () => null,
        name: 'dummy_embedding_function',
        getConfig: () => ({}),
        constructor: {
            buildFromConfig: () => ({
                generate: () => null,
                name: 'dummy_embedding_function',
                getConfig: () => ({})
            })
        }
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
    path: path.resolve(__dirname, '../../../../chroma-neo-knowledge-base'),
    /**
     * The path to the generated knowledge base JSONL file.
     * @type {string}
     */
    dataPath: path.resolve(__dirname, '../../../../dist/ai-knowledge-base.jsonl'),
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
    nResults: 100,
    /**
     * Weights used in the query scoring algorithm.
     * @type {Object}
     */
    queryScoreWeights: {
        baseIncrement    : 1,
        sourcePathMatch  : 40,
        fileNameMatch    : 30,
        classNameMatch   : 20,
        guideMatch       : 50,
        blogMatch        : 5,
        namePartMatch    : 30,
        ticketPenalty    : -70,
        releasePenalty   : -50,
        baseFileBonus    : 20,
        releaseExactMatch: 1000,
        inheritanceBoost : 80,
        inheritanceDecay : 0.6
    }
};

/**
 * @summary Configuration manager for the Knowledge Base MCP server.
 *
 * Configuration manager for the Knowledge Base MCP server.
 * Supports loading configuration from a custom file and merging with defaults.
 *
 * @class Neo.ai.mcp.server.knowledge-base.Config
 * @extends Neo.core.Base
 * @singleton
 */
class Config extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.Config',
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
        // 2. Fallback to the data object (e.g. port, batchSize)
        return target.data[prop];
    }
});
