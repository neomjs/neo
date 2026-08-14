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
    let originalCollectionResolveRetrySleepFn;

    test.beforeAll(async () => {
        aiConfig      = (await import('../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
        ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        originalClient                  = ChromaManager.client;
        originalCollectionPromise       = ChromaManager._knowledgeBaseCollectionPromise;
        originalKnowledgeBaseCollection = ChromaManager.knowledgeBaseCollection;
        originalCollectionResolveRetrySleepFn = ChromaManager.collectionResolveRetrySleepFn;
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
        ChromaManager.collectionResolveRetrySleepFn  = originalCollectionResolveRetrySleepFn;
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
        let getCount    = 0;
        let created     = false;
        let capturedOptions;

        ChromaManager.client = {
            getCollection: async options => {
                getCount++;
                if (!created) {
                    throw new Error(`Collection ${options.name} does not exist.`);
                }
                return {name: options.name};
            },
            listCollections : async () => [],
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

    test('getKnowledgeBaseCollection retries transient ChromaConnectionError while resolving the canonical collection', async () => {
        const delays   = [];
        let   getCount = 0;

        ChromaManager.collectionResolveRetrySleepFn = async delayMs => { delays.push(delayMs); };
        ChromaManager.client = {
            getCollection: async options => {
                getCount++;

                if (getCount < 3) {
                    const error = new Error('Failed to connect to chromadb');
                    error.name  = 'ChromaConnectionError';
                    throw error;
                }

                return {name: options.name};
            }
        };

        const collection = await ChromaManager.getKnowledgeBaseCollection();

        expect(collection.name).toBe(aiConfig.collectionName);
        expect(getCount).toBe(3);
        expect(delays).toEqual([
            aiConfig.collectionResolveRetry.initialDelayMs,
            aiConfig.collectionResolveRetry.initialDelayMs * 2
        ]);
    });

    test('getKnowledgeBaseCollection fails loud after bounded ChromaConnectionError retries', async () => {
        let getCount = 0;

        ChromaManager.collectionResolveRetrySleepFn = async () => {};
        ChromaManager.client = {
            getCollection: async () => {
                getCount++;
                const error = new Error('Failed to connect to chromadb');
                error.name  = 'ChromaConnectionError';
                throw error;
            }
        };

        await expect(ChromaManager.getKnowledgeBaseCollection())
            .rejects.toMatchObject({
                name        : 'ChromaConnectionError',
                retryContext: {
                    maxAttempts: aiConfig.collectionResolveRetry.maxAttempts
                }
            });

        expect(getCount).toBe(aiConfig.collectionResolveRetry.maxAttempts);
        expect(ChromaManager._knowledgeBaseCollectionPromise).toBe(null);
        expect(ChromaManager.knowledgeBaseCollection).toBe(null);
    });

    test('#17068: the bounded resolver spans a dependency restart longer than the prior five-second horizon', async () => {
        const delays   = [];
        let   getCount = 0;

        ChromaManager.collectionResolveRetrySleepFn = async delayMs => { delays.push(delayMs); };
        ChromaManager.client = {
            getCollection: async options => {
                getCount++;

                if (delays.reduce((total, delayMs) => total + delayMs, 0) <= 6000) {
                    const error = new Error('Failed to connect to chromadb');
                    error.name  = 'ChromaConnectionError';
                    throw error;
                }

                return {name: options.name};
            }
        };

        await expect(ChromaManager.getKnowledgeBaseCollection())
            .resolves.toMatchObject({name: aiConfig.collectionName});
        expect(getCount).toBeGreaterThan(aiConfig.collectionResolveRetry.maxAttempts / 2);
        expect(delays.reduce((total, delayMs) => total + delayMs, 0)).toBeGreaterThan(6000);
        expect(delays.reduce((total, delayMs) => total + delayMs, 0))
            .toBeLessThanOrEqual(aiConfig.collectionResolveRetry.maxTotalDelayMs);
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
            listCollections : async () => [],
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

    test('isCollectionNotFoundError exposes the canonical Chroma not-found classifier', () => {
        const namedError = new Error('The requested resource could not be found');
        namedError.name  = 'ChromaNotFoundError';

        expect(ChromaManager.isCollectionNotFoundError(namedError)).toBe(true);
        expect(ChromaManager.isCollectionNotFoundError(new Error('collection does not exist'))).toBe(true);
        expect(ChromaManager.isCollectionNotFoundError(new Error('connection refused'))).toBe(false);
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
                code                 : 'KB_COLLECTION_SWAP_IN_PROGRESS',
                activeSwapCollections: [
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
            heartbeat    : async () => 456,
            getCollection: async () => ({name: 'knowledge-base-test'})
        };

        await expect(ChromaManager.checkConnectivity()).resolves.toEqual({
            heartbeat              : 456,
            knowledgeBaseCollection: 'knowledge-base-test'
        });
    });

    // The disposable path shares the canonical path's restart tolerance, and this asserts it rather
    // than trusting that the helper is called. Flagged in review by @neo-opus-ada: the method's
    // docblock argued three deliberate differences from the canonical resolver while the retry
    // policy was a silent fourth, and Chroma demonstrably restarts — so without this the one
    // resolution path used to DIAGNOSE a restore is the only one that cannot survive the event under
    // investigation, and a transient connection error would surface as "the restore failed".
    test('getDisposableCollection retries transient ChromaConnectionError, with the SAME policy as the canonical path', async () => {
        const delays = [];
        let   calls  = 0;

        ChromaManager.collectionResolveRetrySleepFn = async delayMs => { delays.push(delayMs); };
        ChromaManager.client = {
            // `getOrCreateCollection`, not `getCollection` — a disposable target must be created on
            // first use. Stubbing only this verb also proves the disposable path does not fall back
            // to the canonical one: were it wired to `getCollection`, this test would fail on an
            // undefined function rather than pass for the wrong reason.
            getOrCreateCollection: async options => {
                calls++;

                if (calls < 3) {
                    const error = new Error('Failed to connect to chromadb');
                    error.name  = 'ChromaConnectionError';
                    throw error;
                }

                return {name: options.name};
            }
        };

        const collection = await ChromaManager.getDisposableCollection({name: 'kb-probe-disposable-retry'});

        expect(collection.name).toBe('kb-probe-disposable-retry');
        expect(calls).toBe(3);
        // Identical backoff shape to the canonical retry test above. Asserting the delays rather than
        // just the call count is what makes this a shared-policy claim instead of a has-a-loop claim:
        // a second hand-rolled retry with different timings would pass on `calls` alone.
        expect(delays).toEqual([
            aiConfig.collectionResolveRetry.initialDelayMs,
            aiConfig.collectionResolveRetry.initialDelayMs * 2
        ]);
    });

    test('getDisposableCollection still refuses a canonical target, retry wiring notwithstanding', async () => {
        // The control on the change above: threading the guard through a retry helper must not make
        // the refusal reachable-but-retried. A canonical name fails BEFORE any client call.
        let calls = 0;

        ChromaManager.client = {
            getOrCreateCollection: async () => { calls++; return {name: 'should-not-happen'} }
        };

        await expect(ChromaManager.getDisposableCollection({name: aiConfig.collectionName}))
            .rejects.toThrow(/DISPOSABLE_RESTORE_TARGET_REQUIRED/);
        expect(calls).toBe(0);
    });
});
