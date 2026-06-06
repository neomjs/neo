/**
 * @summary Resolves the canonical embedding provider for all embedding callsites.
 *
 * @param {Object} options
 * @param {Object} [options.config={}] Config object, including custom config overrides after load().
 * @param {Object} [options.env=process.env] Environment map.
 * @returns {String} The provider key consumed by all embedding callsites.
 */
export function resolveEmbeddingProvider({config = {}, env = process.env} = {}) {
    const unified = !Neo.isEmpty(config.embeddingProvider) ? config.embeddingProvider : env.NEO_EMBEDDING_PROVIDER;

    return unified || 'openAiCompatible';
}

/**
 * @summary Normalizes the mutable Memory Core config to the canonical embedding provider key.
 *
 * Normalizes a mutable config object after custom overrides are merged.
 * @param {Object} config Config object to normalize in place.
 * @param {Object} [env=process.env] Environment map.
 * @param {Object} [sourceConfig=config] Raw override object used for provider resolution.
 * @returns {Object} The same config object for chaining.
 */
export function normalizeEmbeddingProviderConfig(config, env = process.env, sourceConfig = config) {
    config.embeddingProvider = resolveEmbeddingProvider({config: sourceConfig, env});
    return config;
}
