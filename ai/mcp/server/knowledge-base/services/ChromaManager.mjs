import {ChromaClient}           from 'chromadb';
import aiConfig                 from '../config.mjs';
import logger                   from '../logger.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

/**
 * @summary Simple manager around the Chroma client that lazily caches the knowledge-base collection.
 *
 * This class provides a wrapper around the ChromaDB client, ensuring that the connection
 * and the specific knowledge-base collection are initialized and cached for subsequent use.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.ChromaManager',
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
         * @member {Object|null} knowledgeBaseCollection=null
         * @protected
         */
        knowledgeBaseCollection: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is created here, but the connection is established in initAsync
        const {host, port} = aiConfig;
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
     * Ensures the process can reach the Chroma server and the collection is available.
     * @returns {Promise<{heartbeat: number, knowledgeBaseCollection: string}>}
     */
    async checkConnectivity() {
        const heartbeat  = await this.client.heartbeat();
        const collection = await this.getKnowledgeBaseCollection();

        return {
            heartbeat,
            knowledgeBaseCollection: collection.name
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
    async getKnowledgeBaseCollection() {
        if (!this._knowledgeBaseCollectionPromise) {
            this._knowledgeBaseCollectionPromise = this.#executeSilently(async () => {
                return await this.client.getOrCreateCollection({
                    name             : aiConfig.collectionName,
                    embeddingFunction: aiConfig.dummyEmbeddingFunction
                });
            });
        }

        this.knowledgeBaseCollection = await this._knowledgeBaseCollectionPromise;
        return this.knowledgeBaseCollection;
    }
}

export default Neo.setupClass(ChromaManager);
