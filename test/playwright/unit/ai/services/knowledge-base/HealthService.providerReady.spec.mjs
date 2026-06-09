import {setup} from '../../../../setup.mjs';

const appName = 'KBHealthServiceProviderReadyTest';

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
import {createHash}       from 'crypto';
import {readFileSync}     from 'fs';
import path               from 'path';
import {fileURLToPath}    from 'url';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';

const
    testDir            = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot           = path.resolve(testDir, '../../../../../../'),
    sharedConfigPath   = path.resolve(repoRoot, 'ai/config.mjs'),
    kbServerConfigPath = path.resolve(repoRoot, 'ai/mcp/server/knowledge-base/config.mjs');

function createFileDigest(filePath) {
    const contents = readFileSync(filePath);

    return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

test.describe('Neo.ai.services.knowledge-base.HealthService provider-aware readiness (#12741)', () => {
    let HealthService, ChromaManager, DatabaseLifecycleService, aiConfig;

    test.beforeAll(async () => {
        HealthService            = (await import('../../../../../../ai/services/knowledge-base/HealthService.mjs')).default;
        ChromaManager            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DatabaseLifecycleService = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;
        aiConfig                 = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
    });

    // ---------------------------------------------------------------------------
    // Pure predicate: the readiness decision for every provider / key combination.
    // Local + mock providers serve embeddings from their own host; only the remote
    // `gemini` provider needs a GEMINI_API_KEY.
    // ---------------------------------------------------------------------------
    test('isEmbeddingProviderReady: local + mock providers are ready without a Gemini key', () => {
        expect(HealthService.isEmbeddingProviderReady('openAiCompatible', false)).toBe(true);
        expect(HealthService.isEmbeddingProviderReady('ollama',           false)).toBe(true);
        expect(HealthService.isEmbeddingProviderReady('mock',             false)).toBe(true);
    });

    test('isEmbeddingProviderReady: only the remote gemini provider requires a key', () => {
        expect(HealthService.isEmbeddingProviderReady('gemini', false)).toBe(false);
        expect(HealthService.isEmbeddingProviderReady('gemini', true)).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Gate-level proof: with ChromaDB healthy and NO GEMINI_API_KEY, a local-provider
    // deployment must NOT have ask_knowledge_base rejected by the health gate.
    // (CI default: aiConfig.embeddingProvider === 'openAiCompatible' — local.)
    // ---------------------------------------------------------------------------
    test.describe('ensureHealthy with ChromaDB healthy + no GEMINI_API_KEY', () => {
        let originalClient, originalGetCollection, originalGetDbStatus, originalGeminiKey;

        test.beforeEach(() => {
            originalClient        = ChromaManager.client;
            originalGetCollection = ChromaManager.getKnowledgeBaseCollection;
            originalGetDbStatus   = DatabaseLifecycleService.getDatabaseStatus;
            originalGeminiKey     = process.env.GEMINI_API_KEY;

            ChromaManager.client                     = {heartbeat: async () => ({})};
            ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 1});
            DatabaseLifecycleService.getDatabaseStatus = () => ({status: 'mocked'});
            delete process.env.GEMINI_API_KEY;

            HealthService.clearCache();
        });

        test.afterEach(() => {
            ChromaManager.client                       = originalClient;
            ChromaManager.getKnowledgeBaseCollection   = originalGetCollection;
            DatabaseLifecycleService.getDatabaseStatus = originalGetDbStatus;

            if (originalGeminiKey === undefined) {
                delete process.env.GEMINI_API_KEY;
            } else {
                process.env.GEMINI_API_KEY = originalGeminiKey;
            }

            HealthService.clearCache();
        });

        test('local embedding provider reports healthy and ensureHealthy() resolves without a key', async () => {
            // Precondition: the resolved default provider is local (not gemini).
            expect(aiConfig.embeddingProvider).not.toBe('gemini');

            const health = await HealthService.healthcheck();

            expect(health.features.embedding).toBe(true);
            expect(health.status).toBe('healthy');

            // The gate must not throw — local-provider ask is allowed with no GEMINI_API_KEY.
            await expect(HealthService.ensureHealthy()).resolves.toBeUndefined();
        });
    });
});

test.describe.serial('Neo.ai.services.knowledge-base.HealthService runtimeFreshness (#12774)', () => {
    let HealthService, ChromaManager, DatabaseLifecycleService,
        bootRuntimeIdentity, bootRuntimeFreshnessErrors;

    test.beforeAll(async () => {
        HealthService            = (await import('../../../../../../ai/services/knowledge-base/HealthService.mjs')).default;
        ChromaManager            = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DatabaseLifecycleService = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;
        bootRuntimeIdentity        = HealthService.bootRuntimeIdentity;
        bootRuntimeFreshnessErrors = HealthService.bootRuntimeFreshnessErrors;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader = null;
        HealthService.runtimeFreshnessCacheDuration = 30 * 1000;
        HealthService.bootRuntimeIdentity        = bootRuntimeIdentity;
        HealthService.bootRuntimeFreshnessErrors = bootRuntimeFreshnessErrors;
        HealthService.clearCache();
    });

    test('classifies matching boot/current identity as current', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'abc123',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {
                configDigest : false,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details).toContain('Runtime source/config identity matches the current checkout.');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('classifies stale config and OpenAPI identity with KB restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'same-head',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:old-openapi'
            },
            current: {
                gitHead      : 'same-head',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:new-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                configDigest : true,
                openApiDigest: true
            },
            hint: 'Restart or reconnect the Knowledge Base MCP server to refresh cached source, config, and tool definitions.'
        });
        expect(result.details[0]).toContain('Knowledge Base MCP server');
        expect(result.details[0]).toContain('configDigest');
    });

    test('does not track gitHead — injected gitHead drift is ignored entirely', async () => {
        // Knowledge Base supplies no rootDir to the shared tracker, so gitHead is never read or
        // surfaced. Even a reader returning differing gitHead values must not appear in `stale`
        // nor flip status: the freshness signal is digest-only and portable off a git checkout.
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'old-head',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current: {
                gitHead      : 'new-head',
                configDigest : 'sha256:same-config',
                openApiDigest: 'sha256:same-openapi'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result.status).toBe('current');
        expect(result.stale).not.toHaveProperty('gitHead');
        expect(result.stale).toEqual({configDigest: false, openApiDigest: false});
        expect(result.details.join(' ')).not.toContain('informational');
    });

    test('classifies missing identity as unknown without throwing', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {},
            current: {},
            errors : ['current config digest unavailable: fixture']
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                configDigest : null,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details).toContain('current config digest unavailable: fixture');
    });

    test('default reader digests shared Tier-1 config, not the KB per-server config', async () => {
        const kbServerConfigDigest = createFileDigest(kbServerConfigPath);

        expect(kbServerConfigDigest).not.toBe(createFileDigest(sharedConfigPath));

        HealthService.runtimeFreshnessCacheDuration = 0;
        HealthService.runtimeFreshnessReader = null;
        HealthService.bootRuntimeFreshnessErrors = [];
        HealthService.bootRuntimeIdentity = {
            configDigest: kbServerConfigDigest
        };
        HealthService.clearCache();

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                configDigest: true
            }
        });
        expect(result.details[0]).toContain('configDigest');
    });

    test('cached healthy healthcheck reuses runtime freshness inside the short TTL', async () => {
        const originalClient        = ChromaManager.client,
              originalGetCollection = ChromaManager.getKnowledgeBaseCollection,
              originalGetDbStatus   = DatabaseLifecycleService.getDatabaseStatus;

        let currentConfigDigest = 'sha256:boot-config';
        let readCount           = 0;

        try {
            ChromaManager.client                       = {heartbeat: async () => ({})};
            ChromaManager.getKnowledgeBaseCollection   = async () => ({count: async () => 1});
            DatabaseLifecycleService.getDatabaseStatus = () => ({status: 'mocked'});

            HealthService.runtimeFreshnessReader = async () => {
                readCount++;

                return {
                    boot: {
                        gitHead      : 'abc123',
                        configDigest : 'sha256:boot-config',
                        openApiDigest: 'sha256:same-openapi'
                    },
                    current: {
                        gitHead      : 'abc123',
                        configDigest : currentConfigDigest,
                        openApiDigest: 'sha256:same-openapi'
                    }
                };
            };

            const cached = await HealthService.healthcheck();

            expect(cached.status).toBe('healthy');
            expect(cached.runtimeFreshness.status).toBe('current');
            expect(readCount).toBe(1);

            currentConfigDigest = 'sha256:changed-config';

            const reused = await HealthService.healthcheck();

            expect(reused.status).toBe('healthy');
            expect(reused.runtimeFreshness.status).toBe('current');
            expect(readCount).toBe(1);

            HealthService.runtimeFreshnessCacheDuration = 0;

            const refreshed = await HealthService.healthcheck();

            expect(refreshed.status).toBe('healthy');
            expect(refreshed.runtimeFreshness).toMatchObject({
                status: 'stale',
                stale : {
                    configDigest : true,
                    openApiDigest: false
                }
            });
            expect(readCount).toBe(2);
        } finally {
            ChromaManager.client                       = originalClient;
            ChromaManager.getKnowledgeBaseCollection   = originalGetCollection;
            DatabaseLifecycleService.getDatabaseStatus = originalGetDbStatus;
        }
    });
});
