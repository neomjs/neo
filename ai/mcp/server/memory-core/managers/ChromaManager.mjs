import {ChromaClient}           from 'chromadb';
import aiConfig                 from '../config.mjs';
import logger                   from '../logger.mjs';
import AbstractVectorManager    from './AbstractVectorManager.mjs';
import ChromaLifecycleService   from '../services/lifecycle/ChromaLifecycleService.mjs';

/**
 * @summary Simple manager around the Chroma client that lazily caches frequently used collections.
 *
 * This class abstracts the lower-level ChromaDB client interactions. It provides methods to connect to the database
 * and retrieve specific collections (memory and summary), ensuring that the connection is established and
 * collections are created if they don't exist. It handles the `dummyEmbeddingFunction` requirement for ChromaDB
 * to prevent warnings.
 *
 * **Dynamic topology (Epic #9999, sub-epic #10015):** The ChromaClient coordinates are resolved from
 * `aiConfig.chromaUnified`. In **federated** mode (the default, flag `false`) the client targets
 * `aiConfig.engines.chroma.{host, port}` — Memory Core's own ChromaDB instance, typically on port 8001.
 * In **unified** mode (flag `true`) the client targets `aiConfig.engines.kb.chroma.{host, port}` —
 * the shared Knowledge Base instance, typically on port 8000 — enabling single-container KB + MC
 * deployments where one ChromaDB process serves both servers. The federation choice is orthogonal
 * to per-tenant write tagging and read-side isolation, which live in `SessionService` /
 * `MemoryService`.
 *
 * @class Neo.ai.mcp.server.memory-core.managers.ChromaManager
 * @extends Neo.ai.mcp.server.memory-core.managers.AbstractVectorManager
 * @singleton
 */
class ChromaManager extends AbstractVectorManager {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.ChromaManager',
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
        const {host, port} = this.resolveChromaCoordinates(aiConfig);
        this.client        = new ChromaClient({host, port, ssl: false});
    }

    /**
     * Resolves the effective ChromaDB `{host, port}` from the unified-vs-federated topology flag
     * (Epic #9999, sub-epic #10015, ticket #10001). Pure function of the passed config — extracted
     * from the `construct()` call-site so the resolution is independently testable and observable
     * by diagnostics (e.g. HealthService topology reporting) without re-instantiating the singleton.
     *
     * - `chromaUnified=false` (default, federated): routes to `cfg.engines.chroma` — MC's own instance
     * - `chromaUnified=true` (unified): routes to `cfg.engines.kb.chroma` — the shared KB instance
     *
     * Throws when unified mode is requested but `engines.kb.chroma` is absent — this can only happen
     * when a custom config file explicitly clobbers the `engines.kb` branch (the shipped template
     * ships it populated). Surfacing an explicit error here prevents `new ChromaClient({host:
     * undefined, port: undefined})` from failing later with a less-actionable heartbeat error.
     *
     * @param {Object} cfg              aiConfig-shaped input. Must expose `chromaUnified` plus both
     *                                  branch targets `engines.chroma.{host, port}` and
     *                                  `engines.kb.chroma.{host, port}`.
     * @returns {{host: string, port: number}} The resolved coordinates for the active topology.
     * @throws {Error} When `chromaUnified=true` and `engines.kb.chroma` is not defined.
     */
    resolveChromaCoordinates(cfg) {
        if (cfg.chromaUnified) {
            const kbChroma = cfg.engines?.kb?.chroma;

            if (!kbChroma) {
                throw new Error(
                    'ChromaManager: chromaUnified=true requires engines.kb.chroma.{host, port} ' +
                    'to be defined. Check your custom config override — the shipped template provides ' +
                    'defaults (localhost:8000) overridable via NEO_KB_CHROMA_HOST / NEO_KB_CHROMA_PORT.'
                )
            }

            return kbChroma
        }

        return cfg.engines.chroma
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
     * Establishes connection to ChromaDB.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        try {
            await this.client.heartbeat();
            this.connected = true;
            return true;
        } catch (e) {
            this.connected = false;
            logger.debug('[ChromaManager] ChromaDB not accessible:', e.message);
            return false;
        }
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

    #chromaLock = Promise.resolve();

    /**
     * Executes a ChromaDB client function sequentially, ensuring console.warn
     * is safely suppressed without overlapping race conditions.
     * @param {Function} fn Async function to execute
     * @returns {Promise<any>}
     */
    async #executeSilently(fn) {
        const nextLock = (async () => {
            // Await the completion of the previous silent execution
            await this.#chromaLock;

            const originalWarn = console.warn;
            console.warn       = (...args) => {
                const msg = args.join(' ');
                if (msg.includes('No embedding function configuration found') ||
                    msg.includes('Could not deserialize the collection metadata') ||
                    msg.includes('dummy_embedding_function') ||
                    msg.includes('dynamic_text_embedding_service')) {
                    return;
                }
                originalWarn.apply(console, args);
            };

            try {
                return await fn();
            } finally {
                // Guaranteed sequential restore
                console.warn = originalWarn;
            }
        })();

        // Prevent chain crashing if an internal error occurs
        this.#chromaLock = nextLock.catch(() => {
        });
        return nextLock;
    }

    /**
     * Instantiates an IEmbeddingFunction wrapper for the chromadb client.
     * @returns {Object} A locally valid implementation of IEmbeddingFunction
     */
    #createEmbeddingFunction() {
        return {
            generate   : async (texts) => {
                // Pass arrays of texts sequentially or via promise.all to TextEmbeddingService
                const {default: TextEmbeddingService} = await import('../services/TextEmbeddingService.mjs');
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
            });
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
            });
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
            });
        }

        this.graphCollection = await this._graphCollectionPromise;
        return this.graphCollection;
    }
}

export default Neo.setupClass(ChromaManager);
