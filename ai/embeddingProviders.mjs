/**
 * @module ai/embeddingProviders
 * @summary The implemented embedding-provider vocabulary as ONE shared constant, plus the env
 * parse hook that makes an unknown provider name a loud config-resolution failure.
 *
 * The set lives here exactly once so the `AiConfig` leaf (`embeddingProvider`) declares its
 * domain FROM this module and every guardrail/dispatch site measures against the same
 * vocabulary. Before this module existed, the ingestion guard kept its own hand-maintained
 * provider subset and the leaf accepted any string, so a typo silently disabled the
 * oversize-input guard; the dispatch vocabulary already existed as prose inside
 * `TextEmbeddingService`'s unsupported-provider throws.
 *
 * Plain by contract (no Neo imports, no env reads outside the parse hook): config files must
 * be able to consume this module before any Provider exists.
 */

/**
 * The embedding providers with a production dispatch path, in canonical (alphabetical) order.
 * @type {ReadonlyArray<String>}
 */
export const IMPLEMENTED_EMBEDDING_PROVIDERS = Object.freeze(['gemini', 'openAiCompatible', 'ollama']);

/**
 * @summary Env parser for the `embeddingProvider` leaf — the loud half of the domain contract.
 *
 * Follows the `parsePlaneIdEnv` convention: an unset value is no opinion (`undefined`, so the
 * leaf default applies); a set-but-unknown value throws a named diagnostic at config
 * resolution, because an unrecognized provider must never boot quietly.
 *
 * @param {String} envVarName The bound env var (diagnostic text names it).
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String|undefined} The valid provider name, or `undefined` when unset.
 */
export function parseEmbeddingProviderEnv(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];

    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    if (!IMPLEMENTED_EMBEDDING_PROVIDERS.includes(rawValue)) {
        throw new Error(
            `embeddingProviders: ${envVarName}="${rawValue}" is not an implemented embedding provider — ` +
            `expected one of: ${IMPLEMENTED_EMBEDDING_PROVIDERS.join(', ')}.`
        );
    }

    return rawValue
}

/**
 * @summary Resolves the display model for a provider from the resolved config tree.
 *
 * The single home of a branch both ingestion guardrail resolvers hand-rolled — and neither
 * copy could resolve `gemini`, whose model lives at the tree's top-level historical leaf. An
 * unrecognized provider resolves to its own name: in that defect case the name is the most
 * informative diagnostic label available.
 *
 * @param {Object} options
 * @param {String} options.embeddingProvider The resolved provider selector.
 * @param {Object} options.aiConfig          The resolved config tree (read at the caller's use site).
 * @returns {String}
 */
export function resolveEmbeddingProviderModel({embeddingProvider, aiConfig}) {
    return embeddingProvider === 'ollama'          ? aiConfig.ollama.embeddingModel
         : embeddingProvider === 'openAiCompatible' ? aiConfig.openAiCompatible.embeddingModel
         : embeddingProvider === 'gemini'           ? aiConfig.embeddingModel
         : embeddingProvider;
}
