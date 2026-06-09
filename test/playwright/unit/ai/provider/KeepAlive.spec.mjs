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
import http           from 'http';

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

async function createOllamaChatServer(payloads) {
    const server = http.createServer((req, res) => {
        let body = '';

        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            payloads.push(JSON.parse(body));
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({message: {content: 'ok'}}));
        });
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    return {
        host: `http://127.0.0.1:${server.address().port}`,
        async close() {
            await new Promise(resolve => server.close(resolve));
        }
    };
}

test.describe('AI provider keep_alive payload shape (#12080, #12089)', () => {
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

    test('Ollama.generate() defaults and overrides keep_alive at the top-level payload', async () => {
        const payloads = [];
        const server = await createOllamaChatServer(payloads);

        try {
            const provider = Neo.create(OllamaProvider, {
                host     : server.host,
                modelName: 'gemma4-test'
            });

            const defaultResult = await provider.generate('hello', {temperature: 0.2});
            const overrideResult = await provider.generate('hello', {keep_alive: 0, temperature: 0.2});

            expect(defaultResult.content).toBe('ok');
            expect(overrideResult.content).toBe('ok');
        } finally {
            await server.close();
        }

        expect(payloads).toHaveLength(2);
        expect(payloads[0]).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            keep_alive: -1,
            options   : {
                temperature: 0.2
            }
        });
        expect(payloads[1]).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            keep_alive: 0,
            options   : {
                temperature: 0.2
            }
        });
        expect(payloads[0].options.keep_alive).toBeUndefined();
        expect(payloads[1].options.keep_alive).toBeUndefined();
    });

    test('Ollama.generate() aborts a hung request at options.timeoutMs with a labeled timeout error (#12803)', async () => {
        // A server that accepts the request but never responds — simulates a long inference
        // holding the one serialized local endpoint, so the configurable socket timeout fires.
        const server = http.createServer((req) => {
            req.on('data', () => {});
            req.on('end', () => {/* intentionally never respond */});
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const host = `http://127.0.0.1:${server.address().port}`;

        try {
            const provider = Neo.create(OllamaProvider, {host, modelName: 'gemma4-test'});

            const error = await provider.generate('hello', {
                timeoutMs     : 50,
                operationLabel: 'ask_knowledge_base synthesis'
            }).then(() => null, e => e);

            expect(error?.message).toMatch(
                /\[Ollama\] ask_knowledge_base synthesis timed out after 50ms \(host=http:\/\/127\.0\.0\.1:\d+, model=gemma4-test\)/
            );
            expect(error?.code).toBe('PROVIDER_TIMEOUT');
            expect(error?.provider).toBe('Ollama');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('Ollama.generate() honors options.signal and aborts the in-flight request (#12814)', async () => {
        // A hung server (accepts but never responds) — so only an honored abort signal can end
        // the request quickly; the prior signal-stripping behavior would hang past the test.
        const server = http.createServer((req) => {
            req.on('data', () => {});
            req.on('end', () => {/* intentionally never respond */});
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const host = `http://127.0.0.1:${server.address().port}`;

        try {
            const provider   = Neo.create(OllamaProvider, {host, modelName: 'gemma4-test'});
            const controller = new AbortController();

            const promise = provider.generate('hello', {
                signal        : controller.signal,
                operationLabel: 'daemon-yield cancel'
            });

            controller.abort();

            const error = await promise.then(() => null, e => e);

            expect(error).toBeTruthy();
            // Honored upstream signal → an AbortError, NOT a hang and NOT the provider-timeout shape.
            expect(error.code === 'ABORT_ERR' || error.name === 'AbortError').toBe(true);
            expect(error.code).not.toBe('PROVIDER_TIMEOUT');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('Ollama.preparePayload() defaults keep_alive for direct payload consumers', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });

        const payload = provider.preparePayload('hello', {temperature: 0.2}, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            keep_alive: -1,
            options   : {
                temperature: 0.2
            }
        });
    });

    test('Ollama.stream() defaults keep_alive to top-level payload', async () => {
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

        for await (const chunk of provider.stream('hello', {temperature: 0.2})) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['ok', ' done']);
        expect(capturedPayload).toMatchObject({
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: -1,
            options   : {
                temperature: 0.2
            }
        });
        expect(capturedPayload.options.keep_alive).toBeUndefined();
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

    test('OpenAiCompatible.stream() defaults keep_alive to top-level payload', async () => {
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

        for await (const chunk of provider.stream('hello', {num_ctx: 8192, temperature: 0.2})) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['ok']);
        expect(capturedPayload).toMatchObject({
            model      : 'gemma4-test',
            stream     : true,
            keep_alive : -1,
            temperature: 0.2
        });
        expect(capturedPayload.options).toBeUndefined();
        expect(capturedPayload.num_ctx).toBeUndefined();
    });

    test('OpenAiCompatible.stream() keeps explicit keep_alive top-level', async () => {
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

    test('OpenAiCompatible.stream() yields non-SSE JSON message content', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://openai-compatible.test/v1/chat/completions');
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    JSON.stringify({choices: [{message: {content: 'json ok'}}]})
                ])
            };
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });
        const chunks = [];

        for await (const chunk of provider.stream('hello', {response_format: {type: 'json_object'}})) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(['json ok']);
        expect(capturedPayload).toMatchObject({
            model          : 'gemma4-test',
            stream         : true,
            keep_alive     : -1,
            response_format: {type: 'json_object'}
        });
    });

    test('OpenAiCompatible.stream() aborts a hung request on timeout without leaking transport options', async () => {
        let capturedPayload, aborted = false, abortReason;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://openai-compatible.test/v1/chat/completions');
            capturedPayload = JSON.parse(init.body);

            return new Promise((resolve, reject) => {
                init.signal.addEventListener('abort', () => {
                    aborted    = init.signal.aborted;
                    abortReason = init.signal.reason;
                    reject(abortReason);
                }, {once: true});
            });
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });

        const collect = async () => {
            const chunks = [];
            for await (const chunk of provider.stream('hello', {
                operationLabel: 'miniSummary backfill',
                temperature   : 0.2,
                timeoutMs     : 25
            })) {
                chunks.push(chunk);
            }
            return chunks;
        };

        await expect(collect()).rejects.toThrow(
            /\[OpenAiCompatible\] miniSummary backfill timed out after 25ms \(host=http:\/\/openai-compatible\.test, model=gemma4-test\)/
        );

        expect(aborted).toBe(true);
        expect(abortReason?.code).toBe('PROVIDER_TIMEOUT');
        expect(abortReason?.provider).toBe('OpenAiCompatible');
        expect(capturedPayload).toMatchObject({
            model      : 'gemma4-test',
            stream     : true,
            keep_alive : -1,
            temperature: 0.2
        });
        expect(capturedPayload.operationLabel).toBeUndefined();
        expect(capturedPayload.timeoutMs).toBeUndefined();
    });

    test('OpenAiCompatible.generate() defaults keep_alive through the streaming payload', async () => {
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

        const result = await provider.generate('hello', {temperature: 0.2});

        expect(result.content).toBe('ok');
        expect(capturedPayload).toMatchObject({
            model      : 'gemma4-test',
            stream     : true,
            keep_alive : -1,
            temperature: 0.2
        });
    });

    test('OpenAiCompatible.generate() aggregates non-SSE JSON message content', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://openai-compatible.test/v1/chat/completions');
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    JSON.stringify({
                        choices: [{
                            message: {
                                role   : 'assistant',
                                content: '{"status":"ok"}'
                            }
                        }]
                    })
                ])
            };
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });

        const result = await provider.generate('hello', {responseMimeType: 'application/json'});

        expect(result).toEqual({
            content: '{"status":"ok"}',
            raw    : {
                message: {
                    content: '{"status":"ok"}'
                }
            }
        });
        expect(capturedPayload).toMatchObject({
            model          : 'gemma4-test',
            stream         : true,
            keep_alive     : -1,
            response_format: {type: 'json_object'}
        });
        expect(capturedPayload.responseMimeType).toBeUndefined();
    });
});
