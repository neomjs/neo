import Ollama                            from '../../provider/Ollama.mjs';
import OpenAiCompatible                  from '../../provider/OpenAiCompatible.mjs';
import {observeUnqueuedProviderActivity} from '../shared/providerActivityLedger.mjs';

export const GRAPH_MODEL_PROVIDERS = Object.freeze(['ollama', 'openAiCompatible']);

/**
 * @summary Identifies provider selectors that route through an OpenAI-compatible HTTP surface.
 * @param {String} provider
 * @returns {Boolean}
 */
export function isOpenAiCompatibleProvider(provider) {
    return provider === 'openAiCompatible'
}

/**
 * @summary Resolves the provider selector used by Dream/Sandman graph-generation lanes.
 *
 * Graph extraction is not the same provider axis as generic Memory Core summarization:
 * summary/chat paths may still use Gemini, while graph-generation dispatch deliberately
 * supports only native Ollama or an OpenAI-compatible local/provider endpoint.
 * Configuration is the single source of truth; this helper returns the configured
 * graph provider verbatim instead of synthesizing hidden defaults from other axes.
 *
 * @param {Object} config aiConfig-shaped object.
 * @returns {String|undefined} Configured `graphProvider`; explicit invalid values are
 *     returned so {@link buildGraphProvider} can fail loudly.
 */
export function resolveGraphModelProvider(config = {}) {
    return config.graphProvider;
}

/**
 * @summary Returns true when `provider` is supported by graph-generation dispatch.
 * @param {String} provider
 * @returns {Boolean}
 */
export function isGraphModelProviderSupported(provider) {
    return GRAPH_MODEL_PROVIDERS.includes(provider);
}

/**
 * @summary Resolves a chat-capable provider for graph-generation callsites
 * based on the graph-generation provider selector.
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
 * @param {Object} [options.ollamaConfig] `{host, model, embeddingModel, keep_alive}` config block.
 * @param {Object} [options.openAiCompatibleConfig] `{host, model, apiKey, keep_alive, ...}` config block.
 * @param {Function} [options.ollamaProviderFactory] Test seam — defaults to `Neo.create(Ollama, cfg)`.
 * @param {Function} [options.openAiCompatibleProviderFactory] Test seam — defaults to `Neo.create(OpenAiCompatible, cfg)`.
 * @param {Object} [options.providerActivityRecorder] Best-effort bounded provider telemetry sink.
 * @param {String} [options.providerActivityService='unknown'] Stable service owner.
 * @returns {{generate: Function}} Provider instance with `generate(prompt, options)` method.
 *     Both native Ollama and OpenAI-compatible providers expose this shape.
 * @throws {Error} For unsupported `modelProvider` values.
 */
export function buildGraphProvider({
    modelProvider,
    ollamaConfig,
    openAiCompatibleConfig,
    ollamaProviderFactory          = (cfg) => Neo.create(Ollama, cfg),
    openAiCompatibleProviderFactory = (cfg) => Neo.create(OpenAiCompatible, cfg),
    providerActivityRecorder,
    providerActivityService = 'unknown'
}) {
    let provider, model;

    switch (modelProvider) {
        case 'ollama': {
            const ollamaProviderConfig = {
                modelName     : ollamaConfig?.model,
                host          : ollamaConfig?.host,
                embeddingModel: ollamaConfig?.embeddingModel || null
            };
            if (ollamaConfig?.keep_alive !== undefined) {
                ollamaProviderConfig.keepAlive = ollamaConfig.keep_alive;
            }
            provider = ollamaProviderFactory(ollamaProviderConfig);
            model    = ollamaConfig?.model;
            break;
        }

        case 'openAiCompatible': {
            const openAiCompatibleProviderConfig = {
                modelName: openAiCompatibleConfig?.model,
                host     : openAiCompatibleConfig?.host,
                apiKey   : openAiCompatibleConfig?.apiKey || ''
            };
            if (openAiCompatibleConfig?.keep_alive !== undefined) {
                openAiCompatibleProviderConfig.keepAlive = openAiCompatibleConfig.keep_alive;
            }
            provider = openAiCompatibleProviderFactory(openAiCompatibleProviderConfig);
            model    = openAiCompatibleConfig?.model;
            break;
        }

        default:
            throw new Error(
                `buildGraphProvider: unsupported modelProvider '${modelProvider}'. ` +
                `Expected one of: 'ollama', 'openAiCompatible'.`
            );
    }

    if (!providerActivityRecorder) return provider;

    return {
        generate(prompt, options = {}) {
            const {
                operationStage = 'unknown',
                priority       = 'batch',
                ...providerOptions
            } = options;

            return observeUnqueuedProviderActivity({
                recorder: providerActivityRecorder,
                activity: {
                    model,
                    operationStage,
                    priority,
                    provider: modelProvider,
                    role    : 'chat',
                    service : providerActivityService
                },
                task: () => provider.generate(prompt, providerOptions)
            });
        }
    };
}
