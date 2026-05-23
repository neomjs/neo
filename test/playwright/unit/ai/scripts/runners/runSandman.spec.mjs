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
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        tmpLogDir = path.resolve(os.tmpdir(), `runsandman-diagnostics-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        logger           = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        runSandmanModule = await import('../../../../../../ai/scripts/runners/runSandman.mjs');
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

    test('records a durable provider-timeout breadcrumb without leaking secrets', async () => {
        const diagnostic = runSandmanModule.createProviderFailureDiagnostic({
            config: {
                modelProvider: 'openAiCompatible',
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
        expect(logLines).toContain('http://127.0.0.1:11435');
        expect(logLines).toContain('mlx-community/test-model');
        expect(logLines).toContain('Start the configured OpenAI-compatible / MLX provider');
        expect(logLines).not.toContain('must-not-be-logged');
    });

    test('runRemPipeline propagates REM failures without printing success (#11698)', async () => {
        const logs = [];

        await expect(runSandmanModule.runRemPipeline({
            dreamService: {
                processUndigestedSessions: async () => {
                    throw new Error('simulated REM failure');
                }
            },
            goldenPathSynthesizer: {
                synthesizeGoldenPath: async () => {
                    throw new Error('Golden Path must not run after REM failure');
                }
            },
            output: {
                log: message => logs.push(message)
            }
        })).rejects.toThrow('simulated REM failure');

        expect(logs.some(message => message.includes('Sandman cycle complete'))).toBe(false);
    });
});
