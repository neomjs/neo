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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

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
