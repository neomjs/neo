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

        if (aiConfig.chromaEmbeddingProvider === 'gemini' || aiConfig.neoEmbeddingProvider === 'gemini') {
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
     * @param {String} explicitProvider The embedding provider to use.
     * @returns {Promise<number[]>}
     */
    async embedText(text, explicitProvider) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedText requires an explicit provider argument');

        if (explicitProvider === 'ollama') {
            const { host, embeddingModel } = aiConfig.ollama;
            try {
                const parsedUrl = new URL(`${host}/api/embeddings`);
                const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

                let resolveFunc, rejectFunc;
                const responsePromise = new Promise((res, rej) => {
                    resolveFunc = res;
                    rejectFunc = rej;
                });

                const req = httpModule.request(parsedUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60 * 60 * 1000 // 1 hour timeout natively
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode < 200 || res.statusCode >= 300) {
                            rejectFunc(new Error(`Ollama embedding error HTTP ${res.statusCode}: ${body}`));
                        } else {
                            try {
                                const result = JSON.parse(body);
                                resolveFunc(result);
                            } catch (e) {
                                rejectFunc(new Error(`Failed to parse Ollama response: ${e.message}`));
                            }
                        }
                    });
                });

                req.on('error', (err) => rejectFunc(err));
                req.on('timeout', () => {
                    req.destroy();
                    rejectFunc(new Error('Ollama request timed out after 1 hour'));
                });

                req.write(JSON.stringify({ model: embeddingModel, prompt: text }));
                req.end();

                const result = await responsePromise;
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
