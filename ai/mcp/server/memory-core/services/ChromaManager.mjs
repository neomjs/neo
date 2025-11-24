import {ChromaClient}           from 'chromadb';
import aiConfig                 from '../config.mjs';
import logger                   from '../logger.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

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
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.ChromaManager',
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

    /**
     * @returns {Promise<Object>}
     */
    async getMemoryCollection() {
        if (!this.memoryCollection) {
            const {collectionName} = aiConfig.memoryDb;

            const originalWarn = console.warn;
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client

            this.memoryCollection = await this.client.getOrCreateCollection({
                name             : collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });

            console.warn = originalWarn;
        }

        return this.memoryCollection;
    }

    /**
     * @returns {Promise<Object>}
     */
    async getSummaryCollection() {
        if (!this.summaryCollection) {
            const {collectionName} = aiConfig.sessionDb;

            const originalWarn = console.warn;
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client

            this.summaryCollection = await this.client.getOrCreateCollection({
                name             : collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });

            console.warn = originalWarn;
        }

        return this.summaryCollection;
    }
}

export default Neo.setupClass(ChromaManager);
