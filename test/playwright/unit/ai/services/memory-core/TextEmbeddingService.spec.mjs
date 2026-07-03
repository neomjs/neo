import {setup} from '../../../../setup.mjs';

const appName = 'TextEmbeddingServiceProviderTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
}                     from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';

/**
 * @summary Coverage for the #10804 TextEmbeddingService Gemini-init gate.
 *
 * #9719 removed implicit provider fallback inside TextEmbeddingService. #10804 keeps that
 * deterministic routing: the singleton only initializes a Gemini embedding client when the
 * single canonical `embeddingProvider` selector is `gemini`.
 *
 * @see Neo.ai.services.memory-core.TextEmbeddingService#shouldInitializeGeminiEmbeddingClient
 */
test.describe('TextEmbeddingService #10804 — shouldInitializeGeminiEmbeddingClient', () => {
    let shouldInitializeGeminiEmbeddingClient;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');
        shouldInitializeGeminiEmbeddingClient = mod.shouldInitializeGeminiEmbeddingClient;
    });

    test('returns true only for the unified gemini embedding provider', () => {
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'gemini'})).toBe(true);
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'openAiCompatible'})).toBe(false);
        expect(shouldInitializeGeminiEmbeddingClient({embeddingProvider: 'ollama'})).toBe(false);
    });

    test('does not consult removed Chroma/SQLite provider selectors', () => {
        expect(shouldInitializeGeminiEmbeddingClient({
            embeddingProvider      : 'openAiCompatible',
            chromaEmbeddingProvider: 'gemini',
            neoEmbeddingProvider   : 'gemini'
        })).toBe(false);
    });
});

test.describe('TextEmbeddingService #11965 Sub-2 — native Ollama dispatch', () => {
    let TextEmbeddingService;
    let aiConfig;
    let originalEmbeddingTimeoutMs;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');
        TextEmbeddingService = mod.default;
        aiConfig             = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        originalEmbeddingTimeoutMs = aiConfig.ollama.embeddingTimeoutMs;
    });

    test.afterEach(() => {
        // Restore singleton ollamaProvider slot — fake injection across tests must not leak.
        TextEmbeddingService.ollamaProvider = null;
        aiConfig.ollama.embeddingTimeoutMs  = originalEmbeddingTimeoutMs;
        clearAggregatedFrictions();
    });

    test('embedText dispatches to native Ollama provider when explicitProvider=ollama', async () => {
        const captured   = [];
        const fakeOllama = {
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2, 0.3]], raw: {model: 'fake-model'}};
            }
        };
        TextEmbeddingService.ollamaProvider = fakeOllama;

        const result = await TextEmbeddingService.embedText('hello world', 'ollama');

        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(captured).toEqual([{
            input  : 'hello world',
            options: {
                num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
                operationLabel: 'TextEmbeddingService.embedText native Ollama embedding',
                timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
                truncate      : false
            }
        }]);
    });

    test('embedTexts dispatches batch to native Ollama provider when explicitProvider=ollama', async () => {
        const captured   = [];
        const fakeOllama = {
            async embed(input, options) {
                captured.push({input, options});
                return {
                    embeddings: [
                        [0.1, 0.2],
                        [0.3, 0.4],
                        [0.5, 0.6]
                    ],
                    raw: {model: 'fake-model'}
                };
            }
        };
        TextEmbeddingService.ollamaProvider = fakeOllama;

        const result = await TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'ollama');

        expect(result).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);
        expect(captured).toEqual([{
            input  : ['a', 'b', 'c'],
            options: {
                num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
                operationLabel: 'TextEmbeddingService.embedTexts native Ollama embedding',
                timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
                truncate      : false
            }
        }]);
    });

    test('native Ollama timeout errors emit provider-scoped ConsumerFriction (#14052)', async () => {
        aiConfig.ollama.embeddingTimeoutMs = 25;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                const err = new Error('[Ollama] native embed timed out after 25ms');
                err.code = PROVIDER_TIMEOUT_CODE;
                err.provider = 'Ollama';
                throw err;
            }
        };

        for (let i = 0; i < 3; i++) {
            await expect(TextEmbeddingService.embedTexts([`stuck ${i}`], 'ollama'))
                .rejects.toThrow(/native embed timed out after 25ms/);
        }

        expect(getAggregatedFrictions()).toEqual([
            expect.objectContaining({
                assetRef      : `ollama:${aiConfig.ollama.embeddingModel || aiConfig.ollama.model}`,
                consumer      : 'TextEmbeddingService.ollama',
                model         : aiConfig.ollama.embeddingModel || aiConfig.ollama.model,
                symptom       : 'timeout',
                emissionPoint : 'post-invocation-failure',
                suggestionKind: 'unknown',
                serviceDomain : 'memory-core',
                count         : 3
            })
        ]);
    });

    test('native Ollama embedding timeout config fails loud when invalid (#14052)', async () => {
        aiConfig.ollama.embeddingTimeoutMs = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [[0.1]], raw: {}}; }
        };

        await expect(TextEmbeddingService.embedText('hello', 'ollama'))
            .rejects.toThrow(/ollama\.embeddingTimeoutMs must be a positive number/);
    });

    test('embedText with explicitProvider=ollama returns empty when provider returns no embeddings', async () => {
        TextEmbeddingService.ollamaProvider = {
            async embed() { return {embeddings: [], raw: {}}; }
        };

        const result = await TextEmbeddingService.embedText('hello', 'ollama');
        expect(result).toBeUndefined(); // embeddings[0] of empty array
    });

    test('embedText with explicitProvider=openAiCompatible does NOT dispatch to Ollama', async () => {
        const ollamaCalls = [];
        TextEmbeddingService.ollamaProvider = {
            async embed(input) { ollamaCalls.push(input); return {embeddings: [[9, 9, 9]]}; }
        };

        // openAiCompatible path tries to hit /v1/embeddings — let it fail; we only assert
        // that the Ollama fake was NOT called.
        await TextEmbeddingService.embedText('hello', 'openAiCompatible').catch(() => {});
        expect(ollamaCalls).toEqual([]);
    });

    test('embedText with explicitProvider=gemini does NOT dispatch to Ollama', async () => {
        const ollamaCalls = [];
        TextEmbeddingService.ollamaProvider = {
            async embed(input) { ollamaCalls.push(input); return {embeddings: [[9, 9, 9]]}; }
        };

        // gemini path checks GEMINI_API_KEY + embeddingModel; without those it throws
        // — we only assert the Ollama fake wasn't called regardless of throw.
        await TextEmbeddingService.embedText('hello', 'gemini').catch(() => {});
        expect(ollamaCalls).toEqual([]);
    });

    test('embedText throws explicitly for unsupported provider (no silent Gemini fallthrough)', async () => {
        // #11965 Sub-2 cycle-2 (per @neo-gpt review): pre-cycle-2, any unknown
        // explicitProvider value fell through to the Gemini branch. That silent-fallback
        // masked misconfiguration. Now an unsupported value throws with the expected set
        // named in the message.
        await expect(TextEmbeddingService.embedText('hello', 'bogus-provider')).rejects.toThrow(
            /unsupported embedding provider 'bogus-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/
        );
    });

    test('embedTexts throws explicitly for unsupported provider (no silent Gemini fallthrough)', async () => {
        await expect(TextEmbeddingService.embedTexts(['a', 'b'], 'mystery-provider')).rejects.toThrow(
            /unsupported embedding provider 'mystery-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/
        );
    });
});
