import {ChromaClient} from 'chromadb';
import aiConfig       from '../../config.mjs';
import Base           from '../../../../../src/core/Base.mjs';

/**
 * Simple manager around the Chroma client that lazily caches frequently used collections.
 * @class AI.mcp.server.memory.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory.ChromaManager'
         * @protected
         */
        className: 'AI.mcp.server.memory.ChromaManager',
        /**
         * @member {ChromaClient|null} client_=null
         * @protected
         * @reactive
         */
        client_: null,
        /**
         * @member {Boolean} connected_=false
         * @reactive
         */
        connected_: false,
        /**
         * @member {import('chromadb').Collection|null} memoryCollection_=null
         * @protected
         * @reactive
         */
        memoryCollection_: null,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {import('chromadb').Collection|null} summaryCollection_=null
         * @protected
         * @reactive
         */
        summaryCollection_: null
    }

    /**
     * Triggered after the connected config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetConnected(value, oldValue) {
        // console.error(`[ChromaManager] ${value ? 'Connected' : 'Disconnected'}`); // Use logger instead
        // this.fire?.('connectionChange', { connected: value }); // Not part of PoC yet
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // The client is created here, but the connection is established in initAsync
        const {host, port} = aiConfig.memoryCore.memoryDb;
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
     */
    async connect() {
        try {
            await this.client.heartbeat();
            this.connected = true;
        } catch (e) {
            this.connected = false;
            throw e;
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
            const {collectionName} = aiConfig.memoryCore.memoryDb;

            const originalWarn = console.warn;
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client

            this.memoryCollection = await this.client.getCollection({
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
            const {collectionName} = aiConfig.memoryCore.sessionDb;

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
