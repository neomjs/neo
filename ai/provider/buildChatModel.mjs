import { GoogleGenerativeAI } from '@google/generative-ai';
import OllamaProvider           from './Ollama.mjs';
import OpenAiCompatibleProvider from './OpenAiCompatible.mjs';

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
 * Side effects are limited to provider instantiation via the injected factories — tests can
 * pass mocked factories to verify selector boundaries + envelope shape without hitting real
 * Ollama / OpenAI-compatible endpoints. Production callers pass `Neo.create`-based factories.
 *
 * @param {Object} options
 * @param {String} options.modelProvider 'gemini' | 'openAiCompatible' | 'ollama'.
 * @param {Object} [options.openAiCompatibleConfig] Slice of `aiConfig.openAiCompatible` ({host, apiKey, model, keep_alive}).
 * @param {Object} [options.ollamaConfig] Slice of `aiConfig.ollama` ({host, model, embeddingModel, keep_alive}).
 * @param {String} [options.geminiApiKey] `GEMINI_API_KEY` env value (passed for testability).
 * @param {String} [options.geminiModelName] Gemini model name (e.g. `aiConfig.modelName`).
 * @param {Function} [options.ollamaProviderFactory] Test seam — defaults to `Neo.create(OllamaProvider, cfg)`.
 * @param {Function} [options.openAiCompatibleProviderFactory] Test seam — defaults to `Neo.create(OpenAiCompatibleProvider, cfg)`.
 * @param {Function} [options.geminiClientFactory] Test seam — defaults to `new GoogleGenerativeAI(...).getGenerativeModel({model})`.
 * @returns {Object|null} Gemini-shaped `{generateContent}` model, OR `null` for gemini without an API key.
 * @throws {Error} When `modelProvider` is not in the supported set.
 */
export function buildChatModel({
    modelProvider,
    openAiCompatibleConfig,
    ollamaConfig,
    geminiApiKey,
    geminiModelName,
    ollamaProviderFactory          = (cfg) => Neo.create(OllamaProvider, cfg),
    openAiCompatibleProviderFactory = (cfg) => Neo.create(OpenAiCompatibleProvider, cfg),
    geminiClientFactory             = (apiKey, modelName) => new GoogleGenerativeAI(apiKey).getGenerativeModel({model: modelName})
} = {}) {
    if (modelProvider === 'openAiCompatible') {
        const cfg = openAiCompatibleConfig || {};
        const provider = openAiCompatibleProviderFactory({
            apiKey   : cfg.apiKey,
            host     : cfg.host,
            modelName: cfg.model,
            ...(cfg.keep_alive !== undefined ? {keepAlive: cfg.keep_alive} : {})
        });
        return {
            generateContent: async (promptText, generationOptions = {}) => {
                provider.apiKey    = cfg.apiKey;
                provider.host      = cfg.host;
                provider.modelName = cfg.model;
                if (cfg.keep_alive !== undefined) {
                    provider.keepAlive = cfg.keep_alive;
                }
                const result  = await provider.generate(promptText, generationOptions);
                const content = result.content || result.raw?.message?.content || '';
                return {response: {text: () => content}};
            }
        };
    }

    if (modelProvider === 'ollama') {
        const cfg = ollamaConfig || {};
        const provider = ollamaProviderFactory({
            host          : cfg.host           || 'http://127.0.0.1:11434',
            modelName     : cfg.model          || 'gemma4',
            embeddingModel: cfg.embeddingModel || null,
            ...(cfg.keep_alive !== undefined ? {keepAlive: cfg.keep_alive} : {})
        });
        return {
            generateContent: async (promptText, generationOptions = {}) => {
                provider.host      = cfg.host  || provider.host;
                provider.modelName = cfg.model || provider.modelName;
                if (cfg.keep_alive !== undefined) {
                    provider.keepAlive = cfg.keep_alive;
                }
                const result  = await provider.generate(promptText, generationOptions);
                const content = result.content || result.raw?.message?.content || '';
                return {response: {text: () => content}};
            }
        };
    }

    if (modelProvider === 'gemini') {
        if (!geminiApiKey) return null;
        return geminiClientFactory(geminiApiKey, geminiModelName);
    }

    throw new Error(`buildChatModel: unsupported modelProvider '${modelProvider}'. Expected one of: 'gemini', 'openAiCompatible', 'ollama'.`);
}
