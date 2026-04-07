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
        summaryCollection: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is created here, but the connection is evaluated lazily.
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
     * Establishes connection to ChromaDB.
     * @returns {Promise<boolean>} True if connected, false otherwise
     */
    async connect() {
        if (aiConfig.engine === 'neo') {
            this.connected = true;
            return true;
        }

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
                    msg.includes('dummy embedding function')) {
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
                const provider                        = aiConfig.chromaEmbeddingProvider;
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
}

export default Neo.setupClass(ChromaManager);
