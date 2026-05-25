import Ollama           from '../../provider/Ollama.mjs';
import OpenAiCompatible from '../../provider/OpenAiCompatible.mjs';

/**
 * @summary Resolves a chat-capable provider for graph-generation callsites
 * based on the active `modelProvider` selector.
 *
 * Graph-generation services (`SemanticGraphExtractor`, `GoldenPathSynthesizer`,
 * `TopologyInferenceEngine`) all need a `provider.generate(prompt)`-shaped
 * client. This helper is the single dispatch seam so a deployment configured
 * for native Ollama actually routes graph work through native Ollama, not
 * the OpenAI-compatible substitute.
 *
 * Pure function with injectable provider factories; tests verify selector
 * behavior without touching real endpoints. Mirrors `SessionService.buildChatModel`
 * in shape and contract.
 *
 * @param {Object} options
 * @param {String} options.modelProvider One of `'ollama'`, `'openAiCompatible'`.
 *     Unknown values throw explicitly (no silent fallback to a different family).
 * @param {Object} [options.ollamaConfig] `{host, model, embeddingModel}` config block.
 * @param {Object} [options.openAiCompatibleConfig] `{host, model, apiKey, ...}` config block.
 * @param {Function} [options.ollamaProviderFactory] Test seam — defaults to `Neo.create(Ollama, cfg)`.
 * @param {Function} [options.openAiCompatibleProviderFactory] Test seam — defaults to `Neo.create(OpenAiCompatible, cfg)`.
 * @returns {{generate: Function}} Provider instance with `generate(prompt, options)` method.
 *     Both native Ollama and OpenAI-compatible providers expose this shape.
 * @throws {Error} For unsupported `modelProvider` values.
 */
export function buildGraphProvider({
    modelProvider,
    ollamaConfig,
    openAiCompatibleConfig,
    ollamaProviderFactory          = (cfg) => Neo.create(Ollama, cfg),
    openAiCompatibleProviderFactory = (cfg) => Neo.create(OpenAiCompatible, cfg)
}) {
    switch (modelProvider) {
        case 'ollama':
            return ollamaProviderFactory({
                modelName     : ollamaConfig?.model,
                host          : ollamaConfig?.host,
                embeddingModel: ollamaConfig?.embeddingModel || null
            });

        case 'openAiCompatible':
            return openAiCompatibleProviderFactory({
                modelName: openAiCompatibleConfig?.model,
                host     : openAiCompatibleConfig?.host,
                apiKey   : openAiCompatibleConfig?.apiKey || ''
            });

        default:
            throw new Error(
                `buildGraphProvider: unsupported modelProvider '${modelProvider}'. ` +
                `Expected one of: 'ollama', 'openAiCompatible'.`
            );
    }
}
