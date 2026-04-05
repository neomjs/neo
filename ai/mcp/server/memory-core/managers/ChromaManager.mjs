import {ChromaClient}           from 'chromadb';
import aiConfig                 from '../config.mjs';
import logger                   from '../logger.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import DatabaseLifecycleService from '../services/DatabaseLifecycleService.mjs';

/**
 * @summary Simple manager around the Chroma client that lazily caches frequently used collections.
 *
 * This class abstracts the lower-level ChromaDB client interactions. It provides methods to connect to the database
 * and retrieve specific collections (memory and summary), ensuring that the connection is established and
 * collections are created if they don't exist. It handles the `dummyEmbeddingFunction` requirement for ChromaDB
 * to prevent warnings.
 *
 * @class Neo.ai.mcp.server.memory-core.services.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
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

        // The client is created here, but the connection is established in initAsync
        const {host, port} = aiConfig.memoryDb;
        this.client = new ChromaClient({host, port, ssl: false});
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await DatabaseLifecycleService.ready();
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
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client
            
            try {
                return await fn();
            } finally {
                // Guaranteed sequential restore
                console.warn = originalWarn;
            }
        })();
        
        // Prevent chain crashing if an internal error occurs
        this.#chromaLock = nextLock.catch(() => {});
        return nextLock;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getMemoryCollection() {
        if (!this._memoryCollectionPromise) {
            this._memoryCollectionPromise = this.#executeSilently(async () => {
                const {collectionName} = aiConfig.memoryDb;
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: aiConfig.dummyEmbeddingFunction
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
                const {collectionName} = aiConfig.sessionDb;
                return await this.client.getOrCreateCollection({
                    name             : collectionName,
                    embeddingFunction: aiConfig.dummyEmbeddingFunction
                });
            });
        }

        this.summaryCollection = await this._summaryCollectionPromise;
        return this.summaryCollection;
    }
}

export default Neo.setupClass(ChromaManager);
