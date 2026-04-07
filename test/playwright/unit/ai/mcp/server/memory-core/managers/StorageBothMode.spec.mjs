import { setup } from '../../../../../../setup.mjs';

const appName = 'StorageBothModeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName,
        isMounted: () => true,
        vnodeInitialising: false
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../../../src/core/_export.mjs';
import InstanceManager      from '../../../../../../../../src/manager/Instance.mjs';
import aiConfig             from '../../../../../../../../ai/mcp/server/memory-core/config.mjs';
import SQLiteVectorManager  from '../../../../../../../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs';
import ChromaManager        from '../../../../../../../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';
import StorageRouter        from '../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs';
import TextEmbeddingService from '../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.managers.StorageBothMode', () => {

    test('should independently request correct embeddings for Neo and Chroma in Both mode', async () => {
        aiConfig.engine = 'both';
        aiConfig.neoEmbeddingProvider = 'mock_openAiCompatible';
        aiConfig.chromaEmbeddingProvider = 'mock_gemini';

        let requestedProviders = [];

        // Mock the TextEmbeddingService
        const originalEmbedText = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async (text, provider) => {
            requestedProviders.push(provider);
            return [0.1, 0.2, 0.3]; // Dummy vector
        };

        try {
            await StorageRouter.ready();

            // Mock clients so we do not actually query databases
            SQLiteVectorManager.client = {
                getOrCreateCollection: async ({ name }) => ({ dummy: true })
            };

            // Bypass init logic for test setup
            ChromaManager.client = {
                getOrCreateCollection: async ({ name, embeddingFunction }) => {
                    if (embeddingFunction && typeof embeddingFunction.generate === 'function') {
                        await embeddingFunction.generate(['test document']);
                    }
                    return { dummy: true };
                }
            };

            // Test SQLite wrapper logic directly simulating an upsert
            // Simulate upsert missing embeddings
            // Mock sqlite transaction
            SQLiteVectorManager.db = {
                prepare: () => ({ get: () => ({ rowid: 1n }), run: () => {} }),
                transaction: (cb) => cb,
                exec: () => {}
            };

            const sqliteCollection = await SQLiteVectorManager.getOrCreateCollection({ name: 'test' });

            await sqliteCollection.upsert({
                ids: ['id1'],
                documents: ['test sqlite document']
            });

            // Trigger native Chroma wrapper logic
            ChromaManager._summaryCollectionPromise = null; // force clear if cached
            await ChromaManager.getSummaryCollection();

            expect(requestedProviders).toContain('mock_openAiCompatible');
            expect(requestedProviders).toContain('mock_gemini');

        } finally {
            TextEmbeddingService.embedText = originalEmbedText;
        }
    });

});
