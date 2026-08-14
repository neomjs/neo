/**
 * @module ai/services/shared/embeddingProbe
 * @summary Consumer-agnostic embedding probe with a caller-owned deadline and bounded public
 * failure receipts. Service-specific health producers own scheduling, retry policy, and config.
 */

const EMBEDDING_PROBE_PUBLIC_REASON_MAX_LENGTH = 96;

/**
 * @summary Closed provider-code vocabulary admitted onto public embedding-health receipts.
 *
 * This is deliberately distinct from Knowledge Base's durable `KB_*` failure-code translator:
 * this attempt boundary preserves only bounded operational meaning for a health response, while the
 * durable translator mints provenance-safe codes for tenant-repo checkpoints. Keeping the two
 * vocabularies separate prevents a health helper from importing a Knowledge Base persistence policy;
 * listing every admitted provider code here prevents a third, implicit classifier from emerging.
 * @type {Object}
 */
const EMBEDDING_PROBE_FAILURE_CLASSIFICATIONS = Object.freeze({
    ABORT_ERR                        : 'upstream-abort',
    ECONNREFUSED                     : 'provider-unreachable',
    EMBEDDING_MODEL_NOT_RESIDENT     : 'model-not-resident',
    EMBEDDING_PROBE_TIMEOUT          : 'consumer-probe-timeout',
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT: 'provider-timeout',
    PROVIDER_TIMEOUT                 : 'provider-timeout'
});

/**
 * @summary Creates the structural caller-owned deadline error shared by embedding-probe consumers.
 * @param {String} operationLabel Bounded diagnostic label.
 * @param {Number} timeoutMs Consumer-owned deadline in milliseconds.
 * @returns {Error}
 */
export function createEmbeddingProbeTimeoutError(operationLabel, timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new TypeError(`Embedding probe timeoutMs must be a positive number, got ${timeoutMs}`);
    }

    const error = new Error(`${operationLabel} timed out after ${timeoutMs}ms`);
    error.code           = 'EMBEDDING_PROBE_TIMEOUT';
    error.operationLabel = operationLabel;
    error.timeoutMs      = timeoutMs;

    return error;
}

/**
 * @summary Maps provider failures to a bounded public receipt without exposing provider payloads.
 * @param {Error} error Embedding failure observed by the health consumer.
 * @returns {{error: String, errorClassification: String, errorCode: String}}
 */
export function describeEmbeddingProbeFailure(error) {
    const candidateCode = error?.name === 'AbortError' ? 'ABORT_ERR' : error?.code,
          knownCode     = Object.hasOwn(EMBEDDING_PROBE_FAILURE_CLASSIFICATIONS, candidateCode)
              ? candidateCode
              : 'EMBEDDING_PROVIDER_ERROR',
          errorClassification = EMBEDDING_PROBE_FAILURE_CLASSIFICATIONS[knownCode] || 'provider-failure';

    return {
        error    : `${errorClassification}:${knownCode}`.substring(0, EMBEDDING_PROBE_PUBLIC_REASON_MAX_LENGTH),
        errorClassification,
        errorCode: knownCode
    };
}

/**
 * @summary Probes one explicitly supplied embedding path and returns a health-safe result block.
 *
 * This module owns only the attempt boundary: deadline, abort propagation, dimension validation,
 * and bounded failure classification. Consumers own provider/config selection, scheduling,
 * backoff, and the policy that maps observations into their public health envelope. The numeric
 * deadline travels beside the signal so provider clients cannot substitute a shorter aggregate
 * retry horizon; the signal remains the whole-call cancellation authority.
 *
 * @param {Object} options
 * @param {Object} options.cfg Provider config carrying `embeddingProvider` and `vectorDimension`.
 * @param {Function} options.embedText Explicit embedding call seam.
 * @param {String} options.input Probe text.
 * @param {String} options.operationLabel Bounded diagnostic label.
 * @param {Function} [options.now=Date.now] Time source for deterministic tests.
 * @param {Number} options.timeoutMs Max time to wait for the provider.
 * @returns {Promise<{status: String, provider: String, dimensions: Number|null,
 *     expectedDimensions: Number|null, durationMs: Number, error: String|undefined,
 *     errorClassification: String|undefined, errorCode: String|undefined}>}
 */
export async function buildEmbeddingProbeBlock({
    cfg,
    embedText,
    input,
    operationLabel,
    now = Date.now,
    timeoutMs
} = {}) {
    if (!cfg || typeof cfg !== 'object') {
        throw new TypeError('buildEmbeddingProbeBlock: cfg is required');
    }
    if (typeof embedText !== 'function') {
        throw new TypeError('buildEmbeddingProbeBlock: embedText is required');
    }
    if (typeof input !== 'string' || input.length === 0) {
        throw new TypeError('buildEmbeddingProbeBlock: input is required');
    }
    if (typeof operationLabel !== 'string' || operationLabel.length === 0) {
        throw new TypeError('buildEmbeddingProbeBlock: operationLabel is required');
    }

    const readNow            = typeof now === 'function' ? now : () => (typeof now === 'number' ? now : now.getTime()),
          startedAt          = readNow(),
          provider           = cfg.embeddingProvider || 'openAiCompatible',
          expectedDimensions = cfg.vectorDimension ?? null;

    let timeoutId;

    try {
        const controller    = new AbortController(),
              timeoutError  = createEmbeddingProbeTimeoutError(operationLabel, timeoutMs),
              deadline      = new Promise((_, reject) => {
                  timeoutId = setTimeout(() => {
                      reject(timeoutError);
                      controller.abort(timeoutError);
                  }, timeoutMs);
              }),
              embedding    = await Promise.race([
                  Promise.resolve(embedText(input, provider, {
                      deadlineMs: timeoutMs,
                      signal    : controller.signal,
                      operationLabel
                  })),
                  deadline
              ]),
              dimensions = Array.isArray(embedding) ? embedding.length : null,
              durationMs = Math.max(0, readNow() - startedAt);

        if (!Array.isArray(embedding) || embedding.length === 0) {
            return {
                status: 'failed',
                provider,
                dimensions,
                expectedDimensions,
                durationMs,
                error : `${operationLabel} returned no vector.`
            };
        }

        if (expectedDimensions && dimensions !== expectedDimensions) {
            return {
                status: 'failed',
                provider,
                dimensions,
                expectedDimensions,
                durationMs,
                error : `${operationLabel} returned ${dimensions} dimensions; expected ${expectedDimensions}.`
            };
        }

        return {
            status: 'healthy',
            provider,
            dimensions,
            expectedDimensions,
            durationMs
        };
    } catch (error) {
        const failure = describeEmbeddingProbeFailure(error);

        return {
            status    : 'failed',
            provider,
            dimensions: null,
            expectedDimensions,
            durationMs: Math.max(0, readNow() - startedAt),
            ...failure
        };
    } finally {
        clearTimeout(timeoutId);
    }
}
