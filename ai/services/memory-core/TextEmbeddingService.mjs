import {
    GoogleGenerativeAI,
    GoogleGenerativeAIAbortError
}                           from '@google/generative-ai';
import aiConfig       from '../../mcp/server/memory-core/config.mjs';
import Base           from '../../../src/core/Base.mjs';
import logger         from '../../mcp/server/memory-core/logger.mjs';
import OllamaProvider from '../../provider/Ollama.mjs';
import {
    withLmsEmbeddingInputSuffix
}                           from '../shared/vector/lmsEmbeddingInputSuffix.mjs';
import {
    createProviderActivityLifecycle,
    observeUnqueuedProviderActivity
}                           from '../shared/providerActivityLedger.mjs';
import MemoryCoreRecorderService                                       from './MemoryCoreRecorderService.mjs';
import {OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE, PROVIDER_TIMEOUT_CODE} from '../../provider/createTimeoutError.mjs';
import {
    bytesToTokens,
    emitConsumerFriction
}                           from './helpers/consumerFrictionHelper.mjs';

const DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
const OPENAI_COMPATIBLE_CONTENTION_HTTP_ERROR_RE   = /openAiCompatible embedding error HTTP (408|429|503|504):/;
const EMBEDDING_OPERATION_LABEL_MAX_LENGTH         = 120;

/**
 * @summary Source-owned code for an embedding request whose configured model is not resident.
 *
 * This shared Memory Core service must not mint a downstream Knowledge Base `KB_*` code. The KB
 * ingestion boundary translates this provider-neutral cause into its own durable vocabulary.
 * @type {String}
 */
export const EMBEDDING_MODEL_NOT_RESIDENT_CODE = 'EMBEDDING_MODEL_NOT_RESIDENT';

/**
 * @summary Disposition for a model that WAS resident at preflight and is gone by the time the batch
 * reaches a later chunk. Carried BESIDE the code, never instead of it.
 *
 * Distinct from {@link EMBEDDING_MODEL_NOT_RESIDENT_CODE} because the two demand OPPOSITE responses and
 * were previously indistinguishable. *Never resident* is a deployment or configuration fault — the wrong
 * identifier, an unloaded model, a mis-pointed host — and no amount of retrying fixes it. *Evicted
 * mid-batch* means the configuration was correct and a co-resident model took the slot, which is a
 * capacity and co-residency question. Reporting both as "not resident" sends an operator to re-check a
 * configuration that was already right.
 *
 * The distinction is free: residency is already observed at preflight, so this only requires remembering
 * that it was, rather than probing again per chunk — which at stock leaves would add ~13,000 `lms` CLI
 * spawns to a full corpus sync.
 * @type {String}
 */
export const EMBEDDING_RESIDENCY_EVICTED_MID_BATCH = 'evicted-mid-batch';

/**
 * @summary Disposition for a model that was never observed resident for this operation.
 * @type {String}
 */
export const EMBEDDING_RESIDENCY_NEVER_RESIDENT = 'never-resident';

/**
 * @summary Carries a known model-residency cause separately from its diagnostic message.
 *
 * Model-load messages include configured model identifiers, observed resident ids and provider
 * payloads, so consumers must classify on this owned code rather than persist or project the text.
 * @param {Error} error The model-load failure recognized at the source boundary.
 * @returns {Error} The same error with its source-owned cause code.
 */
function markEmbeddingModelNotResidentError(error) {
    error.code = EMBEDDING_MODEL_NOT_RESIDENT_CODE;
    return error
}

/**
 * @summary Source-owned code for a batch embedding abandoned at a cooperative lease yield-point.
 *
 * A yield MUST be distinguishable from a failure at the consumer boundary: the caller has to release the
 * heavy-maintenance lease and resume on the next sweep, never spend its retry budget re-attempting work it
 * deliberately stopped. Returning a partial embedding array cannot express that — it would silently
 * misalign with the caller's `ids` at upsert time.
 * @type {String}
 */
export const EMBEDDING_BATCH_YIELDED_CODE = 'EMBEDDING_BATCH_YIELDED';

/**
 * @summary Classifies a cooperative batch-yield abandonment at the consumer boundary.
 * @param {Error} error The error raised by a batch embedding call.
 * @returns {Boolean}
 */
export function isEmbeddingBatchYieldError(error) {
    return error?.code === EMBEDDING_BATCH_YIELDED_CODE
}

/**
 * @summary Orders accumulated provider-chunk results into a caller-aligned embedding array.
 *
 * The single producer for BOTH the resolved batch and the yield error's partial payload. Two call
 * sites re-deriving this ordering could disagree, and a disagreement here is a vector silently
 * upserted under the wrong id.
 * @param {Object[]} data Accumulated `{index, embedding}` entries.
 * @returns {number[][]}
 */
function toOrderedEmbeddings(data, expectedCount) {
    const ordered = data.slice().sort((a, b) => a.index - b.index);

    // The provider's `index` is the ONLY thing binding a vector to its input, and sorting alone does not
    // preserve it: a sparse response (`[{index: 1}]`) sorts to position 0, so the caller upserts input 1's
    // vector under input 0's id — no length mismatch, no error, a permanently wrong row. `expectedCount` is
    // derived from what was SENT, never from what came back, so a short response cannot define its own
    // correctness. Only after this check does array position equal provider index by construction.
    if (ordered.length !== expectedCount) {
        throw new Error(`openAiCompatible embedding response returned ${ordered.length} vector(s) for ${expectedCount} input(s); refusing to bind vectors to inputs by position`);
    }

    ordered.forEach((entry, position) => {
        if (entry.index !== position) {
            throw new Error(`openAiCompatible embedding response is not densely indexed: position ${position} carries provider index ${entry.index}; refusing to bind vectors to inputs by position`);
        }
    });

    return ordered.map(d => d.embedding)
}

