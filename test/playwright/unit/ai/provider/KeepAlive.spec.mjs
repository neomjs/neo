import {setup} from '../../../setup.mjs';

const appName      = 'AiProviderKeepAliveTest';
const statusSchema = {
    type      : 'object',
    properties: {
        status: {type: 'string'}
    },
    required            : ['status'],
    additionalProperties: false
};

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

async function createOllamaChatServer(payloads, responsePayload = {message: {content: 'ok'}}) {
    const server = http.createServer((req, res) => {
        let body = '';

        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            payloads.push(JSON.parse(body));
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(responsePayload));
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
    let buildOllamaEvalAttribution;
    let calculateOllamaTokensPerSecond;
    let extractOllamaEvalSample;
    let originalFetch;

    test.beforeAll(async () => {
        const ollamaModule = await import('../../../../../ai/provider/Ollama.mjs');
        OllamaProvider           = ollamaModule.default;
        buildOllamaEvalAttribution = ollamaModule.buildOllamaEvalAttribution;
        calculateOllamaTokensPerSecond = ollamaModule.calculateOllamaTokensPerSecond;
        extractOllamaEvalSample  = ollamaModule.extractOllamaEvalSample;
        OpenAiCompatibleProvider = (await import('../../../../../ai/provider/OpenAiCompatible.mjs')).default;
    });

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('Ollama eval metrics normalize chat and embedding raw counters (#13923)', () => {
        expect(calculateOllamaTokensPerSecond(40, 2_000_000_000)).toBe(20);
        expect(calculateOllamaTokensPerSecond(40, 0)).toBeNull();

        const chatSample = extractOllamaEvalSample({
            model               : 'gemma4:26b',
            eval_count          : 80,
            eval_duration       : 4_000_000_000,
            prompt_eval_count   : 20,
            prompt_eval_duration: 1_000_000_000
        }, {role: 'chat'});

        const embeddingSample = extractOllamaEvalSample({
            embeddings          : [[0.1, 0.2]],
            prompt_eval_count   : '64',
            prompt_eval_duration: '2000000000'
        }, {
            role : 'embedding',
            model: 'qwen3-embedding'
        });

        expect(chatSample).toMatchObject({
            model                    : 'gemma4:26b',
            role                     : 'chat',
            evalCount                : 80,
            evalTokensPerSecond      : 20,
            promptEvalCount          : 20,
            promptEvalTokensPerSecond: 20,
            totalEvalCount           : 100,
            totalEvalDurationNs      : 5_000_000_000,
            totalTokensPerSecond     : 20
        });

        expect(embeddingSample).toMatchObject({
            model                    : 'qwen3-embedding',
            role                     : 'embedding',
            evalCount                : null,
            promptEvalCount          : 64,
            promptEvalTokensPerSecond: 32,
            totalEvalCount           : 64,
            totalTokensPerSecond     : 32
        });
    });

    test('Ollama eval attribution separates busy, stuck, and unknown models (#13923)', () => {
        const attribution = buildOllamaEvalAttribution([
            extractOllamaEvalSample({
                model        : 'gemma4:26b',
                eval_count   : 120,
                eval_duration: 3_000_000_000
            }, {role: 'chat'}),
            extractOllamaEvalSample({
                model               : 'qwen3-embedding',
                prompt_eval_count   : 0,
                prompt_eval_duration: 2_000_000_000
            }, {role: 'embedding'}),
            extractOllamaEvalSample({model: 'resident-no-counters'}, {role: 'chat'})
        ]);

        expect(attribution.primaryLoad).toMatchObject({
            model          : 'gemma4:26b',
            role           : 'chat',
            state          : 'busy',
            tokensPerSecond: 40
        });
        expect(attribution.busyModels.map(item => item.model)).toEqual(['gemma4:26b']);
        expect(attribution.stuckModels.map(item => item.model)).toEqual(['qwen3-embedding']);
        expect(attribution.models.find(item => item.model === 'resident-no-counters')).toMatchObject({
            state          : 'unknown',
            tokensPerSecond: null
        });
        expect(attribution.roleLoad.chat).toMatchObject({
            role           : 'chat',
            modelCount     : 2,
            tokensPerSecond: 40
        });
        expect(attribution.roleLoad.embedding).toMatchObject({
            role           : 'embedding',
            modelCount     : 1,
            tokensPerSecond: 0
        });
        expect(attribution.primaryRole).toMatchObject({role: 'chat'});
    });

    test('Ollama provider returns normalized eval samples for chat and embedding (#13923)', async () => {
        const payloads = [];
        const server   = http.createServer((req, res) => {
            let body = '';

            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                payloads.push({url: req.url, body: JSON.parse(body)});
                res.writeHead(200, {'Content-Type': 'application/json'});

                if (req.url === '/api/embed') {
                    res.end(JSON.stringify({
                        embeddings          : [[0.1, 0.2]],
                        prompt_eval_count   : 30,
                        prompt_eval_duration: 2_000_000_000
                    }));
                    return;
                }

                res.end(JSON.stringify({
                    message      : {content: 'ok'},
                    eval_count   : 20,
                    eval_duration: 1_000_000_000
                }));
            });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

        try {
            const provider = Neo.create(OllamaProvider, {
                host          : `http://127.0.0.1:${server.address().port}`,
                modelName     : 'gemma4-test',
                embeddingModel: 'qwen3-embedding'
            });

            const chatResult      = await provider.generate('hello');
            const embeddingResult = await provider.embed('hello', {num_ctx: 32768});
            const attribution     = buildOllamaEvalAttribution([
                chatResult.evalSample,
                embeddingResult.evalSample
            ]);

            expect(chatResult.evalSample).toMatchObject({
                model               : 'gemma4-test',
                role                : 'chat',
                evalCount           : 20,
                evalTokensPerSecond : 20,
                totalTokensPerSecond: 20
            });
            expect(embeddingResult.evalSample).toMatchObject({
                model                    : 'qwen3-embedding',
                role                     : 'embedding',
                promptEvalCount          : 30,
                promptEvalTokensPerSecond: 15,
                totalTokensPerSecond     : 15
            });
            expect(attribution.models).toEqual([
                expect.objectContaining({
                    model          : 'gemma4-test',
                    role           : 'chat',
                    state          : 'busy',
                    tokensPerSecond: 20
                }),
                expect.objectContaining({
                    model          : 'qwen3-embedding',
                    role           : 'embedding',
                    state          : 'busy',
                    tokensPerSecond: 15
                })
            ]);
            expect(attribution.roleLoad.chat.throughputShare).toBeCloseTo(20 / 35);
            expect(attribution.roleLoad.embedding.throughputShare).toBeCloseTo(15 / 35);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }

        expect(payloads.map(item => item.url)).toEqual(['/api/chat', '/api/embed']);
        expect(payloads[1].body).toMatchObject({
            model   : 'qwen3-embedding',
            input   : 'hello',
            truncate: false,
            options : {
                num_ctx: 32768
            }
        });
    });

    test('Ollama.generate() defaults and overrides keep_alive at the top-level payload', async () => {
        const payloads = [];
        const server   = await createOllamaChatServer(payloads);

        try {
            const provider = Neo.create(OllamaProvider, {
                host     : server.host,
                modelName: 'gemma4-test'
            });

            const defaultResult  = await provider.generate('hello', {temperature: 0.2});
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

    test('Ollama.generate() maps maxCompletionTokens to native num_predict (#13984)', async () => {
        const payloads = [];
        const server   = await createOllamaChatServer(payloads);

        try {
            const provider = Neo.create(OllamaProvider, {
                host     : server.host,
                modelName: 'gemma4-test'
            });

            const result = await provider.generate('hello', {
                maxCompletionTokens: 8192,
                temperature        : 0.2
            });

            expect(result.content).toBe('ok');
        } finally {
            await server.close();
        }

        expect(payloads).toHaveLength(1);
        expect(payloads[0]).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            keep_alive: -1,
            options   : {
                num_predict: 8192,
                temperature: 0.2
            }
        });
        expect(payloads[0].options.maxCompletionTokens).toBeUndefined();
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

    test('Ollama.embed() aborts a hung request at options.timeoutMs with a labeled timeout error (#14052)', async () => {
        // Mirrors the chat timeout regression but exercises the native `/api/embed` transport.
        const server = http.createServer((req) => {
            req.on('data', () => {});
            req.on('end', () => {/* intentionally never respond */});
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const host = `http://127.0.0.1:${server.address().port}`;

        try {
            const provider = Neo.create(OllamaProvider, {
                embeddingModel: 'qwen3-embedding-test',
                host,
                modelName: 'gemma4-test'
            });

            const error = await provider.embed('hello', {
                timeoutMs     : 25,
                operationLabel: 'native embedding probe'
            }).then(() => null, e => e);

            expect(error?.message).toMatch(
                /\[Ollama\] native embedding probe timed out after 25ms \(host=http:\/\/127\.0\.0\.1:\d+, model=qwen3-embedding-test\)/
            );
            expect(error?.code).toBe('PROVIDER_TIMEOUT');
            expect(error?.provider).toBe('Ollama');
            expect(error?.timeoutMs).toBe(25);
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

    test('Ollama.preparePayload() promotes responseSchema to native format without mutating caller options (#13855)', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });
        const options = {
            responseMimeType: 'application/json',
            responseSchema  : statusSchema,
            temperature     : 0
        };

        const payload = provider.preparePayload('hello', options, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            format    : statusSchema,
            keep_alive: -1,
            options   : {
                temperature: 0
            }
        });
        expect(payload.options.responseMimeType).toBeUndefined();
        expect(payload.options.responseSchema).toBeUndefined();
        expect(options.responseSchema).toBe(statusSchema);
    });

    test('Ollama.preparePayload() maps OpenAI-compatible JSON schema and think to native top-level fields (#13855)', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });

        const payload = provider.preparePayload('hello', {
            response_format: {
                type       : 'json_schema',
                json_schema: {
                    name  : 'StatusPayload',
                    schema: statusSchema,
                    strict: true
                }
            },
            think      : false,
            temperature: 0
        }, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            format    : statusSchema,
            think     : false,
            keep_alive: -1,
            options   : {
                temperature: 0
            }
        });
        expect(payload.options.response_format).toBeUndefined();
        expect(payload.options.think).toBeUndefined();
    });

    test('Ollama.preparePayload() maps reasoning_effort none to native think false (#13854)', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });

        const payload = provider.preparePayload('hello', {
            reasoning_effort: 'none',
            temperature     : 0
        }, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            think     : false,
            keep_alive: -1,
            options   : {
                temperature: 0
            }
        });
        expect(payload.options.reasoning_effort).toBeUndefined();
    });

    test('Ollama.preparePayload() preserves explicit think over reasoning_effort (#13854)', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });

        const payload = provider.preparePayload('hello', {
            reasoning_effort: 'none',
            think           : true,
            temperature     : 0
        }, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            think     : true,
            keep_alive: -1,
            options   : {
                temperature: 0
            }
        });
        expect(payload.options.reasoning_effort).toBeUndefined();
        expect(payload.options.think).toBeUndefined();
    });

    test('Ollama.preparePayload() preserves plain JSON extraction for response_format json_object (#13855)', () => {
        const provider = Neo.create(OllamaProvider, {
            host     : 'http://ollama.test',
            modelName: 'gemma4-test'
        });

        const payload = provider.preparePayload('hello', {
            response_format: {type: 'json_object'},
            temperature    : 0
        }, false);

        expect(payload).toMatchObject({
            model     : 'gemma4-test',
            stream    : false,
            format    : 'json',
            keep_alive: -1,
            options   : {
                temperature: 0
            }
        });
        expect(payload.options.response_format).toBeUndefined();
    });

    test('Ollama.generate() can verify native format against a live env-configured daemon (#13855)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: live Ollama daemon is an operator-local dependency');
        test.skip(process.env.NEO_RUN_LIVE_OLLAMA_TESTS !== '1', 'Skipping live Ollama test; set NEO_RUN_LIVE_OLLAMA_TESTS=1 to run');

        const host      = process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434';
        const modelName = process.env.NEO_OLLAMA_MODEL || 'gemma4:26b';
        const timeoutMs = Number(process.env.NEO_OLLAMA_TEST_TIMEOUT_MS) || 120000;
        const provider  = Neo.create(OllamaProvider, {host, modelName});

        const result = await provider.generate('Return exactly this JSON object: {"status":"ok"}', {
            responseSchema: statusSchema,
            temperature   : 0,
            think         : false,
            timeoutMs
        });

        expect(JSON.parse(result.content)).toEqual({status: 'ok'});
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
            model      : 'gemma4-test',
            stream     : true,
            keep_alive : '10m',
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
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: -1
        });
        // A schema-less json_object request no longer emits the LM-Studio-rejected json_object form.
        expect(capturedPayload.response_format).toBeUndefined();
    });

    test('OpenAiCompatible.stream() emits response_format json_schema when a responseSchema is supplied', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    JSON.stringify({choices: [{message: {content: '{"x":"ok"}'}}]})
                ])
            };
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });
        const schema = {type: 'object', properties: {x: {type: 'string'}}, required: ['x']};

        for await (const _chunk of provider.stream('hello', {responseSchema: schema, responseSchemaName: 'mySchema'})) { /* drain */ }

        expect(capturedPayload.response_format).toEqual({
            type       : 'json_schema',
            json_schema: {name: 'mySchema', strict: false, schema}
        });
        // Schema-carrying keys are consumed by preparePayload, not leaked into the wire payload.
        expect(capturedPayload.responseSchema).toBeUndefined();
        expect(capturedPayload.responseSchemaName).toBeUndefined();
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

    test('OpenAiCompatible.generate() preserves streaming finish_reason metadata (#13984)', async () => {
        let capturedPayload;

        globalThis.fetch = async (url, init) => {
            expect(url).toBe('http://openai-compatible.test/v1/chat/completions');
            capturedPayload = JSON.parse(init.body);

            return {
                ok  : true,
                body: createReadableStream([
                    'data: {"choices":[{"delta":{"content":"{\\"status\\":"}}]}\n\n',
                    'data: {"choices":[{"delta":{"content":"\\"partial\\"}"}}]}\n\n',
                    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
                    'data: [DONE]\n\n'
                ])
            };
        };

        const provider = Neo.create(OpenAiCompatibleProvider, {
            host     : 'http://openai-compatible.test',
            modelName: 'gemma4-test'
        });

        const result = await provider.generate('hello', {maxCompletionTokens: 8192});

        expect(result.content).toBe('{"status":"partial"}');
        expect(result.finish_reason).toBe('length');
        expect(result.raw.finish_reason).toBe('length');
        expect(result.raw.choices[0].finish_reason).toBe('length');
        expect(capturedPayload).toMatchObject({
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: -1,
            max_tokens: 8192
        });
        expect(capturedPayload.maxCompletionTokens).toBeUndefined();
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
            model     : 'gemma4-test',
            stream    : true,
            keep_alive: -1
        });
        // A schema-less application/json request no longer emits the rejected json_object form.
        expect(capturedPayload.response_format).toBeUndefined();
        expect(capturedPayload.responseMimeType).toBeUndefined();
    });
});
