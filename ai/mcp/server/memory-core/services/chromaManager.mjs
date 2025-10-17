import {ChromaClient} from 'chromadb';
import aiConfig       from '../../../../../buildScripts/ai/aiConfig.mjs';

/**
 * Simple manager around the Chroma client that lazily caches frequently used collections.
 */
class ChromaManager {
    constructor() {
        const {host, port} = aiConfig.memory;

        this.client             = new ChromaClient({host, port, ssl: false});
        this.memoryCollection   = null;
        this.summaryCollection  = null;
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
            memoryCollection  : memory.name,
            summaryCollection : summaries.name
        };
    }

    /**
     * @returns {Promise<import('chromadb').Collection>}
     */
    async getMemoryCollection() {
        if (!this.memoryCollection) {
            const {collectionName} = aiConfig.memory;

            this.memoryCollection = await this.client.getCollection({
                name            : collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });
        }

        return this.memoryCollection;
    }

    /**
     * @returns {Promise<import('chromadb').Collection>}
     */
    async getSummaryCollection() {
        if (!this.summaryCollection) {
            const {collectionName} = aiConfig.sessions;

            this.summaryCollection = await this.client.getOrCreateCollection({
                name            : collectionName,
                embeddingFunction: aiConfig.dummyEmbeddingFunction
            });
        }

        return this.summaryCollection;
    }
}

const chromaManager = new ChromaManager();

export default chromaManager;