/**
 * @summary Builds the typed abandonment error for a batch stopped at a lease yield-point.
 *
 * Carries the embeddings it already obtained. A yield that dropped them would waste completed
 * provider work AND persist nothing, so an acquisition that repeatedly yields at the same chunk
 * would re-embed the same prefix forever — the caller needs the partial to make the checkpoint a
 * durable unit rather than merely a reached one.
 * @param {Object} options
 * @param {Number} options.completedChunkCount Provider chunks that completed before the yield.
 * @param {Number} options.totalChunkCount Provider chunks the batch would otherwise have issued.
 * @param {Object[]} options.data Accumulated `{index, embedding}` entries for the completed chunks.
 * @returns {Error}
 */
function createEmbeddingBatchYieldError({completedChunkCount, totalChunkCount, chunkSize, data}) {
    // Derived from the chunks SENT, not from `data.length`. A yield only ever happens at a chunk boundary,
    // so every completed chunk is full-width — which makes this an independent expectation the response
    // must satisfy, rather than a restatement of whatever the provider chose to return.
    const completedTextCount = completedChunkCount * chunkSize,
          embeddings         = toOrderedEmbeddings(data, completedTextCount),
          error              = new Error(`openAiCompatible batch embedding yielded the heavy-maintenance lease after ${completedChunkCount}/${totalChunkCount} provider chunk(s), ${completedTextCount} embedding(s) carried`);

    error.code                = EMBEDDING_BATCH_YIELDED_CODE;
    error.completedChunkCount = completedChunkCount;
    error.totalChunkCount     = totalChunkCount;
    error.completedTextCount  = completedTextCount;
    error.embeddings          = embeddings;

    return error
}

/**
 * @summary Normalizes the additive embedding-call options without widening provider authority.
 * @param {Object} options Caller options.
 * @param {String} defaultOperationLabel Provider-scoped fallback label.
 * @returns {Object}
 */
function normalizeEmbeddingOptions(options, defaultOperationLabel) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('TextEmbeddingService: options must be an object');
    }

    const allowedKeys = [
        'operationLabel',
        'operationStage',
        'providerActivityRecorder',
        'service',
        'shouldYield',
        'signal'
    ];
    const unknownKeys = Object.keys(options).filter(key => !allowedKeys.includes(key));

    if (unknownKeys.length > 0) {
        throw new TypeError(`TextEmbeddingService: unsupported embedding option(s): ${unknownKeys.join(', ')}`);
    }
    if (options.signal !== undefined && (
        typeof options.signal?.aborted !== 'boolean' ||
        typeof options.signal?.addEventListener !== 'function' ||
        typeof options.signal?.removeEventListener !== 'function'
    )) {
        throw new TypeError('TextEmbeddingService: options.signal must be an AbortSignal');
    }
    if (options.operationLabel !== undefined && typeof options.operationLabel !== 'string') {
        throw new TypeError('TextEmbeddingService: options.operationLabel must be a string');
    }
    if (options.operationStage !== undefined && typeof options.operationStage !== 'string') {
        throw new TypeError('TextEmbeddingService: options.operationStage must be a string');
    }
    if (options.service !== undefined && typeof options.service !== 'string') {
        throw new TypeError('TextEmbeddingService: options.service must be a string');
    }
    if (options.providerActivityRecorder !== undefined && options.providerActivityRecorder !== null && typeof options.providerActivityRecorder !== 'object') {
        throw new TypeError('TextEmbeddingService: options.providerActivityRecorder must be an object or null');
    }
    if (options.shouldYield !== undefined && typeof options.shouldYield !== 'function') {
        throw new TypeError('TextEmbeddingService: options.shouldYield must be a function');
    }

    const requestedLabel = options.operationLabel?.trim() || defaultOperationLabel;

    return {
        operationLabel          : requestedLabel.substring(0, EMBEDDING_OPERATION_LABEL_MAX_LENGTH),
        operationStage          : options.operationStage || 'unknown',
        providerActivityRecorder: options.providerActivityRecorder === undefined
            ? MemoryCoreRecorderService
            : options.providerActivityRecorder,
        service    : options.service || 'unknown',
        shouldYield: options.shouldYield,
        signal     : options.signal
    };
}

/**
 * @summary Resolves the configured model identifier for one explicit embedding provider.
 * @param {String} provider Explicit embedding provider.
 * @returns {String}
 */
function getEmbeddingModel(provider) {
    if (provider === 'openAiCompatible') return aiConfig.openAiCompatible.embeddingModel;
    if (provider === 'ollama') return aiConfig.ollama.embeddingModel || aiConfig.ollama.model;
    if (provider === 'gemini') return aiConfig.embeddingModel;

    return 'unknown';
}

/**
 * @summary Restores an Error-valued caller abort reason or creates the bounded structural fallback.
 * @param {AbortSignal} signal Aborted upstream signal.
 * @param {String} operationLabel Bounded operation label.
 * @returns {Error}
 */
function getEmbeddingAbortError(signal, operationLabel) {
    if (signal?.reason instanceof Error) {
        return signal.reason;
    }

    const error = new Error(`${operationLabel} aborted`);
    error.name           = 'AbortError';
    error.code           = 'ABORT_ERR';
    error.operationLabel = operationLabel;

    return error;
}

/**
 * @summary Distinguishes caller cancellation from an earlier provider failure that already won the race.
 * @param {Error} error Observed adapter/provider error.
 * @param {AbortSignal|undefined} signal Caller signal.
 * @returns {Boolean}
 */
