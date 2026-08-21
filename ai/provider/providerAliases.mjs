/**
 * @summary The canonical chat-provider alias set, shared by every surface that accepts one.
 *
 * **Deliberately import-free.** `buildChatModel` lazy-imports its provider classes so a caller that
 * selects Gemini never loads Ollama, and a shared primitive that pulled the classes in would defeat
 * that. This module therefore owns only the *vocabulary* — the ordered names, the normalizer, and the
 * one diagnostic — while {@link module:ai/provider/resolveProviderClass} owns the alias → class map
 * for callers that need an instance.
 *
 * The split exists because the vocabulary previously had two production owners and nothing bound
 * them: `buildChatModel` compared `modelProvider` against three string literals, and `Neo.ai.Agent`
 * tested `alias === 'ollama' ? Ollama : Gemini` — a two-way test over a three-value set, so
 * `openAiCompatible` silently selected Gemini. Both matched "by prose", which is not a binding.
 *
 * @module ai/provider/providerAliases
 */

/**
 * @summary The supported aliases, in diagnostic order. Frozen: a caller mutating the shared set is
 *     the drift this module ends, and the freeze is asserted at the public boundary.
 * @type {ReadonlyArray<String>}
 */
export const PROVIDER_ALIASES = Object.freeze(['gemini', 'openAiCompatible', 'ollama']);

/**
 * @summary Renders the supported set for a diagnostic, so both surfaces quote one list in one order.
 * @returns {String} e.g. `'gemini', 'openAiCompatible', 'ollama'`
 */
export function formatSupportedAliases() {
    return PROVIDER_ALIASES.map(alias => `'${alias}'`).join(', ')
}

/**
 * @summary True when the value is exactly a canonical alias.
 *
 * **Case-sensitive, deliberately.** The two surfaces disagreed here: `buildChatModel` compared
 * exactly, while the expression in `Agent` lower-cased first. One contract had to win, and exact
 * matching is the one that was already load-bearing for the wider consumer — every alias in practice
 * arrives from a config leaf, which resolves canonical. The alternative would have loosened a working
 * surface to match an unexercised one: measured, no caller passes a mis-cased alias, so tightening
 * costs nothing today and stops `'OpenAICompatible'` from resolving on one surface and throwing on
 * the other.
 *
 * @param {*} value
 * @returns {Boolean}
 */
export function isProviderAlias(value) {
    return typeof value === 'string' && PROVIDER_ALIASES.includes(value)
}

/**
 * @summary Returns the canonical alias, or throws the one shared diagnostic.
 *
 * Both production surfaces derive their error text from here, so a reader who greps the message finds
 * a single definition rather than two copies that happen to agree today.
 *
 * @param {*} value
 * @param {String} [surface='resolveProviderClass'] Caller name, so the message says who refused.
 * @returns {String} The canonical alias.
 * @throws {Error} When the value is not exactly one of {@link PROVIDER_ALIASES}.
 */
export function assertProviderAlias(value, surface = 'resolveProviderClass') {
    if (!isProviderAlias(value)) {
        // Single quotes, not `JSON.stringify`: `SessionService.buildChatModel.spec.mjs` pins this
        // wording, and the point of sharing the diagnostic was to give both surfaces ONE existing
        // message — rewording it while consolidating would have broken the contract it consolidates.
        throw new Error(
            `${surface}: unsupported modelProvider '${value}'. ` +
            `Expected one of: ${formatSupportedAliases()}.`
        )
    }

    return value
}
