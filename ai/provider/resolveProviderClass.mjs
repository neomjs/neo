import GeminiProvider           from './Gemini.mjs';
import OllamaProvider           from './Ollama.mjs';
import OpenAiCompatibleProvider from './OpenAiCompatible.mjs';

/**
 * @summary The single alias → provider-class mapping, for callers that need the class rather than a built model.
 *
 * {@link module:ai/provider/buildChatModel} already owns alias → *built chat model* for every consumer that
 * wants a `{generateContent}` surface. `Neo.ai.Agent` cannot use it: it hands a provider INSTANCE to
 * `Neo.ai.agent.Loop`, which calls the provider's own methods. So the alias vocabulary had a second reader
 * with no shared definition, and the copy drifted — `Agent` resolved with
 * `alias.toLowerCase() === 'ollama' ? OllamaProvider : GeminiProvider`, a two-way test over a three-value
 * set, so `openAiCompatible` silently selected Gemini.
 *
 * That miss was latent rather than live: no caller passed that alias. It was one wiring change away from
 * being live, because the natural way to wire an Agent to the SSOT is to pass `aiConfig.modelProvider`,
 * whose resolved default IS `openAiCompatible` — and a Gemini provider without an API key returns `null`
 * from its chat path rather than throwing, so the symptom would have been an agent that produces nothing.
 *
 * The supported set and the diagnostic wording match `buildChatModel`'s deliberately: two modules that
 * disagree about which aliases exist is the defect this replaces, and a reader who greps the error text
 * should land on both.
 *
 * @module ai/provider/resolveProviderClass
 */

/**
 * @summary Alias → provider class. Frozen, because a caller mutating the shared map is the drift this ends.
 * @type {Object}
 */
const PROVIDER_CLASSES = Object.freeze({
    gemini          : GeminiProvider,
    ollama          : OllamaProvider,
    openAiCompatible: OpenAiCompatibleProvider
});

/**
 * @summary Resolves a provider alias to its class, or passes a class through unchanged.
 *
 * Accepts a class so callers whose config declares a provider class directly — `Neo.ai.Agent`'s own
 * `modelProvider` default is `GeminiProvider`, not `'gemini'` — need no branch of their own.
 *
 * Matching is case-insensitive on the alias, because the previous inline resolution lower-cased before
 * comparing and dropping that would be a silent behaviour change for any caller passing `'Ollama'`.
 *
 * @param {String|Function} provider Alias (`'gemini'` / `'ollama'` / `'openAiCompatible'`) or a provider class.
 * @returns {Function} The provider class.
 * @throws {Error} When an alias is not in the supported set — never a default, because selecting the wrong
 *     provider is not observable at the call site: a keyless Gemini returns `null` instead of failing.
 */
export function resolveProviderClass(provider) {
    if (typeof provider !== 'string') {
        if (!provider) {
            throw new Error(
                'resolveProviderClass: no provider given. Pass a supported alias ' +
                `(${Object.keys(PROVIDER_CLASSES).map(key => `'${key}'`).join(', ')}) or a provider class.`
            )
        }

        return provider
    }

    const match = Object.keys(PROVIDER_CLASSES).find(key => key.toLowerCase() === provider.toLowerCase());

    if (!match) {
        throw new Error(
            `resolveProviderClass: unsupported modelProvider '${provider}'. ` +
            `Expected one of: ${Object.keys(PROVIDER_CLASSES).map(key => `'${key}'`).join(', ')}.`
        )
    }

    return PROVIDER_CLASSES[match]
}

/**
 * @summary The supported alias names, for callers that need to report or validate the set.
 * @returns {String[]}
 */
export function supportedProviderAliases() {
    return Object.keys(PROVIDER_CLASSES)
}
