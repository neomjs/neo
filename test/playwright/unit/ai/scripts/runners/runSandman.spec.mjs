import {setup} from '../../../../setup.mjs';

const appName = 'RunSandmanDiagnosticsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Validates the durable diagnostics emitted before `runSandman` exits on provider timeout.
 *
 * This coverage keeps the Sandman REM operator path testable without a real MLX,
 * LM Studio, or OpenAI-compatible server. The script's hard-fail branch must leave
 * a queryable Memory Core log breadcrumb so future agents can distinguish expected
 * provider-unavailable state from missing DreamService / Golden Path output.
 */
test.describe('runSandman.mjs provider readiness diagnostics (#10587)', () => {
    test.describe.configure({mode: 'serial'});

    let aiConfig;
    let logger;
    let runSandmanModule;
    let providerReadinessHelper;
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        tmpLogDir = path.resolve(os.tmpdir(), `runsandman-diagnostics-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        logger           = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        runSandmanModule = await import('../../../../../../ai/scripts/runners/runSandman.mjs');
        providerReadinessHelper = await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs');
    });

    test.afterAll(() => {
        aiConfig.data.logPath = originalLogPath;

        if (tmpLogDir && fs.existsSync(tmpLogDir)) {
            fs.rmSync(tmpLogDir, {recursive: true, force: true});
        }
    });

    test('waitForProvider returns timeout metadata without a real provider', async () => {
        let dots = '';

        const waitResult = await runSandmanModule.waitForProvider({
            attempts     : 3,
            delayMs      : 0,
            timeoutMs    : 50,
            checkProvider: async () => false,
            output       : {
                write: value => {
                    dots += value;
                }
            }
        });

        expect(waitResult).toMatchObject({
            running : false,
            attempts: 3,
            timeoutMs: 0
        });
        expect(waitResult.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(dots).toBe('...');
    });

    test('waitForProvider throws when required probe parameters are absent (config-as-SSOT contract)', async () => {
        await expect(runSandmanModule.waitForProvider({attempts: 1, delayMs: 0})).rejects.toThrow(/timeoutMs.*required/);
        await expect(runSandmanModule.waitForProvider({attempts: 1, timeoutMs: 10})).rejects.toThrow(/delayMs.*required/);
        await expect(runSandmanModule.waitForProvider({delayMs: 0, timeoutMs: 10})).rejects.toThrow(/attempts.*required/);
        await expect(runSandmanModule.waitForProvider()).rejects.toThrow(/attempts.*delayMs.*timeoutMs.*required/);
    });

    test('assertProviderReadinessConfig fails loud when the SSOT config block is absent', () => {
        expect(() => runSandmanModule.assertProviderReadinessConfig()).toThrow(/providerReadiness is required/);
        expect(() => runSandmanModule.assertProviderReadinessConfig({attempts: 1, delayMs: 0})).toThrow(/timeoutMs.*configured/);
        expect(runSandmanModule.assertProviderReadinessConfig({attempts: 1, delayMs: 0, timeoutMs: 10})).toEqual({
            attempts : 1,
            delayMs  : 0,
            timeoutMs: 10
        });
    });

    test('checkProvider throws when timeoutMs is absent (config-as-SSOT contract)', () => {
        expect(() => runSandmanModule.checkProvider()).toThrow(/timeoutMs.*required/);
        expect(() => runSandmanModule.checkProvider({config: {graphProvider: 'openAiCompatible'}})).toThrow(/timeoutMs.*required/);
    });

    test('Sub 9 hypothesis 7: manual CLI delegates to canonical REM cycle without autoDream coupling (#12617)', async () => {
        const calls = [];
        const output = {
            log  : message => calls.push({type: 'log', message}),
            error: message => calls.push({type: 'error', message}),
            write: message => calls.push({type: 'write', message})
        };
        const lifecycleService = {
            ready: async () => calls.push({type: 'lifecycle-ready'})
        };
        const dreamService = {
            ready: async () => calls.push({type: 'dream-ready'}),
            executeRemCycle: async options => {
                calls.push({type: 'execute-rem-cycle', options});
                return {
                    status           : 'skipped',
                    skipReason       : 'no undigested sessions',
                    sessionsProcessed: 0,
                    durationMs       : 5
                };
            }
        };
        let leaseOptions;

        const exitCode = await runSandmanModule.runSandman({
            dreamService,
            lifecycleService,
            output,
            withLease: async (fn, options) => {
                leaseOptions = options;
                return {status: 'completed', result: await fn()};
            },
            exit: code => code
        });

        expect(exitCode).toBe(0);
        expect(leaseOptions).toEqual({
            owner   : 'sandman',
            reason  : 'manual-cli',
            metadata: {script: 'ai/scripts/runners/runSandman.mjs'}
        });
        expect(calls.find(call => call.type === 'execute-rem-cycle').options).toEqual({
            reason      : 'manual-cli',
            mode        : 'cli',
            includeDecay: true
        });
        expect(calls.map(call => call.type)).toContain('lifecycle-ready');
        expect(calls.map(call => call.type)).toContain('dream-ready');
    });

    test('extracts OpenAI-compatible model ids from provider variants', () => {
        expect(providerReadinessHelper.getOpenAiCompatibleModelIds({
            data: [
                {id: 'chat-model'},
                {model: 'embedding-model'},
                {name: 'fallback-model'},
                {}
            ]
        })).toEqual(['chat-model', 'embedding-model', 'fallback-model']);

        expect(providerReadinessHelper.getOpenAiCompatibleModelIds({data: null})).toEqual([]);
    });

    test('extracts native Ollama resident model ids from /api/ps variants', () => {
        expect(providerReadinessHelper.getOllamaRunningModelIds({
            models: [
                {name: 'gemma4:31b'},
                {model: 'qwen3-embedding'},
                {id: 'fallback-model'},
                {name: 'gemma4:31b'},
                {}
            ]
        })).toEqual(['gemma4:31b', 'qwen3-embedding', 'fallback-model']);

        expect(providerReadinessHelper.getOllamaRunningModelIds({models: null})).toEqual([]);
    });

    test('fetchOllamaRunningModelIds probes native Ollama /api/ps', async () => {
        const calls = [];
        const result = await providerReadinessHelper.fetchOllamaRunningModelIds({
            host     : 'http://ollama.test',
            timeoutMs: 25,
            fetchFn  : async (url, options) => {
                calls.push({url, method: options.method});
                return {
                    ok  : true,
                    json: async () => ({
                        models: [{name: 'gemma4:31b'}, {name: 'qwen3-embedding'}]
                    })
                };
            }
        });

        expect(result).toEqual(['gemma4:31b', 'qwen3-embedding']);
        expect(calls).toEqual([{url: 'http://ollama.test/api/ps', method: 'GET'}]);
    });

    test('warmOllamaRoleModel uses native role endpoints and keep_alive', async () => {
        const calls = [];
        const fetchFn = async (url, options) => {
            calls.push({
                url,
                method : options.method,
                headers: options.headers,
                body   : JSON.parse(options.body)
            });
            return {
                ok  : true,
                text: async () => ''
            };
        };

        await providerReadinessHelper.warmOllamaRoleModel({
            host     : 'http://ollama.test',
            model    : 'gemma4:31b',
            role     : 'chat',
            keepAlive: '-1',
            timeoutMs: 25,
            fetchFn
        });
        await providerReadinessHelper.warmOllamaRoleModel({
            host     : 'http://ollama.test',
            model    : 'qwen3-embedding',
            role     : 'embedding',
            keepAlive: '-1',
            timeoutMs: 25,
            fetchFn
        });

        expect(calls).toEqual([{
            url    : 'http://ollama.test/api/chat',
            method : 'POST',
            headers: {'content-type': 'application/json'},
            body   : {
                model     : 'gemma4:31b',
                messages  : [{role: 'user', content: ''}],
                stream    : false,
                keep_alive: '-1'
            }
        }, {
            url    : 'http://ollama.test/api/embed',
            method : 'POST',
            headers: {'content-type': 'application/json'},
            body   : {
                model     : 'qwen3-embedding',
                input     : '',
                keep_alive: '-1'
            }
        }]);
    });

    test('warnProviderParallelModelCapacity warns for native Ollama missing the embedding model', async () => {
        const warnings = [];
        const result = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider: 'ollama',
                modelProvider: 'openAiCompatible',
                ollama: {
                    host                 : 'http://ollama.test',
                    model                : 'gemma4:31b',
                    embeddingModel       : 'qwen3-embedding',
                    requireParallelModels: 2
                }
            },
            timeoutMs        : 25,
            fetchOllamaModels: async () => ['gemma4:31b'],
            log              : {warn: (...args) => warnings.push(args)}
        });

        expect(result.ready).toBe(false);
        expect(result.missingModels).toEqual(['qwen3-embedding']);
        expect(result.warning).toContain('set OLLAMA_MAX_LOADED_MODELS=2');
        expect(warnings).toHaveLength(1);
        expect(warnings[0][0]).toContain('[provider/ollama]');
    });

    test('warnProviderParallelModelCapacity passes when OpenAI-compatible lists both models', async () => {
        const warnings = [];
        const result = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider: 'openAiCompatible',
                modelProvider: 'gemini',
                openAiCompatible: {
                    host                 : 'http://oai.test',
                    model                : 'gemma-4-31b-it',
                    embeddingModel       : 'text-embedding-qwen3-embedding-8b',
                    requireParallelModels: 2
                }
            },
            timeoutMs                     : 25,
            fetchOpenAiCompatibleModels   : async () => ['gemma-4-31b-it', 'text-embedding-qwen3-embedding-8b'],
            log                           : {warn: (...args) => warnings.push(args)}
        });

        expect(result).toMatchObject({
            ready                : true,
            provider             : 'openAiCompatible',
            requireParallelModels: 2,
            missingModels        : []
        });
        expect(warnings).toEqual([]);
    });

    test('warnProviderParallelModelCapacity warns when requireParallelModels is missing', async () => {
        const warnings = [];
        const result = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider: 'openAiCompatible',
                openAiCompatible: {
                    host          : 'http://oai.test',
                    model         : 'gemma-4-31b-it',
                    embeddingModel: 'text-embedding-qwen3-embedding-8b'
                }
            },
            timeoutMs: 25,
            log      : {warn: (...args) => warnings.push(args)}
        });

        expect(result.ready).toBe(false);
        expect(result.error.message).toContain('requireParallelModels');
        expect(warnings[0][0]).toContain('parallel-model capacity probe failed');
    });

    test('warnProviderParallelModelCapacity rejects non-finite requireParallelModels values', async () => {
        for (const requireParallelModels of [NaN, Infinity, -Infinity]) {
            const warnings = [];
            let fetched = false;
            const result = await providerReadinessHelper.warnProviderParallelModelCapacity({
                config: {
                    graphProvider: 'openAiCompatible',
                    openAiCompatible: {
                        host          : 'http://oai.test',
                        model         : 'gemma-4-31b-it',
                        embeddingModel: 'text-embedding-qwen3-embedding-8b',
                        requireParallelModels
                    }
                },
                timeoutMs                  : 25,
                fetchOpenAiCompatibleModels: async () => {
                    fetched = true;
                    return [];
                },
                log: {warn: (...args) => warnings.push(args)}
            });

            expect(fetched).toBe(false);
            expect(result.ready).toBe(false);
            expect(result.error.message).toContain('requireParallelModels');
            expect(warnings[0][0]).toContain('parallel-model capacity probe failed');
        }
    });

    test('ensureLmsModelsLoaded invokes lms load for missing chat and embedding models', async () => {
        const loads = [];
        const modelSnapshots = [
            [],
            ['chat-model'],
            ['chat-model', 'embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host     : 'http://127.0.0.1:1234',
            models   : ['chat-model', 'embedding-model'],
            attempts : 3,
            delayMs  : 0,
            timeoutMs: 50,
            fetchModelIds: async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel    : async model => loads.push(model),
            log          : {info: () => {}}
        });

        expect(loads).toEqual(['chat-model', 'embedding-model']);
        expect(result).toMatchObject({
            ready       : true,
            loadedModels: ['chat-model', 'embedding-model'],
            requiredModels: ['chat-model', 'embedding-model'],
            availableModels: ['chat-model', 'embedding-model']
        });
    });

    test('ensureLmsModelsLoaded skips lms load when both models are already resident AND no contextLengths configured', async () => {
        const loads = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host     : 'http://127.0.0.1:1234',
            models   : ['chat-model', 'embedding-model'],
            attempts : 1,
            delayMs  : 0,
            timeoutMs: 50,
            fetchModelIds: async () => ['chat-model', 'embedding-model'],
            loadModel    : async model => loads.push(model)
        });

        expect(loads).toEqual([]);
        expect(result).toMatchObject({
            ready       : true,
            loadedModels: [],
            attempts    : 1
        });
    });

    test('ensureLmsModelsLoaded force-reloads context-configured models even when already resident (#12117 RA1 — closes silent wrong-context regression)', async () => {
        const loadCalls = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            contextLengths: {'chat-model': 262144, 'embedding-model': 32768},
            attempts      : 1,
            delayMs       : 0,
            timeoutMs     : 50,
            // Both models ALREADY resident — without the RA1 fix, this scenario returned
            // ready with zero loadModel calls, leaving any modelfile-default loaded
            // context window in place. With the fix, context-configured models are
            // force-included in the load set.
            fetchModelIds : async () => ['chat-model', 'embedding-model'],
            loadModel     : async (model, options) => loadCalls.push({model, contextLength: options?.contextLength}),
            log           : {info: () => {}}
        });

        expect(loadCalls).toEqual([
            {model: 'chat-model',      contextLength: 262144},
            {model: 'embedding-model', contextLength: 32768}
        ]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual(['chat-model', 'embedding-model']);
    });

    test('ensureLmsModelsLoaded mixes missing + context-configured force-reload paths correctly (#12117 RA1)', async () => {
        const loadCalls = [];
        const modelSnapshots = [
            ['chat-model'],                      // chat resident, embedding missing
            ['chat-model', 'embedding-model']    // post-load: both present
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            // Only chat has a configured context-length; embedding must still load as missing
            contextLengths: {'chat-model': 262144},
            attempts      : 2,
            delayMs       : 0,
            timeoutMs     : 50,
            fetchModelIds : async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel     : async (model, options) => loadCalls.push({model, contextLength: options?.contextLength}),
            log           : {info: () => {}}
        });

        // Both models should load: embedding because missing, chat because context-configured
        expect(loadCalls).toEqual([
            {model: 'chat-model',      contextLength: 262144},
            {model: 'embedding-model', contextLength: undefined}
        ]);
        expect(result.ready).toBe(true);
    });

    test('ensureLmsModelsLoaded fails loud when readiness config is incomplete', async () => {
        await expect(providerReadinessHelper.ensureLmsModelsLoaded({
            host  : 'http://127.0.0.1:1234',
            models: ['chat-model']
        })).rejects.toThrow(/attempts.*delayMs.*timeoutMs.*required/);
    });

    test('ensureLmsModelsLoaded threads per-model contextLengths into loadModel invocations (#12117)', async () => {
        const loadCalls = [];
        const modelSnapshots = [
            [],
            ['chat-model', 'embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            contextLengths: {'chat-model': 262144, 'embedding-model': 32768},
            attempts      : 2,
            delayMs       : 0,
            timeoutMs     : 50,
            fetchModelIds : async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel     : async (model, options) => loadCalls.push({model, options}),
            log           : {info: () => {}}
        });

        expect(loadCalls).toEqual([
            {model: 'chat-model',      options: {contextLength: 262144}},
            {model: 'embedding-model', options: {contextLength: 32768}}
        ]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual(['chat-model', 'embedding-model']);
    });

    test('ensureLmsModelsLoaded does not pre-skip large local chat contexts (#12264)', async () => {
        const loadCalls = [];
        const warnings  = [];
        const modelSnapshots = [
            [],
            ['embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host            : 'http://127.0.0.1:1234',
            models          : ['chat-model', 'embedding-model'],
            contextLengths  : {'chat-model': 262144, 'embedding-model': 32768},
            allowPartial    : true,
            attempts        : 2,
            delayMs         : 0,
            timeoutMs       : 50,
            fetchModelIds   : async () => modelSnapshots.shift() || ['embedding-model'],
            loadModel       : async (model, options) => {
                loadCalls.push({model, contextLength: options?.contextLength});
                if (model === 'chat-model') {
                    throw new Error('LM Studio rejected 262K chat load');
                }
            },
            log             : {
                info: () => {},
                warn: message => warnings.push(message)
            }
        });

        expect(loadCalls).toEqual([
            {model: 'chat-model',      contextLength: 262144},
            {model: 'embedding-model', contextLength: 32768}
        ]);
        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.loadedModels).toEqual(['embedding-model']);
        expect(result.failedModels).toEqual([{
            model        : 'chat-model',
            contextLength: 262144,
            error        : 'LM Studio rejected 262K chat load'
        }]);
        expect(result.missingModels).toEqual(['chat-model']);
        expect(warnings[0]).toContain('preload failed');
    });

    test('ensureLmsModelsLoaded continues loading remaining models after a partial preload failure (#12264)', async () => {
        const loadCalls = [];
        const warnings  = [];
        const modelSnapshots = [
            [],
            ['embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            contextLengths: {'chat-model': 32768, 'embedding-model': 32768},
            allowPartial  : true,
            attempts      : 2,
            delayMs       : 0,
            timeoutMs     : 50,
            fetchModelIds : async () => modelSnapshots.shift() || ['embedding-model'],
            loadModel     : async (model, options) => {
                loadCalls.push({model, contextLength: options?.contextLength});
                if (model === 'chat-model') {
                    throw new Error('LM Studio rejected chat load');
                }
            },
            log: {
                info: () => {},
                warn: message => warnings.push(message)
            }
        });

        expect(loadCalls).toEqual([
            {model: 'chat-model',      contextLength: 32768},
            {model: 'embedding-model', contextLength: 32768}
        ]);
        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.loadedModels).toEqual(['embedding-model']);
        expect(result.failedModels).toEqual([{
            model        : 'chat-model',
            contextLength: 32768,
            error        : 'LM Studio rejected chat load'
        }]);
        expect(result.missingModels).toEqual(['chat-model']);
        expect(warnings[0]).toContain('preload failed');
    });

    test('ensureOllamaModelsReady warms missing chat and embedding models through native roles (#12285)', async () => {
        const warmCalls = [];
        const modelSnapshots = [
            [],
            ['gemma4:31b', 'qwen3-embedding']
        ];

        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host                 : 'http://ollama.test',
            roles                : [{
                providerRole: 'modelProvider',
                role        : 'chat',
                model       : 'gemma4:31b'
            }, {
                providerRole: 'embeddingProvider',
                role        : 'embedding',
                model       : 'qwen3-embedding'
            }],
            requireParallelModels: 2,
            attempts             : 2,
            delayMs              : 0,
            timeoutMs            : 25,
            keepAlive            : '-1',
            fetchModelIds        : async () => modelSnapshots.shift() || ['gemma4:31b', 'qwen3-embedding'],
            warmModel            : async (role, options) => warmCalls.push({role, options}),
            log                  : {info: () => {}}
        });

        expect(warmCalls).toEqual([{
            role: {
                providerRole: 'modelProvider',
                role        : 'chat',
                model       : 'gemma4:31b'
            },
            options: {
                host     : 'http://ollama.test',
                keepAlive: '-1',
                timeoutMs: 25
            }
        }, {
            role: {
                providerRole: 'embeddingProvider',
                role        : 'embedding',
                model       : 'qwen3-embedding'
            },
            options: {
                host     : 'http://ollama.test',
                keepAlive: '-1',
                timeoutMs: 25
            }
        }]);
        expect(result).toMatchObject({
            ready                : true,
            provider             : 'ollama',
            warmedModels         : [{
                model       : 'gemma4:31b',
                role        : 'chat',
                providerRole: 'modelProvider'
            }, {
                model       : 'qwen3-embedding',
                role        : 'embedding',
                providerRole: 'embeddingProvider'
            }],
            requiredModels       : ['gemma4:31b', 'qwen3-embedding'],
            availableModels      : ['gemma4:31b', 'qwen3-embedding'],
            requireParallelModels: 2
        });
    });

    test('ensureOllamaModelsReady returns degraded when one native role cannot be warmed (#12285)', async () => {
        const warnings = [];
        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host                 : 'http://ollama.test',
            roles                : [{
                providerRole: 'modelProvider',
                role        : 'chat',
                model       : 'gemma4:31b'
            }, {
                providerRole: 'embeddingProvider',
                role        : 'embedding',
                model       : 'qwen3-embedding'
            }],
            requireParallelModels: 2,
            allowPartial         : true,
            attempts             : 2,
            delayMs              : 0,
            timeoutMs            : 25,
            fetchModelIds        : async () => ['qwen3-embedding'],
            warmModel            : async role => {
                if (role.role === 'chat') {
                    throw new Error('Ollama refused chat model');
                }
            },
            log                  : {
                info: () => {},
                warn: message => warnings.push(message)
            }
        });

        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.failedModels).toEqual([{
            model       : 'gemma4:31b',
            role        : 'chat',
            providerRole: 'modelProvider',
            error       : 'Ollama refused chat model'
        }]);
        expect(result.missingModels).toEqual(['gemma4:31b']);
        expect(result.availableModels).toEqual(['qwen3-embedding']);
        expect(result.warning).toContain('set OLLAMA_MAX_LOADED_MODELS=2');
        expect(warnings[0]).toContain('warm-up failed');
    });

    test('ensureOllamaModelsReady does not require inactive role models (#12285)', async () => {
        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host                 : 'http://ollama.test',
            roles                : [{
                providerRole: 'graphProvider',
                role        : 'chat',
                model       : 'gemma4:31b'
            }],
            requireParallelModels: 2,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 25,
            fetchModelIds        : async () => ['gemma4:31b']
        });

        expect(result.ready).toBe(true);
        expect(result.requiredModels).toEqual(['gemma4:31b']);
        expect(result.requiredResidentModels).toBe(1);
        expect(result.requireParallelModels).toBe(2);
        expect(result.warning).toBeNull();
    });

    test('loadLmsModel appends --context-length to execFile args when provided (#12117)', async () => {
        const execCalls = [];
        const execFileStub = (cmd, args, callback) => {
            execCalls.push({cmd, args});
            callback(null, '', '');
        };

        await providerReadinessHelper.loadLmsModel('chat-model', {
            execFileFn   : execFileStub,
            contextLength: 262144
        });

        expect(execCalls).toEqual([
            {cmd: 'lms', args: ['load', 'chat-model', '--context-length', '262144']}
        ]);
    });

    test('loadLmsModel omits --context-length when not provided (backward compat)', async () => {
        const execCalls = [];
        const execFileStub = (cmd, args, callback) => {
            execCalls.push({cmd, args});
            callback(null, '', '');
        };

        await providerReadinessHelper.loadLmsModel('legacy-model', {execFileFn: execFileStub});

        expect(execCalls).toEqual([
            {cmd: 'lms', args: ['load', 'legacy-model']}
        ]);
    });

    test('buildLmsContextLengthsMap composes full map when all four inputs are finite (#12117)', () => {
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel             : 'chat-from-config',
            embeddingModel        : 'embedding-from-config',
            chatContextLength     : 262144,
            embeddingContextLength: 32768
        })).toEqual({
            'chat-from-config'     : 262144,
            'embedding-from-config': 32768
        });
    });

    test('buildLmsContextLengthsMap returns empty map when inputs are missing or non-finite (#12117)', () => {
        // All missing
        expect(providerReadinessHelper.buildLmsContextLengthsMap({})).toEqual({});

        // Models present but context-lengths missing
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel     : 'chat',
            embeddingModel: 'embedding'
        })).toEqual({});

        // Context-lengths present but models missing
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatContextLength     : 262144,
            embeddingContextLength: 32768
        })).toEqual({});

        // Non-finite context-lengths defensive: NaN, Infinity, non-number all skipped
        for (const bad of [NaN, Infinity, -Infinity, '262144', null, undefined]) {
            expect(providerReadinessHelper.buildLmsContextLengthsMap({
                chatModel        : 'chat',
                chatContextLength: bad
            })).toEqual({});
        }
    });

    test('buildLmsContextLengthsMap preserves max cap when chat and embedding share a model id (#12117 RA2)', () => {
        // Same model id for both roles — must not let smaller embedding cap overwrite
        // the larger chat cap (would silently break chat invocations).
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel             : 'shared-model',
            embeddingModel        : 'shared-model',
            chatContextLength     : 262144,
            embeddingContextLength: 32768
        })).toEqual({'shared-model': 262144});

        // Order independence: same result if smaller declared first (already handled
        // because the setMax helper compares both directions)
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel             : 'shared-model',
            embeddingModel        : 'shared-model',
            chatContextLength     : 32768,
            embeddingContextLength: 262144
        })).toEqual({'shared-model': 262144});

        // Same value both roles: idempotent
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel             : 'shared-model',
            embeddingModel        : 'shared-model',
            chatContextLength     : 99999,
            embeddingContextLength: 99999
        })).toEqual({'shared-model': 99999});
    });

    test('buildLmsContextLengthsMap returns partial map when only one role is configured (#12117)', () => {
        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            chatModel        : 'chat-only',
            chatContextLength: 99999
        })).toEqual({'chat-only': 99999});

        expect(providerReadinessHelper.buildLmsContextLengthsMap({
            embeddingModel        : 'embedding-only',
            embeddingContextLength: 32768
        })).toEqual({'embedding-only': 32768});
    });

    test('buildLmsPreloadConfig uses the retuned embedding role context for OpenAI-compatible embeddings (#12286)', () => {
        expect(providerReadinessHelper.buildLmsPreloadConfig({
            modelProvider    : 'gemini',
            graphProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible',
            openAiCompatible: {
                model         : 'gemma-4-31b-it',
                embeddingModel: 'text-embedding-qwen3-embedding-8b'
            },
            localModels: {
                chat: {
                    contextLimitTokens: 262144
                },
                embedding: {
                    contextLimitTokens: 32768
                }
            }
        })).toEqual({
            models: [
                'gemma-4-31b-it',
                'text-embedding-qwen3-embedding-8b'
            ],
            contextLengths: {
                'gemma-4-31b-it'                  : 262144,
                'text-embedding-qwen3-embedding-8b': 32768
            }
        });
    });

    test('buildOllamaReadinessConfig only includes explicitly selected native Ollama roles (#12285)', () => {
        expect(providerReadinessHelper.buildOllamaReadinessConfig({
            modelProvider    : 'gemini',
            graphProvider    : 'ollama',
            embeddingProvider: 'ollama',
            ollama: {
                host                 : 'http://ollama.test',
                model                : 'gemma4:31b',
                embeddingModel       : 'qwen3-embedding',
                keep_alive           : '-1',
                requireParallelModels: 2
            },
            openAiCompatible: {
                model         : 'gemma-openai',
                embeddingModel: 'openai-embedding'
            }
        })).toEqual({
            provider             : 'ollama',
            host                 : 'http://ollama.test',
            keepAlive            : '-1',
            requireParallelModels: 2,
            model                : 'gemma4:31b',
            embeddingModel       : 'qwen3-embedding',
            roles                : [{
                provider    : 'ollama',
                providerRole: 'graphProvider',
                role        : 'chat',
                model       : 'gemma4:31b'
            }, {
                provider    : 'ollama',
                providerRole: 'embeddingProvider',
                role        : 'embedding',
                model       : 'qwen3-embedding'
            }],
            models               : ['gemma4:31b', 'qwen3-embedding']
        });

        expect(providerReadinessHelper.buildOllamaReadinessConfig({
            modelProvider    : 'openAiCompatible',
            graphProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible',
            ollama: {
                host                 : 'http://ollama.test',
                model                : 'gemma4:31b',
                embeddingModel       : 'qwen3-embedding',
                requireParallelModels: 2
            }
        }).roles).toEqual([]);
    });

    test('loadLmsModel omits --context-length when contextLength is non-finite (defensive)', async () => {
        const execCalls = [];
        const execFileStub = (cmd, args, callback) => {
            execCalls.push({cmd, args});
            callback(null, '', '');
        };

        for (const badValue of [undefined, null, NaN, Infinity, 'big', {}]) {
            execCalls.length = 0;
            await providerReadinessHelper.loadLmsModel('m', {execFileFn: execFileStub, contextLength: badValue});
            expect(execCalls[0].args).toEqual(['load', 'm']);
        }
    });

    test('resolves readiness target from graphProvider instead of generic modelProvider', () => {
        expect(runSandmanModule.getGraphProviderReadinessTarget({
            modelProvider : 'gemini',
            graphProvider : 'openAiCompatible',
            openAiCompatible: {
                host : 'http://127.0.0.1:13090',
                model: 'mlx-community/gemma-4'
            }
        })).toMatchObject({
            provider : 'openAiCompatible',
            supported: true,
            endpoint : '/v1/models',
            host     : 'http://127.0.0.1:13090',
            model    : 'mlx-community/gemma-4',
            url      : 'http://127.0.0.1:13090/v1/models'
        });

        expect(runSandmanModule.getGraphProviderReadinessTarget({
            modelProvider : 'gemini',
            graphProvider : 'ollama',
            ollama        : {
                host : 'http://127.0.0.1:11434/',
                model: 'gemma4:31b'
            }
        })).toMatchObject({
            provider : 'ollama',
            supported: true,
            endpoint : '/api/tags',
            host     : 'http://127.0.0.1:11434/',
            model    : 'gemma4:31b',
            url      : 'http://127.0.0.1:11434/api/tags'
        });

        expect(runSandmanModule.getGraphProviderReadinessTarget({
            modelProvider : 'ollama',
            graphProvider : 'openAiCompatible',
            openAiCompatible: {
                host : 'http://127.0.0.1:13091',
                model: 'mlx-community/gemma-4'
            },
            ollama        : {
                host : 'http://127.0.0.1:11434',
                model: 'gemma4:31b'
            }
        })).toMatchObject({
            provider : 'openAiCompatible',
            supported: true,
            endpoint : '/v1/models',
            host     : 'http://127.0.0.1:13091'
        });
    });

    test('records a durable provider-timeout breadcrumb without leaking secrets', async () => {
        const diagnostic = runSandmanModule.createProviderFailureDiagnostic({
            config: {
                modelProvider: 'openAiCompatible',
                graphProvider: 'openAiCompatible',
                openAiCompatible: {
                    host          : 'http://127.0.0.1:11435',
                    model         : 'mlx-community/test-model',
                    embeddingModel: 'test-embedding',
                    apiKey        : 'must-not-be-logged'
                }
            },
            waitResult: {
                attempts : 30,
                elapsedMs: 30000,
                timeoutMs: 30000
            },
            lifecycleStatus: {
                running: false,
                managed: false,
                pid    : null
            }
        });

        const result = await runSandmanModule.recordProviderReadinessFailure(diagnostic, {
            stderr: () => {}
        });

        await logger.flush();

        const today    = new Date().toISOString().slice(0, 10);
        const logFile  = path.join(tmpLogDir, `mc-server-${today}.log`);
        const logLines = fs.readFileSync(logFile, 'utf8');

        expect(result.message).toContain('http://127.0.0.1:11435');
        expect(logLines).toContain('[runSandman] openAiCompatible provider readiness timeout');
        expect(logLines).toContain('PROVIDER_READINESS_TIMEOUT');
        expect(logLines).toContain('"graphProvider":"openAiCompatible"');
        expect(logLines).toContain('/v1/models');
        expect(logLines).toContain('http://127.0.0.1:11435');
        expect(logLines).toContain('mlx-community/test-model');
        expect(logLines).toContain('Start the configured OpenAI-compatible / MLX provider');
        expect(logLines).not.toContain('must-not-be-logged');
    });

    test('createProviderFailureDiagnostic surfaces undefined verbatim when waitResult is absent (no null substitution)', () => {
        const diagnostic = runSandmanModule.createProviderFailureDiagnostic({
            config: {
                modelProvider   : 'openAiCompatible',
                graphProvider   : 'openAiCompatible',
                openAiCompatible: {
                    host : 'http://127.0.0.1:11435',
                    model: 'mlx-community/test-model'
                }
            },
            reason: 'UNSUPPORTED_GRAPH_PROVIDER'
        });

        expect(diagnostic.attempts).toBeUndefined();
        expect(diagnostic.elapsedMs).toBeUndefined();
        expect(diagnostic.timeoutMs).toBeUndefined();
        expect(diagnostic.lifecycleStatus).toBeUndefined();
    });

    test('unsupported graphProvider fails before readiness polling', async () => {
        const diagnostic = runSandmanModule.createProviderFailureDiagnostic({
            config: {
                modelProvider : 'gemini',
                graphProvider : 'gemini',
                openAiCompatible: {
                    apiKey: 'must-not-be-logged'
                }
            },
            reason: 'UNSUPPORTED_GRAPH_PROVIDER'
        });

        const result = await runSandmanModule.recordProviderReadinessFailure(diagnostic, {
            stderr: () => {}
        });

        expect(result.message).toContain("Unsupported Sandman graph provider 'gemini'");
        expect(result.diagnostic).toMatchObject({
            reason        : 'UNSUPPORTED_GRAPH_PROVIDER',
            graphProvider : 'gemini',
            supported     : false,
            host          : null,
            endpoint      : null
        });
    });

    test('provider model-residency diagnostic carries degraded Ollama capacity (#12285)', async () => {
        const stderrMessages = [];
        const logErrors      = [];
        const capacity       = {
            degraded             : true,
            provider             : 'ollama',
            host                 : 'http://ollama.test',
            requiredModels       : ['gemma4:31b', 'qwen3-embedding'],
            availableModels      : ['qwen3-embedding'],
            missingModels        : ['gemma4:31b'],
            observedCount        : 1,
            requireParallelModels: 2,
            warning              : '[provider/ollama] expected 2+ models loaded; set OLLAMA_MAX_LOADED_MODELS=2 in the Ollama server environment.'
        };
        const diagnostic = runSandmanModule.createProviderFailureDiagnostic({
            config: {
                modelProvider : 'ollama',
                graphProvider : 'ollama',
                ollama        : {
                    host          : 'http://ollama.test',
                    model         : 'gemma4:31b',
                    embeddingModel: 'qwen3-embedding'
                }
            },
            reason: 'PROVIDER_MODEL_RESIDENCY_DEGRADED',
            capacity
        });

        expect(diagnostic).toMatchObject({
            event         : 'runSandman.provider_model_residency_degraded',
            reason        : 'PROVIDER_MODEL_RESIDENCY_DEGRADED',
            provider      : 'ollama',
            graphProvider : 'ollama',
            host          : 'http://ollama.test',
            endpoint      : '/api/tags',
            capacity,
            nextAction    : capacity.warning
        });

        const result = await runSandmanModule.recordProviderReadinessFailure(diagnostic, {
            stderr: message => stderrMessages.push(message),
            log   : {
                error: (...args) => logErrors.push(args),
                flush: async () => {}
            }
        });

        expect(result.message).toContain('provider model residency degraded');
        expect(stderrMessages[0]).toContain('OLLAMA_MAX_LOADED_MODELS=2');
        expect(logErrors[0][0]).toContain('provider model residency degraded');
        expect(logErrors[0][1]).toBe(diagnostic);
    });

    test('runSandman delegates exactly one canonical REM cycle inside the lease (#12070)', async () => {
        const calls     = [];
        const logs = [];
        const exitCodes = [];

        const result = await runSandmanModule.runSandman({
            dreamService: {
                ready: async () => calls.push('dream.ready'),
                executeRemCycle: async options => {
                    calls.push(['executeRemCycle', options]);
                    return {status: 'completed', sessionsProcessed: 2};
                },
                processUndigestedSessions: async () => {
                    throw new Error('legacy REM path must not run');
                }
            },
            lifecycleService: {
                ready: async () => calls.push('lifecycle.ready')
            },
            withLease: async (task, options) => {
                calls.push(['withLease', options]);
                return {
                    status  : 'completed',
                    acquired: true,
                    result  : await task({status: 'acquired'})
                };
            },
            output: {
                log  : message => logs.push(message),
                error: message => logs.push(message)
            },
            exit: code => {
                exitCodes.push(code);
                return code;
            }
        });

        expect(result).toBe(0);
        expect(exitCodes).toEqual([0]);
        expect(calls).toEqual([
            ['withLease', {
                owner   : 'sandman',
                reason  : 'manual-cli',
                metadata: {script: 'ai/scripts/runners/runSandman.mjs'}
            }],
            'lifecycle.ready',
            'dream.ready',
            ['executeRemCycle', {
                reason      : 'manual-cli',
                mode        : 'cli',
                includeDecay: true
            }]
        ]);
        expect(logs.some(message => message.includes('Sandman cycle complete (2 session(s) processed)'))).toBe(true);
    });

    test('runSandman maps canonical REM failures to a failing process code (#12070)', async () => {
        const logs      = [];
        const exitCodes = [];

        const result = await runSandmanModule.runSandman({
            dreamService: {
                ready: async () => {},
                executeRemCycle: async () => ({
                    status: 'failed',
                    error : {message: 'simulated REM failure'}
                })
            },
            lifecycleService: {
                ready: async () => {}
            },
            withLease: async task => ({
                status  : 'completed',
                acquired: true,
                result  : await task({status: 'acquired'})
            }),
            output: {
                log  : message => logs.push(message),
                error: (...args) => logs.push(args.join(' '))
            },
            exit: code => {
                exitCodes.push(code);
                return code;
            }
        });

        expect(result).toBe(1);
        expect(exitCodes).toEqual([1]);
        expect(logs.some(message => message.includes('simulated REM failure'))).toBe(true);
    });

    test('runSandman defers without running DreamService when the maintenance lease is held (#12070)', async () => {
        const logs      = [];
        const exitCodes = [];

        const result = await runSandmanModule.runSandman({
            dreamService: {
                ready: async () => {
                    throw new Error('DreamService must not initialize when lease is held');
                }
            },
            lifecycleService: {
                ready: async () => {
                    throw new Error('LifecycleService must not initialize when lease is held');
                }
            },
            withLease: async () => ({
                status  : 'held',
                acquired: false,
                lease   : {
                    owner     : 'orchestrator',
                    reason    : 'periodic-dream',
                    pid       : 12345,
                    acquiredAt: '2026-05-27T16:00:00.000Z'
                }
            }),
            output: {
                log  : message => logs.push(message),
                error: message => logs.push(message)
            },
            exit: code => {
                exitCodes.push(code);
                return code;
            }
        });

        expect(result).toBe(0);
        expect(exitCodes).toEqual([0]);
        expect(logs.some(message => message.includes("Deferred: heavy-maintenance lease held by 'orchestrator'"))).toBe(true);
    });
});
