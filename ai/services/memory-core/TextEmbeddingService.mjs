import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../../mcp/server/memory-core/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import logger               from '../../mcp/server/memory-core/logger.mjs';
import OllamaProvider       from '../../provider/Ollama.mjs';

const DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
const OPENAI_COMPATIBLE_CONTENTION_HTTP_ERROR_RE   = /openAiCompatible embedding error HTTP (408|429|503|504):/;

/**
 * Determines whether TextEmbeddingService needs a Gemini embedding client for the active provider.
 * Kept pure so config-consolidation tests can pin the single-provider gate without
 * constructing the singleton or requiring a live `GEMINI_API_KEY`.
 * @param {Object} cfg aiConfig-shaped input.
 * @returns {Boolean}
 */
export function shouldInitializeGeminiEmbeddingClient(cfg = aiConfig) {
    return cfg.embeddingProvider === 'gemini';
}

/**
 * @summary Detects OpenAI-compatible embedding failures that indicate request contention or timeout.
 *
 * The existing unload retry handles LM Studio JIT-unload cases. This helper isolates the distinct
 * busy/queued request class so interactive single embeddings can retry without treating ordinary
 * model-load or malformed-request failures as contention.
 *
 * @param {Error} error The request error to classify.
 * @returns {Boolean}
 */
export function isOpenAiCompatibleContentionTimeoutError(error) {
    const message = error?.message || '',
          code    = error?.code    || '';

    return code === 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT' ||
        code === 'ETIMEDOUT' ||
        code === 'ESOCKETTIMEDOUT' ||
        OPENAI_COMPATIBLE_CONTENTION_HTTP_ERROR_RE.test(message);
}

/**
 * @summary Formats the timeout value used in OpenAI-compatible embedding timeout errors.
 * @param {Number} requestTimeoutMs The timeout in milliseconds.
 * @returns {String}
 */
function describeOpenAiCompatibleTimeout(requestTimeoutMs) {
    return requestTimeoutMs === DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS ? '1 hour' : `${requestTimeoutMs}ms`;
}

/**
 * @summary Waits before the next OpenAI-compatible batch chunk.
 *
 * Even a zero-millisecond timeout yields the event loop, letting already-arrived interactive
 * single-embedding calls send their provider request before the next batch sub-request.
 *
 * @param {Number} delayMs Delay in milliseconds.
 * @returns {Promise<void>}
 */
