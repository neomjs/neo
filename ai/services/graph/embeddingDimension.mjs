/**
 * @module ai/services/graph/embeddingDimension
 * @summary Pure embedding-dimension validation helpers for the Golden Path query boundary — resolve the active
 * provider's embedding model, measure a provider-produced vector's length, and build the operator-facing
 * dimension-mismatch warning. Extracted out of `GoldenPathSynthesizer` (the SRP-decomposition epic) so the
 * dimension guard is independently testable and the synthesizer is not a catch-all. No I/O; pure functions.
 */

/**
 * @summary Returns the vector length emitted by an embedding provider.
 *
 * Kept as a pure helper so the Golden Path query boundary can validate the provider output
 * before ChromaDB rejects a mismatched query shape.
 *
 * @param {*} embedding Provider-produced embedding payload.
 * @returns {Number|null} The embedding vector length, or null for invalid/non-vector payloads.
 */
export function getEmbeddingVectorLength(embedding) {
    return Number.isInteger(embedding?.length) ? embedding.length : null;
}

/**
 * @summary Resolves the configured embedding model name for the active provider.
 *
 * @param {Object} config   Memory Core config object.
 * @param {String} provider Active embedding provider key.
 * @returns {String|null}
 */
export function getEmbeddingModelName(config, provider) {
    switch (provider) {
        case 'openAiCompatible':
            return config.openAiCompatible?.embeddingModel || null;
        case 'ollama':
            return config.ollama?.embeddingModel || null;
        case 'gemini':
            return config.embeddingModel || null;
        default:
            return null;
    }
}

/**
 * @summary Builds the operator-facing Golden Path dimension mismatch warning.
 *
 * The message intentionally names both config and observed dimensions because this is the
 * runtime evidence operators need to align `NEO_EMBEDDING_PROVIDER`, `NEO_VECTOR_DIMENSION`,
 * and the existing Chroma collection dimension without destructive collection rebuilds. The
 * `[GoldenPathSynthesizer]` prefix is retained verbatim — this is operator-facing runtime
 * evidence, so the message stays byte-identical across the extraction (behavior-preserving).
 *
 * @param {Object}      options
 * @param {String}      options.provider           Active embedding provider key.
 * @param {String|null} options.model              Active embedding model name.
 * @param {Number}      options.configuredDimension Configured vector dimension.
 * @param {Number|null} options.actualDimension    Provider-produced vector length.
 * @returns {String}
 */
export function buildEmbeddingDimensionMismatchMessage({provider, model, configuredDimension, actualDimension}) {
    return `[GoldenPathSynthesizer] Embedding dimension mismatch before Chroma query: ` +
        `provider=${provider || '<unset>'}, model=${model || '<unknown>'}, ` +
        `configuredVectorDimension=${configuredDimension}, actualEmbeddingDimension=${actualDimension}. ` +
        `Skipping semantic route. Align NEO_EMBEDDING_PROVIDER / NEO_VECTOR_DIMENSION with ` +
        `the Chroma collection dimension, or rebuild the collection intentionally after backup.`;
}
