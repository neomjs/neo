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

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            logger.warn('⚠️  [TextEmbeddingService] GEMINI_API_KEY not set. Semantic search features will be unavailable.');
            return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
    }

    /**
     * Creates an embedding vector for the provided text.
     * @param {String} text The text to embed.
     * @returns {Promise<number[]>}
     */
    async embedText(text) {
        if (!process.env.GEMINI_API_KEY) {
             throw  new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
        }

        const result = await this.embeddingModel.embedContent(text);
        return result.embedding.values;
    }
}

export default Neo.setupClass(TextEmbeddingService);
