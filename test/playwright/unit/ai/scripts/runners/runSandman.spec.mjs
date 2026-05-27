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
        providerReadinessHelper = await import('../../../../../../ai/services/graph/ProviderReadinessHelper.mjs');
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

    test('ensureLmsModelsLoaded skips lms load when both models are already resident', async () => {
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

    test('ensureLmsModelsLoaded fails loud when readiness config is incomplete', async () => {
        await expect(providerReadinessHelper.ensureLmsModelsLoaded({
            host  : 'http://127.0.0.1:1234',
            models: ['chat-model']
        })).rejects.toThrow(/attempts.*delayMs.*timeoutMs.*required/);
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
