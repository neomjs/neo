import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../../../../../buildScripts/ai/aiConfig.mjs';

let embeddingModel = null;

function getEmbeddingModel() {
    if (embeddingModel) {
        return embeddingModel;
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        const error = new Error('The GEMINI_API_KEY environment variable must be set to use semantic search endpoints.');
        error.status = 503;
        error.code   = 'missing_gemini_api_key';
        throw error;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    embeddingModel = genAI.getGenerativeModel({model: aiConfig.knowledgeBase.embeddingModel});

    return embeddingModel;
}

/**
 * Creates an embedding vector for the provided text.
 * @param {String} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
    const model    = getEmbeddingModel();
    const result   = await model.embedContent(text);

    return result.embedding.values;
}
