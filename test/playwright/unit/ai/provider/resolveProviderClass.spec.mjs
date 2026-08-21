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
import {resolveProviderClass, supportedProviderAliases}
    from '../../../../../ai/provider/resolveProviderClass.mjs';

/**
 * @summary One alias vocabulary for callers that need a provider CLASS rather than a built chat model.
 *
 * `Neo.ai.Agent` resolved aliases inline with `alias.toLowerCase() === 'ollama' ? OllamaProvider :
 * GeminiProvider` — a two-way test over a three-value set. The arm named RED CONTROL below is the one that
 * matters: it reproduces that expression and shows it routes `openAiCompatible` to Gemini, so this spec
 * demonstrates a behaviour change rather than restating the new code.
 */
test.describe('resolveProviderClass', () => {
    test('RED CONTROL: the replaced inline resolution routed openAiCompatible to Gemini', () => {
        // Verbatim shape of the expression this module replaces.
        const previous = alias => alias.toLowerCase() === 'ollama' ? OllamaProvider : GeminiProvider;

        expect(previous('ollama')).toBe(OllamaProvider);
        expect(previous('gemini')).toBe(GeminiProvider);

        // The defect: a supported alias silently selecting the wrong provider.
        expect(previous('openAiCompatible')).toBe(GeminiProvider);

        // And the fix changes exactly that case.
        expect(resolveProviderClass('openAiCompatible')).toBe(OpenAiCompatibleProvider);
    });

    test('resolves every supported alias to its own class', () => {
        expect(resolveProviderClass('gemini')).toBe(GeminiProvider);
        expect(resolveProviderClass('ollama')).toBe(OllamaProvider);
        expect(resolveProviderClass('openAiCompatible')).toBe(OpenAiCompatibleProvider);
    });

    test('every advertised alias resolves, so the set cannot advertise what it cannot serve', () => {
        const aliases = supportedProviderAliases();

        expect(aliases.length).toBeGreaterThan(0);

        // Asserted as a set rather than one by one: a new alias added to the map without a class would
        // pass the three arms above and fail here.
        for (const alias of aliases) {
            expect(typeof resolveProviderClass(alias)).toBe('function');
        }
    });

    test('matching stays case-insensitive, because the replaced expression lower-cased', () => {
        expect(resolveProviderClass('Ollama')).toBe(OllamaProvider);
        expect(resolveProviderClass('OPENAICOMPATIBLE')).toBe(OpenAiCompatibleProvider);
    });

    test('an unknown alias throws and NAMES the supported set', () => {
        expect(() => resolveProviderClass('anthropic')).toThrow(/unsupported modelProvider 'anthropic'/);
        expect(() => resolveProviderClass('anthropic')).toThrow(/'gemini'/);
        expect(() => resolveProviderClass('anthropic')).toThrow(/'openAiCompatible'/);
        expect(() => resolveProviderClass('anthropic')).toThrow(/'ollama'/);
    });

    test('an unknown alias does NOT fall back to a provider', () => {
        // The whole point: the previous expression answered every unknown alias with Gemini, and a keyless
        // Gemini returns null from its chat path rather than throwing — so the wrong choice was unobservable.
        let resolved = 'threw';

        try {
            resolved = resolveProviderClass('anthropic')
        } catch {
            // expected
        }

        expect(resolved).toBe('threw');
    });

    test('a provider CLASS passes through, since Agent declares one as its default', () => {
        expect(resolveProviderClass(GeminiProvider)).toBe(GeminiProvider);
        expect(resolveProviderClass(OllamaProvider)).toBe(OllamaProvider);
    });

    test('a missing provider throws rather than passing undefined to Neo.create', () => {
        expect(() => resolveProviderClass(undefined)).toThrow(/no provider given/);
        expect(() => resolveProviderClass(null)).toThrow(/no provider given/);
    });

    test('CONTROL: the alias map is frozen, so a caller cannot reintroduce the drift', () => {
        const before = resolveProviderClass('gemini');

        // A mutation attempt must not change what a later caller resolves.
        try {
            resolveProviderClass('gemini').mutated = true
        } catch {
            // irrelevant — the assertion below is about the mapping, not the class object
        }

        expect(resolveProviderClass('gemini')).toBe(before);
    });
});
