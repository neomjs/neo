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

    test('getKnowledgeBaseCollection creates and caches the configured collection after missing get', async () => {
        let createCount = 0;
        let getCount = 0;
        let created = false;
        let capturedOptions;

        ChromaManager.client = {
            getCollection: async options => {
                getCount++;
                if (!created) {
                    throw new Error(`Collection ${options.name} does not exist.`);
                }
                return {name: options.name};
            },
            listCollections: async () => [],
            createCollection: async options => {
                createCount++;
                created = true;
                capturedOptions = options;
                return {name: options.name};
            }
        };

        const first  = await ChromaManager.getKnowledgeBaseCollection();
        const second = await ChromaManager.getKnowledgeBaseCollection();

        expect(getCount).toBe(1);
        expect(createCount).toBe(1);
        expect(first).toBe(second);
        expect(capturedOptions).toEqual({
            name             : aiConfig.collectionName,
            embeddingFunction: aiConfig.dummyEmbeddingFunction
        });
    });

    test('getKnowledgeBaseCollection treats ChromaNotFoundError as missing canonical collection', async () => {
        let createCount = 0;
        let capturedOptions;

        ChromaManager.client = {
            getCollection: async () => {
                const error = new Error('The requested resource could not be found');
                error.name  = 'ChromaNotFoundError';
                throw error;
            },
            listCollections: async () => [],
            createCollection: async options => {
                createCount++;
                capturedOptions = options;
                return {name: options.name};
            }
        };

        const collection = await ChromaManager.getKnowledgeBaseCollection();

        expect(collection.name).toBe(aiConfig.collectionName);
        expect(createCount).toBe(1);
        expect(capturedOptions).toEqual({
            name             : aiConfig.collectionName,
            embeddingFunction: aiConfig.dummyEmbeddingFunction
        });
    });

    test('getKnowledgeBaseCollection refuses to create canonical during active shadow-swap promotion', async () => {
        let createCount = 0;

        ChromaManager.client = {
            getCollection: async options => {
                throw new Error(`Collection ${options.name} does not exist.`);
            },
            listCollections: async () => [
                {name: `${aiConfig.collectionName}-parking-123`},
                {name: `${aiConfig.collectionName}-shadow-123`},
                {name: `${aiConfig.collectionName}-failed-shadow-older`}
            ],
            createCollection: async () => {
                createCount++;
                return {name: aiConfig.collectionName};
            }
        };

        await expect(ChromaManager.getKnowledgeBaseCollection())
            .rejects.toMatchObject({
                code                  : 'KB_COLLECTION_SWAP_IN_PROGRESS',
                activeSwapCollections : [
                    `${aiConfig.collectionName}-parking-123`,
                    `${aiConfig.collectionName}-shadow-123`
                ]
            });

        expect(createCount).toBe(0);
        expect(ChromaManager._knowledgeBaseCollectionPromise).toBe(null);
        expect(ChromaManager.knowledgeBaseCollection).toBe(null);
    });

    test('invalidateKnowledgeBaseCollectionCache clears cached canonical collection handles', async () => {
        const cachedCollection = {name: 'cached-knowledge-base'};

        ChromaManager._knowledgeBaseCollectionPromise = Promise.resolve(cachedCollection);
        ChromaManager.knowledgeBaseCollection         = cachedCollection;

        ChromaManager.invalidateKnowledgeBaseCollectionCache();

        expect(ChromaManager._knowledgeBaseCollectionPromise).toBe(null);
        expect(ChromaManager.knowledgeBaseCollection).toBe(null);
    });

    test('checkConnectivity returns heartbeat and cached collection name', async () => {
        ChromaManager.client = {
            heartbeat: async () => 456,
            getCollection: async () => ({name: 'knowledge-base-test'})
        };

        await expect(ChromaManager.checkConnectivity()).resolves.toEqual({
            heartbeat              : 456,
            knowledgeBaseCollection: 'knowledge-base-test'
        });
    });
});
