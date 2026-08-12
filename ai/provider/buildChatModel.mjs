import InteractiveBatchQueue from './InteractiveBatchQueue.mjs';
import {
    createProviderActivityLifecycle,
    observeUnqueuedProviderActivity
}                            from '../services/shared/providerActivityLedger.mjs';

let GoogleGenerativeAIClass,
    OllamaProviderClass,
    OpenAiCompatibleProviderClass;

/**
 * @summary Shared serializing queue for the LOCAL chat endpoint (openAiCompatible / ollama).
 *
 * Every chat request across services — session summaries, post-`add_memory` mini-summaries, and
 * `ask` synthesis — routes through this single queue, so a heavy `batch` summary cannot starve a
 * latency-sensitive `interactive` request on the single serialized local endpoint. The remote
 * `gemini` provider is high-concurrency and is never queued. Injectable per `buildChatModel` call
 * (test seam); defaults to this process-wide instance.
 * @type {InteractiveBatchQueue}
 */
const sharedLocalChatRequestQueue = new InteractiveBatchQueue();

/**
 * @summary Loads the remote Gemini SDK only when the configured chat provider needs it.
 * @returns {Promise<Function>}
 */
async function getGoogleGenerativeAIClass() {
    if (!GoogleGenerativeAIClass) {
        ({GoogleGenerativeAI: GoogleGenerativeAIClass} = await import('@google/generative-ai'));
    }

    return GoogleGenerativeAIClass;
}

/**
 * @summary Loads the native Ollama provider only when the configured chat provider needs it.
 * @returns {Promise<Function>}
 */
async function getOllamaProviderClass() {
    if (!OllamaProviderClass) {
        ({default: OllamaProviderClass} = await import('./Ollama.mjs'));
    }

    return OllamaProviderClass;
}

/**
 * @summary Loads the OpenAI-compatible provider only when the configured chat provider needs it.
 * @returns {Promise<Function>}
 */
async function getOpenAiCompatibleProviderClass() {
    if (!OpenAiCompatibleProviderClass) {
        ({default: OpenAiCompatibleProviderClass} = await import('./OpenAiCompatible.mjs'));
    }

    return OpenAiCompatibleProviderClass;
}

/**
 * @param {Object} result
 * @returns {Object}
 */
function toGeminiEnvelope(result) {
    const content = result.content || result.raw?.message?.content || '';
    return {response: {text: () => content}};
}

/**
 * @summary Builds a provider-agnostic chat-completion model for the configured `modelProvider`.
 *
 * Returns a `{generateContent}` shim that wraps the selected provider's `generate()` in a
 * Gemini-shaped response envelope (`{response: {text()}}`) so consumers — Memory Core
 * (`summarizeSession`, mini-summaries) and Knowledge Base (`ask` synthesis) — stay
 * provider-agnostic. The wrapper `generateContent(promptText, options)` passes safe provider
 * options such as `timeoutMs` through to local providers without leaking them into prompts.
 *
 * **Lives in `ai/provider/`** (beside the providers it wraps) rather than inside a single
 * service so any `ai/services/*` consumer can import it without dragging that service's
 * module-load side effects (graph/storage/request-context) across the service boundary.
 *
 * Side effects are limited to the configured provider branch: local-provider imports and
 * instantiation are lazy inside the async `generateContent()` shim, while custom injected
 * factories still let tests verify selector boundaries + envelope shape without hitting real
 * Ollama / OpenAI-compatible endpoints.
 *
 * @param {Object} options
 * @param {String} options.modelProvider 'gemini' | 'openAiCompatible' | 'ollama'.
 * @param {Object} [options.openAiCompatibleConfig] Resolved `aiConfig.openAiCompatible` leaves ({host, apiKey, model, keep_alive}).
 * @param {Object} [options.ollamaConfig] Resolved `aiConfig.ollama` leaves ({host, model, embeddingModel, keep_alive}).
 * @param {String} [options.geminiApiKey] `GEMINI_API_KEY` env value (passed for testability).
 * @param {String} [options.geminiModelName] Gemini model name (e.g. `aiConfig.modelName`).
 * @param {Function} [options.ollamaProviderFactory] Test seam — if omitted, lazily imports `./Ollama.mjs` and calls `Neo.create(...)`.
 * @param {Function} [options.openAiCompatibleProviderFactory] Test seam — if omitted, lazily imports `./OpenAiCompatible.mjs` and calls `Neo.create(...)`.
 * @param {Function} [options.geminiClientFactory] Test seam — if omitted, lazily imports `@google/generative-ai` on first `generateContent()`.
 * @param {InteractiveBatchQueue} [options.chatRequestQueue] The admission queue the local providers
 * route through; defaults to the process-wide {@link sharedLocalChatRequestQueue}. A PRODUCTION
 * injection point, not only a test seam: a consumer with its OWN serving endpoint passes its own
 * queue so its parallelism is configurable without handing concurrency to every other local chat
 * consumer in the process. The queue arrives already constructed because its capacity comes from that
 * consumer's config, and this module must neither receive config values second-hand nor read
 * `AiConfig` itself. Per ADR 0019 B5 + C1 (ticket-ref-ok: the ADR clauses are the authority for why
 * the queue arrives constructed instead of as a capacity number — a maintainer "simplifying" this
 * into a threaded parameter would violate the zero-tolerance C1 rule, so the rule has to be named).
 * @param {Object} [options.providerActivityRecorder] Best-effort bounded provider telemetry sink.
 * @param {String} [options.providerActivityService='unknown'] Stable service owner for emitted activity.
 * @returns {Object|null} Gemini-shaped `{generateContent}` model, OR `null` for gemini without an API key.
 * @throws {Error} When `modelProvider` is not in the supported set.
 */
