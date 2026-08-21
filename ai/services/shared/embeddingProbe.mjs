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
    PROVIDER_TIMEOUT                 : 'provider-timeout',
    // Provider DEATH, not provider failure, and the difference decides what a consumer may conclude.
    // `provider-unreachable` above means the connection never came up — ambient, and the lane may be
    // fine once it does. These four mean the connection came up, the request was accepted, and the
    // process went away mid-answer: an OOM kill leaves exactly this trace. That is direct evidence
    // the lane cannot serve THIS input, which is the one conclusion a recovery probe exists to draw.
    ECONNRESET                       : 'provider-died',
    EPIPE                            : 'provider-died',
    ERR_STREAM_PREMATURE_CLOSE       : 'provider-died',
    UND_ERR_SOCKET                   : 'provider-died'
});

/**
 * @summary Bytes per token for the estimate-space heuristic every admission site already uses.
 * @type {Number}
 */
const BYTES_PER_TOKEN_HEURISTIC = 3;

/**
 * @summary Default share of the admitted band a cadence probe exercises.
 *
 * Not a preference — a cost/discrimination trade priced from the incident that produced this
 * helper. Peak memory for one non-causal embedding request scales with the SQUARE of its token
 * count: measured on the offending image, idle 7.69 GiB and a single 13,980-token embed peaking at
 * 24.14 GiB, so ~16.45 GiB marginal at that size. At fraction `f` of a 28,672-token band the
 * marginal cost is `16.45 × (28672f / 13980)²` GiB — roughly 4.3 GiB at 0.25, and 17.3 GiB at 0.50,
 * which is the size that was doing the killing.
 *
 * 0.25 buys ~354× the discrimination of the constant it replaces (5,309 estimate-tokens against a
 * 44-byte canary) at roughly a quarter of the killing request's marginal footprint.
 *
 * It is a DEFAULT this module owns and every caller may override, not a config leaf: the arithmetic
 * above is deployment-specific, but no deployment has asked to tune it yet, and a leaf nobody sets
 * is a knob to maintain rather than a value to read. What makes that safe is the reporting — the
 * probe carries whichever fraction it used onto its verdict, so `healthy` is never readable as
 * healthy-at-full-size regardless of who chose the number.
 * @type {Number}
 */
export const EMBEDDING_PROBE_BAND_FRACTION = 0.25;

/**
 * @summary Builds a probe input sized from the lane's admitted band, and describes what it built.
 *
 * Pure. The band arrives resolved from the caller's entrypoint — this helper never reads config.
 *
 * A fixed short string is the one input guaranteed not to discriminate: the failure mode is
 * size-dependent, so a probe three orders of magnitude below the workload certifies a property
 * nobody asked about. The generated text is deliberately varied rather than one character repeated,
 * because a run-length-trivial input is exactly what a tokenizer collapses.
 *
 * **`sized: false` is a reading, not a fallback.** When the band cannot be resolved the probe still
 * runs — refusing to probe would remove a signal — but it says it ran unsized, so a consumer can
 * see that `healthy` means "the plane answered" rather than "the lane can serve admitted work".
 * @param {Object} [options]
 * @param {Number|null} [options.estimateBandTokens=null] Estimate-space band from
 *     `resolveEmbeddingAdmissionBand`, or `null` when the deployment declares no resolvable ceiling.
 * @param {Number} [options.fraction=EMBEDDING_PROBE_BAND_FRACTION] Share of the band to exercise.
 * @param {String} [options.marker='neo-embedding-probe'] Leading identifier, so the input is
 *     recognisable in a provider log.
 * @returns {{estimateTokens: Number, fraction: Number|null, input: String, sized: Boolean}}
 */
export function buildEmbeddingProbeInput({
    estimateBandTokens = null,
    fraction           = EMBEDDING_PROBE_BAND_FRACTION,
    marker             = 'neo-embedding-probe'
} = {}) {
    const
        bandResolved     = Number.isFinite(estimateBandTokens) && estimateBandTokens > 0,
        fractionResolved = Number.isFinite(fraction) && fraction > 0 && fraction <= 1;

    if (!bandResolved || !fractionResolved) {
        return {estimateTokens: Math.ceil(marker.length / BYTES_PER_TOKEN_HEURISTIC), fraction: null, input: marker, sized: false}
    }

    const
        estimateTokens = Math.max(1, Math.floor(estimateBandTokens * fraction)),
        targetBytes    = estimateTokens * BYTES_PER_TOKEN_HEURISTIC,
        // Varied by construction: a repeated character compresses in the tokenizer, which would put
        // the real token count far below the estimate the caller thinks it asked for.
        filler         = ' lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';

    let input = marker;

    while (input.length < targetBytes) {
        input += `${filler} ${input.length}`
    }

    return {estimateTokens, fraction, input: input.slice(0, targetBytes), sized: true}
}

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
    probeSize = null,
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
          expectedDimensions = cfg.vectorDimension ?? null,
          // Echoed on EVERY return path, success included. A verdict that does not carry the size it
          // exercised is the defect this parameter exists to close: `healthy` then reads as an
          // unqualified pass over whatever the caller happened to send.
          //
          // Absent when the caller supplies no `probeSize`, rather than emitted as nulls. The other
          // consumers of this helper are healthcheck WRITE CANARIES — deliberately liveness-only,
          // deliberately tiny, and not consumed as readiness for real work. Widening their public
          // payload would be a change to two other services' health contracts to describe a size
          // they never claimed to exercise. The surface that IS read as readiness — the tenant
          // recovery probe's bridge projection — declares the fields explicitly instead, so absence
          // is a reading exactly where a reading is owed.
          sizeBlock          = probeSize
              ? {probeEstimateTokens: probeSize.estimateTokens ?? null, probeBandFraction: probeSize.fraction ?? null, probeSized: probeSize.sized === true}
              : {};

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
                ...sizeBlock,
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
                ...sizeBlock,
                error : `${operationLabel} returned ${dimensions} dimensions; expected ${expectedDimensions}.`
            };
        }

        return {
            status: 'healthy',
            provider,
            dimensions,
            expectedDimensions,
            durationMs,
            ...sizeBlock
        };
    } catch (error) {
        const failure = describeEmbeddingProbeFailure(error);

        return {
            status    : 'failed',
            provider,
            dimensions: null,
            expectedDimensions,
            durationMs: Math.max(0, readNow() - startedAt),
            ...sizeBlock,
            ...failure
        };
    } finally {
        clearTimeout(timeoutId);
    }
}
