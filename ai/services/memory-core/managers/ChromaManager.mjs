import {ChromaClient}                       from 'chromadb';
import aiConfig                             from '../../../mcp/server/memory-core/config.mjs';
import logger                               from '../../../mcp/server/memory-core/logger.mjs';
import AbstractVectorManager                from './AbstractVectorManager.mjs';
import ChromaLifecycleService               from '../lifecycle/ChromaLifecycleService.mjs';
import {
    chromaConnect,
    chromaDeleteCollection,
    createSilentExecutor
} from '../../shared/vector/chromaClientPrimitives.mjs';

/**
 * Predicate suppression filter for MC: the four Chroma library messages that surface noisily
 * during routine `getOrCreateCollection` calls with the dynamic embedding function. Everything
 * else passes through to the real `console.warn`. The suppression now feeds the shared Chroma
 * client primitives instead of staying local to ChromaManager's silent executor.
 */
const MC_WARN_FILTER = msg =>
    msg.includes('No embedding function configuration found') ||
    msg.includes('Could not deserialize the collection metadata') ||
    msg.includes('dummy_embedding_function') ||
    msg.includes('dynamic_text_embedding_service');

/**
 * @summary Simple manager around the Chroma client that lazily caches frequently used collections.
 *
 * This class abstracts the lower-level ChromaDB client interactions. It provides methods to connect to the database
 * and retrieve specific collections (memory and summary), ensuring that the connection is established and
 * collections are created if they don't exist. It handles the `dummyEmbeddingFunction` requirement for ChromaDB
 * to prevent warnings.
 *
 * @class Neo.ai.services.memory-core.managers.ChromaManager
 * @extends Neo.ai.services.memory-core.managers.AbstractVectorManager
 * @singleton
 */
class ChromaManager extends AbstractVectorManager {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.managers.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.managers.ChromaManager',
        /**
         * @member {ChromaClient|null} client=null
         * @protected
         */
        client: null,
        /**
         * @member {Boolean} connected=false
         */
        connected: false,
        /**
         * @member {Object|null} memoryCollection=null
         * @protected
         */
        memoryCollection: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} summaryCollection=null
         * @protected
         */
        summaryCollection: null,
        /**
         * @member {Object|null} graphCollection=null
         * @protected
         */
        graphCollection: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is constructed here; heartbeat/connection is evaluated lazily by `connect()`.
        const {host, port} = aiConfig.engines.chroma;
        this.client        = new ChromaClient({host, port, ssl: false});
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaLifecycleService.ready();
        await this.connect();
    }

    /**
     * Establishes connection to ChromaDB via the shared `chromaConnect` primitive.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        this.connected = await chromaConnect({client: this.client, logger});
        return this.connected
    }

    /**
     * Ensures the process can reach the Chroma server and both collections are available.
     * @returns {Promise<{heartbeat: number, memoryCollection: string, summaryCollection: string}>}
     */
    async checkConnectivity() {
        const heartbeat = await this.client.heartbeat();
        const memory    = await this.getMemoryCollection();
        const summaries = await this.getSummaryCollection();

        return {
            heartbeat,
            memoryCollection : memory.name,
            summaryCollection: summaries.name
        };
    }

    /**
     * Per-instance silent-execution function from the shared Chroma primitive.
     * Each consumer gets its own isolated sequential lock. MC's call sites pass
     * `{filter: MC_WARN_FILTER}` to suppress only the four specific Chroma library
     * messages while letting everything else through.
     * @member {Function} #executeSilently
     * @private
     */
    #executeSilently = createSilentExecutor()

    /**
     * Instantiates an IEmbeddingFunction wrapper for the chromadb client.
     * @returns {Object} A locally valid implementation of IEmbeddingFunction
     */
    #createEmbeddingFunction() {
        return {
            generate   : async (texts) => {
                // Pass arrays of texts sequentially or via promise.all to TextEmbeddingService
                const {default: TextEmbeddingService} = await import('../TextEmbeddingService.mjs');
                const provider                        = aiConfig.embeddingProvider;
                const vectors                         = await Promise.all(texts.map(text => TextEmbeddingService.embedText(text, provider)));
                return vectors;
            },
            name       : 'dynamic_text_embedding_service',
            getConfig  : () => ({}),
            constructor: {
                buildFromConfig: () => this.#createEmbeddingFunction()
            }
        };
    }

    /**
     * @returns {Promise<Object>}
     */
    async getMemoryCollection() {
        if (!this._memoryCollectionPromise) {
            this._memoryCollectionPromise = this.#executeSilently(async () => {
                const collectionName = aiConfig.collections.memory;
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.memoryCollection = await this._memoryCollectionPromise;
        return this.memoryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getSummaryCollection() {
        if (!this._summaryCollectionPromise) {
            this._summaryCollectionPromise = this.#executeSilently(async () => {
                const collectionName = aiConfig.collections.session;
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.summaryCollection = await this._summaryCollectionPromise;
        return this.summaryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getGraphCollection() {
        if (!this._graphCollectionPromise) {
            this._graphCollectionPromise = this.#executeSilently(async () => {
                const collectionName = aiConfig.collections.graph;
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: this.#createEmbeddingFunction()
                });
            }, {filter: MC_WARN_FILTER});
        }

        this.graphCollection = await this._graphCollectionPromise;
        return this.graphCollection;
    }

    /**
     * Guarded delete-collection wrapper. Refuses canonical production collection names
     * (`neo-agent-memory`, `neo-agent-sessions`, `neo-agent-graph`, `neo-knowledge-base`)
     * unless `process.env.UNIT_TEST_MODE === 'true'` (test path) or a valid production
     * `confirmation` token is supplied.
     *
     * All Memory Core callers (tests, `CollectionProxy`, future restore wrappers) MUST
     * route through this method instead of `ChromaManager.client.deleteCollection` so the
     * substrate-level invariant fires regardless of harness or config state. The empirical
     * anchor is the 2026-05-17 wipe where `npx playwright` bypassed `playwright.config.unit.mjs`
     * (`UNIT_TEST_MODE` absent) → `aiConfig.collections.*` returned canonical names →
     * a destructive cleanup helper dropped the live collections.
     *
     * @param {Object}  options
     * @param {String}  options.name              Collection name to delete.
     * @param {String} [options.confirmation]     Production-recovery token; equals `CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE` for bypass.
     * @returns {Promise<*>} Forwarded chromadb-client response.
     * @throws {CanonicalCollectionGuardError} When `name` is canonical and neither bypass applies.
     * @see https://github.com/neomjs/neo/issues/11652
     */
    async deleteCollection({name, confirmation} = {}) {
        return chromaDeleteCollection({client: this.client, name, subsystem: 'memory-core', confirmation})
    }
}

export default Neo.setupClass(ChromaManager);
