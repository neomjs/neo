import {ChromaClient} from 'chromadb';
import aiConfig       from '../config.mjs';
import logger         from '../logger.mjs';
import Base           from '../../../../../src/core/Base.mjs';

/**
 * Simple manager around the Chroma client that lazily caches the knowledge-base collection.
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
         * @member {import('chromadb').Collection|null} knowledgeBaseCollection=null
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

    /**
     * @returns {Promise<import('chromadb').Collection>}
     */
    async getKnowledgeBaseCollection() {
        if (!this.knowledgeBaseCollection) {
            const originalWarn = console.warn;
            console.warn = () => {}; // Suppress unwanted warnings from ChromaDB client

            this.knowledgeBaseCollection = await this.client.getOrCreateCollection({
                name             : aiConfig.collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });

            console.warn = originalWarn;
        }

        return this.knowledgeBaseCollection;
    }
}

export default Neo.setupClass(ChromaManager);
