import {
    GoogleGenerativeAI,
    GoogleGenerativeAIAbortError
}                           from '@google/generative-ai';
import aiConfig       from '../../mcp/server/memory-core/config.mjs';
import Base           from '../../../src/core/Base.mjs';
import {
    resolveCompletedPrefix,
    resolveDispatchPlan,
    resolveEmbeddingTaskBudget
}                           from './helpers/embeddingDispatchPlan.mjs';
import logger         from '../../mcp/server/memory-core/logger.mjs';
import OllamaProvider from '../../provider/Ollama.mjs';
import {
    isEmbeddingContextBelowSafeBand
}                           from '../../embeddingSafeBand.mjs';
import {
    withLmsEmbeddingInputSuffix
}                           from '../shared/vector/lmsEmbeddingInputSuffix.mjs';
import {
    createProviderActivityLifecycle,
    observeUnqueuedProviderActivity
}                           from '../shared/providerActivityLedger.mjs';
import MemoryCoreRecorderService                                       from './MemoryCoreRecorderService.mjs';
import {
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE,
    isProviderTimeoutCode
}                           from '../../provider/createTimeoutError.mjs';
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
 * @summary Source-owned code for a current embedding input classified beyond provider context.
 *
 * Minted when Neo's bounded LM Studio token estimate exceeds an otherwise policy-compliant resident
 * context, or when an OpenAI-compatible provider returns the exact structured
 * `exceed_context_size_error` refusal. If the resident itself is below the declared lane policy,
 * that repairable context cause takes precedence because reloading the model may make the same input
 * fit. A truncated embedding must never be stored, so the KB boundary rejects only this input cause.
 *
 * This shared Memory Core service must not mint a downstream Knowledge Base `KB_*` code; the KB
 * ingestion boundary translates this cause into its own durable vocabulary.
 * @type {String}
 */
export const EMBEDDING_INPUT_TRUNCATED_CODE = 'EMBEDDING_INPUT_TRUNCATED';

/**
 * @summary Source-owned code for a loaded embedding context below Neo's active lane contract.
 *
 * A resident may be below the configured requirement or safe-processing band while still holding
 * the current input. That is a repairable deployment/context-policy mismatch, not proof that this
 * input was or would be truncated. Knowledge Base therefore translates it distinctly and keeps it
 * deferrable rather than discarding work under the permanent-input refusal.
 * @type {String}
 */
export const EMBEDDING_CONTEXT_INSUFFICIENT_CODE = 'EMBEDDING_CONTEXT_INSUFFICIENT';

/**
 * @summary Marks a bounded estimate-based or exact structured current-input overflow.
 * @param {Error} error A trusted-metadata estimate failure or exact structured provider refusal.
 * @returns {Error} The same typed error.
 */
function markEmbeddingInputTruncatedError(error) {
    error.code = EMBEDDING_INPUT_TRUNCATED_CODE;
    return error
}

/**
 * @summary Marks a repairable loaded-context policy mismatch without claiming input truncation.
 * @param {Error} error The trusted-metadata context-policy failure.
 * @returns {Error} The same typed error.
 */
function markEmbeddingContextInsufficientError(error) {
    error.code = EMBEDDING_CONTEXT_INSUFFICIENT_CODE;
    return error
}

/**
 * @summary Recognizes the pinned llama.cpp context-overflow refusal without provider-prose inference.
 * @param {Number} statusCode HTTP status code.
 * @param {String} body Raw response body.
 * @returns {Boolean}
 */
function isStructuredEmbeddingContextOverflow(statusCode, body) {
    if (statusCode !== 400 || typeof body !== 'string' || body.length === 0) return false;

    try {
        const payload = JSON.parse(body),
              detail  = payload?.error ?? payload;

        return detail?.code === 400 && detail?.type === 'exceed_context_size_error' &&
            Number.isSafeInteger(detail.n_prompt_tokens) && detail.n_prompt_tokens > 0 &&
            Number.isSafeInteger(detail.n_ctx) && detail.n_ctx > 0 &&
            detail.n_prompt_tokens >= detail.n_ctx
    } catch {
        return false
    }
}

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
 * **Takes the measured prefix; does not re-derive it.** This previously computed
 * `completedChunkCount * chunkSize`, justified by "a yield lands on a chunk boundary, so every
 * completed chunk is full-width". That justification is false — the final span is short whenever the
 * input count is not a multiple of the width — while the conclusion happened to hold for a different
 * reason the comment never stated: the dispatch loop only consults the yield predicate while spans
 * remain UNDISPATCHED, and dispatch is in span order, so a yielded prefix structurally excludes the
 * final span. No reachable input reddened the product, and none can.
 *
 * It is passed in anyway, because a leaf whose correctness depends on a caller-side ordering invariant
 * it cannot see is one refactor away from being wrong silently: reorder dispatch, or consult the
 * predicate once more after the last admission, and this returns a count one width too large — at
 * which point `toOrderedEmbeddings` throws from inside the yield constructor and the abandonment loses
 * its `EMBEDDING_BATCH_YIELDED_CODE`, downgrading a resumable checkpoint to a hard failure. The
 * failure path one branch up already passed the measured count, so the two also disagreed about the
 * same prefix — the divergence the single-producer rule above exists to prevent.
 *
 * @param {Object} options
 * @param {Number} options.completedChunkCount Provider chunks that completed before the yield.
 * @param {Number} options.totalChunkCount Provider chunks the batch would otherwise have issued.
 * @param {Number} options.completedTextCount Inputs covered by that prefix, measured by the caller.
 * @param {Object[]} options.data Accumulated `{index, embedding}` entries for the completed chunks.
 * @returns {Error}
 */
