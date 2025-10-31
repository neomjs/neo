import {ChromaClient} from 'chromadb';
import aiConfig       from '../config.mjs';
import logger         from '../logger.mjs';
import Base           from '../../../../../src/core/Base.mjs';

/**
 * Simple manager around the Chroma client that lazily caches frequently used collections.
 * @class AI.mcp.server.memory-core.services.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory-core.services.ChromaManager'
         * @protected
         */
        className: 'AI.mcp.server.memory-core.services.ChromaManager',
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
         * @member {import('chromadb').Collection|null} memoryCollection=null
         * @protected
         */
        memoryCollection: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {import('chromadb').Collection|null} summaryCollection=null
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
     * @returns {Promise<import('chromadb').Collection>}
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
     * @returns {Promise<import('chromadb').Collection>}
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
