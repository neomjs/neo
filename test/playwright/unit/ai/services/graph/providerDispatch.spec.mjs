import {setup} from '../../../../setup.mjs';

const appName = 'GraphProviderDispatchTest';

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

test.describe('buildGraphProvider (#11965 Sub-2 cycle-3)', () => {
    let buildGraphProvider;
    let resolveGraphModelProvider;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/providerDispatch.mjs');
        buildGraphProvider        = mod.buildGraphProvider;
        resolveGraphModelProvider = mod.resolveGraphModelProvider;
    });

    test('returns configured graph provider without generic modelProvider fallback (#12059)', () => {
        expect(resolveGraphModelProvider({
            modelProvider : 'gemini',
            graphProvider : 'openAiCompatible'
        })).toBe('openAiCompatible');

        expect(resolveGraphModelProvider({
            modelProvider : 'gemini',
            graphProvider : 'ollama'
        })).toBe('ollama');

        expect(resolveGraphModelProvider({
            modelProvider : 'ollama',
            graphProvider : 'openAiCompatible'
        })).toBe('openAiCompatible');

        expect(resolveGraphModelProvider({
            modelProvider: 'ollama'
        })).toBeUndefined();

        expect(resolveGraphModelProvider({
            modelProvider : 'openAiCompatible',
            graphProvider : 'bogus-provider'
        })).toBe('bogus-provider');
    });

    test('throws for unsupported modelProvider (no silent fallback)', () => {
        expect(() => buildGraphProvider({
            modelProvider: 'bogus-provider'
        })).toThrow(/buildGraphProvider: unsupported modelProvider 'bogus-provider'.*Expected one of.*ollama.*openAiCompatible/);

        expect(() => buildGraphProvider({
            modelProvider: 'gemini' // gemini is not supported for graph dispatch (Sub-3 scope)
        })).toThrow(/buildGraphProvider: unsupported modelProvider 'gemini'/);
    });

    test('modelProvider=ollama instantiates native Ollama provider with config', () => {
        const factoryCalls = [];
        const fakeProvider = {generate: async () => ({content: 'ollama-result'})};

        const provider = buildGraphProvider({
            modelProvider        : 'ollama',
            ollamaConfig         : {host: 'http://ollama.test', model: 'gemma4', embeddingModel: 'qwen-embed', keep_alive: -1},
            ollamaProviderFactory: (cfg) => {
                factoryCalls.push(cfg);
                return fakeProvider;
            }
        });

        expect(provider).toBe(fakeProvider);
        expect(factoryCalls).toEqual([{
            modelName     : 'gemma4',
            host          : 'http://ollama.test',
            embeddingModel: 'qwen-embed',
            keepAlive     : -1
        }]);
    });

    test('modelProvider=ollama defaults embeddingModel to null when not configured', () => {
        const factoryCalls = [];
        buildGraphProvider({
            modelProvider        : 'ollama',
            ollamaConfig         : {host: 'http://ollama.test', model: 'gemma4'}, // no embeddingModel
            ollamaProviderFactory: (cfg) => { factoryCalls.push(cfg); return {generate: async () => ({})}; }
        });

        expect(factoryCalls[0].embeddingModel).toBe(null);
    });

    test('modelProvider=openAiCompatible instantiates OpenAi-compatible provider with config', () => {
        const factoryCalls = [];
        const fakeProvider = {generate: async () => ({content: 'oai-result'})};

        const provider = buildGraphProvider({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', model: 'gemma-4-31b', apiKey: 'sk-test', keep_alive: -1},
            openAiCompatibleProviderFactory: (cfg) => {
                factoryCalls.push(cfg);
                return fakeProvider;
            }
        });

        expect(provider).toBe(fakeProvider);
        expect(factoryCalls).toEqual([{
            modelName: 'gemma-4-31b',
            host     : 'http://oai.test',
            apiKey   : 'sk-test',
            keepAlive: -1
        }]);
    });

    test('modelProvider=openAiCompatible defaults apiKey to empty when not configured', () => {
        const factoryCalls = [];
        buildGraphProvider({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', model: 'oai-model'}, // no apiKey
            openAiCompatibleProviderFactory: (cfg) => { factoryCalls.push(cfg); return {generate: async () => ({})}; }
        });

        expect(factoryCalls[0].apiKey).toBe('');
    });

    test('returned provider exposes generate() method (Ollama envelope shape)', async () => {
        const provider = buildGraphProvider({
            modelProvider        : 'ollama',
            ollamaConfig         : {host: 'http://ollama.test', model: 'gemma4'},
            ollamaProviderFactory: () => ({
                async generate(input) {
                    return {content: 'ollama-generated', raw: {message: {content: 'ollama-generated'}}};
                }
            })
        });

        const result = await provider.generate('hello world');
        expect(result.content).toBe('ollama-generated');
    });

    test('returned provider exposes generate() method (OpenAiCompatible envelope shape)', async () => {
        const provider = buildGraphProvider({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', model: 'oai-model'},
            openAiCompatibleProviderFactory: () => ({
                async generate(input) {
                    return {content: 'oai-generated'};
                }
            })
        });

        const result = await provider.generate('hello world');
        expect(result.content).toBe('oai-generated');
    });
});
