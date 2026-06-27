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

    test.beforeEach(() => {
        providerReadinessHelper?.clearProviderDiscoveryProbeCache();
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
            running  : false,
            attempts : 3,
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
        expect(() => runSandmanModule.assertProviderReadinessConfig({attempts: 1, delayMs: 0, timeoutMs: 10})).toThrow(/routineCacheTtlMs.*configured/);
        expect(runSandmanModule.assertProviderReadinessConfig({
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 10,
            routineCacheTtlMs: 1000
        })).toEqual({
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 10,
            routineCacheTtlMs: 1000
        });
    });

    test('checkProvider throws when timeoutMs is absent (config-as-SSOT contract)', () => {
        expect(() => runSandmanModule.checkProvider()).toThrow(/timeoutMs.*required/);
        expect(() => runSandmanModule.checkProvider({config: {graphProvider: 'openAiCompatible'}})).toThrow(/timeoutMs.*required/);
    });

    test('Sub 9 hypothesis 7: manual CLI delegates to canonical REM cycle without autoDream coupling (#12617)', async () => {
        const calls  = [];
        const output = {
            log  : message => calls.push({type: 'log', message}),
            error: message => calls.push({type: 'error', message}),
            write: message => calls.push({type: 'write', message})
        };
        const lifecycleService = {
            ready: async () => calls.push({type: 'lifecycle-ready'})
        };
        const dreamService = {
            ready          : async () => calls.push({type: 'dream-ready'}),
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
            owner       : 'sandman',
            reason      : 'manual-cli',
            staleAfterMs: aiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/runners/runSandman.mjs'}
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
                {name: 'gemma4:31b', context_length: 131072},
                {model: 'qwen3-embedding', context_length: 32768},
                {id: 'fallback-model'},
                {name: 'gemma4:31b'},
                {}
            ]
        })).toEqual(['gemma4:31b', 'qwen3-embedding', 'fallback-model']);

        expect(providerReadinessHelper.getOllamaRunningModels({
            models: [
                {name: 'gemma4:31b', context_length: 131072},
                {model: 'qwen3-embedding', context_length: 32768},
                {id: 'fallback-model'},
                {name: 'gemma4:31b', context_length: 4096}
            ]
        })).toEqual([{
            id           : 'gemma4:31b',
            contextLength: 131072
        }, {
            id           : 'qwen3-embedding',
            contextLength: 32768
        }, {
            id           : 'fallback-model',
            contextLength: undefined
        }]);

        expect(providerReadinessHelper.getOllamaRunningModelIds({models: null})).toEqual([]);
        expect(providerReadinessHelper.getOllamaRunningModels({models: null})).toEqual([]);
    });

    test('fetchOllamaRunningModelIds probes native Ollama /api/ps', async () => {
        const calls  = [];
        const result = await providerReadinessHelper.fetchOllamaRunningModelIds({
            host     : 'http://ollama.test',
            timeoutMs: 25,
            fetchFn  : async (url, options) => {
                calls.push({url, method: options.method});
                return {
                    ok  : true,
                    json: async () => ({
                        models: [
                            {name: 'gemma4:31b', context_length: 131072},
                            {name: 'qwen3-embedding', context_length: 32768}
                        ]
                    })
                };
            }
        });

        expect(result).toEqual(['gemma4:31b', 'qwen3-embedding']);
        expect(calls).toEqual([{url: 'http://ollama.test/api/ps', method: 'GET'}]);
    });

    test('warmOllamaRoleModel uses native role endpoints and keep_alive', async () => {
        const calls   = [];
        const fetchFn = async (url, options) => {
            calls.push({
                url,
                method : options.method,
                headers: options.headers,
                body   : JSON.parse(options.body)
            });
            return {
                ok  : true,
                text: async () => url.endsWith('/api/embed')
                    ? JSON.stringify({
                        prompt_eval_count   : 30,
                        prompt_eval_duration: 2_000_000_000
                    })
                    : JSON.stringify({
                        eval_count   : 20,
                        eval_duration: 1_000_000_000
                    })
            };
        };

        const chatWarm = await providerReadinessHelper.warmOllamaRoleModel({
            host     : 'http://ollama.test',
            model    : 'gemma4:31b',
            role     : 'chat',
            keepAlive: '-1',
            timeoutMs: 25,
            fetchFn
        });
        const embeddingWarm = await providerReadinessHelper.warmOllamaRoleModel({
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
        expect(chatWarm.evalSample).toMatchObject({
            model               : 'gemma4:31b',
            role                : 'chat',
            evalCount           : 20,
            evalTokensPerSecond : 20,
            totalTokensPerSecond: 20
        });
        expect(embeddingWarm.evalSample).toMatchObject({
            model                    : 'qwen3-embedding',
            role                     : 'embedding',
            promptEvalCount          : 30,
            promptEvalTokensPerSecond: 15,
            totalTokensPerSecond     : 15
        });
    });

    test('warmOllamaRoleModel threads native num_ctx for chat and embedding warm-ups (#13865)', async () => {
        const calls   = [];
        const fetchFn = async (url, options) => {
            calls.push({
                url,
                body: JSON.parse(options.body)
            });
            return {
                ok  : true,
                text: async () => ''
            };
        };

        await providerReadinessHelper.warmOllamaRoleModel({
            host         : 'http://ollama.test',
            model        : 'gemma4:31b',
            role         : 'chat',
            contextLength: 131072,
            timeoutMs    : 25,
            fetchFn
        });
        await providerReadinessHelper.warmOllamaRoleModel({
            host         : 'http://ollama.test',
            model        : 'qwen3-embedding',
            role         : 'embedding',
            contextLength: 32768,
            timeoutMs    : 25,
            fetchFn
        });

        expect(calls).toEqual([{
            url : 'http://ollama.test/api/chat',
            body: {
                model   : 'gemma4:31b',
                messages: [{role: 'user', content: ''}],
                stream  : false,
                options : {num_ctx: 131072}
            }
        }, {
            url : 'http://ollama.test/api/embed',
            body: {
                model  : 'qwen3-embedding',
                input  : '',
                options: {num_ctx: 32768}
            }
        }]);
    });

    test('warnProviderParallelModelCapacity warns for native Ollama missing the embedding model', async () => {
        const warnings = [];
        const result   = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider: 'ollama',
                modelProvider: 'openAiCompatible',
                ollama       : {
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
        expect(result.extraModels).toEqual([]);
        expect(result.observedRequiredCount).toBe(1);
        expect(result.warning).toContain('ollama pull qwen3-embedding');
        expect(result.warning).not.toContain('set OLLAMA_MAX_LOADED_MODELS=2');
        expect(warnings).toHaveLength(1);
        expect(warnings[0][0]).toContain('[provider/ollama]');
    });

    test('warnProviderParallelModelCapacity passes when OpenAI-compatible lists both models', async () => {
        const warnings = [];
        const result   = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider   : 'openAiCompatible',
                modelProvider   : 'gemini',
                openAiCompatible: {
                    host                 : 'http://oai.test',
                    model                : 'gemma-4-31b-it',
                    embeddingModel       : 'text-embedding-qwen3-embedding-8b',
                    requireParallelModels: 2
                }
            },
            timeoutMs                  : 25,
            fetchOpenAiCompatibleModels: async () => ['gemma-4-31b-it', 'text-embedding-qwen3-embedding-8b'],
            log                        : {warn: (...args) => warnings.push(args)}
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
        const result   = await providerReadinessHelper.warnProviderParallelModelCapacity({
            config: {
                graphProvider   : 'openAiCompatible',
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
            let   fetched  = false;
            const result   = await providerReadinessHelper.warnProviderParallelModelCapacity({
                config: {
                    graphProvider   : 'openAiCompatible',
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
        const loads          = [];
        const modelSnapshots = [
            [],
            ['chat-model'],
            ['chat-model', 'embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host         : 'http://127.0.0.1:1234',
            models       : ['chat-model', 'embedding-model'],
            attempts     : 3,
            delayMs      : 0,
            timeoutMs    : 50,
            fetchModelIds: async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel    : async model => loads.push(model),
            log          : {info: () => {}}
        });

        expect(loads).toEqual(['chat-model', 'embedding-model']);
        expect(result).toMatchObject({
            ready          : true,
            loadedModels   : ['chat-model', 'embedding-model'],
            requiredModels : ['chat-model', 'embedding-model'],
            availableModels: ['chat-model', 'embedding-model']
        });
    });

    test('repairProviderRoleSetResidency warms the LM Studio chat and embedding role set (#13948)', async () => {
        let repairOptions;

        const result = await providerReadinessHelper.repairProviderRoleSetResidency({
            config: {
                modelProvider    : 'openAiCompatible',
                graphProvider    : 'openAiCompatible',
                embeddingProvider: 'openAiCompatible',
                openAiCompatible : {
                    host          : 'http://127.0.0.1:1234',
                    model         : 'chat-model',
                    embeddingModel: 'embedding-model'
                },
                localModels: {
                    chat     : {contextLimitTokens: 131072, parallel: 1},
                    embedding: {contextLimitTokens: 32768, parallel: 1}
                },
                orchestrator: {
                    lms: {enabled: true}
                }
            },
            attempts   : 2,
            delayMs    : 0,
            timeoutMs  : 50,
            lmsRepairFn: async options => {
                repairOptions = options;
                return {
                    ready          : true,
                    requiredModels : options.models,
                    availableModels: options.models
                };
            }
        });

        expect(result).toMatchObject({
            ready   : true,
            provider: 'openAiCompatible',
            host    : 'http://127.0.0.1:1234',
            action  : 'warm-provider'
        });
        expect(repairOptions).toMatchObject({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            contextLengths: {
                'chat-model'     : 131072,
                'embedding-model': 32768
            },
            parallels: {
                'chat-model'     : 1,
                'embedding-model': 1
            },
            allowPartial: true,
            attempts    : 2,
            delayMs     : 0,
            timeoutMs   : 50
        });
    });

    test('repairProviderRoleSetResidency warms native Ollama chat and embedding roles (#13948)', async () => {
        let repairOptions;

        const result = await providerReadinessHelper.repairProviderRoleSetResidency({
            config: {
                modelProvider    : 'ollama',
                graphProvider    : 'ollama',
                embeddingProvider: 'ollama',
                ollama           : {
                    host                 : 'http://127.0.0.1:11434',
                    model                : 'gemma4:26b',
                    embeddingModel       : 'qwen3-embedding:latest',
                    keep_alive           : -1,
                    requireParallelModels: 2
                },
                localModels: {
                    chat     : {contextLimitTokens: 131072},
                    embedding: {contextLimitTokens: 32768}
                }
            },
            attempts      : 2,
            delayMs       : 0,
            timeoutMs     : 50,
            ollamaRepairFn: async options => {
                repairOptions = options;
                return {
                    ready       : true,
                    warmedModels: options.roles.map(role => ({model: role.model, role: role.role}))
                };
            }
        });

        expect(result).toMatchObject({
            ready   : true,
            provider: 'ollama',
            action  : 'warm-provider'
        });
        expect(repairOptions).toMatchObject({
            host                 : 'http://127.0.0.1:11434',
            keepAlive            : -1,
            requireParallelModels: 2,
            allowPartial         : true,
            attempts             : 2,
            delayMs              : 0,
            timeoutMs            : 50
        });
        expect(repairOptions.roles).toEqual([{
            provider     : 'ollama',
            providerRole : 'modelProvider',
            role         : 'chat',
            model        : 'gemma4:26b',
            contextLength: 131072
        }, {
            provider     : 'ollama',
            providerRole : 'embeddingProvider',
            role         : 'embedding',
            model        : 'qwen3-embedding:latest',
            contextLength: 32768
        }]);
    });

    test('provider role-set builders fail loud on missing AiConfig localModels leaves (#13948)', () => {
        expect(() => providerReadinessHelper.buildLmsPreloadConfig({
            modelProvider    : 'openAiCompatible',
            graphProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible',
            openAiCompatible : {
                model         : 'chat-model',
                embeddingModel: 'embedding-model'
            }
        })).toThrow(TypeError);

        expect(() => providerReadinessHelper.buildOllamaReadinessConfig({
            modelProvider    : 'ollama',
            graphProvider    : 'ollama',
            embeddingProvider: 'ollama',
            ollama           : {
                model         : 'chat-model',
                embeddingModel: 'embedding-model'
            }
        })).toThrow(TypeError);
    });

    test('ensureLmsModelsLoaded skips lms load when both models are already resident AND no contextLengths configured', async () => {
        const loads = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host         : 'http://127.0.0.1:1234',
            models       : ['chat-model', 'embedding-model'],
            attempts     : 1,
            delayMs      : 0,
            timeoutMs    : 50,
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

    test('ensureLmsModelsLoaded skips reload when lms ps confirms resident context-configured models are sufficient (#13700)', async () => {
        const loadCalls = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model', 'embedding-model'],
            contextLengths   : {'chat-model': 262144, 'embedding-model': 32768},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['chat-model', 'embedding-model'],
            loadModel        : async (model, options) => loadCalls.push({model, contextLength: options?.contextLength}),
            fetchLoadedModels: async () => [{
                id           : 'chat-model',
                contextLength: 262144
            }, {
                id           : 'embedding-model',
                contextLength: 32768
            }],
            log          : {info: () => {}}
        });

        expect(loadCalls).toEqual([]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual([]);
    });

    test('ensureLmsModelsLoaded treats unknown embedding parallel as unobservable telemetry (#13950)', async () => {
        const loadCalls = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model', 'embedding-model'],
            contextLengths   : {'chat-model': 131072, 'embedding-model': 32768},
            parallels        : {'chat-model': 1, 'embedding-model': 1},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['chat-model', 'embedding-model'],
            loadModel        : async (model, options) => loadCalls.push({model, options}),
            fetchLoadedModels: async () => [{
                id           : 'chat-model',
                contextLength: 131072,
                parallel     : 1
            }, {
                id           : 'embedding-model',
                contextLength: 32768
            }],
            log: {info: () => {}}
        });

        expect(loadCalls).toEqual([]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual([]);
        expect(result.loadedParallels).toEqual({
            'chat-model'     : 1,
            'embedding-model': undefined
        });
    });

    test('ensureLmsModelsLoaded still repairs numeric chat parallel mismatches (#13950)', async () => {
        const loadCalls       = [],
              unloadCalls     = [],
              loadedSnapshots = [
                  [{
                      id           : 'chat-model',
                      contextLength: 131072,
                      parallel     : 4
                  }],
                  [{
                      id           : 'chat-model',
                      contextLength: 131072,
                      parallel     : 1
                  }]
              ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model'],
            contextLengths   : {'chat-model': 131072},
            parallels        : {'chat-model': 1},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['chat-model'],
            unloadModel      : async identifier => unloadCalls.push(identifier),
            loadModel        : async (model, options) => loadCalls.push({model, options}),
            fetchLoadedModels: async () => loadedSnapshots.shift() || [{
                id           : 'chat-model',
                contextLength: 131072,
                parallel     : 1
            }],
            log: {info: () => {}}
        });

        expect(unloadCalls).toEqual(['chat-model']);
        expect(loadCalls).toEqual([{
            model  : 'chat-model',
            options: {
                contextLength: 131072,
                parallel     : 1,
                identifier   : 'chat-model'
            }
        }]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual(['chat-model']);
    });

    test('ensureLmsModelsLoaded replaces stale exact lms load and unloads suffixed siblings (#13700)', async () => {
        const loadCalls      = [],
              unloadCalls    = [],
              modelSnapshots = [
                  ['chat-model', 'chat-model:2', 'embedding-model'],
                  ['chat-model', 'chat-model:2', 'embedding-model']
              ],
              loadedSnapshots = [
                  [{
                      id           : 'chat-model',
                      contextLength: 4096,
                      parallel     : 4
                  }, {
                      id           : 'chat-model:2',
                      contextLength: 131072,
                      parallel     : 1
                  }, {
                      id           : 'embedding-model',
                      contextLength: 32768
                  }],
                  [{
                      id           : 'chat-model',
                      contextLength: 131072,
                      parallel     : 1
                  }, {
                      id           : 'chat-model:2',
                      contextLength: 4096,
                      parallel     : 4
                  }, {
                      id           : 'embedding-model',
                      contextLength: 32768
                  }]
              ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model', 'embedding-model'],
            contextLengths   : {'chat-model': 131072, 'embedding-model': 32768},
            parallels        : {'chat-model': 1},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel        : async (model, options) => loadCalls.push({model, options}),
            unloadModel      : async identifier => unloadCalls.push(identifier),
            fetchLoadedModels: async () => loadedSnapshots.shift() || [{
                id           : 'chat-model',
                contextLength: 131072,
                parallel     : 1
            }, {
                id           : 'embedding-model',
                contextLength: 32768
            }],
            log: {info: () => {}}
        });

        expect(unloadCalls).toEqual(['chat-model', 'chat-model:2']);
        expect(loadCalls).toEqual([{
            model  : 'chat-model',
            options: {
                contextLength: 131072,
                parallel     : 1,
                identifier   : 'chat-model'
            }
        }]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual(['chat-model']);
        expect(result.unloadedModels).toEqual(['chat-model', 'chat-model:2']);
    });

    test('ensureLmsModelsLoaded unloads an exact resident gated model when initial lms ps fails (#13700)', async () => {
        const loadCalls   = [],
              unloadCalls = [];
        let loadedProbeRuns = 0;

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model'],
            contextLengths   : {'chat-model': 131072},
            parallels        : {'chat-model': 1},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['chat-model'],
            loadModel        : async (model, options) => loadCalls.push({model, options}),
            unloadModel      : async identifier => unloadCalls.push(identifier),
            fetchLoadedModels: async () => {
                loadedProbeRuns++;

                if (loadedProbeRuns === 1) {
                    throw new Error('lms ps unavailable');
                }

                return [{
                    id           : 'chat-model',
                    contextLength: 131072,
                    parallel     : 1
                }];
            },
            log: {
                info: () => {},
                warn: () => {}
            }
        });

        expect(unloadCalls).toEqual(['chat-model']);
        expect(loadCalls).toEqual([{
            model  : 'chat-model',
            options: {
                contextLength: 131072,
                parallel     : 1,
                identifier   : 'chat-model'
            }
        }]);
        expect(result.ready).toBe(true);
    });

    test('getSupersededLmsLoadedModels only supersedes suffixed siblings after exact model is sufficient (#13700)', () => {
        expect(providerReadinessHelper.getSupersededLmsLoadedModels({
            requiredModels: ['chat-model'],
            contextLengths: {'chat-model': 131072},
            parallels     : {'chat-model': 1},
            loadedModels  : [{
                id           : 'chat-model',
                contextLength: 131072,
                parallel     : 1
            }, {
                id           : 'chat-model:2',
                contextLength: 4096,
                parallel     : 4
            }, {
                id           : 'chat-model:beta',
                contextLength: 131072,
                parallel     : 1
            }]
        })).toEqual([{
            id           : 'chat-model:2',
            contextLength: 4096,
            parallel     : 4,
            model        : 'chat-model'
        }]);
    });

    test('getLmsLoadedModels normalizes lms ps json metadata (#13851)', () => {
        expect(providerReadinessHelper.getLmsLoadedModels({
            models: [{
                identifier   : 'chat-model',
                contextWindow: '131072',
                parallel     : '1',
                format       : 'gguf',
                architecture : 'gemma3'
            }, {
                model         : 'embedding-model',
                context_length: 32768,
                num_parallel  : 2
            }]
        })).toEqual([{
            id           : 'chat-model',
            contextLength: 131072,
            parallel     : 1,
            format       : 'gguf',
            architecture : 'gemma3'
        }, {
            id           : 'embedding-model',
            contextLength: 32768,
            parallel     : 2
        }]);
    });

    test('fetchLmsLoadedModels invokes lms ps --json (#13851)', async () => {
        const calls        = [];
        const loadedModels = await providerReadinessHelper.fetchLmsLoadedModels({
            timeoutMs : 123,
            execFileFn: (cmd, args, options, callback) => {
                calls.push({cmd, args, options});
                callback(null, JSON.stringify([{id: 'chat-model', contextLength: 131072, parallel: 1}]), '');
            }
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].cmd).toBe('lms');
        expect(calls[0].args).toEqual(['ps', '--json']);
        expect(calls[0].options.timeout).toBe(123);
        // embedding-readiness fix: the LM Studio bin dir is augmented onto PATH so the probe resolves `lms` regardless of launch env
        expect(calls[0].options.env.PATH).toContain('.lmstudio');
        expect(loadedModels).toEqual([{
            id           : 'chat-model',
            contextLength: 131072,
            parallel     : 1
        }]);
    });

    test('fetchOpenAiCompatibleModelIds coalesces and caches routine probes (#13997)', async () => {
        let fetchCalls = 0,
            releaseFirst;

        const firstProbe = new Promise(resolve => {
            releaseFirst = resolve;
        });
        const fetchFn = async () => {
            fetchCalls++;
            await firstProbe;

            return {
                ok  : true,
                json: async () => ({data: [{id: 'chat-model'}]})
            };
        };

        const first = providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        });
        const second = providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        });

        await Promise.resolve();
        expect(fetchCalls).toBe(1);

        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual([
            ['chat-model'],
            ['chat-model']
        ]);

        const cached = await providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        });

        expect(cached).toEqual(['chat-model']);
        expect(fetchCalls).toBe(1);
    });

    test('fetchOpenAiCompatibleModelIds force-refresh bypasses routine cache (#13997)', async () => {
        let   fetchCalls = 0;
        const fetchFn    = async () => {
            fetchCalls++;

            return {
                ok  : true,
                json: async () => ({data: [{id: fetchCalls === 1 ? 'cached-model' : 'fresh-model'}]})
            };
        };

        await expect(providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        })).resolves.toEqual(['cached-model']);

        await expect(providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host     : 'http://127.0.0.1:1234',
            timeoutMs: 50,
            freshness: 'force',
            fetchFn
        })).resolves.toEqual(['fresh-model']);

        expect(fetchCalls).toBe(2);
    });

    test('routine provider-discovery failures are not cached as healthy (#13997)', async () => {
        let   fetchCalls = 0;
        const fetchFn    = async () => {
            fetchCalls++;

            if (fetchCalls === 1) {
                return {
                    ok    : false,
                    status: 503,
                    text  : async () => 'starting'
                };
            }

            return {
                ok  : true,
                json: async () => ({data: [{id: 'recovered-model'}]})
            };
        };

        await expect(providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        })).rejects.toThrow(/HTTP 503/);

        await expect(providerReadinessHelper.fetchOpenAiCompatibleModelIds({
            host      : 'http://127.0.0.1:1234',
            timeoutMs : 50,
            freshness : 'routine',
            cacheTtlMs: 1000,
            fetchFn
        })).resolves.toEqual(['recovered-model']);
        expect(fetchCalls).toBe(2);
    });

    test('fetchLmsLoadedModels coalesces routine metadata probes and lets force-refresh bypass cache (#13997)', async () => {
        let cliCalls = 0;

        const execFileFn = (cmd, args, options, callback) => {
            cliCalls++;
            callback(null, JSON.stringify([{
                id           : cliCalls === 1 ? 'cached-model' : 'fresh-model',
                contextLength: 32768
            }]), '');
        };

        const first = await providerReadinessHelper.fetchLmsLoadedModels({
            timeoutMs : 123,
            freshness : 'routine',
            cacheTtlMs: 1000,
            execFileFn
        });
        const cached = await providerReadinessHelper.fetchLmsLoadedModels({
            timeoutMs : 123,
            freshness : 'routine',
            cacheTtlMs: 1000,
            execFileFn
        });
        const fresh = await providerReadinessHelper.fetchLmsLoadedModels({
            timeoutMs: 123,
            freshness: 'force',
            execFileFn
        });

        expect(first.map(item => item.id)).toEqual(['cached-model']);
        expect(cached.map(item => item.id)).toEqual(['cached-model']);
        expect(fresh.map(item => item.id)).toEqual(['fresh-model']);
        expect(cliCalls).toBe(2);
    });

    test('ensureLmsModelsLoaded uses routine discovery before mutation and force-refresh after load (#13997)', async () => {
        const
            discoveryFreshness = [],
            loadCalls          = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 50,
            modelDiscoveryFreshness : 'routine',
            modelDiscoveryCacheTtlMs: 1000,
            fetchModelIds           : async options => {
                discoveryFreshness.push(options.freshness);
                return discoveryFreshness.length === 1 ? [] : ['chat-model'];
            },
            loadModel: async model => loadCalls.push(model),
            log      : {info: () => {}}
        });

        expect(discoveryFreshness).toEqual(['routine', 'force']);
        expect(loadCalls).toEqual(['chat-model']);
        expect(result.ready).toBe(true);
    });

    test('ensureLmsModelsLoaded degrades when lms ps reports insufficient context or parallel (#13851)', async () => {
        const warnings = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model', 'embedding-model'],
            contextLengths   : {'chat-model': 131072, 'embedding-model': 32768},
            parallels        : {'chat-model': 1},
            allowPartial     : true,
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['chat-model', 'embedding-model'],
            loadModel        : async () => {},
            unloadModel      : async () => {},
            fetchLoadedModels: async () => [{
                id           : 'chat-model',
                contextLength: 4096,
                parallel     : 4
            }, {
                id           : 'embedding-model',
                contextLength: 32768
            }],
            log: {
                info: () => {},
                warn: message => warnings.push(message)
            }
        });

        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.insufficientLoadedModels).toEqual([{
            model                : 'chat-model',
            contextLength        : 4096,
            requiredContextLength: 131072,
            parallel             : 4,
            requiredParallel     : 1
        }]);
        expect(result.loadedContexts).toEqual({
            'chat-model'     : 4096,
            'embedding-model': 32768
        });
        expect(result.loadedParallels).toEqual({
            'chat-model'     : 4,
            'embedding-model': undefined
        });
        expect(warnings[0]).toContain('loaded-model readiness failed');
    });

    test('ensureLmsModelsLoaded mixes missing + context-configured verified-resident paths correctly (#13700)', async () => {
        const loadCalls      = [];
        const modelSnapshots = [
            ['chat-model'],                      // chat resident, embedding missing
            ['chat-model', 'embedding-model']    // post-load: both present
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host  : 'http://127.0.0.1:1234',
            models: ['chat-model', 'embedding-model'],
            // Only chat has a configured context-length; embedding must still load as missing
            contextLengths   : {'chat-model': 262144},
            attempts         : 2,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel        : async (model, options) => loadCalls.push({model, contextLength: options?.contextLength}),
            fetchLoadedModels: async () => [{
                id           : 'chat-model',
                contextLength: 262144
            }],
            log           : {info: () => {}}
        });

        // Only embedding loads: chat is resident and lms ps proves its configured context.
        expect(loadCalls).toEqual([
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
        const loadCalls      = [];
        const modelSnapshots = [
            [],
            ['chat-model', 'embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model', 'embedding-model'],
            contextLengths   : {'chat-model': 262144, 'embedding-model': 32768},
            attempts         : 2,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => modelSnapshots.shift() || ['chat-model', 'embedding-model'],
            loadModel        : async (model, options) => loadCalls.push({model, options}),
            fetchLoadedModels: async () => [{
                id           : 'chat-model',
                contextLength: 262144
            }, {
                id           : 'embedding-model',
                contextLength: 32768
            }],
            log           : {info: () => {}}
        });

        expect(loadCalls).toEqual([
            {model: 'chat-model',      options: {contextLength: 262144, identifier: 'chat-model'}},
            {model: 'embedding-model', options: {contextLength: 32768, identifier: 'embedding-model'}}
        ]);
        expect(result.ready).toBe(true);
        expect(result.loadedModels).toEqual(['chat-model', 'embedding-model']);
    });

    test('ensureLmsModelsLoaded does not pre-skip large local chat contexts (#12264)', async () => {
        const loadCalls      = [];
        const warnings       = [];
        const modelSnapshots = [
            [],
            ['embedding-model']
        ];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model', 'embedding-model'],
            contextLengths: {'chat-model': 262144, 'embedding-model': 32768},
            allowPartial  : true,
            attempts      : 2,
            delayMs       : 0,
            timeoutMs     : 50,
            fetchModelIds : async () => modelSnapshots.shift() || ['embedding-model'],
            loadModel     : async (model, options) => {
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
        const loadCalls      = [];
        const warnings       = [];
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

    test('checkOpenAiCompatibleEmbeddingServing reports success without returning vector bodies (#13950)', async () => {
        let request;

        const result = await providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host     : 'http://127.0.0.1:1234',
            model    : 'embedding-model',
            input    : 'neo embedding canary',
            timeoutMs: 50,
            fetchFn  : async (url, options) => {
                request = {
                    url,
                    method: options.method,
                    body  : JSON.parse(options.body)
                };

                return {
                    ok  : true,
                    json: async () => ({data: [{embedding: [0.1, 0.2, 0.3]}]})
                };
            }
        });

        expect(request).toEqual({
            url   : 'http://127.0.0.1:1234/v1/embeddings',
            method: 'POST',
            body  : {
                model: 'embedding-model',
                input: 'neo embedding canary'
            }
        });
        expect(result).toEqual({
            ready       : true,
            degraded    : false,
            provider    : 'openAiCompatible',
            host        : 'http://127.0.0.1:1234',
            model       : 'embedding-model',
            vectorLength: 3
        });
        expect(result.embedding).toBeUndefined();
    });

    test('checkOpenAiCompatibleEmbeddingServing applies LMS GGUF EOS suffix when metadata is available (#14015)', async () => {
        let request;

        const result = await providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host           : 'http://127.0.0.1:1234',
            model          : 'embedding-model',
            input          : 'neo embedding canary',
            timeoutMs      : 50,
            lmsLoadedModels: [{
                id          : 'embedding-model',
                format      : 'gguf',
                eosTokenText: '<|endoftext|>'
            }],
            fetchFn  : async (url, options) => {
                request = {
                    url,
                    method: options.method,
                    body  : JSON.parse(options.body)
                };

                return {
                    ok  : true,
                    json: async () => ({data: [{embedding: [0.1, 0.2, 0.3]}]})
                };
            }
        });

        expect(request).toEqual({
            url   : 'http://127.0.0.1:1234/v1/embeddings',
            method: 'POST',
            body  : {
                model: 'embedding-model',
                input: 'neo embedding canary<|endoftext|>'
            }
        });
        expect(result).toMatchObject({
            ready       : true,
            degraded    : false,
            provider    : 'openAiCompatible',
            host        : 'http://127.0.0.1:1234',
            model       : 'embedding-model',
            vectorLength: 3
        });
    });

    test('checkOpenAiCompatibleEmbeddingServing serializes concurrent canaries (#13950)', async () => {
        const events = [];
        let releaseFirst;

        const firstCanaryDone = new Promise(resolve => {
            releaseFirst = resolve;
        });
        const fetchFn = async (url, options) => {
            const {input} = JSON.parse(options.body);

            events.push(`start:${input}`);

            if (input === 'first') {
                await firstCanaryDone;
            }

            events.push(`finish:${input}`);

            return {
                ok  : true,
                json: async () => ({data: [{embedding: [1]}]})
            };
        };

        const first = providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host     : 'http://127.0.0.1:1234',
            model    : 'embedding-model',
            input    : 'first',
            timeoutMs: 50,
            fetchFn
        });
        const second = providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host     : 'http://127.0.0.1:1234',
            model    : 'embedding-model',
            input    : 'second',
            timeoutMs: 50,
            fetchFn
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(events).toEqual(['start:first']);

        releaseFirst();
        await Promise.all([first, second]);

        expect(events).toEqual([
            'start:first',
            'finish:first',
            'start:second',
            'finish:second'
        ]);
    });

    test('checkOpenAiCompatibleEmbeddingServing skips under load without issuing a request (#13950)', async () => {
        let fetchCalled = false;

        const result = await providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host     : 'http://127.0.0.1:1234',
            model    : 'embedding-model',
            input    : 'neo embedding canary',
            timeoutMs: 50,
            fetchFn  : async () => {
                fetchCalled = true;
            },
            shouldRun: async () => ({
                run   : false,
                reason: 'heavy-maintenance-active'
            })
        });

        expect(fetchCalled).toBe(false);
        expect(result).toMatchObject({
            ready   : false,
            degraded: true,
            skipped : true,
            provider: 'openAiCompatible',
            model   : 'embedding-model',
            reason  : 'heavy-maintenance-active'
        });
    });

    test('ensureLmsModelsLoaded surfaces degraded embedding-serving canary diagnostics (#13950)', async () => {
        const warnings = [];

        const result = await providerReadinessHelper.ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['embedding-model'],
            contextLengths   : {'embedding-model': 32768},
            parallels        : {'embedding-model': 1},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 50,
            fetchModelIds    : async () => ['embedding-model'],
            fetchLoadedModels: async () => [{
                id           : 'embedding-model',
                contextLength: 32768
            }],
            embeddingServingProbe: async () => ({
                ready   : false,
                degraded: true,
                error   : {message: 'HTTP 400 - Model unloaded while request was queued'},
                warning : '[provider/openAiCompatible] embedding-serving canary failed for embedding-model: HTTP 400 - Model unloaded while request was queued'
            }),
            log: {
                info: () => {},
                warn: message => warnings.push(message)
            }
        });

        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.embeddingServing).toMatchObject({
            ready   : false,
            degraded: true,
            error   : {message: 'HTTP 400 - Model unloaded while request was queued'}
        });
        expect(warnings[0]).toContain('embedding-serving canary failed');
    });

    test('checkOpenAiCompatibleEmbeddingServing rejects large canary bodies (#13950)', async () => {
        await expect(providerReadinessHelper.checkOpenAiCompatibleEmbeddingServing({
            host     : 'http://127.0.0.1:1234',
            model    : 'embedding-model',
            input    : 'x'.repeat(257),
            timeoutMs: 50
        })).rejects.toThrow(/<= 256 UTF-8 bytes/);
    });

    test('ensureOllamaModelsReady warms missing chat and embedding models through native roles (#12285)', async () => {
        const warmCalls      = [];
        const modelSnapshots = [
            [],
            [
                {id: 'gemma4:31b', contextLength: 131072},
                {id: 'qwen3-embedding', contextLength: 32768}
            ]
        ];

        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host : 'http://ollama.test',
            roles: [{
                providerRole : 'modelProvider',
                role         : 'chat',
                model        : 'gemma4:31b',
                contextLength: 131072
            }, {
                providerRole : 'embeddingProvider',
                role         : 'embedding',
                model        : 'qwen3-embedding',
                contextLength: 32768
            }],
            requireParallelModels: 2,
            attempts             : 2,
            delayMs              : 0,
            timeoutMs            : 25,
            keepAlive            : '-1',
            fetchModelIds        : async () => modelSnapshots.shift() || [
                {id: 'gemma4:31b', contextLength: 131072},
                {id: 'qwen3-embedding', contextLength: 32768}
            ],
            warmModel: async (role, options) => {
                warmCalls.push({role, options});

                return {
                    evalSample: {
                        model               : role.model,
                        role                : role.role,
                        totalEvalCount      : role.role === 'chat' ? 20 : 30,
                        totalEvalDurationNs : role.role === 'chat' ? 1_000_000_000 : 2_000_000_000,
                        totalTokensPerSecond: role.role === 'chat' ? 20 : 15
                    }
                };
            },
            log      : {info: () => {}}
        });

        expect(warmCalls).toEqual([{
            role: {
                providerRole : 'modelProvider',
                role         : 'chat',
                model        : 'gemma4:31b',
                contextLength: 131072
            },
            options: {
                host         : 'http://ollama.test',
                keepAlive    : '-1',
                timeoutMs    : 25,
                contextLength: 131072
            }
        }, {
            role: {
                providerRole : 'embeddingProvider',
                role         : 'embedding',
                model        : 'qwen3-embedding',
                contextLength: 32768
            },
            options: {
                host         : 'http://ollama.test',
                keepAlive    : '-1',
                timeoutMs    : 25,
                contextLength: 32768
            }
        }]);
        expect(result).toMatchObject({
            ready       : true,
            provider    : 'ollama',
            warmedModels: [{
                model        : 'gemma4:31b',
                role         : 'chat',
                providerRole : 'modelProvider',
                contextLength: 131072
            }, {
                model        : 'qwen3-embedding',
                role         : 'embedding',
                providerRole : 'embeddingProvider',
                contextLength: 32768
            }],
            requiredModels : ['gemma4:31b', 'qwen3-embedding'],
            availableModels: ['gemma4:31b', 'qwen3-embedding'],
            extraModels    : [],
            loadedContexts : {
                'gemma4:31b'     : 131072,
                'qwen3-embedding': 32768
            },
            observedRequiredCount: 2,
            requireParallelModels: 2
        });
        expect(result.ollamaEvalAttribution).toMatchObject({
            primaryLoad: {
                model          : 'gemma4:31b',
                role           : 'chat',
                tokensPerSecond: 20
            },
            primaryRole: {
                role           : 'chat',
                tokensPerSecond: 20
            }
        });
        expect(result.ollamaEvalAttribution.roleLoad.embedding).toMatchObject({
            role           : 'embedding',
            tokensPerSecond: 15
        });
    });

    test('ensureOllamaModelsReady degrades resident models loaded below configured context (#13865)', async () => {
        const warmCalls      = [];
        const modelSnapshots = [
            [{id: 'gemma4:31b', contextLength: 4096}],
            [{id: 'gemma4:31b', contextLength: 4096}]
        ];

        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host : 'http://ollama.test',
            roles: [{
                providerRole : 'graphProvider',
                role         : 'chat',
                model        : 'gemma4:31b',
                contextLength: 131072
            }],
            requireParallelModels: 1,
            allowPartial         : true,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 25,
            keepAlive            : '-1',
            fetchModelIds        : async () => modelSnapshots.shift() || [{id: 'gemma4:31b', contextLength: 4096}],
            warmModel            : async (role, options) => warmCalls.push({role, options}),
            log                  : {info: () => {}}
        });

        expect(warmCalls).toEqual([{
            role: {
                providerRole : 'graphProvider',
                role         : 'chat',
                model        : 'gemma4:31b',
                contextLength: 131072
            },
            options: {
                host         : 'http://ollama.test',
                keepAlive    : '-1',
                timeoutMs    : 25,
                contextLength: 131072
            }
        }]);
        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.missingModels).toEqual([]);
        expect(result.extraModels).toEqual([]);
        expect(result.observedRequiredCount).toBe(1);
        expect(result.insufficientContextModels).toEqual([{
            model                : 'gemma4:31b',
            contextLength        : 4096,
            requiredContextLength: 131072
        }]);
        expect(result.loadedContexts).toEqual({'gemma4:31b': 4096});
        expect(result.warning).toContain('loaded context too small');
        expect(result.warning).toContain('observed=4096 required>=131072');
    });

    test('ensureOllamaModelsReady returns degraded when one native role cannot be warmed (#12285)', async () => {
        const warnings = [];
        const result   = await providerReadinessHelper.ensureOllamaModelsReady({
            host : 'http://ollama.test',
            roles: [{
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
        expect(result.extraModels).toEqual([]);
        expect(result.observedRequiredCount).toBe(1);
        expect(result.warning).toContain('ollama pull gemma4:31b');
        expect(result.warning).not.toContain('set OLLAMA_MAX_LOADED_MODELS=2');
        expect(warnings[0]).toContain('warm-up failed');
    });

    test('ensureOllamaModelsReady reports stale resident Ollama models separately (#13879)', async () => {
        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host : 'http://ollama.test',
            roles: [{
                providerRole: 'graphProvider',
                role        : 'chat',
                model       : 'gemma4:26b'
            }],
            requireParallelModels: 2,
            allowPartial         : true,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 25,
            fetchModelIds        : async () => ['qwen3-embedding:latest'],
            warmModel            : async role => {
                throw new Error(`model '${role.model}' not found`);
            },
            log                  : {info: () => {}, warn: () => {}}
        });

        expect(result.ready).toBe(false);
        expect(result.degraded).toBe(true);
        expect(result.requiredModels).toEqual(['gemma4:26b']);
        expect(result.availableModels).toEqual(['qwen3-embedding:latest']);
        expect(result.extraModels).toEqual(['qwen3-embedding:latest']);
        expect(result.missingModels).toEqual(['gemma4:26b']);
        expect(result.observedCount).toBe(1);
        expect(result.observedRequiredCount).toBe(0);
        expect(result.requiredResidentModels).toBe(1);
        expect(result.warning).toContain('ollama pull gemma4:26b');
        expect(result.warning).toContain('extra=qwen3-embedding:latest');
        expect(result.warning).not.toContain('set OLLAMA_MAX_LOADED_MODELS=1');
    });

    test('ensureOllamaModelsReady does not require inactive role models (#12285)', async () => {
        const result = await providerReadinessHelper.ensureOllamaModelsReady({
            host : 'http://ollama.test',
            roles: [{
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
        expect(result.extraModels).toEqual([]);
        expect(result.observedRequiredCount).toBe(1);
        expect(result.requiredResidentModels).toBe(1);
        expect(result.requireParallelModels).toBe(2);
        expect(result.warning).toBeNull();
    });

    test('loadLmsModel appends --context-length to execFile args when provided (#12117)', async () => {
        const execCalls    = [];
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

    test('loadLmsModel appends --parallel and --identifier when provided (#13700)', async () => {
        const execCalls    = [];
        const execFileStub = (cmd, args, callback) => {
            execCalls.push({cmd, args});
            callback(null, '', '');
        };

        await providerReadinessHelper.loadLmsModel('chat-model', {
            execFileFn   : execFileStub,
            contextLength: 131072,
            parallel     : 1,
            identifier   : 'chat-model'
        });

        expect(execCalls).toEqual([
            {
                cmd : 'lms',
                args: [
                    'load', 'chat-model',
                    '--context-length', '131072',
                    '--parallel', '1',
                    '--identifier', 'chat-model'
                ]
            }
        ]);
    });

    test('unloadLmsModel invokes lms unload for the requested identifier (#13700)', async () => {
        const execCalls    = [];
        const execFileStub = (cmd, args, callback) => {
            execCalls.push({cmd, args});
            callback(null, '', '');
        };

        await providerReadinessHelper.unloadLmsModel('chat-model:2', {execFileFn: execFileStub});

        expect(execCalls).toEqual([
            {cmd: 'lms', args: ['unload', 'chat-model:2']}
        ]);
    });

    test('loadLmsModel omits --context-length when not provided (backward compat)', async () => {
        const execCalls    = [];
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
            openAiCompatible : {
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
                'gemma-4-31b-it'                   : 262144,
                'text-embedding-qwen3-embedding-8b': 32768
            },
            parallels: {}
        });
    });

    test('buildOllamaReadinessConfig only includes explicitly selected native Ollama roles (#12285)', () => {
        expect(providerReadinessHelper.buildOllamaReadinessConfig({
            modelProvider    : 'gemini',
            graphProvider    : 'ollama',
            embeddingProvider: 'ollama',
            ollama           : {
                host                 : 'http://ollama.test',
                model                : 'gemma4:31b',
                embeddingModel       : 'qwen3-embedding',
                keep_alive           : '-1',
                requireParallelModels: 2
            },
            openAiCompatible: {
                model         : 'gemma-openai',
                embeddingModel: 'openai-embedding'
            },
            localModels: {
                chat: {
                    contextLimitTokens: 131072
                },
                embedding: {
                    contextLimitTokens: 32768
                }
            }
        })).toEqual({
            provider             : 'ollama',
            host                 : 'http://ollama.test',
            keepAlive            : '-1',
            requireParallelModels: 2,
            model                : 'gemma4:31b',
            embeddingModel       : 'qwen3-embedding',
            roles                : [{
                provider     : 'ollama',
                providerRole : 'graphProvider',
                role         : 'chat',
                model        : 'gemma4:31b',
                contextLength: 131072
            }, {
                provider     : 'ollama',
                providerRole : 'embeddingProvider',
                role         : 'embedding',
                model        : 'qwen3-embedding',
                contextLength: 32768
            }],
            models        : ['gemma4:31b', 'qwen3-embedding'],
            contextLengths: {
                'gemma4:31b'     : 131072,
                'qwen3-embedding': 32768
            }
        });

        expect(providerReadinessHelper.buildOllamaReadinessConfig({
            modelProvider    : 'openAiCompatible',
            graphProvider    : 'openAiCompatible',
            embeddingProvider: 'openAiCompatible',
            ollama           : {
                host                 : 'http://ollama.test',
                model                : 'gemma4:31b',
                embeddingModel       : 'qwen3-embedding',
                requireParallelModels: 2
            },
            localModels: {
                chat: {
                    contextLimitTokens: 131072
                },
                embedding: {
                    contextLimitTokens: 32768
                }
            }
        }).roles).toEqual([]);
    });

    test('loadLmsModel omits --context-length when contextLength is non-finite (defensive)', async () => {
        const execCalls    = [];
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
            modelProvider   : 'gemini',
            graphProvider   : 'openAiCompatible',
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
            modelProvider: 'gemini',
            graphProvider: 'ollama',
            ollama       : {
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
            modelProvider   : 'ollama',
            graphProvider   : 'openAiCompatible',
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
                modelProvider   : 'openAiCompatible',
                graphProvider   : 'openAiCompatible',
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

        const today = new Date().toISOString().slice(0, 10);
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
                modelProvider   : 'gemini',
                graphProvider   : 'gemini',
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
            reason       : 'UNSUPPORTED_GRAPH_PROVIDER',
            graphProvider: 'gemini',
            supported    : false,
            host         : null,
            endpoint     : null
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
                modelProvider: 'ollama',
                graphProvider: 'ollama',
                ollama       : {
                    host          : 'http://ollama.test',
                    model         : 'gemma4:31b',
                    embeddingModel: 'qwen3-embedding'
                }
            },
            reason: 'PROVIDER_MODEL_RESIDENCY_DEGRADED',
            capacity
        });

        expect(diagnostic).toMatchObject({
            event        : 'runSandman.provider_model_residency_degraded',
            reason       : 'PROVIDER_MODEL_RESIDENCY_DEGRADED',
            provider     : 'ollama',
            graphProvider: 'ollama',
            host         : 'http://ollama.test',
            endpoint     : '/api/tags',
            capacity,
            nextAction   : capacity.warning
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
        const logs      = [];
        const exitCodes = [];

        const result = await runSandmanModule.runSandman({
            dreamService: {
                ready          : async () => calls.push('dream.ready'),
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
                owner       : 'sandman',
                reason      : 'manual-cli',
                staleAfterMs: aiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
                metadata    : {script: 'ai/scripts/runners/runSandman.mjs'}
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
                ready          : async () => {},
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
