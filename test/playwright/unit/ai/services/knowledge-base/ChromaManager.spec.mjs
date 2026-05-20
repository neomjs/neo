import {setup} from '../../../../setup.mjs';

const appName = 'KBChromaManagerTest';

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

test.describe('Neo.ai.services.knowledge-base.ChromaManager', () => {
    let aiConfig;
    let ChromaManager;
    let originalClient;
    let originalCollectionPromise;
    let originalKnowledgeBaseCollection;

    test.beforeAll(async () => {
        aiConfig      = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        originalClient                  = ChromaManager.client;
        originalCollectionPromise       = ChromaManager._knowledgeBaseCollectionPromise;
        originalKnowledgeBaseCollection = ChromaManager.knowledgeBaseCollection;
    });

    test.beforeEach(() => {
        ChromaManager._knowledgeBaseCollectionPromise = null;
        ChromaManager.knowledgeBaseCollection         = null;
    });

    test.afterEach(() => {
        ChromaManager.client                         = originalClient;
        ChromaManager.connected                      = false;
        ChromaManager._knowledgeBaseCollectionPromise = originalCollectionPromise;
        ChromaManager.knowledgeBaseCollection        = originalKnowledgeBaseCollection;
    });

    test('connect marks the manager connected when heartbeat succeeds', async () => {
        ChromaManager.client = {
            heartbeat: async () => 123
        };

        await expect(ChromaManager.connect()).resolves.toBe(true);
        expect(ChromaManager.connected).toBe(true);
    });

    test('connect marks the manager disconnected when heartbeat fails', async () => {
        ChromaManager.client = {
            heartbeat: async () => {
                throw new Error('offline');
            }
        };

        await expect(ChromaManager.connect()).resolves.toBe(false);
        expect(ChromaManager.connected).toBe(false);
    });

    test('getKnowledgeBaseCollection creates and caches the configured collection', async () => {
        let callCount = 0;
        let capturedOptions;

        ChromaManager.client = {
            getOrCreateCollection: async options => {
                callCount++;
                capturedOptions = options;
                return {name: options.name};
            }
        };

        const first  = await ChromaManager.getKnowledgeBaseCollection();
        const second = await ChromaManager.getKnowledgeBaseCollection();

        expect(callCount).toBe(1);
        expect(first).toBe(second);
        expect(capturedOptions).toEqual({
            name             : aiConfig.collectionName,
            embeddingFunction: aiConfig.dummyEmbeddingFunction
        });
    });

    test('checkConnectivity returns heartbeat and cached collection name', async () => {
        ChromaManager.client = {
            heartbeat: async () => 456,
            getOrCreateCollection: async () => ({name: 'knowledge-base-test'})
        };

        await expect(ChromaManager.checkConnectivity()).resolves.toEqual({
            heartbeat              : 456,
            knowledgeBaseCollection: 'knowledge-base-test'
        });
    });
});
