import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';

/**
 * Service for creating embedding vectors for text.
 * @class AI.mcp.server.memory-core.services.TextEmbeddingService
 * @extends Neo.core.Base
 * @singleton
 */
class TextEmbeddingService extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory-core.services.TextEmbeddingService'
         * @protected
         */
        className: 'AI.mcp.server.memory-core.services.TextEmbeddingService',
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            const error = new Error('The GEMINI_API_KEY environment variable must be set to use semantic search endpoints.');
            error.status = 503;
            error.code   = 'missing_gemini_api_key';
            throw error;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
    }

    /**
     * Creates an embedding vector for the provided text.
     * @param {String} text
     * @returns {Promise<number[]>}
     */
    async embedText(text) {
        const result = await this.embeddingModel.embedContent(text);
        return result.embedding.values;
    }
}

export default Neo.setupClass(TextEmbeddingService);