function isCallerAbortError(error, signal) {
    if (!signal?.aborted) return false;
    if (error === signal.reason) return true;

    return error?.name === 'AbortError' ||
        error instanceof GoogleGenerativeAIAbortError ||
        error?.code === 'ABORT_ERR';
}

/**
 * @summary Fails synchronously before an aborted embedding phase can start more local work.
 * @param {AbortSignal|undefined} signal Upstream cancellation signal.
 * @param {String} operationLabel Bounded operation label.
 * @param {Object} [operation] Mutable local-phase record for causal abort identity.
 * @returns {void}
 */
function throwIfEmbeddingAborted(signal, operationLabel, operation) {
    if (signal?.aborted) {
        const error = getEmbeddingAbortError(signal, operationLabel);

        if (operation) {
            operation.callerAbortError = error;
        }

        throw error;
    }
}

/**
 * @summary Settles one caller abort without abandoning the already-dispatched provider promise.
 *
 * Native Ollama can continue computing after the client socket closes. The caller therefore gets
 * its exact abort reason promptly, while `providerPromise` remains independently handled and the
 * provider-activity lifecycle stays open until the provider response or provider-owned timeout.
 * The source tag lives on the local operation record rather than the caller-owned Error, which may
 * be frozen and must never be mutated.
 *
 * @param {Object} options
 * @param {Promise<*>} options.providerPromise Independently observed provider operation.
 * @param {AbortSignal|undefined} options.signal Caller-owned cancellation signal.
 * @param {String} options.operationLabel Bounded operation label.
 * @param {Object} options.operation Mutable local-phase observability record.
 * @param {Object} options.providerOutcome Direct raw-provider settlement latch.
 * @returns {Promise<*>}
 */
function settleCallerWhileProviderContinues({providerPromise, signal, operationLabel, operation, providerOutcome}) {
    if (!signal) {
        return providerPromise;
    }

    return new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => signal.removeEventListener('abort', onAbort);
        const settle  = (fn, value) => {
            if (settled) return false;

            settled = true;
            cleanup();
            fn(value);

            return true;
        };
        const settleCallerAbort = () => {
            if (settled) return;
            // The activity wrapper adds an async hop. If the raw provider already settled,
            // let its observed wrapper outcome win instead of relabeling it as caller abort.
            if (providerOutcome.state !== 'pending') return;

            const error = getEmbeddingAbortError(signal, operationLabel);

            operation.callerAbortError = error;
            operation.phase            = 'caller-aborted-provider-pending';
            settle(reject, error);
        };
        const onAbort = () => {
            // Provider settlement callbacks registered before this abort are already queued.
            // Giving them one microtask preserves a provider error that causally won first,
            // while a genuinely pending provider still loses promptly to caller cancellation.
            queueMicrotask(settleCallerAbort);
        };

        signal.addEventListener('abort', onAbort, {once: true});
        providerPromise.then(
            value => settle(resolve, value),
            error => settle(reject, error)
        );

        if (signal.aborted) {
            onAbort();
        }
    });
}

/**
 * @summary Waits on a Neo-owned timer that is cancelled and detached on upstream abort.
 * @param {Number} delayMs Delay in milliseconds.
 * @param {AbortSignal|undefined} signal Upstream cancellation signal.
 * @param {String} operationLabel Bounded operation label.
 * @returns {Promise<void>}
 */
function waitForAbortableDelay(delayMs, signal, operationLabel) {
    throwIfEmbeddingAborted(signal, operationLabel);

    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;

        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        };
        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn(value);
        };
        const onAbort = () => settle(reject, getEmbeddingAbortError(signal, operationLabel));

        signal?.addEventListener('abort', onAbort, {once: true});
        timer = setTimeout(() => settle(resolve), Math.max(0, delayMs || 0));

        if (signal?.aborted) {
            onAbort();
        }
    });
}

/**
 * @summary Projects an abort error into a bounded structural log reason.
 * @param {Error} error Caller or provider abort error.
 * @returns {String}
 */
function describeEmbeddingAbortReason(error) {
    if ([
        'ABORT_ERR',
        'EMBEDDING_PROBE_TIMEOUT',
        OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
        'PROVIDER_TIMEOUT'
    ].includes(error?.code)) {
        return error.code;
    }

    return ['AbortError', 'Error', 'GoogleGenerativeAIAbortError'].includes(error?.name)
        ? error.name
        : 'Error';
}

/**
 * @summary Emits bounded, input-free observability for one caller-owned embedding abort.
 * @param {Object} options Abort observation.
 * @returns {void}
 */
function logEmbeddingAbort({provider, operation, error}) {
    logger.warn('[TextEmbeddingService] embedding operation aborted.', {
        provider,
        operationLabel: operation.operationLabel,
        phase         : operation.phase,
        classification: error?.code === 'EMBEDDING_PROBE_TIMEOUT' ? 'consumer-probe-timeout' : 'upstream-abort',
        durationMs    : Math.max(0, Date.now() - operation.startedAt),
        reason        : describeEmbeddingAbortReason(error)
    });
}

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

    return code === OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE ||
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
 * @param {AbortSignal|undefined} signal Upstream cancellation signal.
 * @param {String} operationLabel Bounded operation label.
 * @returns {Promise<void>}
 */