function waitForOpenAiCompatibleBatchYield(delayMs) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs || 0)));
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
        embeddingModel_: null,
        /**
         * Lazy-instantiated `Neo.ai.provider.Ollama` instance used by the native
         * Ollama embedding-dispatch path. Created on first `embedText`/`embedTexts`
         * call with `explicitProvider === 'ollama'`. Tests inject a fake by setting
         * this directly via the singleton, bypassing the lazy-init path.
         * @member {Object|null} ollamaProvider_=null
         * @protected
         * @reactive
         */
        ollamaProvider_: null
    }

    #openAiCompatiblePostQueue       = [];
    #openAiCompatiblePostQueueActive = false;

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
     * @summary Queues OpenAI-compatible embedding posts behind an interactive-first scheduler.
     *
     * Local OpenAI-compatible embedding servers frequently serialize model requests. This queue
     * keeps TextEmbeddingService from creating competing local-provider concurrency while allowing
     * latency-sensitive single embeddings to run before subsequent KB-sync batch chunks.
     *
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @param {Object} options The `#postOpenAiCompatible` retry/timeout options.
     * @param {'interactive'|'batch'} priority The request lane priority.
     * @returns {Promise<Object>}
     * @private
     */
    #enqueueOpenAiCompatiblePost(inputData, options, priority) {
        return new Promise((resolve, reject) => {
            this.#openAiCompatiblePostQueue.push({
                inputData,
                options,
                priority,
                reject,
                resolve
            });

            this.#drainOpenAiCompatiblePostQueue();
        });
    }

    /**
     * @summary Runs queued OpenAI-compatible posts one at a time, preferring interactive work.
     * @returns {Promise<void>}
     * @private
     */
    async #drainOpenAiCompatiblePostQueue() {
        if (this.#openAiCompatiblePostQueueActive) return;

        this.#openAiCompatiblePostQueueActive = true;

        try {
            while (this.#openAiCompatiblePostQueue.length > 0) {
                const taskIndex = this.#getNextOpenAiCompatiblePostQueueIndex(),
                      task      = this.#openAiCompatiblePostQueue.splice(taskIndex, 1)[0];

                try {
                    task.resolve(await this.#postOpenAiCompatible(task.inputData, task.options));
                } catch (err) {
                    task.reject(err);
                }
            }
        } finally {
            this.#openAiCompatiblePostQueueActive = false;
        }
    }

    /**
     * @summary Selects the next OpenAI-compatible queue item, FIFO within each priority lane.
     * @returns {Number}
     * @private
     */
    #getNextOpenAiCompatiblePostQueueIndex() {
        let bestIndex = 0;

        for (let i = 1; i < this.#openAiCompatiblePostQueue.length; i++) {
            const best = this.#openAiCompatiblePostQueue[bestIndex],
                  item = this.#openAiCompatiblePostQueue[i];

            if (best.priority === 'batch' && item.priority === 'interactive') {
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    /**
     * @summary Executes OpenAI-compatible /v1/embeddings POST requests with bounded retry semantics.
     *
     * Retries unloaded-model failures for both single and batch embeddings. Single interactive
     * embeddings can additionally opt into a shorter contention timeout + retry budget, preventing
     * `add_memory` from waiting behind a serialized batch until the MCP client times out.
     * The same endpoint shape is used by LM Studio desktop, `lms server start`, MLX, llama.cpp,
     * and other local OpenAI-format embedding servers.
     *
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @param {Object} options
     * @param {Number} options.unloadRetriesLeft Number of unload retries remaining.
     * @param {Number} [options.contentionRetriesLeft=0] Number of contention-timeout retries remaining.
     * @param {Number} [options.requestTimeoutMs=3600000] Request timeout in milliseconds.
     * @returns {Promise<Object>}
     * @private
     */
    async #postOpenAiCompatible(inputData, options) {
        const {
            unloadRetriesLeft,
            contentionRetriesLeft = 0,
            requestTimeoutMs      = DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS
        } = options;
        const {
            host,
            embeddingModel,
            apiKey,
            unloadRetryDelayMs    = 500,
            contentionRetryDelayMs = 1000
        } = aiConfig.openAiCompatible;

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
                timeout: requestTimeoutMs
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
                const err = new Error(`openAiCompatible request timed out after ${describeOpenAiCompatibleTimeout(requestTimeoutMs)}`);
                err.code = 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT';
                req.destroy();
                rejectFunc(err);
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

            if (unloadRetriesLeft > 0 && isModelLoadError) {
                logger.log(`[TextEmbeddingService] embedding-provider model-load failure detected (Shape ${err.message.includes('Model was unloaded') ? 'A' : 'B'}), retrying (remaining retries: ${unloadRetriesLeft})`);
                await new Promise(r => setTimeout(r, unloadRetryDelayMs));
                return this.#postOpenAiCompatible(inputData, {
                    unloadRetriesLeft: unloadRetriesLeft - 1,
                    contentionRetriesLeft,
                    requestTimeoutMs
                });
            }

            if (contentionRetriesLeft > 0 && isOpenAiCompatibleContentionTimeoutError(err)) {
                logger.log(`[TextEmbeddingService] embedding-provider contention timeout detected, retrying (remaining contention retries: ${contentionRetriesLeft})`);
                await new Promise(r => setTimeout(r, contentionRetryDelayMs));
                return this.#postOpenAiCompatible(inputData, {
                    unloadRetriesLeft,
                    contentionRetriesLeft: contentionRetriesLeft - 1,
                    requestTimeoutMs
                });
            }
            logger.error(`[TextEmbeddingService] Failed to generate embedding from openAiCompatible:`, err.message);
            throw err;
        }
    }

    /**
     * @summary Lazy-instantiates or returns the cached native Ollama provider client.
     *
     * Reads host + embeddingModel from `aiConfig.ollama`. Caches the instance on the
     * singleton's reactive `ollamaProvider_` slot. Test seam: tests can set
     * `TextEmbeddingService.ollamaProvider` directly with a fake to bypass real-host
     * instantiation.
     *
     * @returns {OllamaProvider}
     * @protected
     */
    #getOllamaProvider() {
        if (this.ollamaProvider) return this.ollamaProvider;

        const config = aiConfig.ollama;
        const provider = Neo.create(OllamaProvider, {
            host          : config.host,
            modelName     : config.model,
            embeddingModel: config.embeddingModel
        });
        this.ollamaProvider = provider;
        return provider;
    }

    /**
     * @summary Embeds a text array through OpenAI-compatible chunked batch requests.
     *
     * Local OpenAI-compatible embedding servers often serialize model requests. Sending the whole
     * KB-sync batch as one provider call can monopolize that server for minutes. Chunking keeps
     * batch ingestion moving while yielding between chunks so interactive single embeddings can
     * enter the provider queue before the next batch chunk.
     *
     * @param {String[]} texts The texts to embed.
     * @returns {Promise<number[][]>}
     * @private
     */
    async #embedOpenAiCompatibleBatch(texts) {
        const {
            unloadRetryCount        = 3,
            batchEmbeddingChunkSize = 5,
            batchEmbeddingYieldMs   = 0
        } = aiConfig.openAiCompatible;
        const chunkSize = Math.max(1, Math.floor(batchEmbeddingChunkSize || texts.length)),
              data      = [];

        for (let offset = 0; offset < texts.length; offset += chunkSize) {
            const chunk = texts.slice(offset, offset + chunkSize),
                  result = await this.#enqueueOpenAiCompatiblePost(chunk, {
                      unloadRetriesLeft: unloadRetryCount
                  }, 'batch');

            data.push(...(result.data || []).map(item => ({
                ...item,
                index: offset + item.index
            })));

            if (offset + chunkSize < texts.length) {
                await waitForOpenAiCompatibleBatchYield(batchEmbeddingYieldMs);
            }
        }

        return data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    }

    /**
     * @summary Creates one embedding vector for interactive write/query paths.
     *
     * The OpenAI-compatible branch uses the contention retry budget because single embeddings are
     * latency-sensitive (`add_memory`, query, frontier) and must fail/retry inside the service before
     * the MCP request envelope times out.
     *
     * @param {String} text The text to embed.
     * @param {String} explicitProvider The embedding provider to use.
     * @returns {Promise<number[]>}
     */
    async embedText(text, explicitProvider) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedText requires an explicit provider argument');

        if (explicitProvider === 'openAiCompatible') {
            const {
                unloadRetryCount          = 3,
                contentionRetryCount      = 2,
                contentionTimeoutMs       = 15000
            } = aiConfig.openAiCompatible;
            const result = await this.#enqueueOpenAiCompatiblePost(text, {
                unloadRetriesLeft    : unloadRetryCount,
                contentionRetriesLeft: contentionRetryCount,
                requestTimeoutMs     : contentionTimeoutMs
            }, 'interactive');
            return result.data?.[0]?.embedding;
        } else if (explicitProvider === 'ollama') {
            // Native Ollama returns `{embeddings: [[...]]}` even for single-input;
            // project the single inner array since this method is the per-text variant.
            const provider = this.#getOllamaProvider();
            const result   = await provider.embed(text);
            return result.embeddings?.[0];
        } else if (explicitProvider === 'gemini') {
            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                 throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
            }
            if (!this.embeddingModel) {
                 throw new Error('Google Generative AI Client not initialized properly.');
            }
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        } else {
            // Unknown provider names fail loudly rather than silently fall back to
            // the Gemini path — silent fallback is speculative-support.
            throw new Error(`TextEmbeddingService: unsupported embedding provider '${explicitProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
        }
    }

    /**
     * @summary Creates embedding vectors for batch ingestion paths.
     *
     * The OpenAI-compatible branch preserves the long request timeout and only applies unload retry,
     * so legitimate KB-sync batches are not cut short by the interactive contention timeout.
     *
     * @param {String[]} texts The texts to embed.
     * @param {String} explicitProvider The embedding provider to use.
     * @returns {Promise<number[][]>}
     */
    async embedTexts(texts, explicitProvider) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedTexts requires an explicit provider argument');

        if (explicitProvider === 'openAiCompatible') {
            return this.#embedOpenAiCompatibleBatch(texts);
        } else if (explicitProvider === 'ollama') {
            // Ollama's `/api/embed` accepts array-of-strings natively + returns
            // a parallel embeddings array — no per-text fan-out needed.
            const provider = this.#getOllamaProvider();
            const result   = await provider.embed(texts);
            return result.embeddings || [];
        } else if (explicitProvider === 'gemini') {
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
        } else {
            // Unknown provider names fail loudly (matches `embedText`).
            throw new Error(`TextEmbeddingService: unsupported embedding provider '${explicitProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
        }
    }
}

export default Neo.setupClass(TextEmbeddingService);
