import {setup} from '../../../../setup.mjs';

const appName = 'SessionServiceBuildChatModelTest';

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

test.describe('SessionService.buildChatModel (#11965 Sub-2)', () => {
    let buildChatModel;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/SessionService.mjs');
        buildChatModel = mod.buildChatModel;
    });

    test('throws for unsupported modelProvider (no silent Gemini fallthrough)', () => {
        expect(() => buildChatModel({
            modelProvider: 'bogus-provider'
        })).toThrow(/unsupported modelProvider 'bogus-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/);

        expect(() => buildChatModel({
            modelProvider: 'mystery'
        })).toThrow(/unsupported modelProvider 'mystery'/);
    });

    test('modelProvider=ollama returns generateContent wrapping native Ollama provider', async () => {
        const captured = [];
        const fakeOllama = {
            host         : 'fake://injected',
            modelName    : 'fake-injected',
            async generate(promptText) {
                captured.push({promptText, host: this.host, modelName: this.modelName});
                return {content: 'fake-content-for: ' + promptText, raw: {message: {content: 'fake-content-for: ' + promptText}}};
            }
        };

        const model = buildChatModel({
            modelProvider          : 'ollama',
            ollamaConfig           : {host: 'http://ollama.test', model: 'test-gemma', embeddingModel: null},
            ollamaProviderFactory  : (cfg) => {
                fakeOllama.host      = cfg.host;
                fakeOllama.modelName = cfg.modelName;
                return fakeOllama;
            }
        });

        expect(model).toBeTruthy();
        expect(typeof model.generateContent).toBe('function');

        const response = await model.generateContent('hello world');

        // Envelope shape: Gemini-compatible {response: {text()}}.
        expect(typeof response.response.text).toBe('function');
        expect(response.response.text()).toBe('fake-content-for: hello world');

        // Provider received the host/model from injected config.
        expect(captured).toHaveLength(1);
        expect(captured[0]).toEqual({
            promptText: 'hello world',
            host      : 'http://ollama.test',
            modelName : 'test-gemma'
        });
    });

    test('modelProvider=ollama refreshes provider host/model per invocation', async () => {
        const captured = [];
        const fakeOllama = {
            host     : null,
            modelName: null,
            async generate(promptText) {
                captured.push({promptText, host: this.host, modelName: this.modelName});
                return {content: 'r:' + promptText};
            }
        };

        // Pass a mutable ollamaConfig ref so we can change it between invocations.
        const ollamaConfig = {host: 'http://v1.test', model: 'model-v1'};
        const model = buildChatModel({
            modelProvider         : 'ollama',
            ollamaConfig,
            ollamaProviderFactory : () => fakeOllama
        });

        await model.generateContent('first');
        ollamaConfig.host  = 'http://v2.test';
        ollamaConfig.model = 'model-v2';
        await model.generateContent('second');

        expect(captured).toEqual([
            {promptText: 'first',  host: 'http://v1.test', modelName: 'model-v1'},
            {promptText: 'second', host: 'http://v2.test', modelName: 'model-v2'}
        ]);
    });

    test('modelProvider=openAiCompatible returns generateContent wrapping OpenAi-compatible provider', async () => {
        const captured = [];
        const fakeProvider = {
            host     : null,
            modelName: null,
            apiKey   : null,
            async generate(promptText) {
                captured.push({promptText, host: this.host, modelName: this.modelName, apiKey: this.apiKey});
                return {content: 'oai:' + promptText};
            }
        };

        const model = buildChatModel({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', apiKey: 'sk-test', model: 'oai-model'},
            openAiCompatibleProviderFactory: () => fakeProvider
        });

        expect(model).toBeTruthy();
        const response = await model.generateContent('hello');
        expect(response.response.text()).toBe('oai:hello');
        expect(captured[0]).toMatchObject({host: 'http://oai.test', modelName: 'oai-model', apiKey: 'sk-test'});
    });

    test('modelProvider=gemini returns null when geminiApiKey is missing', () => {
        const model = buildChatModel({
            modelProvider: 'gemini',
            geminiApiKey : null
        });
        expect(model).toBe(null);
    });

    test('modelProvider=gemini delegates to geminiClientFactory when key present', () => {
        const fakeGemini = {generateContent: async () => ({response: {text: () => 'gemini-mock'}})};
        const factoryCalls = [];
        const model = buildChatModel({
            modelProvider       : 'gemini',
            geminiApiKey        : 'gem-key',
            geminiModelName     : 'gemini-pro',
            geminiClientFactory : (apiKey, modelName) => {
                factoryCalls.push({apiKey, modelName});
                return fakeGemini;
            }
        });
        expect(model).toBe(fakeGemini);
        expect(factoryCalls).toEqual([{apiKey: 'gem-key', modelName: 'gemini-pro'}]);
    });
});