function waitForOpenAiCompatibleBatchYield(delayMs, signal, operationLabel) {
    return waitForAbortableDelay(delayMs, signal, operationLabel);
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
            const apiKey = aiConfig.geminiApiKey;
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
        const {
            operation,
            operationLabel,
            providerActivity,
            providerActivityRecorder,
            signal
        } = options;
        const lifecycle = createProviderActivityLifecycle({
            recorder: providerActivityRecorder,
            activity: {
                ...providerActivity,
                model: 'unknown',
                priority
            }
        });
        options.providerActivityLifecycle = lifecycle;
        const enqueuedAt = Date.now();

        throwIfEmbeddingAborted(signal, operationLabel);
        lifecycle.onEnqueued({enqueuedAt});

        return new Promise((resolve, reject) => {
            const task = {
                dispatched: false,
                inputData,
                options,
                priority,
                lifecycle,
                enqueuedAt,
                settled   : false
            };

            const cleanup = () => {
                signal?.removeEventListener('abort', task.onAbort);
            };
            const settle = (fn, value) => {
                if (task.settled) return;
                task.settled = true;
                cleanup();
                fn(value);
            };

            task.resolve = value => settle(resolve, value);
            task.reject  = error => settle(reject, error);
            task.onAbort = () => {
                if (task.dispatched || task.settled) return;

                const taskIndex = this.#openAiCompatiblePostQueue.indexOf(task);

                if (taskIndex !== -1) {
                    this.#openAiCompatiblePostQueue.splice(taskIndex, 1);
                }

                task.lifecycle.onSettled({
                    completedAt : Date.now(),
                    failureStage: 'queue',
                    success     : false
                });
                task.reject(getEmbeddingAbortError(signal, operationLabel));
            };
            task.markDispatched = () => {
                task.dispatched = true;
                cleanup();
            };

            signal?.addEventListener('abort', task.onAbort, {once: true});

            if (signal?.aborted) {
                task.onAbort();
                return;
            }

            operation.phase = 'queued';
            this.#openAiCompatiblePostQueue.push(task);

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

                task.markDispatched();

                const startedAt = Date.now();

                task.lifecycle.onStarted({startedAt});

                try {
                    const result = await this.#postOpenAiCompatible(task.inputData, task.options);

                    task.lifecycle.onSettled({completedAt: Date.now(), success: true});
                    task.resolve(result);
                } catch (err) {
                    task.lifecycle.onSettled({completedAt: Date.now(), success: false});
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
     * @param {AbortSignal|undefined} signal Upstream cancellation signal exposed to the test seam.
     * @param {String} operationLabel Bounded operation label.
     * @returns {Promise<Object[]>}
     * @private
     */
    async #getOpenAiCompatibleLoadedModels(timeoutMs, signal, operationLabel) {
        if (this.openAiCompatibleLoadedModelsProbe) {
            return this.openAiCompatibleLoadedModelsProbe({timeoutMs, signal});
        }

        const {fetchLmsLoadedModels} = await import('../graph/providerReadinessHelper.mjs');
        throwIfEmbeddingAborted(signal, operationLabel);
        return fetchLmsLoadedModels({timeoutMs, signal});
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
     * @param {AbortSignal|undefined} signal Upstream cancellation signal.
     * @param {String} operationLabel Bounded operation label.
     * @param {Object} operation Mutable local-phase observability record.
     * @returns {Promise<{configuredContextLength: Number, loadedModel: Object, model: String}|null>}
     * @private
     */
    async #getOpenAiCompatibleEmbeddingRuntime(signal, operationLabel, operation) {
        operation.phase = 'preflight';
        throwIfEmbeddingAborted(signal, operationLabel);

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
            loadedModels = await this.#getOpenAiCompatibleLoadedModels(timeoutMs, signal, operationLabel);
        } catch (error) {
            if (isCallerAbortError(error, signal)) {
                throw getEmbeddingAbortError(signal, operationLabel);
            }

            throw new Error(`TextEmbeddingService: unable to verify LM Studio embedding context for '${model}': ${error.message}`);
        }

        throwIfEmbeddingAborted(signal, operationLabel);

        const loadedModel = loadedModels.find(item => item.id === model);

        if (!loadedModel) {
            const observedIds = loadedModels.map(item => item.id).filter(Boolean).slice(0, 5).join(', ') || 'none',
                  error       = markEmbeddingModelNotResidentError(
                      new Error(`TextEmbeddingService: LM Studio embedding model '${model}' is not resident under its configured identifier; observed=${observedIds}`)
                  );

            // The preflight rejection is the OTHER origin of "not resident", and it carries the same
            // disposition field so a consumer never has to infer the cause from which throw site it
            // came out of. Absent here, only the post-request path would be classified and this one
            // would read as unclassified rather than as the configuration fault it plainly is.
            error.residencyDisposition = EMBEDDING_RESIDENCY_NEVER_RESIDENT;

            throw error
        }
        if (!Neo.isNumber(loadedModel.contextLength)) {
            throw new Error(`TextEmbeddingService: LM Studio embedding model '${model}' has unknown loaded context; configured>=${configuredContextLength}`);
        }

        // Record that residency was OBSERVED here, so a later 404 can be told apart from one raised by
        // a model that was never loaded. This preflight runs once per embedTexts call while the batch
        // below issues one request per chunk — the check is a point observation, not an invariant over
        // the requests it licenses, and a co-resident chat model can evict this one inside that window.
        operation.residentAtPreflight = true;

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
     * @param {AbortSignal|undefined} signal Upstream cancellation signal.
     * @param {String} operationLabel Bounded operation label.
     * @param {Object} operation Mutable local-phase observability record.
     * @returns {Promise<String|String[]>}
     * @private
     */
    async #prepareOpenAiCompatibleEmbeddingInput(inputData, signal, operationLabel, operation) {
        const
            runtime          = await this.#getOpenAiCompatibleEmbeddingRuntime(signal, operationLabel, operation),
            requestInputData = runtime ? withLmsEmbeddingInputSuffix(inputData, runtime.loadedModel, {log: logger}) : inputData;

        throwIfEmbeddingAborted(signal, operationLabel);
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
     * @param {AbortSignal} [options.signal] Upstream cancellation signal.
     * @param {String} options.operationLabel Bounded operation label.
     * @param {Object} options.operation Mutable local-phase observability record.
     * @returns {Promise<Object>}
     * @private
     */
    async #postOpenAiCompatible(inputData, options) {
        const {
            unloadRetriesLeft,
            contentionRetriesLeft = 0,
            requestTimeoutMs      = DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS,
            signal,
            operationLabel,
            operation,
            providerActivityLifecycle
        } = options;
        const {
            host,
            apiKey,
            unloadRetryDelayMs    = 500,
            contentionRetryDelayMs = 1000
        } = aiConfig.openAiCompatible;
        const embeddingModel = aiConfig.openAiCompatible.embeddingModel;

        try {
            operation.phase = 'transport-setup';
            throwIfEmbeddingAborted(signal, operationLabel);

            const parsedUrl  = new URL(`${host}/v1/embeddings`);
            const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

            throwIfEmbeddingAborted(signal, operationLabel);

            let req, abortHandler;
            let settled = false;
            let resolveFunc, rejectFunc;
            const responsePromise = new Promise((res, rej) => {
                resolveFunc = res;
                rejectFunc = rej;
            });
            const cleanup = () => {
                signal?.removeEventListener('abort', abortHandler);
            };
            const settle = (fn, value) => {
                if (settled) return;
                settled = true;
                cleanup();
                fn(value);
            };
            const resolveOnce = value => settle(resolveFunc, value);
            const rejectOnce  = error => settle(rejectFunc, error);

            const reqHeaders = { 'Content-Type': 'application/json' };
            if (apiKey) {
                reqHeaders.Authorization = `Bearer ${apiKey}`;
            }

            operation.phase = 'in-flight';
            req = httpModule.request(parsedUrl, {
                method : 'POST',
                headers: reqHeaders,
                signal,
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
                        rejectOnce(new Error(`openAiCompatible embedding error HTTP ${res.statusCode}: ${body} [endpoint=${parsedUrl.href}, model='${embeddingModel}']`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveOnce(result);
                        } catch (e) {
                            rejectOnce(new Error(`Failed to parse openAiCompatible response: ${e.message}`));
                        }
                    }
                });
                res.on('error', error => rejectOnce(isCallerAbortError(error, signal) ? getEmbeddingAbortError(signal, operationLabel) : error));
            });

            abortHandler = () => {
                const error = getEmbeddingAbortError(signal, operationLabel);

                // Node's native `http.request({signal})` listener owns the single request destroy.
                // This Neo-owned listener restores the caller reason without issuing a second destroy.
                rejectOnce(error);
            };
            signal?.addEventListener('abort', abortHandler, {once: true});

            req.on('error', err => rejectOnce(isCallerAbortError(err, signal) ? getEmbeddingAbortError(signal, operationLabel) : err));
            req.on('timeout', () => {
                const err = new Error(`openAiCompatible request timed out after ${describeOpenAiCompatibleTimeout(requestTimeoutMs)}`);
                err.code = OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE;
                rejectOnce(err);
                if (!req.destroyed) {
                    req.destroy(err);
                }
            });

            if (signal?.aborted) {
                abortHandler();
            } else {
                providerActivityLifecycle?.onDispatch({model: embeddingModel});
                req.write(JSON.stringify({ model: embeddingModel, input: inputData }));
                req.end();
            }

            return await responsePromise;
        } catch (err) {
            if (isCallerAbortError(err, signal)) {
                throw getEmbeddingAbortError(signal, operationLabel);
            }

            // Shape C (HTTP 404): the model is not resident at the provider (sustained eviction / never
            // loaded). A 404 on /v1/embeddings means model-not-found, so it gets
            // the same bounded model-load-wait retry; it stays fail-loud on a permanent 404 (retries exhaust).
            const isModelLoadError = (err.message.includes('HTTP 400') && (
                err.message.includes('Model was unloaded') ||              // Shape A — JIT-unload-then-queued-request
                (err.message.includes('Failed to load model') &&            // Shape B — JIT-warm-load-canceled
                 err.message.includes('Operation canceled'))
            )) || err.message.includes('HTTP 404');                         // Shape C — model not resident

            if (isModelLoadError) {
                markEmbeddingModelNotResidentError(err);

                // ADDITIVE, deliberately. `code` keeps its spelling because two downstream readers own
                // it — `embeddingProbe`'s `model-not-resident` and the KB's durable
                // `KB_VECTOR_EMBED_MODEL_NOT_RESIDENT` — and re-coding here would drop an evicted
                // failure out of both classifications rather than refining it.
                //
                // The disposition rides alongside: residency observed at preflight and gone by the time
                // retries exhausted means the model existed and something took its slot, which is a
                // capacity question. Never observed resident stays a configuration fault. Only the
                // exhausted case is marked — a Shape-C with retries left may still succeed.
                // Strictly `true`, never merely truthy. The preflight is SKIPPED entirely for an
                // openAiCompatible endpoint that is not LM Studio (`#getOpenAiCompatibleEmbeddingRuntime`
                // returns before recording anything), so the flag is then `undefined` — an absence of
                // observation, not an observation of absence. A ternary read it as `never-resident`
                // and minted a positive configuration-fault claim from a check that never ran, which
                // is the hidden default this ticket's own Avoided Traps forbids.
                //
                // `never-resident` is therefore minted ONLY where it is observed: the preflight
                // rejection above. Unobserved leaves the field absent, and absent is readable.
                if (!(unloadRetriesLeft > 0) && operation.residentAtPreflight === true) {
                    err.residencyDisposition = EMBEDDING_RESIDENCY_EVICTED_MID_BATCH
                }
            }

            if (unloadRetriesLeft > 0 && isModelLoadError) {
                logger.log(`[TextEmbeddingService] embedding-provider model-load failure detected (Shape ${err.message.includes('Model was unloaded') ? 'A' : err.message.includes('HTTP 404') ? 'C' : 'B'}), retrying (remaining retries: ${unloadRetriesLeft})`);
                operation.phase = 'retry-delay';
                await waitForAbortableDelay(unloadRetryDelayMs, signal, operationLabel);
                return this.#postOpenAiCompatible(inputData, {
                    unloadRetriesLeft: unloadRetriesLeft - 1,
                    contentionRetriesLeft,
                    requestTimeoutMs,
                    signal,
                    operationLabel,
                    operation,
                    providerActivityLifecycle
                });
            }

            if (contentionRetriesLeft > 0 && isOpenAiCompatibleContentionTimeoutError(err)) {
                logger.log(`[TextEmbeddingService] embedding-provider contention timeout detected, retrying (remaining contention retries: ${contentionRetriesLeft})`);
                operation.phase = 'retry-delay';
                await waitForAbortableDelay(contentionRetryDelayMs, signal, operationLabel);
                return this.#postOpenAiCompatible(inputData, {
                    unloadRetriesLeft,
                    contentionRetriesLeft: contentionRetriesLeft - 1,
                    requestTimeoutMs,
                    signal,
                    operationLabel,
                    operation,
                    providerActivityLifecycle
                });
            }
            if (isOpenAiCompatibleContentionTimeoutError(err)) {
                this.#emitOpenAiCompatibleTimeoutFriction(inputData, requestTimeoutMs, err, embeddingModel);
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
     * @param {String} embeddingModel Model captured at the provider dispatch boundary.
     * @returns {void}
     * @private
     */
    #emitOpenAiCompatibleTimeoutFriction(inputData, requestTimeoutMs, err, embeddingModel) {
        const
            estimate = this.#getOpenAiCompatibleInputEstimate(inputData);

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
     * @summary Runs native Ollama embedding while separating caller abort from provider settlement.
     * @param {String|String[]} inputData Text input to embed.
     * @param {String} operationLabel Safe diagnostic label for timeout errors.
     * @param {AbortSignal|undefined} signal Upstream cancellation signal.
     * @param {Object} operation Mutable local-phase observability record.
     * @param {Object|null} providerActivityRecorder Best-effort telemetry sink.
     * @param {Object} providerActivity Bounded provider activity descriptor.
     * @returns {Promise<Object>}
     * @private
     */
    async #embedOllama(inputData, operationLabel, signal, operation, providerActivityRecorder, providerActivity) {
        const
            provider         = this.#getOllamaProvider(),
            dispatchModel    = provider.embeddingModel || provider.modelName || 'unknown',
            requestTimeoutMs = this.#getOllamaEmbeddingTimeoutMs(),
            providerOutcome  = {state: 'pending'};

        operation.phase = 'in-flight';
        throwIfEmbeddingAborted(signal, operationLabel, operation);

        const recordProviderFailure = error => {
            providerOutcome.state = 'rejected';
            if (error?.code === PROVIDER_TIMEOUT_CODE) {
                this.#emitOllamaEmbeddingTimeoutFriction(inputData, requestTimeoutMs, error);
            }
        };
        const providerPromise = observeUnqueuedProviderActivity({
            recorder: providerActivityRecorder,
            activity: {
                ...providerActivity,
                model: dispatchModel
            },
            task    : () => {
                let rawProviderPromise;

                try {
                    rawProviderPromise = Promise.resolve(provider.embed(inputData, {
                        num_ctx  : aiConfig.localModels.embedding.contextLimitTokens,
                        operationLabel,
                        timeoutMs: requestTimeoutMs,
                        truncate : false
                    }));
                } catch (error) {
                    recordProviderFailure(error);
                    throw error;
                }

                rawProviderPromise.then(
                    () => providerOutcome.state = 'fulfilled',
                    recordProviderFailure
                );

                return rawProviderPromise;
            }
        });

        return settleCallerWhileProviderContinues({
            providerPromise,
            signal,
            operationLabel,
            operation,
            providerOutcome
        });
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
     * @param {Object} options Abort and observability context.
     * @param {Function} [options.shouldYield] Cooperative heavy-maintenance-lease yield predicate.
     * @returns {Promise<number[][]>}
     * @private
     */
    async #embedOpenAiCompatibleBatch(texts, options) {
        const {
            operation,
            operationLabel,
            providerActivity,
            providerActivityRecorder,
            shouldYield,
            signal
        } = options;
        const {
            unloadRetryCount        = 3,
            batchEmbeddingChunkSize = 5,
            batchEmbeddingTimeoutMs = DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS,
            batchEmbeddingYieldMs   = 0
        } = aiConfig.openAiCompatible;
        const chunkSize        = Math.max(1, Math.floor(batchEmbeddingChunkSize || texts.length)),
              requestTimeoutMs = assertPositiveTimeoutMs(batchEmbeddingTimeoutMs, 'openAiCompatible.batchEmbeddingTimeoutMs'),
              totalChunkCount  = Math.ceil(texts.length / chunkSize),
              data             = [];

        let completedChunkCount = 0;

        for (let offset = 0; offset < texts.length; offset += chunkSize) {
            operation.phase = 'batch-chunk';
            throwIfEmbeddingAborted(signal, operationLabel);

            // Cooperative heavy-maintenance-lease yield-point: BETWEEN provider chunks, never before the
            // first — the same forward-progress guarantee `VectorService.embedChunks` makes between its own
            // batches, so at least one chunk always lands per acquisition and the pair cannot livelock.
            //
            // The consultation has to happen HERE and not only one frame up, because the interval between two
            // consultations up there is `maxRetries * ceil(batchSize / chunkSize) * (1 + unloadRetryCount) *
            // batchEmbeddingTimeoutMs` — 16h40m at stock leaves, against a 30-minute `maxActiveHoldMs`. A
            // cooperative bound whose checkpoint interval exceeds the bound is not a bound: the holder's
            // first chance to honour it can arrive after it has already elapsed. Checking per chunk makes
            // the worst case `(1 + unloadRetryCount) * batchEmbeddingTimeoutMs`.
            //
            // `completedChunkCount > 0` is a forward-progress guarantee only because the error carries the
            // embeddings: a reached checkpoint is not a durable one. Dropping them would let an acquisition
            // that yields at the same chunk every time re-embed the same prefix forever.
            if (completedChunkCount > 0 && shouldYield?.()) {
                operation.phase = 'lease-yield';
                throw createEmbeddingBatchYieldError({completedChunkCount, totalChunkCount, chunkSize, data})
            }

            const chunk  = texts.slice(offset, offset + chunkSize),
                  result = await this.#enqueueOpenAiCompatiblePost(chunk, {
                      unloadRetriesLeft: unloadRetryCount,
                      requestTimeoutMs,
                      signal,
                      operationLabel,
                      operation,
                      providerActivity,
                      providerActivityRecorder
                  }, 'batch');

            data.push(...(result.data || []).map(item => ({
                ...item,
                index: offset + item.index
            })));

            completedChunkCount++;

            if (offset + chunkSize < texts.length) {
                operation.phase = 'batch-yield';
                await waitForOpenAiCompatibleBatchYield(batchEmbeddingYieldMs, signal, operationLabel);
            }
        }

        return toOrderedEmbeddings(data, texts.length);
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
     * @param {Object} [options={}] Abort/diagnostic options.
     * @param {AbortSignal} [options.signal] Caller-owned cancellation signal.
     * @param {String} [options.operationLabel] Bounded diagnostic label.
     * @param {String} [options.operationStage='unknown'] Stable low-cardinality stage.
     * @param {String} [options.service='unknown'] Stable service owner.
     * @param {Object|null} [options.providerActivityRecorder] Best-effort telemetry sink.
     * @returns {Promise<number[]>}
     */
    async embedText(text, explicitProvider, options = {}) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedText requires an explicit provider argument');

        const defaultOperationLabel = explicitProvider === 'ollama'
                  ? 'TextEmbeddingService.embedText native Ollama embedding'
                  : `TextEmbeddingService.embedText ${explicitProvider} embedding`,
              {
                  operationLabel,
                  operationStage,
                  providerActivityRecorder,
                  service,
                  signal
              } = normalizeEmbeddingOptions(options, defaultOperationLabel),
              providerActivity          = {
                  model   : getEmbeddingModel(explicitProvider),
                  operationStage,
                  priority: 'interactive',
                  provider: explicitProvider,
                  role    : 'embedding',
                  service
              },
              operation                = {operationLabel, phase: 'entry', startedAt: Date.now()};

        try {
            throwIfEmbeddingAborted(signal, operationLabel, operation);

            if (explicitProvider === 'openAiCompatible') {
                const {
                    unloadRetryCount          = 3,
                    contentionRetryCount      = 2,
                    contentionTimeoutMs       = 15000
                } = aiConfig.openAiCompatible;
                const requestText = await this.#prepareOpenAiCompatibleEmbeddingInput(text, signal, operationLabel, operation);
                const result      = await this.#enqueueOpenAiCompatiblePost(requestText, {
                    unloadRetriesLeft    : unloadRetryCount,
                    contentionRetriesLeft: contentionRetryCount,
                    requestTimeoutMs     : contentionTimeoutMs,
                    signal,
                    operationLabel,
                    operation,
                    providerActivity,
                    providerActivityRecorder
                }, 'interactive');
                return result.data?.[0]?.embedding;
            } else if (explicitProvider === 'ollama') {
                // Native Ollama returns `{embeddings: [[...]]}` even for single-input;
                // project the single inner array since this method is the per-text variant.
                const result = await this.#embedOllama(
                    text,
                    operationLabel,
                    signal,
                    operation,
                    providerActivityRecorder,
                    providerActivity
                );
                return result.embeddings?.[0];
            } else if (explicitProvider === 'gemini') {
                const geminiKey = aiConfig.geminiApiKey;
                if (!geminiKey) {
                     throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
                }
                if (!this.embeddingModel) {
                     throw new Error('Google Generative AI Client not initialized properly.');
                }

                operation.phase = 'in-flight';
                const dispatchModel = this.embeddingModel.model || 'unknown';
                const result        = await observeUnqueuedProviderActivity({
                    recorder: providerActivityRecorder,
                    activity: {
                        ...providerActivity,
                        model: dispatchModel
                    },
                    task    : () => this.embeddingModel.embedContent(text, signal ? {signal} : undefined)
                });
                return result.embedding.values;
            } else {
                // Unknown provider names fail loudly rather than silently fall back to
                // the Gemini path — silent fallback is speculative-support.
                throw new Error(`TextEmbeddingService: unsupported embedding provider '${explicitProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
            }
        } catch (error) {
            const isCallerAbort = explicitProvider === 'ollama'
                ? error === operation.callerAbortError
                : isCallerAbortError(error, signal);

            if (isCallerAbort) {
                const abortError = explicitProvider === 'ollama'
                    ? operation.callerAbortError
                    : getEmbeddingAbortError(signal, operationLabel);

                logEmbeddingAbort({provider: explicitProvider, operation, error: abortError});
                throw abortError;
            }

            throw error;
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
     * @param {Object} [options={}] Abort/diagnostic options.
     * @param {AbortSignal} [options.signal] Caller-owned cancellation signal.
     * @param {String} [options.operationLabel] Bounded diagnostic label.
     * @param {String} [options.operationStage='unknown'] Stable low-cardinality stage.
     * @param {String} [options.service='unknown'] Stable service owner.
     * @param {Object|null} [options.providerActivityRecorder] Best-effort telemetry sink.
     * @param {Function} [options.shouldYield] Cooperative heavy-maintenance-lease yield predicate,
     *     consulted BETWEEN provider chunks (never before the first). When it returns truthy the batch is
     *     abandoned with an {@link EMBEDDING_BATCH_YIELDED_CODE} error rather than a partial array, so the
     *     lease holder can release and resume instead of retrying work it deliberately stopped.
     * @returns {Promise<number[][]>}
     */
    async embedTexts(texts, explicitProvider, options = {}) {
        if (!explicitProvider) throw new Error('TextEmbeddingService.embedTexts requires an explicit provider argument');

        const defaultOperationLabel = explicitProvider === 'ollama'
                  ? 'TextEmbeddingService.embedTexts native Ollama embedding'
                  : `TextEmbeddingService.embedTexts ${explicitProvider} embedding`,
              {
                  operationLabel,
                  operationStage,
                  providerActivityRecorder,
                  service,
                  shouldYield,
                  signal
              } = normalizeEmbeddingOptions(options, defaultOperationLabel),
              providerActivity          = {
                  model   : getEmbeddingModel(explicitProvider),
                  operationStage,
                  priority: 'batch',
                  provider: explicitProvider,
                  role    : 'embedding',
                  service
              },
              operation                = {operationLabel, phase: 'entry', startedAt: Date.now()};

        try {
            throwIfEmbeddingAborted(signal, operationLabel, operation);

            if (explicitProvider === 'openAiCompatible') {
                const requestTexts = await this.#prepareOpenAiCompatibleEmbeddingInput(texts, signal, operationLabel, operation);
                return this.#embedOpenAiCompatibleBatch(requestTexts, {
                    operation,
                    operationLabel,
                    providerActivity,
                    providerActivityRecorder,
                    shouldYield,
                    signal
                });
            } else if (explicitProvider === 'ollama') {
                // Ollama's `/api/embed` accepts array-of-strings natively + returns
                // a parallel embeddings array — no per-text fan-out needed.
                const result = await this.#embedOllama(
                    texts,
                    operationLabel,
                    signal,
                    operation,
                    providerActivityRecorder,
                    providerActivity
                );
                // Length is the ONLY thing binding a native-ollama vector to its input: the response
                // is a parallel array with no per-item index, so a short response silently shifts
                // every later vector onto its neighbour's id — input 1's vector stored under input
                // 0's id, and the last id upserted with nothing. No length mismatch reaches the
                // caller, no error is raised, and the rows are permanently wrong.
                //
                // A wrong row is worse than a failed batch: the batch retries, the row is believed.
                // `|| []` was the same defect one degree further — a malformed response became "zero
                // vectors, no error", so a sweep could report progress while the corpus stayed empty.
                //
                // `texts.length` is derived from what was SENT, never from what came back, so a short
                // response cannot define its own correctness. This is the openAiCompatible density
                // guard's twin; that path got it and this one did not, on the provider a deployment
                // is more likely to run.
                const ollamaEmbeddings = result.embeddings;

                if (!Array.isArray(ollamaEmbeddings) || ollamaEmbeddings.length !== texts.length) {
                    throw new Error(`ollama embedding response returned ${Array.isArray(ollamaEmbeddings) ? ollamaEmbeddings.length : 'no'} vector(s) for ${texts.length} input(s); refusing to bind vectors to inputs by position`);
                }

                return ollamaEmbeddings;
            } else if (explicitProvider === 'gemini') {
                const geminiKey = aiConfig.geminiApiKey;
                if (!geminiKey) {
                     throw new Error('Semantic search unavailable: GEMINI_API_KEY is missing.');
                }
                if (!this.embeddingModel) {
                     throw new Error('Google Generative AI Client not initialized properly.');
                }

                operation.phase = 'in-flight';
                const endpointModel = this.embeddingModel.model;
                const requestModel  = aiConfig.embeddingModel;
                const dispatchModel = endpointModel || 'unknown';
                const requests      = texts.map(text => ({model: requestModel, content: {parts: [{text}]}}));
                const result        = await observeUnqueuedProviderActivity({
                    recorder: providerActivityRecorder,
                    activity: {
                        ...providerActivity,
                        model: dispatchModel
                    },
                    task    : () => this.embeddingModel.batchEmbedContents({requests}, signal ? {signal} : undefined)
                });
                return result.embeddings.map(e => e.values);
            } else {
                // Unknown provider names fail loudly (matches `embedText`).
                throw new Error(`TextEmbeddingService: unsupported embedding provider '${explicitProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
            }
        } catch (error) {
            const isCallerAbort = explicitProvider === 'ollama'
                ? error === operation.callerAbortError
                : isCallerAbortError(error, signal);

            if (isCallerAbort) {
                const abortError = explicitProvider === 'ollama'
                    ? operation.callerAbortError
                    : getEmbeddingAbortError(signal, operationLabel);

                logEmbeddingAbort({provider: explicitProvider, operation, error: abortError});
                throw abortError;
            }

            throw error;
        }
    }
}

export default Neo.setupClass(TextEmbeddingService);
