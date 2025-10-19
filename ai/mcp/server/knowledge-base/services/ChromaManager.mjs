import {ChromaClient} from 'chromadb';
import aiConfig       from '../../config.mjs';
import Base           from '../../../../../src/core/Base.mjs';

/**
 * Simple manager around the Chroma client that lazily caches the knowledge-base collection.
 * @class Neo.ai.mcp.server.knowledgebase.service.ChromaManager
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledgebase.service.ChromaManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledgebase.service.ChromaManager',
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
         * @member {import('chromadb').Collection|null} knowledgeBaseCollection_=null
         * @protected
         * @reactive
         */
        knowledgeBaseCollection_: null,
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
        const {host, port} = aiConfig.knowledgeBase;
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
            const {collectionName} = aiConfig.knowledgeBase;

            this.knowledgeBaseCollection = await this.client.getOrCreateCollection({
                name             : collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });
        }

        return this.knowledgeBaseCollection;
    }
}

export default Neo.setupClass(ChromaManager);
