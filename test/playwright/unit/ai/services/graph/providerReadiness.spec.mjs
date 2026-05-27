import {setup} from '../../../../setup.mjs';

const appName = 'GraphProviderReadinessTest';

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
 * @summary Validates shared graph-provider readiness diagnostics extracted from runSandman.
 *
 * This coverage keeps the provider-readiness substrate testable without a real MLX,
 * Ollama, LM Studio, or OpenAI-compatible server. The failure branch must leave a
 * queryable Memory Core log breadcrumb so future REM callers can distinguish expected
 * provider-unavailable state from missing DreamService / Golden Path output.
 */
test.describe('providerReadiness.mjs graph provider diagnostics (#12072)', () => {
    test.describe.configure({mode: 'serial'});

    let aiConfig;
    let logger;
    let providerReadiness;
    let tmpLogDir;
    let originalLogPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        tmpLogDir = path.resolve(os.tmpdir(), `provider-readiness-${process.pid}-${Date.now()}`);
        originalLogPath = aiConfig.data.logPath;
        aiConfig.data.logPath = tmpLogDir;

        logger            = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        providerReadiness = await import('../../../../../../ai/services/graph/providerReadiness.mjs');
    });

    test.afterAll(() => {
        aiConfig.data.logPath = originalLogPath;

        if (tmpLogDir && fs.existsSync(tmpLogDir)) {
            fs.rmSync(tmpLogDir, {recursive: true, force: true});
        }
    });

    test('waitForProvider returns timeout metadata without a real provider', async () => {
        let dots = '';

        const waitResult = await providerReadiness.waitForProvider({
            attempts        : 3,
            delayMs         : 0,
            requestTimeoutMs: 10,
            checkProvider   : async () => false,
            output          : {
                write: value => {
                    dots += value;
                }
            }
        });

        expect(waitResult).toMatchObject({
            running : false,
            attempts: 3,
            timeoutMs: 30
        });
        expect(waitResult.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(dots).toBe('...');
    });

    test('resolves readiness target from graphProvider instead of generic modelProvider', () => {
        expect(providerReadiness.getGraphProviderReadinessTarget({
            modelProvider: 'gemini',
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

        expect(providerReadiness.getGraphProviderReadinessTarget({
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
    });

    test('records a durable provider-timeout breadcrumb without leaking secrets', async () => {
        const diagnostic = providerReadiness.createProviderFailureDiagnostic({
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
                timeoutMs: 120000
            },
            lifecycleStatus: {
                running: false,
                managed: false,
                pid    : null
            }
        });

        const result = await providerReadiness.recordProviderReadinessFailure(diagnostic, {
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

    test('unsupported graphProvider fails before readiness polling', async () => {
        const diagnostic = providerReadiness.createProviderFailureDiagnostic({
            config: {
                modelProvider : 'gemini',
                graphProvider : 'gemini',
                openAiCompatible: {
                    apiKey: 'must-not-be-logged'
                }
            },
            reason: 'UNSUPPORTED_GRAPH_PROVIDER'
        });

        const result = await providerReadiness.recordProviderReadinessFailure(diagnostic, {
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
});
