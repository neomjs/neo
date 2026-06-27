import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../../mcp/server/memory-core/config.mjs';
import Base                 from '../../../src/core/Base.mjs';
import logger               from '../../mcp/server/memory-core/logger.mjs';
import OllamaProvider       from '../../provider/Ollama.mjs';
import {
    withLmsEmbeddingInputSuffix
}                           from '../shared/vector/lmsEmbeddingInputSuffix.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../provider/createTimeoutError.mjs';
import {
    bytesToTokens,
    emitConsumerFriction
}                           from './helpers/consumerFrictionHelper.mjs';

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
 * @summary Fails loudly when a resolved embedding request timeout leaf is invalid.
 * @param {Number} value Resolved timeout value in milliseconds.
 * @param {String} label Config label for the error message.
 * @returns {Number}
 */
function assertPositiveTimeoutMs(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`TextEmbeddingService: ${label} must be a positive number, got ${value}`);
    }

    return value
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
        ollamaProvider_: null,
        /**
         * Optional test seam for LM Studio loaded-model context probes.
         * @member {Function|null} openAiCompatibleLoadedModelsProbe=null
         * @protected
         */
        openAiCompatibleLoadedModelsProbe: null
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
     * @summary Reads currently resident LM Studio models for embedding-context enforcement.
     *
     * Runtime uses the canonical readiness helper. The optional plain test seam avoids spawning
     * the LM Studio CLI from unit tests while preserving the same normalized model shape.
     *
     * @param {Number} timeoutMs LM Studio CLI timeout.
     * @returns {Promise<Object[]>}
     * @private
     */
    async #getOpenAiCompatibleLoadedModels(timeoutMs) {
        if (this.openAiCompatibleLoadedModelsProbe) {
            return this.openAiCompatibleLoadedModelsProbe({timeoutMs});
        }

        const {fetchLmsLoadedModels} = await import('../graph/providerReadinessHelper.mjs');
        return fetchLmsLoadedModels({timeoutMs});
    }

    /**
     * @summary Estimates the largest text input in an OpenAI-compatible embedding request.
     *
     * LM Studio truncates each input string independently. Batch safety therefore uses the
     * largest member, not the aggregate byte length of the whole batch envelope.
     *
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @returns {{inputBytes: Number, inputTokensEstimate: Number}}
     * @private
     */
    #getOpenAiCompatibleInputEstimate(inputData) {
        return this.#getEmbeddingInputEstimate(inputData);
    }

    /**
     * @summary Estimates the largest text input in an embedding request.
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @returns {{inputBytes: Number, inputTokensEstimate: Number}}
     * @private
     */
    #getEmbeddingInputEstimate(inputData) {
        const texts = Array.isArray(inputData) ? inputData : [inputData];

        let inputBytes = 0;

        for (const text of texts) {
            inputBytes = Math.max(inputBytes, Buffer.byteLength(typeof text === 'string' ? text : '', 'utf8'));
        }

        return {
            inputBytes,
            inputTokensEstimate: bytesToTokens(inputBytes)
        };
    }

    /**
     * @summary Determines whether the active OpenAI-compatible endpoint is the orchestrator-owned LM Studio lane.
     *
     * OpenAI-compatible covers LM Studio, Ollama's compatibility surface, llama.cpp, vLLM, and
     * CI fixture servers. The `lms ps` loaded-context probe is valid only for the LM Studio CLI
     * lane, identified by the configured `orchestrator.lms.port` owning the provider host.
     *
     * @returns {Boolean}
     * @private
     */
    #shouldAssertOpenAiCompatibleEmbeddingContext() {
        if (this.openAiCompatibleLoadedModelsProbe) {
            return true;
        }
        if (Neo.config.unitTestMode) {
            return false;
        }
        if (aiConfig.orchestrator.lms.enabled !== true) {
            return false;
        }

        const
            host    = aiConfig.openAiCompatible.host,
            lmsPort = aiConfig.orchestrator.lms.port;

        let endpointUrl;

        try {
            endpointUrl = new URL(host);
        } catch (error) {
            throw new TypeError(`TextEmbeddingService: openAiCompatible.host must be a valid URL for embedding context enforcement, got '${host}': ${error.message}`);
        }

        return endpointUrl.port === lmsPort;
    }

    /**
     * @summary Reads and validates the active LM Studio embedding model metadata.
     *
     * LM Studio can answer `/v1/embeddings` while the embedding model is resident at a smaller
     * loaded context than Neo's `localModels.embedding.contextLimitTokens` leaf. Fetching the
     * resident row also exposes LMS model metadata used for request-boundary token handling.
     *
     * @returns {Promise<{configuredContextLength: Number, loadedModel: Object, model: String}|null>}
     * @private
     */
    async #getOpenAiCompatibleEmbeddingRuntime() {
        if (!this.#shouldAssertOpenAiCompatibleEmbeddingContext()) {
            return null;
        }

        const
            configuredContextLength = aiConfig.localModels.embedding.contextLimitTokens,
            timeoutMs               = aiConfig.orchestrator.providerReadiness.timeoutMs,
            model                   = aiConfig.openAiCompatible.embeddingModel;

        if (!Neo.isNumber(configuredContextLength) || configuredContextLength <= 0) {
            throw new TypeError(`TextEmbeddingService: localModels.embedding.contextLimitTokens must be a positive number, got ${configuredContextLength}`);
        }
        if (!Neo.isNumber(timeoutMs) || timeoutMs <= 0) {
            throw new TypeError(`TextEmbeddingService: orchestrator.providerReadiness.timeoutMs must be a positive number, got ${timeoutMs}`);
        }
        if (!model) {
            throw new TypeError('TextEmbeddingService: openAiCompatible.embeddingModel is required for embedding context enforcement');
        }

        let loadedModels;

        try {
            loadedModels = await this.#getOpenAiCompatibleLoadedModels(timeoutMs);
        } catch (error) {
            throw new Error(`TextEmbeddingService: unable to verify LM Studio embedding context for '${model}': ${error.message}`);
        }

        const loadedModel = loadedModels.find(item => item.id === model);

        if (!loadedModel) {
            const observedIds = loadedModels.map(item => item.id).filter(Boolean).slice(0, 5).join(', ') || 'none';
            throw new Error(`TextEmbeddingService: LM Studio embedding model '${model}' is not resident under its configured identifier; observed=${observedIds}`);
        }
        if (!Neo.isNumber(loadedModel.contextLength)) {
            throw new Error(`TextEmbeddingService: LM Studio embedding model '${model}' has unknown loaded context; configured>=${configuredContextLength}`);
        }

        return {configuredContextLength, loadedModel, model};
    }

    /**
     * @summary Fails before OpenAI-compatible embeddings can be silently provider-truncated.
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @param {{configuredContextLength: Number, loadedModel: Object, model: String}|null} runtime LMS runtime metadata.
     * @returns {void}
     * @private
     */
    #assertOpenAiCompatibleEmbeddingContext(inputData, runtime) {
        if (!runtime) {
            return;
        }

        const
            {configuredContextLength, loadedModel, model} = runtime,
            estimate                                      = this.#getOpenAiCompatibleInputEstimate(inputData);

        if (loadedModel.contextLength < configuredContextLength || estimate.inputTokensEstimate > loadedModel.contextLength) {
            if (estimate.inputTokensEstimate > loadedModel.contextLength) {
                emitConsumerFriction({
                    assetRef                 : `openAiCompatible:${model}`,
                    consumer                 : 'TextEmbeddingService.openAiCompatible',
                    model,
                    symptom                  : 'context-overflow',
                    emissionPoint            : 'pre-invocation',
                    suggestionKind           : 'split-document',
                    inputBytes               : estimate.inputBytes,
                    inputTokensEstimate      : estimate.inputTokensEstimate,
                    contextLimitTokens       : configuredContextLength,
                    safeProcessingLimitTokens: loadedModel.contextLength,
                    serviceDomain            : 'memory-core',
                    note                     : 'OpenAI-compatible embedding request would exceed the observed loaded LM Studio embedding context.'
                });
            }

            logger.warn('[TextEmbeddingService] Refusing OpenAI-compatible embedding before provider-side truncation.', {
                model,
                loadedContextLength: loadedModel.contextLength,
                configuredContextLength,
                inputTokensEstimate: estimate.inputTokensEstimate
            });

            throw new Error(`TextEmbeddingService: LM Studio embedding context too small for '${model}' (loaded=${loadedModel.contextLength}, configured>=${configuredContextLength}, inputEstimate=${estimate.inputTokensEstimate})`);
        }
    }

    /**
     * @summary Prepares OpenAI-compatible embedding input at the provider request boundary.
     * @param {String|String[]} inputData The caller's original text input.
     * @returns {Promise<String|String[]>}
     * @private
     */
    async #prepareOpenAiCompatibleEmbeddingInput(inputData) {
        const
            runtime          = await this.#getOpenAiCompatibleEmbeddingRuntime(),
            requestInputData = runtime ? withLmsEmbeddingInputSuffix(inputData, runtime.loadedModel, {log: logger}) : inputData;

        this.#assertOpenAiCompatibleEmbeddingContext(requestInputData, runtime);

        return requestInputData;
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
                        // Append the resolved endpoint + model so a wrong host:port (the :11434 Ollama
                        // default vs :1234 LM Studio) or a non-resident model is diagnosable from the error
                        // alone — not a bare "resource could not be found". The `HTTP <status>:` prefix MUST
                        // stay verbatim: OPENAI_COMPATIBLE_CONTENTION_HTTP_ERROR_RE classifies on it.
                        rejectFunc(new Error(`openAiCompatible embedding error HTTP ${res.statusCode}: ${body} [endpoint=${parsedUrl.href}, model='${embeddingModel}']`));
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
            if (isOpenAiCompatibleContentionTimeoutError(err)) {
                this.#emitOpenAiCompatibleTimeoutFriction(inputData, requestTimeoutMs, err);
            }
            logger.error(`[TextEmbeddingService] Failed to generate embedding from openAiCompatible:`, err.message);
            throw err;
        }
    }

    /**
     * @summary Emits a structured ConsumerFriction timeout signal for bounded embedding requests.
     * @param {String|String[]} inputData Text input that timed out.
     * @param {Number} requestTimeoutMs Request timeout in milliseconds.
     * @param {Error} err Timeout error.
     * @returns {void}
     * @private
     */
    #emitOpenAiCompatibleTimeoutFriction(inputData, requestTimeoutMs, err) {
        const
            {embeddingModel} = aiConfig.openAiCompatible,
            estimate         = this.#getOpenAiCompatibleInputEstimate(inputData);

        try {
            emitConsumerFriction({
                assetRef                 : `openAiCompatible:${embeddingModel}`,
                consumer                 : 'TextEmbeddingService.openAiCompatible',
                model                    : embeddingModel,
                symptom                  : 'timeout',
                emissionPoint            : 'post-invocation-failure',
                suggestionKind           : 'unknown',
                inputBytes               : estimate.inputBytes,
                inputTokensEstimate      : estimate.inputTokensEstimate,
                contextLimitTokens       : aiConfig.localModels.embedding.contextLimitTokens,
                safeProcessingLimitTokens: aiConfig.localModels.embedding.safeProcessingLimitTokens,
                serviceDomain            : 'memory-core',
                note                     : `OpenAI-compatible embedding request timed out after ${describeOpenAiCompatibleTimeout(requestTimeoutMs)}: ${String(err?.message || err).substring(0, 160)}`
            });
        } catch (frictionError) {
            logger.warn('[TextEmbeddingService] Failed to emit embedding timeout friction.', frictionError.message);
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

        const config   = aiConfig.ollama;
        const provider = Neo.create(OllamaProvider, {
            host          : config.host,
            modelName     : config.model,
            embeddingModel: config.embeddingModel
        });
        this.ollamaProvider = provider;
        return provider;
    }

    /**
     * @summary Reads the native Ollama embedding request timeout from AiConfig.
     * @returns {Number}
     * @private
     */
    #getOllamaEmbeddingTimeoutMs() {
        const timeoutMs = aiConfig.ollama.embeddingTimeoutMs;

        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new TypeError(`TextEmbeddingService: ollama.embeddingTimeoutMs must be a positive number, got ${timeoutMs}`);
        }

        return timeoutMs;
    }

    /**
     * @summary Emits a structured ConsumerFriction timeout signal for native Ollama embeddings.
     * @param {String|String[]} inputData Text input that timed out.
     * @param {Number} requestTimeoutMs Request timeout in milliseconds.
     * @param {Error} err Timeout error.
     * @returns {void}
     * @private
     */
    #emitOllamaEmbeddingTimeoutFriction(inputData, requestTimeoutMs, err) {
        const
            model    = aiConfig.ollama.embeddingModel || aiConfig.ollama.model,
            estimate = this.#getEmbeddingInputEstimate(inputData);

        try {
            emitConsumerFriction({
                assetRef                 : `ollama:${model}`,
                consumer                 : 'TextEmbeddingService.ollama',
                model,
                symptom                  : 'timeout',
                emissionPoint            : 'post-invocation-failure',
                suggestionKind           : 'unknown',
                inputBytes               : estimate.inputBytes,
                inputTokensEstimate      : estimate.inputTokensEstimate,
                contextLimitTokens       : aiConfig.localModels.embedding.contextLimitTokens,
                safeProcessingLimitTokens: aiConfig.localModels.embedding.safeProcessingLimitTokens,
                serviceDomain            : 'memory-core',
                note                     : `Native Ollama embedding request timed out after ${requestTimeoutMs}ms: ${String(err?.message || err).substring(0, 160)}`
            });
        } catch (frictionError) {
            logger.warn('[TextEmbeddingService] Failed to emit native Ollama embedding timeout friction.', frictionError.message);
        }
    }

    /**
     * @summary Runs the native Ollama embedding call with request-shape and timeout parity.
     * @param {String|String[]} inputData Text input to embed.
     * @param {String} operationLabel Safe diagnostic label for timeout errors.
     * @returns {Promise<Object>}
     * @private
     */
    async #embedOllama(inputData, operationLabel) {
        const
            provider         = this.#getOllamaProvider(),
            requestTimeoutMs = this.#getOllamaEmbeddingTimeoutMs();

        try {
            return await provider.embed(inputData, {
                num_ctx : aiConfig.localModels.embedding.contextLimitTokens,
                operationLabel,
                timeoutMs: requestTimeoutMs,
                truncate: false
            });
        } catch (err) {
            if (err?.code === PROVIDER_TIMEOUT_CODE) {
                this.#emitOllamaEmbeddingTimeoutFriction(inputData, requestTimeoutMs, err);
            }

            throw err;
        }
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
            batchEmbeddingTimeoutMs = DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS,
            batchEmbeddingYieldMs   = 0
        } = aiConfig.openAiCompatible;
        const chunkSize        = Math.max(1, Math.floor(batchEmbeddingChunkSize || texts.length)),
              requestTimeoutMs = assertPositiveTimeoutMs(batchEmbeddingTimeoutMs, 'openAiCompatible.batchEmbeddingTimeoutMs'),
              data             = [];

        for (let offset = 0; offset < texts.length; offset += chunkSize) {
            const chunk  = texts.slice(offset, offset + chunkSize),
                  result = await this.#enqueueOpenAiCompatiblePost(chunk, {
                      unloadRetriesLeft: unloadRetryCount,
                      requestTimeoutMs
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
            const requestText = await this.#prepareOpenAiCompatibleEmbeddingInput(text);
            const result      = await this.#enqueueOpenAiCompatiblePost(requestText, {
                unloadRetriesLeft    : unloadRetryCount,
                contentionRetriesLeft: contentionRetryCount,
                requestTimeoutMs     : contentionTimeoutMs
            }, 'interactive');
            return result.data?.[0]?.embedding;
        } else if (explicitProvider === 'ollama') {
            // Native Ollama returns `{embeddings: [[...]]}` even for single-input;
            // project the single inner array since this method is the per-text variant.
            const result = await this.#embedOllama(text, 'TextEmbeddingService.embedText native Ollama embedding');
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
            const requestTexts = await this.#prepareOpenAiCompatibleEmbeddingInput(texts);
            return this.#embedOpenAiCompatibleBatch(requestTexts);
        } else if (explicitProvider === 'ollama') {
            // Ollama's `/api/embed` accepts array-of-strings natively + returns
            // a parallel embeddings array — no per-text fan-out needed.
            const result = await this.#embedOllama(texts, 'TextEmbeddingService.embedTexts native Ollama embedding');
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
            const result   = await this.embeddingModel.batchEmbedContents({ requests });
            return result.embeddings.map(e => e.values);
        } else {
            // Unknown provider names fail loudly (matches `embedText`).
            throw new Error(`TextEmbeddingService: unsupported embedding provider '${explicitProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
        }
    }
}

export default Neo.setupClass(TextEmbeddingService);
