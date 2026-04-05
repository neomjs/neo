import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import logger               from '../logger.mjs';

/**
 * @summary Service for creating embedding vectors for text.
 *
 * This wrapper service interfaces with the Google Generative AI API (Gemini) to generate vector embeddings
 * for text inputs. These embeddings are essential for the semantic search capabilities of the memory
 * and summary collections.
 *
 * @class Neo.ai.mcp.server.memory-core.services.TextEmbeddingService
 * @extends Neo.core.Base
 * @singleton
 */
class TextEmbeddingService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.TextEmbeddingService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.TextEmbeddingService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {GoogleGenerativeAI|null} embeddingModel_=null
         * @protected
         * @reactive
         */
        embeddingModel_: null
    }

    /**
     * @param {Object} config The configuration object.
     */
    construct(config) {
        super.construct(config);

        if (aiConfig.embeddingProvider === 'gemini' || aiConfig.chromaEmbeddingProvider === 'gemini' || aiConfig.neoEmbeddingProvider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                logger.warn('⚠️  [TextEmbeddingService] GEMINI_API_KEY not set. Semantic search features with Gemini will be unavailable.');
            } else {
                const genAI = new GoogleGenerativeAI(apiKey);
                this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
            }
        }
    }

    /**
     * Creates an embedding vector for the provided text.
     * @param {String} text The text to embed.
     * @param {String} [explicitProvider=null] The embedding provider to use, bypassing config.
     * @returns {Promise<number[]>}
     */
    async embedText(text, explicitProvider = null) {
        const provider = explicitProvider || aiConfig.embeddingProvider;

        if (provider === 'ollama') {
            const { host, embeddingModel } = aiConfig.ollama;
            try {
                const response = await fetch(`${host}/api/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: embeddingModel, prompt: text })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Ollama embedding error HTTP ${response.status}: ${errText}`);
                }

                const result = await response.json();
                return result.embedding;
            } catch (err) {
                logger.error(`[TextEmbeddingService] Failed to generate embedding from Ollama:`, err.message);
                throw err;
            }
        } else {
            if (!process.env.GEMINI_API_KEY) {
                 throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
            }
            if (!this.embeddingModel) {
                 throw new Error('Google Generative AI Client not initialized properly.');
            }
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        }
    }
}

export default Neo.setupClass(TextEmbeddingService);