function createEmbeddingBatchYieldError({completedChunkCount, totalChunkCount, completedTextCount, data}) {
    // Still an independent expectation rather than a restatement of what came back: the count is
    // measured from the spans that were SENT and completed, never from `data.length`.
    const embeddings = toOrderedEmbeddings(data, completedTextCount),
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
        'deadlineMs',
        'operationLabel',
        'operationStage',
        'onProviderTimeout',
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
    if (options.deadlineMs !== undefined && (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)) {
        throw new TypeError('TextEmbeddingService: options.deadlineMs must be a positive number');
    }
    if (options.deadlineMs !== undefined && options.signal === undefined) {
        throw new TypeError('TextEmbeddingService: options.deadlineMs requires options.signal');
    }
    if (options.operationLabel !== undefined && typeof options.operationLabel !== 'string') {
        throw new TypeError('TextEmbeddingService: options.operationLabel must be a string');
    }
    if (options.operationStage !== undefined && typeof options.operationStage !== 'string') {
        throw new TypeError('TextEmbeddingService: options.operationStage must be a string');
    }
    if (options.onProviderTimeout !== undefined && typeof options.onProviderTimeout !== 'function') {
        throw new TypeError('TextEmbeddingService: options.onProviderTimeout must be a function');
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
        deadlineMs              : options.deadlineMs,
        operationLabel          : requestedLabel.substring(0, EMBEDDING_OPERATION_LABEL_MAX_LENGTH),
        operationStage          : options.operationStage || 'unknown',
        onProviderTimeout       : options.onProviderTimeout,
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
export function getEmbeddingModel(provider) {
    if (provider === 'openAiCompatible') return aiConfig.openAiCompatible.embeddingModel;
    if (provider === 'ollama') return aiConfig.ollama.embeddingModel || aiConfig.ollama.model;
    if (provider === 'gemini') return aiConfig.embeddingModel;

    return 'unknown';
}

/**
 * @summary Records one admitted batch at the recorder that owns its current process.
 *
 * This is best-effort observability: a recorder failure must not change provider behavior. Calling
 * it only at the final provider branch excludes invalid and pre-aborted requests from the ratio.
 * @param {Object|null} recorder Process-local telemetry recorder.
 * @param {String[]} texts Batch inputs admitted to provider work.
 * @returns {void}
 */
function recordEmbeddingSubmissions(recorder, texts) {
    if (typeof recorder?.recordEmbeddingSubmissions !== 'function') return;

    try {
        recorder.recordEmbeddingSubmissions({texts, submittedAt: Date.now()});
    } catch (error) {
        logger.warn('[TextEmbeddingService] Failed to record embedding identities:', error.message);
    }
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

    // Deliberately NOT `isProviderTimeoutCode`: this predicate answers "should the interactive
    // single-embed retry", which is a superset on one axis (the HTTP contention message) and a
    // subset on another — `PROVIDER_TIMEOUT` is absent because the OpenAI-compatible embedding
    // transport never stamps it. Swapping in the shared four-code predicate would widen contention
    // retry rather than deduplicate it, so the two classifiers stay separate on purpose.
    return code === OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE ||
        code === 'ETIMEDOUT' ||
        code === 'ESOCKETTIMEDOUT' ||
        OPENAI_COMPATIBLE_CONTENTION_HTTP_ERROR_RE.test(message);
}

/**
 * @summary Runs the caller-owned provider-timeout circuit hook BEFORE local admission advances —
 * the one ordered notification both local embedding providers share.
 *
 * **Why one helper rather than a branch per provider.** The two paths have genuinely different
 * admission machinery (native Ollama: a capped slot released on provider settlement; OpenAI-compatible:
 * a single-lane queue whose drain selects the next task immediately after a rejection), but they owe
 * the caller the identical *ordering* guarantee: if this attempt timed out, the caller's circuit is
 * told before anything else can be dispatched into the provider that just failed. Expressing that
 * ordering twice is what let it exist in only one of them.
 *
 * **What this helper does NOT own.** It does not create, hold, or reason about the tenant-run circuit;
 * it does not author the circuit-open reason; and it never converts a hook failure into an outcome.
 * The caller owns its `AbortController` and its distinct circuit-open error — this layer owns only
 * "typed timeout detected → notify synchronously → let the source error stand".
 *
 * **The containment cell, stated exactly.** A hook
 * that synchronously opens its circuit and *then* throws is contained here — the source provider error
 * survives, admission is not stalled, and a queued task's synchronous removal is not undone. A hook
 * that throws *before* opening its circuit is explicitly outside the guarantee: this layer will not
 * invent fallback circuit authority, so a later dispatch is possible and is the caller's contract to
 * keep, not this helper's to synthesize.
 *
 * @param {Object} options
 * @param {Error} options.error The settled provider failure to classify.
 * @param {Function} [options.onProviderTimeout] Caller-owned synchronous circuit hook.
 * @param {String} options.providerLabel Bounded provider name for the diagnostic log only.
 * @returns {Boolean} `true` when the error was a typed provider timeout (whether or not a hook ran).
 */
export function notifyProviderTimeout({error, onProviderTimeout, providerLabel}) {
    if (!isProviderTimeoutCode(error?.code)) {
        return false;
    }

    try {
        onProviderTimeout?.(error);
    } catch (hookError) {
        // The hook is an advisory circuit signal, never a replacement for the source provider error.
        // Preserve the timing-out repository's timeout identity even when a caller supplied a broken
        // hook, and keep the log bounded to structural error identity — never hook or prompt content.
        logger.warn(`[TextEmbeddingService] ${providerLabel} provider-timeout hook failed.`, {
            errorName: hookError?.name || 'Error'
        });
    }

    return true;
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

    #openAiCompatiblePostQueue        = [];
    // A COUNT, not a boolean. The boolean it replaces was a single-worker re-entrancy guard, and it
    // was the real concurrency bound on this path: the dispatch loop above could issue N requests and
    // they queued behind one drain. Bounded by the declared parallelism, so the provider's own stated
    // width is the only authority.
    #openAiCompatiblePostQueueWorkers = 0;
    // Provider TASKS in flight, not posts. One multi-input POST is one task per input, and the budget
    // is written in tasks, so admission has to count the same unit.
    #openAiCompatibleInFlightTasks    = 0;

    // Native Ollama admission control. The openAiCompatible path has been serialized since
    // `#openAiCompatiblePostQueue` existed; this path reached the provider through
    // `observeUnqueuedProviderActivity` — which observes and does NOT admit — so its concurrency was
    // emergent from caller count. Four callers meant four resident-model requests, which is the
    // observed shape on a real plane rather than a hypothetical one.
    #ollamaInFlightEmbeddings = 0;
    #ollamaEmbeddingWaiters   = [];

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
     * A local OpenAI-compatible engine schedules TASKS: one multi-input embedding POST expands to one
     * task per input. This queue's job is admission ORDER, not admission volume — it lets a
     * latency-sensitive single embedding overtake queued KB-sync batch work. How much work may be
     * outstanding is decided upstream by `resolveDispatchPlan`, which keeps a batch's offered tasks
     * below the declared budget; this queue deliberately does not repeat that accounting.
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
                dispatched            : false,
                inputData,
                interactiveBypassCount: 0,
                options,
                priority,
                lifecycle,
                enqueuedAt,
                settled               : false
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
     * @summary Admits queue workers up to the declared parallelism, preferring interactive work.
     *
     * Every worker selects through {@link #peekNextOpenAiCompatiblePostQueueIndex}, so the
     * interactive-first fairness contract is unchanged: an interactive item still overtakes queued
     * batch work, and it now becomes runnable when any worker frees rather than only the single one.
     *
     * No latency claim is made here. Whether that reduces interactive wait in practice depends on the
     * engine's own scheduling and has not been measured; what IS structural is the headroom, and it is
     * enforced upstream — `resolveDispatchPlan` keeps a batch's offered tasks at or below
     * `taskBudget - 1`, so a single-task interactive request fits inside the declared budget rather
     * than competing for it.
     *
     * Not `await`ed: a caller enqueues and waits on its own task's promise, never on the drain.
     * @returns {void}
     * @private
     */
    #drainOpenAiCompatiblePostQueue() {
        // Admission lives HERE, and the placement is the fix rather than a detail.
        // `resolveDispatchPlan` reserves headroom per `embedTexts` call, which is sound for one caller
        // and silently false for two: each satisfies its own reservation and they jointly overshoot the
        // budget the reservation exists to protect. An earlier revision of this comment asserted the
        // opposite — "it can never be the binding constraint … the dispatch loop keeps ITS OWN offered
        // tasks" — and "its own" was the defect. Measured: two callers at width 3 offered six tasks
        // against a budget of four.
        //
        // A worker cannot enforce it by declining after being spawned. An async function that returns
        // before its first `await` runs synchronously to its `finally`, so the worker count is already
        // back down when control reaches this loop — which respawns it, and the pair spins without
        // bound. That shape reads from outside as a hang; it is measured here as the reason admission
        // must decide BEFORE a worker exists.
        const maxTasks = resolveEmbeddingTaskBudget(aiConfig.localModels.embedding.parallel);

        while (this.#openAiCompatiblePostQueueWorkers < maxTasks && this.#openAiCompatiblePostQueue.length > 0) {
            const {index} = this.#peekNextOpenAiCompatiblePostQueueIndex();

            if (index === -1) break;

            const weight = this.#openAiCompatibleTaskWeight(this.#openAiCompatiblePostQueue[index]);

            // `inFlightTasks === 0` always admits, so a post wider than the whole budget still makes
            // forward progress instead of livelocking. A slot withheld here returns the moment a
            // settling worker re-drains.
            if (this.#openAiCompatibleInFlightTasks > 0 &&
                this.#openAiCompatibleInFlightTasks + weight > maxTasks) {
                break
            }

            this.#openAiCompatiblePostQueueWorkers++;
            this.#runOpenAiCompatiblePostQueueWorker()
        }
    }

    /**
     * @summary Drains queued posts until the queue empties, then retires.
     * @returns {Promise<void>}
     * @private
     */
    /**
     * @summary The number of provider tasks one queued post represents.
     * @param {Object} task Queued post.
     * @returns {Number} One per input, minimum one.
     * @private
     */
    #openAiCompatibleTaskWeight(task) {
        return Array.isArray(task?.inputData) ? Math.max(task.inputData.length, 1) : 1
    }

    async #runOpenAiCompatiblePostQueueWorker() {
        try {
            while (this.#openAiCompatiblePostQueue.length > 0) {
                const {index: taskIndex, bypassedBatchIndex} = this.#peekNextOpenAiCompatiblePostQueueIndex();

                if (taskIndex === -1) break;

                const weight = this.#openAiCompatibleTaskWeight(this.#openAiCompatiblePostQueue[taskIndex]);

                // The drain admitted this worker once. A worker looping to a SECOND task re-checks,
                // because capacity may have been taken since. Exiting is safe and cannot spin: this
                // worker has already awaited, so its count is live when the drain next runs.
                if (this.#openAiCompatibleInFlightTasks > 0 &&
                    this.#openAiCompatibleInFlightTasks + weight >
                        resolveEmbeddingTaskBudget(aiConfig.localModels.embedding.parallel)) {
                    break
                }

                this.#commitOpenAiCompatibleSelection(bypassedBatchIndex);

                const task = this.#openAiCompatiblePostQueue.splice(taskIndex, 1)[0];

                task.markDispatched();
                this.#openAiCompatibleInFlightTasks += weight;

                const startedAt = Date.now();

                task.lifecycle.onStarted({startedAt});

                try {
                    const result = await this.#postOpenAiCompatible(task.inputData, task.options);

                    this.#openAiCompatibleInFlightTasks -= weight;
                    this.#drainOpenAiCompatiblePostQueue();
                    task.lifecycle.onSettled({completedAt: Date.now(), success: true});
                    task.resolve(result);
                } catch (err) {
                    this.#openAiCompatibleInFlightTasks -= weight;
                    this.#drainOpenAiCompatiblePostQueue();
                    task.lifecycle.onSettled({completedAt: Date.now(), success: false});

                    // The queue task — not each transport attempt — owns final failure, so by the
                    // time this catch runs `#postOpenAiCompatible` has already exhausted its
                    // contention/unload retries. This is therefore the FINAL logical timeout, and it
                    // is the last point before `while` selects another task and dispatches into the
                    // provider that just failed. Notify before `reject` so the caller's circuit is
                    // open before any continuation of theirs can observe the rejection.
                    notifyProviderTimeout({
                        error            : err,
                        onProviderTimeout: task.options?.onProviderTimeout,
                        providerLabel    : 'OpenAI-compatible'
                    });

                    task.reject(err);
                }
            }
        } finally {
            this.#openAiCompatiblePostQueueWorkers--;
        }
    }

    /**
     * @summary Selects the next OpenAI-compatible queue item without starving either priority lane.
     *
     * One interactive item may overtake an already-waiting batch item. If both lanes remain queued,
     * the next selection admits the oldest batch before another interactive item can overtake it.
     * The counter advances on selections rather than elapsed time, keeping the fairness guarantee
     * deterministic and local to the queue that owns admission.
     *
     * @returns {Number}
     * @private
     */
    #peekNextOpenAiCompatiblePostQueueIndex() {
        let firstBatchIndex       = -1,
            firstInteractiveIndex = -1;

        for (let index = 0; index < this.#openAiCompatiblePostQueue.length; index++) {
            const item = this.#openAiCompatiblePostQueue[index];

            if (item.priority === 'batch' && firstBatchIndex === -1) {
                firstBatchIndex = index;
            } else if (item.priority === 'interactive' && firstInteractiveIndex === -1) {
                firstInteractiveIndex = index;
            }
        }

        if (firstBatchIndex === -1 || firstInteractiveIndex === -1) {
            return {index: firstInteractiveIndex === -1 ? firstBatchIndex : firstInteractiveIndex, bypassedBatchIndex: -1};
        }

        const oldestBatch = this.#openAiCompatiblePostQueue[firstBatchIndex];

        if (oldestBatch.interactiveBypassCount > 0) {
            return {index: firstBatchIndex, bypassedBatchIndex: -1};
        }

        // The bypass is a CONSEQUENCE of dispatching the interactive item, so it is reported here and
        // applied by {@link #commitOpenAiCompatibleSelection} only when that dispatch actually happens.
        // Previously the increment lived here, which made selection a state change: any caller that
        // looked at what WOULD be selected — admission control needs exactly that, to weigh it —
        // silently consumed a batch item's one bypass without dispatching anything.
        return {index: firstInteractiveIndex, bypassedBatchIndex: firstBatchIndex};
    }

    /**
     * @summary Applies the fairness bookkeeping for a selection that is actually being dispatched.
     *
     * Split from {@link #peekNextOpenAiCompatiblePostQueueIndex} so that observing the queue is free
     * and only dispatch costs a bypass. The pair is the reason admission can weigh a candidate before
     * admitting it without corrupting interactive-first fairness.
     * @param {Number} bypassedBatchIndex Index of the batch item an interactive item overtook, or -1.
     * @returns {void}
     * @private
     */
    #commitOpenAiCompatibleSelection(bypassedBatchIndex) {
        if (bypassedBatchIndex !== -1) {
            this.#openAiCompatiblePostQueue[bypassedBatchIndex].interactiveBypassCount++
        }
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

        const helper = await import('../graph/providerReadinessHelper.mjs');
        throwIfEmbeddingAborted(signal, operationLabel);

        if (this.#shouldAssertOpenAiCompatibleEmbeddingContext()) {
            return helper.fetchLmsLoadedModels({timeoutMs, signal});
        }

        // Provider-shaped fallback: `GET /v1/models`, which every OpenAI-compatible server answers.
        // Ids only — no `contextLength`, which is precisely why the context assertion stays behind
        // the LM Studio gate. Normalised to the same row shape so the identity comparison below is
        // one code path rather than two.
        const ids = await helper.fetchOpenAiCompatibleModelIds({
            host: aiConfig.openAiCompatible.host,
            timeoutMs
        });

        // `null` means UNANSWERABLE; `[]` means answered-and-empty. Only this source can be
        // unanswerable-while-succeeding: `/v1/models` is conventional rather than guaranteed, so a
        // proxy or minimal runtime can return 200 carrying nothing enumerable, and zero rows cannot
        // distinguish "serves no models" from "does not answer this question".
        //
        // The distinction is scoped to this source deliberately. An empty `lms ps` is a real
        // negative on a surface we own, and an injected test probe returning `[]` is an explicit
        // statement that nothing is resident — collapsing all three would silently retire the
        // not-resident preflight everywhere.
        return ids.length > 0 ? ids.map(id => ({id})) : null;
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
     * @summary Whether the served model IDENTITY can be verified on this endpoint. Provider-shaped.
     *
     * Distinct from {@link #isLmStudioEmbeddingLane}, and the split is the whole point. Two different
     * assertions used to share one vendor gate:
     *
     * - **Identity** — is the configured model the one actually being served? Answerable on ANY
     *   OpenAI-compatible endpoint via `GET /v1/models`.
     * - **Context** — is the loaded context window large enough? Answerable only from `lms ps`,
     *   because `/v1/models` reports no context length.
     *
     * Gating both behind the LM Studio port meant identity verification existed for the developer
     * laptop and not for the deployment — the inverse of where it is needed. A production plane then
     * served `Qwen3-Embedding-8B-Q4_K_M` while configured for `qwen3-embedding-0.6b` across two
     * deploys, every container healthy, the only symptom slow embeddings read as a performance
     * problem.
     *
     * Widening the SHARED gate instead of splitting it would have been worse than the gap: the
     * context assertion would then fire on llama.cpp, where `contextLength` is structurally unknown,
     * and refuse every embed with a spurious unknown-context error.
     *
     * @returns {Boolean}
     * @private
     */
    #shouldAssertOpenAiCompatibleEmbeddingIdentity() {
        if (this.openAiCompatibleLoadedModelsProbe) {
            return true;
        }
        if (Neo.config.unitTestMode) {
            return false;
        }

        return Boolean(aiConfig.openAiCompatible.host && aiConfig.openAiCompatible.embeddingModel);
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
        // The probe seam deliberately does NOT answer this one. It means "use this instead of the
        // real fetch", not "you are LM Studio" — and while both assertions shared a gate the two
        // readings were indistinguishable. Now that context enforcement is lane-specific, letting an
        // injected probe imply the LMS lane would demand a `contextLength` from every seam that
        // supplies only ids, and refuse the embed for a context nobody ever claimed to observe.
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

        if (!this.#shouldAssertOpenAiCompatibleEmbeddingIdentity()) {
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

            // The LM Studio lane keeps refusing: `lms ps` is orchestrator-owned, so a probe failure
            // there means the lane we manage is not answering, and proceeding would embed blind
            // against a provider we are supposed to control.
            if (this.#shouldAssertOpenAiCompatibleEmbeddingContext()) {
                throw new Error(`TextEmbeddingService: unable to verify LM Studio embedding context for '${model}': ${error.message}`);
            }

            // Every other OpenAI-compatible endpoint degrades to UNKNOWN instead. `/v1/models` is
            // conventional, not guaranteed — vLLM, a CI fixture server or a proxy may not serve it,
            // and a transient 503 must not take embedding down. An identity check that cannot run is
            // an unanswered question, never a confirmed match, and never grounds for refusing work
            // that was previously allowed: turning an observability gap into an outage is a worse
            // failure than the gap.
            //
            // A probe that DOES answer and disagrees still throws — that path is below, and it is
            // the one this ticket exists for.
            return null;
        }

        throwIfEmbeddingAborted(signal, operationLabel);

        // `null` is the UNANSWERABLE signal from the provider-shaped probe (see its return site).
        // Distinct from `[]`, which is a real "nothing is resident" from a source that can say so.
        // An identity check that cannot run is an unanswered question, never a confirmed match.
        if (loadedModels === null) {
            return null;
        }

        // Implicit-tag tolerant, because this compare is NOT LM Studio-only any more: the identity
        // gate now reaches every OpenAI-compatible endpoint, and the lane's default host is
        // byte-identical to `ollama.host`. Ollama reports an untagged pull as `name:latest` and
        // `/v1/models` returns ids verbatim, so an exact compare refuses a model that is loaded and
        // serving, and it is the shipped default rather than an exotic host. The rule stays directional: a
        // requirement that names a tag still gets an exact compare.
        const {satisfiesRequiredModelIdOnOpenAiCompatibleLane} = await import('../graph/providerReadinessHelper.mjs');

        throwIfEmbeddingAborted(signal, operationLabel);

        const loadedModel = loadedModels.find(item => satisfiesRequiredModelIdOnOpenAiCompatibleLane(model, item.id));

        if (!loadedModel) {
            // The lane, not the vendor: this path serves LM Studio only when the context gate is on,
            // and naming LM Studio to an operator running Ollama is the "confident wrong instruction"
            // this ticket's own config JSDoc argues against.
            const lane        = this.#shouldAssertOpenAiCompatibleEmbeddingContext() ? 'LM Studio' : 'OpenAI-compatible',
                  observedIds = loadedModels.map(item => item.id).filter(Boolean).slice(0, 5).join(', ') || 'none',
                  error       = markEmbeddingModelNotResidentError(
                      new Error(`TextEmbeddingService: ${lane} embedding model '${model}' is not resident under its configured identifier; observed=${observedIds}`)
                  );

            // The preflight rejection is the OTHER origin of "not resident", and it carries the same
            // disposition field so a consumer never has to infer the cause from which throw site it
            // came out of. Absent here, only the post-request path would be classified and this one
            // would read as unclassified rather than as the configuration fault it plainly is.
            error.residencyDisposition = EMBEDDING_RESIDENCY_NEVER_RESIDENT;

            throw error
        }
        // Context enforcement is LM-Studio-only BY EVIDENCE, not by preference: `lms ps` reports the
        // loaded context window and `GET /v1/models` does not. On any other OpenAI-compatible lane
        // the number is structurally unknown, so demanding it here would refuse every embed with a
        // spurious unknown-context error — turning an observability fix into an outage. Identity has
        // already been asserted above and is the half that catches a wrong model.
        if (this.#shouldAssertOpenAiCompatibleEmbeddingContext() && !Neo.isNumber(loadedModel.contextLength)) {
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
     * @summary Enforces the loaded LM Studio context contract and refuses current-input overflow.
     * @param {String|String[]} inputData The text or array of texts to embed.
     * @param {{configuredContextLength: Number, loadedModel: Object, model: String}|null} runtime LMS runtime metadata.
     * @returns {void}
     * @private
     */
    #assertOpenAiCompatibleEmbeddingContext(inputData, runtime) {
        if (!runtime) {
            return;
        }

        // An unknown loaded context is UNKNOWN, and enforcement declines rather than guesses. Only
        // `lms ps` reports a context window; a provider-shaped `/v1/models` row carries an id and
        // nothing else, so this runs on rows where the number was never observable.
        //
        // Stated explicitly rather than left to fall through: every comparison below happens to be
        // false against `undefined`, so the correct behaviour is currently an accident of JS
        // coercion. One change to `isEmbeddingContextBelowSafeBand`'s handling of a non-number and
        // this silently starts refusing every embed on llama.cpp — a spurious outage produced by a
        // helper that never knew it had become load-bearing.
        if (!Neo.isNumber(runtime.loadedModel?.contextLength)) {
            return;
        }

        const
            {configuredContextLength, loadedModel, model} = runtime,
            safeProcessingLimitTokens                     = aiConfig.localModels.embedding.safeProcessingLimitTokens,
            estimate                                      = this.#getOpenAiCompatibleInputEstimate(inputData);

        const belowConfiguredContext = loadedModel.contextLength < configuredContextLength,
              belowSafeBand          = isEmbeddingContextBelowSafeBand(loadedModel.contextLength, safeProcessingLimitTokens),
              contextInsufficient    = belowConfiguredContext || belowSafeBand,
              inputExceedsContext    = estimate.inputTokensEstimate > loadedModel.contextLength;

        if (contextInsufficient || inputExceedsContext) {
            if (!contextInsufficient && inputExceedsContext) {
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

            logger.warn('[TextEmbeddingService] Refusing OpenAI-compatible embedding after LM Studio context verification failed.', {
                model,
                loadedContextLength: loadedModel.contextLength,
                configuredContextLength,
                safeProcessingLimitTokens,
                inputTokensEstimate: estimate.inputTokensEstimate
            });

            const error = new Error(`TextEmbeddingService: LM Studio embedding context too small for '${model}' (loaded=${loadedModel.contextLength}, configured>=${configuredContextLength}, safeProcessingLimitTokens=${safeProcessingLimitTokens}, inputEstimate=${estimate.inputTokensEstimate})`);

            throw contextInsufficient
                ? markEmbeddingContextInsufficientError(error)
                : markEmbeddingInputTruncatedError(error)
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
                        const httpError = new Error(`openAiCompatible embedding error HTTP ${res.statusCode}: ${body} [endpoint=${parsedUrl.href}, model='${embeddingModel}']`);

                        if (isStructuredEmbeddingContextOverflow(res.statusCode, body)) {
                            markEmbeddingInputTruncatedError(httpError)
                        }

                        rejectOnce(httpError);
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
                req.write(JSON.stringify({model: embeddingModel, input: inputData}));
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
     * @summary Attempts to admit one native Ollama embedding request without yielding.
     *
     * The cap is read from the SSOT at the use site on every admission, not captured once, so an
     * operator override takes effect on the next request rather than at the next process start.
     *
     * The ConfigProvider leaf rejects invalid persisted/env values. This use-site backstop also covers
     * direct runtime mutation: a fractional cap would report one number while admitting its ceiling,
     * and a non-finite cap can turn the queue into either an unbounded path or a permanent stall.
     * @returns {Boolean} True when the caller acquired a slot.
     * @private
     */
    #tryAcquireOllamaEmbeddingSlot() {
        const cap = aiConfig.ollama.maxInFlightEmbeddings;

        if (!Number.isInteger(cap) || cap < 1) {
            throw new Error(`TextEmbeddingService: ollama.maxInFlightEmbeddings must be a positive integer, got ${cap}`);
        }

        if (this.#ollamaInFlightEmbeddings < cap) {
            this.#ollamaInFlightEmbeddings++;
            return true
        }

        return false
    }

    /**
     * @summary Wakes the longest-waiting native Ollama embedding caller, if any.
     * @returns {void}
     * @private
     */
    #wakeNextOllamaEmbeddingWaiter() {
        const waiter = this.#ollamaEmbeddingWaiters.shift();

        if (!waiter) return;

        waiter.cleanup();
        waiter.resolve()
    }

    /**
     * @summary Waits for the next admission retry while keeping caller cancellation live.
     * @param {AbortSignal|undefined} signal Caller-owned cancellation signal.
     * @param {String} operationLabel Bounded diagnostic label.
     * @param {Object} operation Mutable local-phase observability record.
     * @returns {Promise<void>}
     * @private
     */
    #waitForOllamaEmbeddingWake(signal, operationLabel, operation) {
        return new Promise((resolve, reject) => {
            let settled = false;

            const waiter  = {};
            const cleanup = () => signal?.removeEventListener('abort', onAbort);
            const settle  = (fn, value) => {
                if (settled) return;

                settled = true;
                cleanup();
                fn(value)
            };
            const onAbort = () => {
                const index = this.#ollamaEmbeddingWaiters.indexOf(waiter);

                if (index !== -1) {
                    this.#ollamaEmbeddingWaiters.splice(index, 1)
                }

                const error = getEmbeddingAbortError(signal, operationLabel);

                operation.callerAbortError = error;
                operation.phase            = 'caller-aborted-awaiting-admission';
                settle(reject, error)
            };

            waiter.cleanup = cleanup;
            waiter.resolve = () => settle(resolve);

            this.#ollamaEmbeddingWaiters.push(waiter);
            signal?.addEventListener('abort', onAbort, {once: true});

            if (signal?.aborted) onAbort()
        })
    }

    /**
     * @summary Waits for a slot. Only reached when the cap actually binds.
     *
     * Split from the synchronous attempt above deliberately. An `await` before dispatch — even one
     * that resolves immediately — hands control back to the caller, and a caller that aborts on the
     * next line then cancels the request BEFORE the provider is reached. The provider-neutral cancellation
     * contract asserts that an uncontended call reaches dispatch before that next-line abort; an
     * unconditional await broke it by preventing dispatch entirely. Admission must be FREE when there
     * is room, or it silently re-times every caller's cancellation.
     * @param {AbortSignal|undefined} signal Caller-owned cancellation signal.
     * @param {String} operationLabel Bounded diagnostic label.
     * @param {Object} operation Mutable local-phase observability record.
     * @returns {Promise<void>}
     * @private
     */
    async #awaitOllamaEmbeddingSlot(signal, operationLabel, operation) {
        // Re-check per iteration rather than trusting the value that queued us. A raised cap does
        // NOT proactively wake anyone — nothing watches the config — but the next admission
        // attempt, whether a fresh caller or a woken waiter, reads the current number.
        let consumedWake = false;

        while (true) {
            let admitted;

            try {
                throwIfEmbeddingAborted(signal, operationLabel, operation);
                admitted = this.#tryAcquireOllamaEmbeddingSlot();
            } catch (error) {
                // A caller can abort after a release selected it but before its retry microtask runs.
                // It consumed a wake without acquiring the slot, so hand that wake to the next waiter.
                // The same rule covers a queued caller that wakes into a newly-invalid cap.
                if (consumedWake) this.#wakeNextOllamaEmbeddingWaiter();
                throw error;
            }

            if (admitted) return;

            consumedWake = false;
            await this.#waitForOllamaEmbeddingWake(signal, operationLabel, operation);
            consumedWake = true;
        }
    }

    /**
     * @summary Releases one native Ollama embedding slot and wakes the longest-waiting caller.
     *
     * Wired to both provider-settlement arms, so an aborted or thrown provider request returns its slot.
     * A release that only ran on success would leak the cap down to zero after N failures and stall the
     * path completely — turning an admission control into an outage, silently.
     * @private
     */
    #releaseOllamaEmbeddingSlot() {
        this.#ollamaInFlightEmbeddings--;
        this.#wakeNextOllamaEmbeddingWaiter()
    }

    /**
     * @summary Runs native Ollama embedding while separating caller abort from provider settlement.
     * @param {String|String[]} inputData Text input to embed.
     * @param {String} operationLabel Safe diagnostic label for timeout errors.
     * @param {AbortSignal|undefined} signal Upstream cancellation signal.
     * @param {Function|undefined} onProviderTimeout Synchronous provider-timeout circuit hook.
     * @param {Object} operation Mutable local-phase observability record.
     * @param {Object|null} providerActivityRecorder Best-effort telemetry sink.
     * @param {Object} providerActivity Bounded provider activity descriptor.
     * @param {String[]|null} [identityTexts=null] Batch identities to record after provider validation.
     * @returns {Promise<Object>}
     * @private
     */
    async #embedOllama(inputData, operationLabel, signal, onProviderTimeout, operation, providerActivityRecorder, providerActivity, identityTexts = null) {
        const
            provider         = this.#getOllamaProvider(),
            dispatchModel    = provider.embeddingModel || provider.modelName || 'unknown',
            requestTimeoutMs = this.#getOllamaEmbeddingTimeoutMs(),
            providerOutcome  = {state: 'pending'};

        // The activity row opens BEFORE admission, because the wait is part of what happened.
        //
        // This path used to reach the provider through `observeUnqueuedProviderActivity`, which
        // stamps `queueDisposition: 'not-applicable'` and `enqueuedAt === startedAt`. Once native
        // admission landed the queue became real, and the observation kept describing it as absent —
        // so a caller that waited behind the cap published a null wait, and an operator staring at
        // provider metrics could not separate "the provider is slow" from "Neo made it wait". Those
        // demand opposite responses: raise the model's resources, or raise the cap. That is the
        // discrimination a starved external plane needed and did not have.
        //
        // `neo-queued` for BOTH branches, including the uncontended one, on purpose: a disposition
        // that only appears under contention makes the queue look like it materializes at load,
        // rather than being a property of the path. The uncontended call records a measured ~zero
        // wait, which is a fact, not an absence.
        const lifecycle = createProviderActivityLifecycle({
            recorder        : providerActivityRecorder,
            activity        : {...providerActivity, model: dispatchModel},
            queueDisposition: 'neo-queued'
        });

        lifecycle.onEnqueued({enqueuedAt: Date.now()});

        // Admission before the provider call. The uncontended path takes the synchronous branch and
        // does NOT await — see `#awaitOllamaEmbeddingSlot` for why an unconditional await silently
        // re-times every caller's cancellation.
        try {
            if (!this.#tryAcquireOllamaEmbeddingSlot()) {
                operation.phase = 'awaiting-admission';
                await this.#awaitOllamaEmbeddingSlot(signal, operationLabel, operation);
            }
        } catch (error) {
            // `queue`, NOT an invented `admission`. The shared ledger admits only
            // `provider | queue | unknown` and normalizes anything else to `unknown` — so a bespoke
            // stage does not fail, it silently degrades to the least informative value. The
            // openAiCompatible queued-abort at :649 already uses `queue`; one vocabulary, not two.
            //
            // A caller abandoned WHILE WAITING never reached the provider, so the row must settle
            // here. Without this the abort leaves an opened row with no completion — an in-flight
            // figure that only grows, which is a worse instrument than none.
            lifecycle.onSettled({completedAt: Date.now(), failureStage: 'queue', success: false});
            throw error;
        }

        // The slot is held from here. Start stamps the boundary between waiting and executing.
        lifecycle.onStarted({startedAt: Date.now()});

        try {
            operation.phase = 'in-flight';
            throwIfEmbeddingAborted(signal, operationLabel, operation);
        } catch (error) {
            // Already-aborted callers must return the slot they just took, or an abort storm walks
            // the cap down to zero and stalls the path.
            this.#releaseOllamaEmbeddingSlot();
            lifecycle.onSettled({completedAt: Date.now(), failureStage: 'queue', success: false});
            throw error;
        }

        if (identityTexts !== null) {
            recordEmbeddingSubmissions(providerActivityRecorder, identityTexts);
        }

        const recordProviderFailure = error => {
            providerOutcome.state = 'rejected';
            if (error?.code === PROVIDER_TIMEOUT_CODE) {
                this.#emitOllamaEmbeddingTimeoutFriction(inputData, requestTimeoutMs, error);
            }
        };
        // Same task shape `observeUnqueuedProviderActivity` ran, settled against the lifecycle opened
        // above so the row carries the admission wait it actually incurred.
        const providerPromise = (async () => {
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
                lifecycle.onSettled({completedAt: Date.now(), success: false});
                throw error;
            }

            rawProviderPromise.then(
                () => providerOutcome.state = 'fulfilled',
                recordProviderFailure
            );

            try {
                const result = await rawProviderPromise;

                lifecycle.onSettled({completedAt: Date.now(), success: true});
                return result
            } catch (error) {
                lifecycle.onSettled({completedAt: Date.now(), success: false});
                throw error
            }
        })();

        // Release when the PROVIDER settles, NOT when the caller does. This path deliberately lets a
        // caller settle on abort while its provider request keeps running — so releasing on caller
        // completion would free a slot whose request is still in flight, and an abort storm would put
        // N concurrent requests through a cap of 1. Both handlers attached, so this derived promise
        // cannot reject unhandled.
        providerPromise.then(
            () => this.#releaseOllamaEmbeddingSlot(),
            error => {
                try {
                    // Open a caller-owned sweep circuit BEFORE releasing the provider slot. Abort
                    // listeners synchronously remove never-dispatched waiters from the admission
                    // queue; releasing first would let the next repository acquire the slot behind
                    // work whose provider-side settlement is not known to imply compute idleness.
                    //
                    // The same helper runs at the OpenAI-compatible queue's final rejection, so both
                    // lanes share one ordering guarantee. Note this fires on the full typed-timeout
                    // set rather than `PROVIDER_TIMEOUT` alone:
                    // a native request that dies at the socket layer (`ETIMEDOUT`/`ESOCKETTIMEDOUT`)
                    // was previously invisible to the circuit here, which is the same defect in the
                    // native path that this ticket fixes in the queued one.
                    notifyProviderTimeout({error, onProviderTimeout, providerLabel: 'Native Ollama'});
                } finally {
                    this.#releaseOllamaEmbeddingSlot();
                }
            }
        );

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
     * Sending a whole KB-sync batch as one provider call can monopolize the engine for minutes, so the
     * batch is divided into spans and the lease bound is consulted between them — that is what lets an
     * interactive single embedding enter the queue rather than waiting out the batch.
     *
     * Capacity is accounted in TASKS, not requests: one multi-input POST becomes one task per input, so
     * a batch's offered work is `concurrency × width`. `resolveDispatchPlan` resolves both against the
     * declared budget and holds one task back where the budget allows it, which is where the
     * interactive-headroom guarantee lives. A budget of one reserves nothing — there is nothing to
     * reserve from — and keeps its configured width unchanged.
     *
     * @param {String[]} texts The texts to embed.
     * @param {Object} options Abort and observability context.
     * @param {Function} [options.onProviderTimeout] Caller-owned synchronous provider-timeout circuit
     *     hook, carried to the queue task so the drain can notify before selecting another task.
     * @param {Function} [options.shouldYield] Cooperative heavy-maintenance-lease yield predicate.
     * @returns {Promise<number[][]>}
     * @private
     */
    async #embedOpenAiCompatibleBatch(texts, options) {
        const {
            onProviderTimeout,
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

        // The provider's capacity unit is a TASK, not a request: one multi-input POST expands to one
        // task per input, so offered work is `concurrency × width`. Width and concurrency are still
        // separate contracts — width bounds what one failure or yield costs, concurrency bounds
        // throughput — but they are jointly constrained by the same budget, which is why one function
        // resolves both. The predecessor computed a width alone and could not express the constraint;
        // it also fell through unclamped at `parallel <= 1`, the shipped default, where a configured
        // width of 5 offered five tasks against one declared slot.
        const taskBudget = resolveEmbeddingTaskBudget(aiConfig.localModels.embedding.parallel),
              plan       = resolveDispatchPlan({
                  textCount   : texts.length,
                  requestWidth: batchEmbeddingChunkSize,
                  taskBudget
              }),
              {spans, width: chunkSize, concurrency: maxInFlight} = plan,
              requestTimeoutMs = assertPositiveTimeoutMs(batchEmbeddingTimeoutMs, 'openAiCompatible.batchEmbeddingTimeoutMs'),
              totalChunkCount  = spans.length,
              // Parallel to `spans`. A COUNT of completions cannot locate them once they arrive out of
              // order, and locating them is the entire carry problem — see `resolveCompletedPrefix`.
              completedFlags   = new Array(totalChunkCount).fill(false),
              inFlight         = new Set(),
              data             = [];

        let nextSpanIndex = 0,
            firstError    = null,
            yielded       = false;

        /**
         * Issues one span and registers its settlement. Rejections are captured rather than thrown so
         * the pool can drain: abandoning in-flight requests would discard provider work that has
         * already been paid for, which is the same waste the carry exists to prevent.
         * @param {Number} spanIndex
         * @returns {Promise}
         */
        const dispatchSpan = spanIndex => {
            const span  = spans[spanIndex],
                  chunk = texts.slice(span.offset, span.offset + span.count);

            recordEmbeddingSubmissions(providerActivityRecorder, chunk);

            const settled = this.#enqueueOpenAiCompatiblePost(chunk, {
                unloadRetriesLeft: unloadRetryCount,
                requestTimeoutMs,
                signal,
                operationLabel,
                onProviderTimeout,
                operation,
                providerActivity,
                providerActivityRecorder
            }, 'batch').then(result => {
                data.push(...(result.data || []).map(item => ({
                    ...item,
                    index: span.offset + item.index
                })));

                completedFlags[spanIndex] = true
            }).catch(err => {
                // Producer attribution for the FAILED request. A provider timeout names the whole
                // multi-input POST, so the consumer's undeliverable classification must know which
                // input span was in flight — assigning the failure to the first batch member when the
                // request held five is how an innocent neighbour inherits a monster's strikes. Under
                // concurrency this is why the span travels with the error rather than being re-derived
                // from a loop variable that has already moved on.
                err.failedTextOffset = span.offset;
                err.failedTextCount  = span.count;

                // FIRST error wins. A later failure describes a request issued after the lane was
                // already failing, and reporting it would name a span the caller did not stop on.
                firstError ??= err
            }).finally(() => {
                inFlight.delete(settled)
            });

            inFlight.add(settled);

            return settled
        };

        while (nextSpanIndex < totalChunkCount && !firstError && !yielded) {
            throwIfEmbeddingAborted(signal, operationLabel);

            // Cooperative heavy-maintenance-lease yield-point: between ADMISSIONS, and never before at
            // least one span has landed — the same forward-progress guarantee `VectorService.embedChunks`
            // makes between its own batches, so at least one span always lands per acquisition and the
            // pair cannot livelock.
            //
            // The consultation has to happen HERE and not one frame up, because the interval between two
            // consultations up there is `maxRetries * ceil(batchSize / chunkSize) * (1 + unloadRetryCount)
            // * batchEmbeddingTimeoutMs` — 16h40m at stock leaves, against a 30-minute `maxActiveHoldMs`.
            // A cooperative bound whose checkpoint interval exceeds the bound is not a bound.
            //
            // Keyed on the CARRYABLE prefix rather than on any completion: a span that landed after a
            // hole is not durable, so treating it as forward progress would let an acquisition yield
            // having banked nothing and re-embed the same span forever.
            if (resolveCompletedPrefix({spans, completedFlags}).chunkCount > 0 && shouldYield?.()) {
                yielded = true;
                break
            }

            while (inFlight.size < maxInFlight && nextSpanIndex < totalChunkCount && !firstError) {
                operation.phase = 'batch-chunk';
                dispatchSpan(nextSpanIndex++);

                if (batchEmbeddingYieldMs > 0 && nextSpanIndex < totalChunkCount) {
                    operation.phase = 'batch-yield';
                    await waitForOpenAiCompatibleBatchYield(batchEmbeddingYieldMs, signal, operationLabel)
                }
            }

            if (inFlight.size > 0) {
                await Promise.race([...inFlight])
            }
        }

        // Drain before reporting anything. An outstanding request may still complete and extend the
        // carryable prefix, and its work is already paid for.
        while (inFlight.size > 0) {
            await Promise.race([...inFlight])
        }

        const carried = resolveCompletedPrefix({spans, completedFlags});

        // Completed-but-unbindable work is REPORTED, never dropped in silence: the consumer binds by
        // position and the ordering guard refuses a sparse carry, so a span landing after a hole cannot
        // be handed over — and a lane quietly re-purchasing it on every retry is the failure this leaf
        // is about. The count rides the thrown envelope AND the operation record, because an internal
        // field no consumer reads is not a report.
        //
        // A zero is an assertion that nothing was lost, so it is set unconditionally rather than only
        // when non-zero: an absent field cannot distinguish "no loss" from "never measured".
        operation.droppedCompletedChunkCount = carried.droppedChunkCount;

        // PRECEDENCE: a provider failure or caller abort outranks a cooperative yield vote observed
        // earlier in the same batch. The yield is a decision to stop politely; a failure is the reason
        // the batch cannot continue at all, and reporting the polite version would hand the caller a
        // resumable checkpoint for a lane that is actually broken. Evaluated after the drain, so a
        // failure surfacing while in-flight requests settled still wins.
        if (firstError) {
            // Work conservation on the FAILURE path. The ORIGINAL error is decorated rather than
            // replaced: its `code` is what the caller's timeout/circuit classification reads.
            firstError.droppedCompletedChunkCount = carried.droppedChunkCount;

            if (carried.chunkCount > 0) {
                try {
                    // Bind BEFORE assigning anything. The guard throws on an unprovable prefix, and a
                    // field-by-field decoration would already have written `completedTextCount` by then
                    // — handing the consumer a count with no vectors, which it slices onto ids anyway.
                    const embeddings = toOrderedEmbeddings(
                        data.filter(entry => entry.index < carried.textCount),
                        carried.textCount
                    );

                    firstError.completedChunkCount = carried.chunkCount;
                    firstError.totalChunkCount     = totalChunkCount;
                    firstError.completedTextCount  = carried.textCount;
                    firstError.embeddings          = embeddings
                } catch {
                    // Positional binding could not be proven; the failure travels uncarried.
                }
            }

            throw firstError
        }

        if (yielded) {
            operation.phase = 'lease-yield';

            const yieldError = createEmbeddingBatchYieldError({
                completedChunkCount: carried.chunkCount,
                totalChunkCount,
                completedTextCount : carried.textCount,
                data               : data.filter(entry => entry.index < carried.textCount)
            });

            yieldError.droppedCompletedChunkCount = carried.droppedChunkCount;

            throw yieldError
        }


        return toOrderedEmbeddings(data, texts.length);
    }

    /**
     * @summary Creates one embedding vector for interactive write/query paths.
     *
     * The OpenAI-compatible branch uses the contention retry budget because single embeddings are
     * latency-sensitive (`add_memory`, query, frontier) and must fail/retry inside the service before
     * the MCP request envelope times out. A caller that supplies `deadlineMs` alongside its abort
     * signal owns the aggregate deadline instead: that call receives one timed contention attempt
     * whose socket timeout matches the caller budget, so a shorter fixed contention ladder cannot
     * silently replace the declared deadline or multiply abandoned work. Model-residency failures
     * retain their separate bounded retry semantics.
     *
     * @param {String} text The text to embed.
     * @param {String} explicitProvider The embedding provider to use.
     * @param {Object} [options={}] Abort/diagnostic options.
     * @param {Number} [options.deadlineMs] Caller-owned whole-call deadline carried by `options.signal`.
     * @param {AbortSignal} [options.signal] Caller-owned cancellation signal.
     * @param {String} [options.operationLabel] Bounded diagnostic label.
     * @param {String} [options.operationStage='unknown'] Stable low-cardinality stage.
     * @param {Function} [options.onProviderTimeout] Synchronous native-provider timeout hook.
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
                  deadlineMs,
                  operationLabel,
                  operationStage,
                  onProviderTimeout,
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
                const requestText       = await this.#prepareOpenAiCompatibleEmbeddingInput(text, signal, operationLabel, operation);
                const hasCallerDeadline = deadlineMs !== undefined;
                const result            = await this.#enqueueOpenAiCompatiblePost(requestText, {
                    unloadRetriesLeft    : unloadRetryCount,
                    contentionRetriesLeft: hasCallerDeadline ? 0 : contentionRetryCount,
                    requestTimeoutMs     : hasCallerDeadline ? deadlineMs : contentionTimeoutMs,
                    signal,
                    operationLabel,
                    onProviderTimeout,
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
                    onProviderTimeout,
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
     * @param {Function} [options.onProviderTimeout] Synchronous native-provider timeout hook.
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
                  onProviderTimeout,
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
                    onProviderTimeout,
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
                    onProviderTimeout,
                    operation,
                    providerActivityRecorder,
                    providerActivity,
                    texts
                );
                // Length is the ONLY thing binding a native-ollama vector to its input: the response
                // is a parallel array with no per-item index, so length is the only thing binding a
                // vector to its input: a short response would carry input 1's vector at position 0.
                //
                // This is CONTRACT hardening, not corruption prevention, and the distinction was
                // established by probe rather than argument. The vector store refuses a mismatched
                // record set before any API call — ChromaDB 3.5.0 throws on unequal field lengths and
                // on a zero-length list — so a misbound set does not reach a corpus and the sweep
                // already fails. What this adds is WHERE: the failure is named here, against the
                // input count, quoting both numbers, instead of arriving as a store-level complaint
                // about field lengths three layers from the cause. It also covers callers that never
                // terminate at a store.
                //
                // `texts.length` is derived from what was SENT, never from what came back, so a short
                // response cannot define its own correctness. This is the openAiCompatible density
                // guard's twin; that path got it and this one did not.
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

                recordEmbeddingSubmissions(providerActivityRecorder, texts);

                const result = await observeUnqueuedProviderActivity({
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
