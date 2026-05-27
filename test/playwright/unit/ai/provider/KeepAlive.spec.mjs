import {setup} from '../../../setup.mjs';

const appName = 'AiProviderKeepAliveTest';

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

function createReadableStream(chunks) {
    const encoder = new TextEncoder();
    const encoded = chunks.map(chunk => encoder.encode(chunk));

    return {
        getReader() {
            let index = 0;

            return {
                async read() {
                    if (index >= encoded.length) {
                        return {done: true};
                    }

                    return {
                        done : false,
                        value: encoded[index++]
                    };
                }
            };
        }
    };
}

test.describe('AI provider keep_alive payload shape (#12080)', () => {
    let OllamaProvider;
    let OpenAiCompatibleProvider;
    let originalFetch;

    test.beforeAll(async () => {
        OllamaProvider           = (await import('../../../../../ai/provider/Ollama.mjs')).default;
        OpenAiCompatibleProvider = (await import('../../../../../ai/provider/OpenAiCompatible.mjs')).default;
    });

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('Ollama.stream() promotes keep_alive to top-level payload', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://ollama.test/api/chat');
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    '{"message":{"content":"ok"},"done":false}\n',
                    '{"message":{"content":" done"},"done":true}\n'
                ])
            };
        };

        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });
        const chunks = [];

        for await (const chunk of provider.stream('hello', {keep_alive: '10m', temperature: 0.2})) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['ok', ' done']);
        expect(capturedPayload).toMatchObject({
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: '10m',
            options   : {
                temperature: 0.2
            }
        });
        expect(capturedPayload.options.keep_alive).toBeUndefined();
    });

    test('OpenAiCompatible.stream() already keeps keep_alive top-level', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://openai-compatible.test/v1/chat/completions');
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
                    'data: [DONE]\n\n'
                ])
            };
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });
        const chunks = [];

        for await (const chunk of provider.stream('hello', {keep_alive: '10m', num_ctx: 8192, temperature: 0.2})) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['ok']);
        expect(capturedPayload).toMatchObject({
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: '10m',
            temperature: 0.2
        });
        expect(capturedPayload.options).toBeUndefined();
        expect(capturedPayload.num_ctx).toBeUndefined();
    });
});
