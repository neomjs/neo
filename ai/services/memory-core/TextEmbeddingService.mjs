import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../../mcp/server/memory-core/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import logger               from '../../mcp/server/memory-core/logger.mjs';

/**
 * Determines whether TextEmbeddingService needs a Gemini embedding client for the active provider.
 * Kept pure so #10804 config-consolidation tests can pin the single-provider gate without
 * constructing the singleton or requiring a live `GEMINI_API_KEY`.
 * @param {Object} cfg aiConfig-shaped input.
 * @returns {Boolean}
 */
export function shouldInitializeGeminiEmbeddingClient(cfg = aiConfig) {
    return cfg.embeddingProvider === 'gemini';
}

/**
 * @summary Service for creating embedding vectors for text.
 *
 * This wrapper service interfaces with the Google Generative AI API (Gemini) to generate vector embeddings
 * for text inputs. These embeddings are essential for the semantic search capabilities of the memory
 * and summary collections.
 *
 * @class Neo.ai.services.memory-core.TextEmbeddingService
 * @extends Neo.core.Base
 * @singleton
 */
class TextEmbeddingService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.TextEmbeddingService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.TextEmbeddingService',
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

        if (shouldInitializeGeminiEmbeddingClient()) {
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
     * Executes OpenAI-compatible /v1/embeddings POST requests with retry semantics for unloaded models.
     * The same endpoint shape is used by LM Studio desktop, `lms server start`, MLX, llama.cpp,
     * and other local OpenAI-format embedding servers.
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @param {Number} retriesLeft Number of retries remaining.
     * @returns {Promise<Object>}
     * @private
     */
    async #postOpenAiCompatible(inputData, retriesLeft) {
        const { host, embeddingModel, apiKey, unloadRetryCount = 3, unloadRetryDelayMs = 500 } = aiConfig.openAiCompatible;

        try {
            const parsedUrl = new URL(`${host}/v1/embeddings`);
            const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

            let resolveFunc, rejectFunc;
            const responsePromise = new Promise((res, rej) => {
                resolveFunc = res;
                rejectFunc = rej;
            });

            const reqHeaders = { 'Content-Type': 'application/json' };
            if (apiKey) {
                reqHeaders.Authorization = `Bearer ${apiKey}`;
            }

            const req = httpModule.request(parsedUrl, {
                method : 'POST',
                headers: reqHeaders,
                timeout: 60 * 60 * 1000 // 1 hour timeout natively
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        rejectFunc(new Error(`openAiCompatible embedding error HTTP ${res.statusCode}: ${body}`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveFunc(result);
                        } catch (e) {
                            rejectFunc(new Error(`Failed to parse openAiCompatible response: ${e.message}`));
                        }
                    }
                });
            });

            req.on('error', (err) => rejectFunc(err));
            req.on('timeout', () => {
                req.destroy();
                rejectFunc(new Error('openAiCompatible request timed out after 1 hour'));
            });

            req.write(JSON.stringify({ model: embeddingModel, input: inputData }));
            req.end();

            return await responsePromise;
        } catch (err) {
            const isModelLoadError = err.message.includes('HTTP 400') && (
                err.message.includes('Model was unloaded') ||              // Shape A — JIT-unload-then-queued-request
                (err.message.includes('Failed to load model') &&            // Shape B — JIT-warm-load-canceled
                 err.message.includes('Operation canceled'))
            );

            if (retriesLeft > 0 && isModelLoadError) {
                logger.log(`[TextEmbeddingService] embedding-provider model-load failure detected (Shape ${err.message.includes('Model was unloaded') ? 'A' : 'B'}), retrying (remaining retries: ${retriesLeft})`);
                await new Promise(r => setTimeout(r, unloadRetryDelayMs));
                return this.#postOpenAiCompatible(inputData, retriesLeft - 1);
            }
            logger.error(`[TextEmbeddingService] Failed to generate embedding from openAiCompatible:`, err.message);
            throw err;
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

        if (explicitProvider === 'openAiCompatible') {
            const { unloadRetryCount = 3 } = aiConfig.openAiCompatible;
            const result = await this.#postOpenAiCompatible(text, unloadRetryCount);
            return result.data?.[0]?.embedding;
        } else {
            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                 throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
            }
            if (!this.embeddingModel) {
                 throw new Error('Google Generative AI Client not initialized properly.');
            }
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        }
    }

    /**
     * Creates embedding vectors for an array of texts.
     * @param {String[]} texts The texts to embed.
     * @param {String} explicitProvider The embedding provider to use.
     * @returns {Promise<number[][]>}
     */
    async embedTexts(texts, explicitProvider) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedTexts requires an explicit provider argument');

        if (explicitProvider === 'openAiCompatible') {
            const { unloadRetryCount = 3 } = aiConfig.openAiCompatible;
            const result = await this.#postOpenAiCompatible(texts, unloadRetryCount);
            return result.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
        } else {
            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                 throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
            }
            if (!this.embeddingModel) {
                 throw new Error('Google Generative AI Client not initialized properly.');
            }

            const requests = texts.map(text => ({model: aiConfig.embeddingModel, content: {parts: [{text}]}}));
            const result = await this.embeddingModel.batchEmbedContents({ requests });
            return result.embeddings.map(e => e.values);
        }
    }
}

export default Neo.setupClass(TextEmbeddingService);