export function buildChatModel({
    modelProvider,
    openAiCompatibleConfig,
    ollamaConfig,
    geminiApiKey,
    geminiModelName,
    ollamaProviderFactory,
    openAiCompatibleProviderFactory,
    geminiClientFactory,
    chatRequestQueue = sharedLocalChatRequestQueue,
    providerActivityRecorder,
    providerActivityService = 'unknown'
} = {}) {
    if (modelProvider === 'openAiCompatible') {
        const cfg = openAiCompatibleConfig || {};
        let providerPromise;

        const getProvider = () => {
            providerPromise ||= Promise.resolve((async () => {
                const providerConfig = {
                    apiKey   : cfg.apiKey,
                    host     : cfg.host,
                    modelName: cfg.model,
                    ...(cfg.keep_alive !== undefined ? {keepAlive: cfg.keep_alive} : {})
                };

                if (openAiCompatibleProviderFactory) {
                    return openAiCompatibleProviderFactory(providerConfig);
                }

                const ProviderClass = await getOpenAiCompatibleProviderClass();
                return Neo.create(ProviderClass, providerConfig);
            })());

            return providerPromise;
        };

        return {
            generateContent: (promptText, generationOptions = {}) => {
                const {
                    operationStage = 'unknown',
                    priority       = 'interactive',
                    ...providerOptions
                } = generationOptions;
                const lifecycle = createProviderActivityLifecycle({
                    recorder: providerActivityRecorder,
                    activity: {
                        model   : 'unknown',
                        operationStage,
                        priority,
                        provider: 'openAiCompatible',
                        role    : 'chat',
                        service : providerActivityService
                    }
                });

                // Serialize through the shared local-endpoint queue so a heavy `batch` summary cannot
                // block an `interactive` request. `priority` is a queue-control param — stripped here
                // so it never leaks into the provider request.
                return chatRequestQueue.enqueue(async () => {
                    const provider      = await getProvider(),
                          dispatchModel = cfg.model;

                    provider.apiKey    = cfg.apiKey;
                    provider.host      = cfg.host;
                    provider.modelName = dispatchModel;
                    if (cfg.keep_alive !== undefined) {
                        provider.keepAlive = cfg.keep_alive;
                    }

                    lifecycle.onDispatch({model: dispatchModel});
                    return toGeminiEnvelope(await provider.generate(promptText, providerOptions));
                }, priority, lifecycle);
            }
        };
    }

    if (modelProvider === 'ollama') {
        const cfg = ollamaConfig || {};
        let providerPromise;

        const getProvider = () => {
            providerPromise ||= Promise.resolve((async () => {
                const providerConfig = {
                    host          : cfg.host,
                    modelName     : cfg.model,
                    embeddingModel: cfg.embeddingModel,
                    ...(cfg.keep_alive !== undefined ? {keepAlive: cfg.keep_alive} : {})
                };

                if (ollamaProviderFactory) {
                    return ollamaProviderFactory(providerConfig);
                }

                const ProviderClass = await getOllamaProviderClass();
                return Neo.create(ProviderClass, providerConfig);
            })());

            return providerPromise;
        };

        return {
            generateContent: (promptText, generationOptions = {}) => {
                const {
                    operationStage = 'unknown',
                    priority       = 'interactive',
                    ...providerOptions
                } = generationOptions;
                const lifecycle = createProviderActivityLifecycle({
                    recorder: providerActivityRecorder,
                    activity: {
                        model   : 'unknown',
                        operationStage,
                        priority,
                        provider: 'ollama',
                        role    : 'chat',
                        service : providerActivityService
                    }
                });

                // Serialize through the shared local-endpoint queue (see the openAiCompatible branch).
                return chatRequestQueue.enqueue(async () => {
                    const provider      = await getProvider(),
                          dispatchModel = cfg.model;

                    provider.host      = cfg.host;
                    provider.modelName = dispatchModel;
                    if (cfg.keep_alive !== undefined) {
                        provider.keepAlive = cfg.keep_alive;
                    }

                    lifecycle.onDispatch({model: dispatchModel});
                    return toGeminiEnvelope(await provider.generate(promptText, providerOptions));
                }, priority, lifecycle);
            }
        };
    }

    if (modelProvider === 'gemini') {
        if (!geminiApiKey) return null;

        const customModel = geminiClientFactory
            ? geminiClientFactory(geminiApiKey, geminiModelName)
            : null;

        if (customModel && !providerActivityRecorder) {
            return customModel;
        }

        let modelPromise;
        const getModel = () => {
            if (customModel) return Promise.resolve(customModel);

            modelPromise ||= Promise.resolve((async () => {
                const GoogleGenerativeAI = await getGoogleGenerativeAIClass();
                return new GoogleGenerativeAI(geminiApiKey).getGenerativeModel({model: geminiModelName});
            })());

            return modelPromise;
        };

        return {
            generateContent: async (promptText, generationOptions = {}) => {
                // Remote gemini is high-concurrency → never queued. Strip the queue-control `priority`
                // so it never reaches the SDK; the remaining options forward unchanged (when no
                // priority is passed, `rest` equals the original options — preserving prior behavior).
                const {
                    operationStage = 'unknown',
                    priority       = 'interactive',
                    ...providerOptions
                } = generationOptions;

                const model = await getModel();

                return observeUnqueuedProviderActivity({
                    recorder: providerActivityRecorder,
                    activity: {
                        model   : model.model || 'unknown',
                        operationStage,
                        priority,
                        provider: 'gemini',
                        role    : 'chat',
                        service : providerActivityService
                    },
                    task: () => model.generateContent(promptText, providerOptions)
                });
            }
        };
    }

    throw new Error(`buildChatModel: unsupported modelProvider '${modelProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
}
