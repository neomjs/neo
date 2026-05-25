import Ollama           from '../../provider/Ollama.mjs';
import OpenAiCompatible from '../../provider/OpenAiCompatible.mjs';

/**
 * @summary Provider dispatch for graph-generation services (#11965 AC5).
 *
 * Closes #11965 AC5 "Dream/REM graph-mutator provider reachability is not
 * hardwired to the wrong provider family" by giving graph-generation callsites
 * (`SemanticGraphExtractor`, `GoldenPathSynthesizer`, `TopologyInferenceEngine`)
 * a single dispatch seam that honors `aiConfig.modelProvider`. Without this
 * indirection, cloud deployments configured for native Ollama would still see
 * graph generation hit OpenAI-compatible endpoints, breaking the operator
 * client-need signal that flipped OQ2 disposition during Discussion #11961
 * graduation (cloud-deployment clients prefer Ollama; no Mac OS in cloud rules
 * out MLX).
 *
 * Pure function with injectable provider factories so tests can verify
 * selector behavior without hitting real Ollama / OpenAI-compatible endpoints.
 * Mirrors the `buildChatModel` pattern in `SessionService.mjs` so reviewers
 * recognize the shape.
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
