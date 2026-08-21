import {setup} from '../../../setup.mjs';

const appName = 'AiResolveProviderClassTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../../src/Neo.mjs';
import * as core                from '../../../../../src/core/_export.mjs';
import GeminiProvider           from '../../../../../ai/provider/Gemini.mjs';
import OllamaProvider           from '../../../../../ai/provider/Ollama.mjs';
import OpenAiCompatibleProvider from '../../../../../ai/provider/OpenAiCompatible.mjs';
import {buildChatModel}         from '../../../../../ai/provider/buildChatModel.mjs';
import {resolveProviderClass}   from '../../../../../ai/provider/resolveProviderClass.mjs';
import {assertProviderAlias, formatSupportedAliases, isProviderAlias, PROVIDER_ALIASES}
    from '../../../../../ai/provider/providerAliases.mjs';

/**
 * @summary One alias vocabulary, consumed by both production surfaces.
 *
 * `Neo.ai.Agent` resolved aliases inline with `alias.toLowerCase() === 'ollama' ? OllamaProvider :
 * GeminiProvider` — a two-way test over a three-value set. The RED CONTROL reproduces that expression
 * so this file demonstrates a behaviour change rather than restating the new code, and the parity
 * block asserts the two surfaces share one accepted set instead of two copies that happen to agree.
 */
test.describe('provider alias vocabulary', () => {
    test('RED CONTROL: the replaced inline resolution routed openAiCompatible to Gemini', () => {
        const previous = alias => alias.toLowerCase() === 'ollama' ? OllamaProvider : GeminiProvider;

        expect(previous('ollama')).toBe(OllamaProvider);
        expect(previous('gemini')).toBe(GeminiProvider);
        expect(previous('openAiCompatible')).toBe(GeminiProvider);   // the defect

        expect(resolveProviderClass('openAiCompatible')).toBe(OpenAiCompatibleProvider);
    });

    test('resolves every supported alias to its own class', () => {
        expect(resolveProviderClass('gemini')).toBe(GeminiProvider);
        expect(resolveProviderClass('ollama')).toBe(OllamaProvider);
        expect(resolveProviderClass('openAiCompatible')).toBe(OpenAiCompatibleProvider);
    });

    test('every advertised alias maps to a distinct class, so the set cannot advertise what it cannot serve', () => {
        const classes = PROVIDER_ALIASES.map(alias => resolveProviderClass(alias));

        expect(PROVIDER_ALIASES.length).toBeGreaterThan(0);
        classes.forEach(cls => expect(typeof cls).toBe('function'));

        // Distinctness matters: the original defect was two aliases resolving to ONE class.
        expect(new Set(classes).size).toBe(PROVIDER_ALIASES.length);
    });

    /* ------------------------------------------------------------------ *
     * RA-1 — cross-surface parity. Mutating EITHER consumer's accepted set
     * must redden here, which is what makes the vocabulary shared rather
     * than merely matching.
     * ------------------------------------------------------------------ */

    test('PARITY: both production surfaces accept exactly the canonical set', () => {
        for (const alias of PROVIDER_ALIASES) {
            expect(isProviderAlias(alias), `${alias} is canonical`).toBe(true);

            // `resolveProviderClass` accepts it...
            expect(() => resolveProviderClass(alias)).not.toThrow();

            // ...and `buildChatModel` gets past its alias gate for the same value. It is allowed to
            // fail LATER for provider-specific reasons (gemini without a key returns null); what must
            // not happen is a refusal naming an unsupported alias.
            let message = '';
            try {
                buildChatModel({modelProvider: alias})
            } catch (error) {
                message = error.message
            }
            expect(message, `${alias} must not be refused as unsupported`).not.toMatch(/unsupported modelProvider/);
        }
    });

    test('PARITY: both surfaces refuse the same unknown alias with the same set', () => {
        const bogus = 'anthropic';

        expect(() => resolveProviderClass(bogus)).toThrow(/unsupported modelProvider/);
        expect(() => buildChatModel({modelProvider: bogus})).toThrow(/unsupported modelProvider/);

        // Derived from one ordered set, so the two diagnostics quote the same list in the same order.
        const supported = formatSupportedAliases();

        for (const surface of [() => resolveProviderClass(bogus), () => buildChatModel({modelProvider: bogus})]) {
            let message = '';
            try { surface() } catch (error) { message = error.message }
            expect(message).toContain(supported);
        }
    });

    test('PARITY: the case boundary is the same on both surfaces', () => {
        // Canonical-only. `buildChatModel` always compared exactly; the Agent expression lower-cased.
        // One contract had to win and the wider consumer's did.
        expect(() => resolveProviderClass('Ollama')).toThrow(/unsupported modelProvider/);
        expect(() => buildChatModel({modelProvider: 'Ollama'})).toThrow(/unsupported modelProvider/);
        expect(isProviderAlias('Ollama')).toBe(false);
    });

    /* ------------------------------------------------------------------ *
     * RA-2 — the direct-class path is validated, not trusted.
     * ------------------------------------------------------------------ */

    test('a provider CLASS passes through, since Agent declares one as its default', () => {
        expect(resolveProviderClass(GeminiProvider)).toBe(GeminiProvider);
        expect(resolveProviderClass(OllamaProvider)).toBe(OllamaProvider);
        expect(resolveProviderClass(OpenAiCompatibleProvider)).toBe(OpenAiCompatibleProvider);
    });

    test('NEGATIVE CONTROLS: non-class values are refused here, not deferred into Neo.create', () => {
        // Each of these was previously returned unchanged, so the failure surfaced as a confusing
        // class-construction error instead of naming the argument the caller got wrong.
        for (const value of [42, true, {}, [], (x) => x, Symbol('nope')]) {
            expect(() => resolveProviderClass(value), String(typeof value))
                .toThrow(/expected a canonical alias|received/);
        }
    });

    test('a missing provider throws rather than passing undefined to Neo.create', () => {
        expect(() => resolveProviderClass(undefined)).toThrow(/expected a canonical alias/);
        expect(() => resolveProviderClass(null)).toThrow(/expected a canonical alias/);
    });

    test('a plain Neo-free subclass is refused, so isClass alone is not the test', () => {
        class NotAProvider {}

        expect(() => resolveProviderClass(NotAProvider)).toThrow(/received/);
    });

    /* ------------------------------------------------------------------ *
     * RA-3 — an OBSERVABLE freeze control. The previous arm mutated
     * `GeminiProvider` rather than the map, leaked that property into the
     * shared unit worker, and stayed green with the freeze removed.
     * ------------------------------------------------------------------ */

    test('CONTROL: the shared alias set is frozen, observably and without teardown', () => {
        expect(Object.isFrozen(PROVIDER_ALIASES)).toBe(true);

        // Strict-mode ESM: mutating a frozen array THROWS. Removing `Object.freeze` makes these
        // silently succeed, which is what reddens the arm — nothing is mutated either way, so this
        // leaves no state behind for the next spec in the worker.
        expect(() => PROVIDER_ALIASES.push('bogus')).toThrow(TypeError);
        expect(() => { PROVIDER_ALIASES[0] = 'bogus' }).toThrow(TypeError);

        expect(PROVIDER_ALIASES).toEqual(['gemini', 'openAiCompatible', 'ollama']);
    });

    test('assertProviderAlias names the refusing surface, so a shared message stays attributable', () => {
        expect(() => assertProviderAlias('nope', 'buildChatModel')).toThrow(/^buildChatModel:/);
        expect(() => assertProviderAlias('nope', 'resolveProviderClass')).toThrow(/^resolveProviderClass:/);
    });
});
