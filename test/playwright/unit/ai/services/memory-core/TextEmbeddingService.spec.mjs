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
import {execFile}     from 'child_process';
import {promisify}    from 'util';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
}                     from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Runs a config-sensitive embedding probe in a fresh process before any AiConfig singleton exists.
 * @param {Function} probe Self-contained async child probe.
 * @param {Object} [env={}] Environment overrides materialized by the child config provider.
 * @returns {Promise<Object>} Last-line JSON evidence emitted by the child probe.
 */
async function runIsolatedEmbeddingProbe(probe, env = {}) {
    const source = `
        const {setup} = await import('./test/playwright/setup.mjs');
        await import('./src/Neo.mjs');
        await import('./src/core/_export.mjs');
        setup({
            neoConfig: {unitTestMode: true},
            appConfig: {name: 'TextEmbeddingIsolatedProbe', isMounted: () => true, vnodeInitialising: false}
        });
        await (${probe.toString()})();
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', source], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NEO_UNIT_TEST_MODE: 'true',
            ...env
        },
        killSignal: 'SIGKILL',
        maxBuffer : 1024 * 1024,
        timeout   : 10_000
    });
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);

    return JSON.parse(lines.at(-1));
}

/**
 * @summary Coverage for the TextEmbeddingService Gemini-init gate.
 *
 * Implicit provider fallback is forbidden inside TextEmbeddingService. The initialization gate
 * keeps routing deterministic: the singleton only initializes a Gemini embedding client when the
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
        aiConfig             = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
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

    test('records native Ollama as unqueued without leaking attribution controls to the provider', async () => {
        const captured   = [];
        const activities = [];
        const recorder   = {
            beginProviderActivity(entry) { activities.push({type: 'begin', entry}); return `activity-${activities.length}` },
            startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
            completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
        };

        TextEmbeddingService.ollamaProvider = {
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2]]};
            }
        };

        await TextEmbeddingService.embedText('hello', 'ollama', {
            operationLabel          : 'session/private-123',
            operationStage          : 'embedding-canary',
            providerActivityRecorder: recorder,
            service                 : 'memory-core'
        });
        await TextEmbeddingService.embedText('unknown-stage', 'ollama', {
            operationLabel          : 'asset/private-456',
            providerActivityRecorder: recorder,
            service                 : 'memory-core'
        });

        expect(captured[0].options).toEqual({
            num_ctx       : aiConfig.localModels.embedding.contextLimitTokens,
            operationLabel: 'session/private-123',
            timeoutMs     : aiConfig.ollama.embeddingTimeoutMs,
            truncate      : false
        });
        expect(activities.filter(item => item.type === 'begin').map(item => item.entry)).toEqual([
            expect.objectContaining({
                operationStage  : 'embedding-canary',
                priority        : 'interactive',
                provider        : 'ollama',
                queueDisposition: 'not-applicable',
                role            : 'embedding',
                service         : 'memory-core'
            }),
            expect.objectContaining({
                operationStage  : 'unknown',
                queueDisposition: 'not-applicable'
            })
        ]);
        expect(activities.filter(item => item.type === 'complete')).toHaveLength(2);
    });

    test('attributes native Ollama to the cached provider model without changing its request shape', async () => {
        const activities = [];
        const captured   = [];

        TextEmbeddingService.ollamaProvider = {
            embeddingModel: 'cached-ollama-model-a',
            async embed(input, options) {
                captured.push({input, options});
                return {embeddings: [[0.1, 0.2]]};
            }
        };

        await TextEmbeddingService.embedText('hello', 'ollama', {
            operationStage          : 'embedding-canary',
            providerActivityRecorder: {
                beginProviderActivity(entry) { activities.push(entry); return 'cached-ollama-activity' },
                startProviderActivity() {},
                completeProviderActivity() {}
            },
            service: 'memory-core'
        });

        expect(activities[0].model).toBe('cached-ollama-model-a');
        expect(captured[0].options).not.toHaveProperty('model');
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
        // Historically, any unknown explicitProvider value fell through to the Gemini branch.
        // That silent fallback
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

test.describe.serial('TextEmbeddingService #15694 — provider-neutral cancellation contract', () => {
    let TextEmbeddingService;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs');

        TextEmbeddingService = mod.default;
    });

    test.afterEach(() => {
        TextEmbeddingService.ollamaProvider = null;
    });

    test('Ollama receives the identical signal and restores the exact caller Error', async () => {
        const
            controller = new AbortController(),
            reason     = new Error('stop native Ollama transport');

        let capturedSignal;
        TextEmbeddingService.ollamaProvider = {
            embed(input, options) {
                capturedSignal = options.signal;

                return new Promise((resolve, reject) => {
                    options.signal.addEventListener('abort', () => {
                        reject(Object.assign(new Error('provider wrapper'), {name: 'AbortError'}));
                    }, {once: true});
                });
            }
        };

        const embeddingPromise = TextEmbeddingService.embedText('hello', 'ollama', {
            signal        : controller.signal,
            operationLabel: 'Ollama health probe'
        });

        controller.abort(reason);

        let observed;
        try {
            await embeddingPromise;
        } catch (error) {
            observed = error;
        }

        expect(capturedSignal).toBe(controller.signal);
        expect(observed).toBe(reason);
        expect(observed.code).not.toBe(PROVIDER_TIMEOUT_CODE);
    });

    test('non-Error abort reasons become a bounded structural AbortError before provider work', async () => {
        const
            controller     = new AbortController(),
            operationLabel = 'x'.repeat(160);

        let providerCalls = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                providerCalls++;
                return {embeddings: [[0.1]]};
            }
        };
        controller.abort('opaque-reason');

        let observed;
        try {
            await TextEmbeddingService.embedText('hello', 'ollama', {
                signal: controller.signal,
                operationLabel
            });
        } catch (error) {
            observed = error;
        }

        expect(providerCalls).toBe(0);
        expect(observed).toMatchObject({
            name          : 'AbortError',
            code          : 'ABORT_ERR',
            operationLabel: 'x'.repeat(120)
        });
        expect(observed.message).toBe(`${'x'.repeat(120)} aborted`);
    });

    test('rejects unknown call options before provider dispatch', async () => {
        let providerCalls = 0;
        TextEmbeddingService.ollamaProvider = {
            async embed() {
                providerCalls++;
                return {embeddings: [[0.1]]};
            }
        };

        await expect(TextEmbeddingService.embedText('hello', 'ollama', {timeoutMs: 5}))
            .rejects.toThrow(/unsupported embedding option\(s\): timeoutMs/);
        expect(providerCalls).toBe(0);
    });

    test('Gemini forwards signals and preserves the complete SDK abort taxonomy in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const {GoogleGenerativeAIAbortError} = await import('@google/generative-ai');
            const {default: Service}             = await import('./ai/services/memory-core/TextEmbeddingService.mjs');

            const forwardController = new AbortController();
            const calls             = [];

            Service.embeddingModel = {
                async embedContent(request, requestOptions) {
                    calls.push({kind: 'single', requestOptions});
                    return {embedding: {values: [0.1, 0.2]}};
                },
                async batchEmbedContents(request, requestOptions) {
                    calls.push({kind: 'batch', requestOptions});
                    return {embeddings: [{values: [0.3]}, {values: [0.4]}]};
                }
            };

            const single = await Service.embedText('one', 'gemini', {signal: forwardController.signal});
            const batch  = await Service.embedTexts(['two', 'three'], 'gemini', {signal: forwardController.signal});

            const exactController = new AbortController();
            const exactReason     = new Error('cancel Gemini probe');
            Service.embeddingModel = {
                embedContent(input, requestOptions) {
                    return new Promise((resolve, reject) => {
                        requestOptions.signal.addEventListener('abort', () => {
                            reject(new GoogleGenerativeAIAbortError('SDK wrapped the caller abort'));
                        }, {once: true});
                    });
                }
            };
            const exactPromise = Service.embedText('exact', 'gemini', {signal: exactController.signal});
            exactController.abort(exactReason);
            let exactObserved;
            try {
                await exactPromise;
            } catch (error) {
                exactObserved = error;
            }

            const fallbackController = new AbortController();
            Service.embeddingModel = {
                embedContent(input, requestOptions) {
                    return new Promise((resolve, reject) => {
                        requestOptions.signal.addEventListener('abort', () => {
                            reject(new GoogleGenerativeAIAbortError('SDK dropped a non-Error reason'));
                        }, {once: true});
                    });
                }
            };
            const fallbackPromise = Service.embedText('fallback', 'gemini', {
                signal        : fallbackController.signal,
                operationLabel: 'g'.repeat(160)
            });
            fallbackController.abort('opaque-reason');
            let fallbackObserved;
            try {
                await fallbackPromise;
            } catch (error) {
                fallbackObserved = error;
            }

            const liveController = new AbortController();
            const liveWrapper    = new GoogleGenerativeAIAbortError('SDK aborted independently');
            Service.embeddingModel = {
                async embedContent() {
                    throw liveWrapper;
                }
            };
            let liveObserved;
            try {
                await Service.embedText('live', 'gemini', {signal: liveController.signal});
            } catch (error) {
                liveObserved = error;
            }

            console.log(JSON.stringify({
                single,
                batch,
                singleSignalForwarded: calls[0].requestOptions.signal === forwardController.signal,
                batchSignalForwarded : calls[1].requestOptions.signal === forwardController.signal,
                exactReasonRestored  : exactObserved === exactReason,
                fallback             : {
                    name          : fallbackObserved?.name,
                    code          : fallbackObserved?.code,
                    operationLabel: fallbackObserved?.operationLabel,
                    message       : fallbackObserved?.message
                },
                liveWrapperPreserved: liveObserved === liveWrapper,
                liveSignalAborted   : liveController.signal.aborted
            }));
        }, {GEMINI_API_KEY: 'unit-test-key'});

        expect(evidence).toEqual({
            single               : [0.1, 0.2],
            batch                : [[0.3], [0.4]],
            singleSignalForwarded: true,
            batchSignalForwarded : true,
            exactReasonRestored  : true,
            fallback             : {
                name          : 'AbortError',
                code          : 'ABORT_ERR',
                operationLabel: 'g'.repeat(120),
                message       : `${'g'.repeat(120)} aborted`
            },
            liveWrapperPreserved: true,
            liveSignalAborted   : false
        });
    });

    test('attributes Gemini embeddings to the cached SDK endpoint model under config drift', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const {default: Service}  = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
            const {default: aiConfig} = await import('./ai/mcp/server/memory-core/config.template.mjs');
            const activities          = [];
            const requestModels       = [];
            const recorder            = {
                beginProviderActivity(entry) { activities.push(entry); return `activity-${activities.length}` },
                startProviderActivity() {},
                completeProviderActivity() {}
            };

            aiConfig.embeddingModel = 'live-config-model-b';
            Service.embeddingModel = {
                model: 'models/cached-sdk-model-a',
                async embedContent() {
                    return {embedding: {values: [0.1]}};
                },
                async batchEmbedContents({requests}) {
                    requestModels.push(...requests.map(request => request.model));
                    return {embeddings: requests.map(() => ({values: [0.2]}))};
                }
            };

            await Service.embedText('one', 'gemini', {
                operationStage          : 'kb-query-embedding',
                providerActivityRecorder: recorder,
                service                 : 'knowledge-base'
            });
            await Service.embedTexts(['two', 'three'], 'gemini', {
                operationStage          : 'kb-tenant-ingestion-embedding',
                providerActivityRecorder: recorder,
                service                 : 'knowledge-base'
            });

            console.log(JSON.stringify({
                models: activities.map(entry => entry.model),
                requestModels
            }));
        }, {GEMINI_API_KEY: 'unit-test-key'});

        expect(evidence).toEqual({
            models: [
                'models/cached-sdk-model-a',
                'models/cached-sdk-model-a'
            ],
            requestModels: [
                'live-config-model-b',
                'live-config-model-b'
            ]
        });
    });

    test('OpenAI-compatible retry and batch delays stop before later work in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const http                = await import('node:http');
            const {getEventListeners} = await import('node:events');

            let behavior                           = 'success';
            let closedHungRequests                 = 0;
            let heldResponse                       = null;
            let nextRequestObservedAfterAbortClose = false;
            let requestCount                       = 0;
            let requestInputs                      = [];

            const server = http.createServer((request, response) => {
                requestCount++;
                response.on('close', () => {
                    if (!response.writableEnded) {
                        closedHungRequests++;
                    }
                });

                let body = '';
                request.on('data', chunk => body += chunk);
                request.on('end', () => {
                    const payload = JSON.parse(body);
                    requestInputs.push(payload.input);

                    if (behavior === 'model-load') {
                        response.writeHead(400, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({error: 'Model was unloaded while the request was still in queue.'}));
                    } else if (behavior === 'contention') {
                        response.writeHead(408, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({error: 'provider contention'}));
                    } else {
                        if (behavior === 'hold-first' && requestCount === 1) {
                            heldResponse = response;
                            return;
                        }
                        if (behavior === 'hold-first') {
                            nextRequestObservedAfterAbortClose = closedHungRequests > 0;
                        }

                        const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
                        response.writeHead(200, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({
                            data: inputs.map((input, index) => ({index, embedding: [index + 0.1]}))
                        }));
                    }
                });
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

            try {
                Object.assign(process.env, {
                NEO_OPENAI_COMPATIBLE_HOST                      : `http://127.0.0.1:${server.address().port}`,
                NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_COUNT        : '2',
                NEO_OPENAI_COMPATIBLE_UNLOAD_RETRY_DELAY_MS     : '500',
                NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT    : '2',
                NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_DELAY_MS : '500',
                NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS     : '5000',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_CHUNK_SIZE: '1',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_TIMEOUT_MS: '5000',
                NEO_OPENAI_COMPATIBLE_BATCH_EMBEDDING_YIELD_MS  : '500'
            });

            const {default: Service} = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
            const waitFor            = async (condition, label) => {
                const startedAt = Date.now();

                while (Date.now() - startedAt < 1000) {
                    if (condition()) return;
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                throw new Error(`Timed out waiting for ${label}`);
            };
            const capture = async promise => {
                try {
                    await promise;
                } catch (error) {
                    return error;
                }

                throw new Error('Expected isolated embedding probe to reject');
            };
            const resetServerState = nextBehavior => {
                behavior                           = nextBehavior;
                closedHungRequests                 = 0;
                heldResponse                       = null;
                nextRequestObservedAfterAbortClose = false;
                requestCount                       = 0;
                requestInputs                      = [];
            };

            resetServerState('success');
            let preflightCalls = 0;
            Service.openAiCompatibleLoadedModelsProbe = async () => {
                preflightCalls++;
                return [];
            };
            const preAbortedController = new AbortController();
            const preAbortedReason     = new Error('cancel before embedding entry');
            preAbortedController.abort(preAbortedReason);
            const preAbortedObserved = await capture(Service.embedText('never-send', 'openAiCompatible', {
                signal        : preAbortedController.signal,
                operationLabel: 'pre-aborted probe'
            }));
            const preAborted = {
                exactReason: preAbortedObserved === preAbortedReason,
                listeners  : getEventListeners(preAbortedController.signal, 'abort').length,
                preflightCalls,
                requestCount
            };

            resetServerState('success');
            let readinessSignal;
            Service.openAiCompatibleLoadedModelsProbe = ({signal}) => new Promise((resolve, reject) => {
                readinessSignal = signal;
                signal.addEventListener('abort', () => reject(Object.assign(
                    new Error('preflight wrapper'),
                    {name: 'AbortError'}
                )), {once: true});
            });
            const readinessController = new AbortController();
            const readinessReason     = new Error('cancel LMS readiness child');
            const readinessPromise    = Service.embedText('never-send', 'openAiCompatible', {
                signal        : readinessController.signal,
                operationLabel: 'preflight cancellation probe'
            });
            await waitFor(() => readinessSignal === readinessController.signal, 'preflight signal hand-off');
            readinessController.abort(readinessReason);
            const readinessObserved = await capture(readinessPromise);
            const readiness         = {
                exactReason: readinessObserved === readinessReason,
                listeners  : getEventListeners(readinessController.signal, 'abort').length,
                requestCount
            };
            Service.openAiCompatibleLoadedModelsProbe = null;

            resetServerState('hold-first');
            const blockerPromise = Service.embedTexts(['blocker'], 'openAiCompatible');
            await waitFor(() => heldResponse !== null, 'first provider request gate');

            const queuedController = new AbortController();
            const queuedReason     = new Error('cancel queued batch');
            const queuedPromise    = Service.embedTexts(['do-not-send'], 'openAiCompatible', {
                signal        : queuedController.signal,
                operationLabel: 'queued cancellation probe'
            });
            await waitFor(
                () => getEventListeners(queuedController.signal, 'abort').length === 1,
                'queued abort listener'
            );
            queuedController.abort(queuedReason);
            const queuedObserved = await capture(queuedPromise);

            heldResponse.writeHead(200, {'Content-Type': 'application/json'});
            heldResponse.end(JSON.stringify({data: [{index: 0, embedding: [7.1, 7.2, 7.3]}]}));
            heldResponse = null;
            await blockerPromise;
            await Service.embedText('after-abort', 'openAiCompatible');
            const queued = {
                exactReason: queuedObserved === queuedReason,
                listeners  : getEventListeners(queuedController.signal, 'abort').length,
                requestInputs
            };

            resetServerState('hold-first');
            const inFlightController = new AbortController();
            const inFlightReason     = new Error('cancel active socket');
            const inFlightPromise    = Service.embedText('hung', 'openAiCompatible', {
                signal        : inFlightController.signal,
                operationLabel: 'in-flight cancellation probe'
            });
            await waitFor(() => requestCount === 1, 'hung provider request');
            const afterInFlightPromise = Service.embedText('after-socket-abort', 'openAiCompatible');
            inFlightController.abort(inFlightReason);
            const inFlightObserved = await capture(inFlightPromise);
            await afterInFlightPromise;
            await waitFor(() => closedHungRequests === 1, 'active socket close');
            const inFlight = {
                closedHungRequests,
                exactReason: inFlightObserved === inFlightReason,
                listeners  : getEventListeners(inFlightController.signal, 'abort').length,
                nextRequestObservedAfterAbortClose,
                requestCount
            };

            const runDelayedAbort = async (nextBehavior, input, batch = false) => {
                resetServerState(nextBehavior);

                const controller = new AbortController();
                const reason     = new Error(`cancel ${nextBehavior}`);
                const promise    = batch
                    ? Service.embedTexts(input, 'openAiCompatible', {signal: controller.signal, operationLabel: nextBehavior})
                    : Service.embedText(input, 'openAiCompatible', {signal: controller.signal, operationLabel: nextBehavior});

                await waitFor(
                    () => requestCount === 1 && getEventListeners(controller.signal, 'abort').length === 1,
                    `${nextBehavior} abortable delay`
                );
                controller.abort(reason);

                const observed = await capture(promise);
                await new Promise(resolve => setTimeout(resolve, 30));

                return {
                    exactReason: observed === reason,
                    requestCount,
                    listeners  : getEventListeners(controller.signal, 'abort').length
                };
            };

            const modelLoad  = await runDelayedAbort('model-load', 'retry-once');
            const contention = await runDelayedAbort('contention', 'retry-once');
            const batchYield = await runDelayedAbort('success', ['first', 'second'], true);

                console.log(JSON.stringify({
                    preAborted,
                    readiness,
                    queued,
                    inFlight,
                    modelLoad,
                    contention,
                    batchYield
                }));
            } finally {
                server.closeAllConnections?.();
                await new Promise(resolve => server.close(resolve));
            }
        });

        expect(evidence).toEqual({
            preAborted: {exactReason: true, listeners: 0, preflightCalls: 0, requestCount: 0},
            readiness : {exactReason: true, listeners: 0, requestCount: 0},
            queued    : {
                exactReason  : true,
                listeners    : 0,
                requestInputs: [['blocker'], 'after-abort']
            },
            inFlight: {
                closedHungRequests                : 1,
                exactReason                       : true,
                listeners                         : 0,
                nextRequestObservedAfterAbortClose: true,
                requestCount                      : 2
            },
            modelLoad : {exactReason: true, requestCount: 1, listeners: 0},
            contention: {exactReason: true, requestCount: 1, listeners: 0},
            batchYield: {exactReason: true, requestCount: 1, listeners: 0}
        });
    });

    test('OpenAI-compatible provider timeout wins a later caller abort in an isolated config process', async () => {
        const evidence = await runIsolatedEmbeddingProbe(async () => {
            const http                = await import('node:http');
            const {getEventListeners} = await import('node:events');

            let   requestCount = 0;
            const server       = http.createServer(request => {
                requestCount++;
                request.resume();
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

            try {
                Object.assign(process.env, {
                    NEO_OPENAI_COMPATIBLE_HOST                  : `http://127.0.0.1:${server.address().port}`,
                    NEO_OPENAI_COMPATIBLE_CONTENTION_RETRY_COUNT: '0',
                    NEO_OPENAI_COMPATIBLE_CONTENTION_TIMEOUT_MS : '10'
                });

                const {default: Service} = await import('./ai/services/memory-core/TextEmbeddingService.mjs');
                const controller         = new AbortController();

                let observed;
                try {
                    await Service.embedText('timeout', 'openAiCompatible', {
                        signal        : controller.signal,
                        operationLabel: 'provider timeout race probe'
                    });
                } catch (error) {
                    observed = error;
                }

                controller.abort(new Error('late caller abort'));
                await new Promise(resolve => setTimeout(resolve, 20));

                console.log(JSON.stringify({
                    code     : observed?.code,
                    listeners: getEventListeners(controller.signal, 'abort').length,
                    requestCount
                }));
            } finally {
                server.closeAllConnections?.();
                await new Promise(resolve => server.close(resolve));
            }
        });

        expect(evidence).toEqual({
            code        : 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT',
            listeners   : 0,
            requestCount: 1
        });
    });
});
