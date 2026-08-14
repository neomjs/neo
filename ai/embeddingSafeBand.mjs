/**
 * @module ai/embeddingSafeBand
 * @summary The embedding safe-processing band as ONE shared constant, plus the floor predicate.
 *
 * The band is the largest single embedding input Neo will send: a vector computed from a prefix does
 * not represent the document it is indexed under, so an input larger than a lane's per-slot context
 * must be refused — never silently truncated by the provider. The literal lives here exactly once so
 * the `AiConfig` leaf (`localModels.embedding.safeProcessingLimitTokens`) declares its default FROM
 * this module while Neo-free deploy tooling (the provider-lane election/composition scripts, which
 * cannot import the config Provider) reads the same declaration. Env binding stays in the leaf,
 * unconditionally and alone; a script that needs deployment variance takes the value from its own
 * entrypoint environment and injects it — never a second resolver inside library code.
 *
 * 28,672 leaves headroom under the shipped 32,768-token embedding slot context: prompt-template
 * tokens and tokenizer drift consume the difference, and the margin is deliberate — a band equal to
 * the slot context would sit one suffix away from silent truncation.
 */

/**
 * @summary Canonical default for `localModels.embedding.safeProcessingLimitTokens`.
 * @type {Number}
 */
export const EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS = 28672;

/**
 * @summary Whether a per-slot engine context cannot hold a safe-band input.
 *
 * Pure and total: non-finite or non-positive inputs report BELOW the band, because a lane whose
 * context is unknown must not wave safe-band inputs through — the failure this predicate exists to
 * prevent is silent, permanent, and indistinguishable from correct indexing at every later stage.
 *
 * @param {Number} contextTokensPerSlot Engine per-slot context in tokens.
 * @param {Number} [safeProcessingLimitTokens=EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS] The band.
 * @returns {Boolean}
 */
export function isEmbeddingContextBelowSafeBand(contextTokensPerSlot, safeProcessingLimitTokens = EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS) {
    const context = Number(contextTokensPerSlot),
          band    = Number(safeProcessingLimitTokens);

    if (!Number.isFinite(band) || band <= 0) return false;

    return !Number.isFinite(context) || context <= 0 || context < band
}
