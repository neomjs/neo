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
 * @summary Multiplier covering how far a real tokenizer can exceed the `bytes/3` estimate.
 *
 * `bytesToTokens` is a bytes-per-token heuristic, while every admission ceiling is denominated in
 * the provider tokenizer's own count. The two disagree by content: measured against the Qwen3
 * embedding tokenizer over a generated-TypeScript corpus, `actual / estimate` ranged **0.80 – 1.28**
 * across the ten largest units — code is denser in tokens per byte than the heuristic assumes, and
 * declaration headers are the dense end of that.
 *
 * 1.35 sits above the measured worst case with headroom rather than on it. The module summary above
 * already names tokenizer drift as something a margin must absorb; this is that margin made explicit
 * and applied where admission is decided, instead of being folded invisibly into one band default.
 *
 * Raising a ceiling does not remove the need for this: the factor converts an ESTIMATE into a
 * conservative token count, so it applies at whatever ceiling is in force.
 * @type {Number}
 */
export const EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR = 1.35;

/**
 * @summary Resolves the estimate-space band an embedding input must fit to be admitted.
 *
 * Pure. Two ceilings govern an embedding input and they answer different questions: the engine's
 * per-slot context is a HARD admission limit (exceed it and the provider refuses the request), while
 * the safe-processing band is an operational workload floor. Admission must respect BOTH, so the
 * smaller governs — a deployment that lowers `contextLimitTokens` to match a narrower slot has said
 * something the split path must not ignore, which is exactly the defect this resolver closes: all
 * three admission sites keyed on the safe band alone, so a deployment running a 16,384-token slot
 * had inputs admitted against a 28,672 band and refused by its own engine.
 *
 * The returned band is in ESTIMATE space — divided by {@link EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR}
 * — because callers compare it against `bytesToTokens` output, not against a real token count.
 * Comparing an estimate to a ceiling denominated in real tokens is the second half of the same
 * defect, and dividing here keeps both halves fixed in one place.
 *
 * Fail-closed by omission rather than by throwing: a caller with no resolvable ceiling gets
 * `resolved: false` and decides its own refusal, preserving each site's existing unmeasurable path.
 *
 * @param {Object} options
 * @param {Number} [options.contextLimitTokens] Engine per-slot admission ceiling, real tokens.
 * @param {Number} [options.safeProcessingLimitTokens] Operational safe band, real tokens.
 * @returns {{resolved: Boolean, admissionCeilingTokens: Number|null, estimateBandTokens: Number|null}}
 */
export function resolveEmbeddingAdmissionBand({contextLimitTokens, safeProcessingLimitTokens} = {}) {
    const unresolved = {resolved: false, admissionCeilingTokens: null, estimateBandTokens: null},
          declared   = [contextLimitTokens, safeProcessingLimitTokens].filter(value => value !== undefined && value !== null);

    // ABSENT and INVALID are different facts. A ceiling nobody declared is fine — the other one
    // governs. A ceiling declared as NaN, zero or negative is a configuration defect, and letting
    // the sibling rescue it would turn "cannot check" back into "checked, tiny" — the exact reading
    // the guard at this boundary exists to refuse.
    if (declared.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
        return unresolved
    }

    const candidates = declared.map(Number);

    if (candidates.length === 0) {
        return unresolved
    }

    const admissionCeilingTokens = Math.min(...candidates);

    return {
        resolved          : true,
        admissionCeilingTokens,
        estimateBandTokens: Math.max(1, Math.floor(admissionCeilingTokens / EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR))
    }
}

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
