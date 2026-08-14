/**
 * @module ai/embeddingSafeBand
 * @summary The embedding safe-processing band as ONE shared constant, plus the floor predicate.
 *
 * The band is the operational workload floor every canonical embedding lane must prove it can hold:
 * an undersized lane either refuses valid workload or risks provider-specific truncation semantics.
 * Inputs may be smaller or, when observed context proves room, somewhat larger; this value governs
 * deployment/readiness safety rather than imposing a second request-size cap. The literal lives here exactly once so
 * the `AiConfig` leaf (`localModels.embedding.safeProcessingLimitTokens`) declares its default FROM
 * this module. Operational consumers read the resolved leaf at their entrypoint/use site and inject
 * it into pure helpers; they never treat this default as the active deployment value or create a
 * second environment resolver.
 *
 * 28,672 leaves headroom under the shipped 32,768-token embedding slot context: prompt-template
 * tokens and tokenizer drift consume the difference, and the margin is deliberate — a band equal to
 * the slot context would sit one suffix away from refusal or provider-specific truncation.
 */

/**
 * @summary Canonical default for `localModels.embedding.safeProcessingLimitTokens`.
 * @type {Number}
 */
export const EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS = 28672;

/**
 * @summary Whether a per-slot engine context cannot hold a safe-band input.
 *
 * Pure and fail-closed: non-finite or non-positive contexts report BELOW the band, because a lane whose
 * context is unknown must not wave safe-band inputs through — the failure this predicate exists to
 * prevent may otherwise appear only as provider refusal or provider-specific truncated output.
 * An invalid resolved band is a caller/configuration defect and throws instead of creating a fallback.
 *
 * @param {Number} contextTokensPerSlot Engine per-slot context in tokens.
 * @param {Number} safeProcessingLimitTokens The resolved band.
 * @returns {Boolean}
 */
export function isEmbeddingContextBelowSafeBand(contextTokensPerSlot, safeProcessingLimitTokens) {
    const context = Number(contextTokensPerSlot),
          band    = Number(safeProcessingLimitTokens);

    if (!Number.isSafeInteger(band) || band <= 0) {
        throw new TypeError(`embedding safe-processing limit must be a positive integer, got ${safeProcessingLimitTokens}`)
    }

    return !Number.isSafeInteger(context) || context <= 0 || context < band
}
