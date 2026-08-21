import Base                     from './Base.mjs';
import GeminiProvider           from './Gemini.mjs';
import OllamaProvider           from './Ollama.mjs';
import OpenAiCompatibleProvider from './OpenAiCompatible.mjs';
import {assertProviderAlias, formatSupportedAliases, PROVIDER_ALIASES}
    from './providerAliases.mjs';

/**
 * @summary Alias → provider CLASS, for callers that need an instance rather than a built chat model.
 *
 * {@link module:ai/provider/buildChatModel} owns alias → *built chat model* for consumers that want a
 * `{generateContent}` surface. `Neo.ai.Agent` cannot use it: it hands a provider INSTANCE to
 * `Neo.ai.agent.Loop`, which calls the provider's own methods.
 *
 * The alias *vocabulary* deliberately does not live here — {@link module:ai/provider/providerAliases}
 * owns it, import-free, so `buildChatModel` can share it without losing its lazy provider imports.
 * This module owns only the mapping, and it is derived from that shared set rather than restating it,
 * so a new alias cannot be added to one surface and forgotten on the other.
 *
 * @module ai/provider/resolveProviderClass
 */

/**
 * @summary Alias → provider class, keyed by the shared canonical set.
 *
 * Built from {@link PROVIDER_ALIASES} rather than written as a literal, and asserted complete at load:
 * an alias advertised by the vocabulary with no class here is a startup failure, not a runtime one.
 * @type {Object}
 */
const PROVIDER_CLASSES = Object.freeze({
    gemini          : GeminiProvider,
    ollama          : OllamaProvider,
    openAiCompatible: OpenAiCompatibleProvider
});

// Load-time completeness: the vocabulary and the map cannot drift apart silently. A missing entry
// throws on import rather than surfacing as an "unsupported alias" for a name the set advertises.
const unmapped = PROVIDER_ALIASES.filter(alias => !PROVIDER_CLASSES[alias]);

if (unmapped.length > 0) {
    throw new Error(
        `resolveProviderClass: aliases advertised by providerAliases have no class: ${unmapped.join(', ')}.`
    )
}

/**
 * @summary True for a Neo provider class — a `Neo.setupClass` result on {@link Neo.ai.provider.Base}'s
 *     constructor chain.
 *
 * Both halves are load-bearing. `isClass` alone admits any Neo class; the chain check alone admits a
 * plain subclass that never went through `setupClass` and therefore has no resolved config.
 *
 * **The chain is walked on the CONSTRUCTOR, not the prototype.** `value.prototype instanceof Base` is
 * the reflex and it is wrong here: measured, `GeminiProvider.prototype instanceof Base` is `false`
 * while `Object.getPrototypeOf(GeminiProvider) === Base` is `true`, because `Neo.setupClass` replaces
 * the prototype. Using the reflex form rejects every real provider — which is exactly what it did on
 * the first run of this guard.
 *
 * @param {*} value
 * @returns {Boolean}
 */
function isProviderClass(value) {
    return typeof value === 'function' && value.isClass === true && (value === Base || Base.isPrototypeOf(value))
}

/**
 * @summary Resolves a canonical alias to its provider class, or passes a provider class through.
 *
 * A class is accepted because `Neo.ai.Agent`'s `modelProvider` default is `GeminiProvider` itself
 * rather than `'gemini'`, so callers need no branch of their own. **The class path is validated, not
 * trusted**: it previously returned any truthy value unchanged, so a number, a boolean, a plain object
 * or a bare arrow function reached `Neo.create` and failed there instead of here — a diagnostic about
 * class construction rather than about the argument the caller actually got wrong.
 *
 * Aliases are matched **exactly**; see {@link module:ai/provider/providerAliases} for why the two
 * surfaces converged on case-sensitivity rather than the other way round.
 *
 * @param {String|Function} provider Canonical alias or a `Neo.ai.provider.Base` subclass.
 * @returns {Function} The provider class.
 * @throws {Error} When the alias is unsupported, or the non-string value is not a provider class —
 *     never a default, because selecting the wrong provider is not observable at the call site: a
 *     keyless Gemini returns `null` from its chat path rather than failing.
 */
export function resolveProviderClass(provider) {
    if (typeof provider !== 'string') {
        if (isProviderClass(provider)) {
            return provider
        }

        throw new Error(
            `resolveProviderClass: expected a canonical alias (${formatSupportedAliases()}) ` +
            `or a Neo.ai.provider.Base subclass, received ${describe(provider)}.`
        )
    }

    return PROVIDER_CLASSES[assertProviderAlias(provider, 'resolveProviderClass')]
}

/**
 * @summary Names a rejected value for the diagnostic without leaking its contents into a log.
 * @param {*} value
 * @returns {String}
 */
function describe(value) {
    if (value === null)              return 'null';
    if (typeof value === 'function') return 'a function that is not a Neo provider class';
    return typeof value
}
