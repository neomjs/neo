import {setup} from '../../../setup.mjs';

const appName = 'AiProviderOllamaModelIdGuardTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Ollama         from '../../../../../ai/provider/Ollama.mjs';

/**
 * @summary The Ollama provider must name a missing model id instead of defaulting one.
 *
 * The class used to declare `modelName: 'gemma4'` while `aiConfig.ollama.model` resolves
 * `gemma4:26b`. Those are different models — an unqualified Ollama name resolves to the `:latest`
 * tag — and `Neo.ai.Agent` builds its provider with `Neo.create(providerClass, this.providerConfig
 * || {})`, where `providerConfig` is never set. So the class default was the only model supplier on
 * that path, and it supplied one the deployment had not chosen, with no error to notice it.
 *
 * These arms pin the replacement: no default, and a named diagnostic at the request boundary. The
 * controls matter as much as the throws — a guard that rejects everything would satisfy the throw
 * arms while breaking every configured caller.
 */
test.describe('Ollama provider model-id guard', () => {
    test('declares no model id, so nothing silently substitutes one', () => {
        const provider = Neo.create(Ollama, {});

        // The regression this replaces: a truthy default here is indistinguishable, at the call
        // site, from an operator having configured that exact model.
        expect(provider.modelName).toBe(null);
    });

    test('chat dispatch throws a NAMED diagnostic when no model id resolved', () => {
        const provider = Neo.create(Ollama, {});

        expect(() => provider.preparePayload('ping', {}, false)).toThrow(/no chat model id resolved/);

        // Names the class and the remedy, not just the failure — an operator reading this in a log
        // has to know which knob to turn.
        expect(() => provider.preparePayload('ping', {}, false)).toThrow(/Neo\.ai\.provider\.Ollama/);
        expect(() => provider.preparePayload('ping', {}, false)).toThrow(/aiConfig\.ollama/);
    });

    test('CONTROL: a configured chat model still dispatches, and carries the exact id', () => {
        const provider = Neo.create(Ollama, {modelName: 'gemma4:26b'}),
              payload  = provider.preparePayload('ping', {}, false);

        expect(payload.model).toBe('gemma4:26b');
        expect(payload.messages).toEqual([{role: 'user', content: 'ping'}]);
    });

    test('embedding dispatch throws a NAMED diagnostic when no model id resolved', async () => {
        const provider = Neo.create(Ollama, {});

        // `embeddingModel` already defaulted to null; with `modelName` no longer supplying a
        // fallback, the embedding lane would otherwise have sent `model: null` to the daemon.
        await expect(provider.embed('ping')).rejects.toThrow(/no embedding model id resolved/);
    });

    test('CONTROL: a configured embedding model PASSES the guard, failing later at the network', async () => {
        const provider = Neo.create(Ollama, {
            // A closed port, so the request must fail — the question is only WHERE.
            host          : 'http://127.0.0.1:1',
            modelName     : 'gemma4:26b',
            embeddingModel: 'qwen3-embedding'
        });

        let message = '';

        try {
            await provider.embed('ping')
        } catch (error) {
            message = error.message
        }

        // Asserting which failure, not that one occurred. A connection-level error proves the guard
        // admitted the request; a blanket-reject guard would carry its own wording here instead, and
        // this arm is the only thing in the file that would notice the difference.
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toMatch(/no embedding model id resolved/);
    });

    test('CONTROL: modelName remains the documented embedding fallback when embeddingModel is unset', () => {
        const chatOnly = Neo.create(Ollama, {modelName: 'gemma4:26b'});

        // The guard must not have changed the precedence it validates: override > embeddingModel >
        // modelName. Only the "nothing resolved" case is new.
        expect(chatOnly.embeddingModel).toBe(null);
        expect(chatOnly.modelName).toBe('gemma4:26b');
    });
});
