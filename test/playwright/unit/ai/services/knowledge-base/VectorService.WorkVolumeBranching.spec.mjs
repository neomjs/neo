import {setup} from '../../../../setup.mjs';

const appName = 'KBWorkVolumeBranchingTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Work-volume branching coverage for `VectorService.embed`.
 *
 * Verifies the post-delta-pre-embed gate at the four meaningful states:
 *
 * 1. Zero-changes fast-path is unchanged — the existing no-work early return in
 *    VectorService.embed is preserved by the gate.
 * 2. Below-threshold MCP invocation succeeds — agent-callable steady-state.
 * 3. Above-threshold MCP invocation refuses with `KB_SYNC_VOLUME_EXCEEDED` payload that
 *    the KB Server's `'error' in result` contract converts to `isError: true`.
 * 4. Above-threshold CLI invocation bypasses the gate — explicit opt-in to long-running work.
 *
 * Spy-collection pattern: replaces `KB_ChromaManager.getKnowledgeBaseCollection` with
 * an in-memory spy that simulates ChromaDB's `get` (existing IDs) + `upsert` (embedding
 * write) without touching the real DB. The spy lets us seed `existingIds` to engineer
 * specific `chunksToProcess` volumes for each branch.
 *
 * Serial mode: specs mutate the `KB_ChromaManager.getKnowledgeBaseCollection` singleton.
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection({existingIds = [], name = 'spy-knowledge-base'} = {}) {
    const rows = new Map();
    existingIds.forEach(id => rows.set(id, {id, metadata: {}, document: ''}));

    const calls = {get: 0, upsert: 0, delete: 0, count: 0, modify: []};

    const collection = {
        rows,
        calls,
        name,

        async get({ids, where, limit = 2000, offset = 0, include = []} = {}) {
            calls.get++;
            const all = Array.from(rows.keys());
            const slice = all.slice(offset, offset + limit);
            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(() => ({})) : [],
                documents: include.includes('documents') ? slice.map(() => '') : []
            };
        },

        async upsert({ids, embeddings, metadatas}) {
            calls.upsert++;
            ids.forEach((id, i) => rows.set(id, {
                id,
                metadata: metadatas?.[i] ?? {},
                embedding: embeddings?.[i] ?? null
            }));
        },

        async delete({ids}) {
            calls.delete++;
            ids.forEach(id => rows.delete(id));
        },

        async modify({name}) {
            calls.modify.push({name});
            collection.name = name;
        },

        async count() {
            calls.count++;
            return rows.size;
        }
    };

    return collection;
}

function createRegistryBackedCollection({existingIds = [], name, registry, onModify} = {}) {
    const collection = createSpyCollection({existingIds, name});

    collection.modify = async ({name: nextName}) => {
        collection.calls.modify.push({name: nextName});
        if (registry.has(nextName)) {
            throw new Error(`Collection ${nextName} already exists.`);
        }
        registry.delete(collection.name);
        collection.name = nextName;
        registry.set(nextName, collection);
        if (onModify) {
            await onModify({collection, name: nextName});
        }
    };

    return collection;
}

function createRegistryBackedClient(registry) {
    const calls = {createCollection: [], getCollection: [], listCollections: 0};

    return {
        calls,

        async getCollection({name}) {
            calls.getCollection.push(name);
            const collection = registry.get(name);
            if (!collection) {
                throw new Error(`Collection ${name} does not exist.`);
            }
            return collection;
        },

        async listCollections() {
            calls.listCollections++;
            return Array.from(registry.values());
        },

        async createCollection({name}) {
            calls.createCollection.push(name);
            if (registry.has(name)) {
                throw new Error(`Collection ${name} already exists.`);
            }
            const collection = createRegistryBackedCollection({name, registry});
            registry.set(name, collection);
            return collection;
        }
    };
}

/**
 * Writes a JSONL file with N synthetic chunks. Each chunk is `kind: 'method-context'` (skips
 * the `module-context` className-map enrichment loop in embed()) with a unique `hash`.
 */
function writeFixtureJsonl(filePath, chunkCount, hashPrefix = 'chunk-') {
    const lines = [];
    for (let i = 0; i < chunkCount; i++) {
        lines.push(JSON.stringify({
            hash       : `${hashPrefix}${i}`,
            type       : 'method',
            name       : `method${i}`,
            className  : '',
            description: `synthetic chunk ${i}`,
            content    : `body ${i}`
        }));
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

test.describe('VectorService.embed — work-volume branching (#10572)', () => {
    let SDK, KB_VectorService, KB_ChromaManager, KB_Config;
    let TextEmbeddingService_orig;
    let originalGetCollection;
    let originalClient;
    let originalThreshold;
    let tmpDir, fixturePath;

    let TextEmbeddingService;

    test.beforeAll(async () => {
        SDK              = await import('../../../../../../ai/services.mjs');
        KB_ChromaManager = SDK.KB_ChromaManager;
        KB_Config        = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        // VectorService is a helper not exposed via the SDK exports — import directly.
        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        KB_VectorService = VectorServiceModule.default;

        // Stub the embedding API: tests verify the BRANCH decision, not real embedding work.
        // Without a stub, large-volume tests would attempt actual API calls (or timeout).
        TextEmbeddingService_orig = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));

        originalGetCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
        originalClient        = KB_ChromaManager.client;
        originalThreshold     = KB_Config.data.mcpSyncMaxChunks;

        tmpDir      = path.resolve(os.tmpdir(), `kb-work-volume-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        fixturePath = path.join(tmpDir, 'fixture.jsonl');
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_ChromaManager.client                     = originalClient;
        KB_Config.data.mcpSyncMaxChunks             = originalThreshold;
        TextEmbeddingService.embedTexts             = TextEmbeddingService_orig;
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        KB_Config.data.mcpSyncMaxChunks = 5; // tight threshold for predictable branching
        KB_ChromaManager.client         = originalClient;
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();
    });

    test('zero-changes fast-path is unchanged (existing chunks dedup to empty queue)', async () => {
        // Seed tenant-aware existing IDs that match the fixture exactly so
        // chunksToProcess becomes empty under the write-side stamping contract.
        const stamp = KB_VectorService.resolveTenantStamp();
        const ids   = ['chunk-0', 'chunk-1', 'chunk-2'].map((hash, i) => {
            return KB_VectorService.createTenantAwareChunkId({
                hash,
                type  : 'method',
                name  : `method${i}`,
                source: undefined
            }, stamp);
        });
        const spy = createSpyCollection({existingIds: ids});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 3); // hashes match the seeded existingIds

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        expect(result.message).toContain('No changes detected');
        expect('error' in result).toBe(false);
        expect(spy.calls.upsert).toBe(0); // no embedding work attempted
    });

    test('below-threshold MCP invocation succeeds (synchronous embedding path)', async () => {
        // 3 new chunks, threshold 5 — small enough to run synchronously via MCP.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 3);

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        expect('error' in result).toBe(false);
        expect(result.message).toContain('Embedding complete');
        expect(spy.calls.upsert).toBeGreaterThan(0); // embedding actually happened
    });

    test('deleteStale:false preserves incremental-push callers by skipping stale deletion', async () => {
        const spy = createSpyCollection({existingIds: ['stale-id']});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 1);

        const result = await KB_VectorService.embed(fixturePath, {deleteStale: false});

        expect('error' in result).toBe(false);
        expect(result.message).toContain('Embedding complete');
        expect(spy.calls.delete).toBe(0);
        expect(spy.rows.has('stale-id')).toBe(true);
        expect(spy.calls.upsert).toBeGreaterThan(0);
    });

    test('shadow-swap embeds full corpus into a shadow collection before canonical promotion', async () => {
        const live = createSpyCollection({existingIds: ['stale-id'], name: KB_Config.data.collectionName});
        let shadow;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                shadow = createSpyCollection({name});
                return shadow;
            }
        };
        KB_ChromaManager.getKnowledgeBaseCollection = async () => {
            return shadow?.name === KB_Config.data.collectionName ? shadow : live;
        };

        writeFixtureJsonl(fixturePath, 3);

        const result = await KB_VectorService.embed(fixturePath, {staleStrategy: 'shadow-swap'});

        expect('error' in result).toBe(false);
        expect(result.staleStrategy).toBe('shadow-swap');
        expect(result.embedded).toBe(3);
        expect(result.deleted).toBe(1);
        expect(result.shadowCollection).toContain(`${KB_Config.data.collectionName}-shadow-`);
        expect(result.parkedCollection).toContain(`${KB_Config.data.collectionName}-parking-`);
        expect(result.canonicalCollection).toBe(KB_Config.data.collectionName);

        expect(live.calls.delete).toBe(0);
        expect(live.calls.upsert).toBe(0);
        expect(live.calls.modify[0]).toEqual({name: result.parkedCollection});
        expect(shadow.calls.upsert).toBeGreaterThan(0);
        expect(shadow.calls.modify[0]).toEqual({name: KB_Config.data.collectionName});
        expect(shadow.rows.size).toBe(3);
    });

    test('shadow-swap failure invalidates cached canonical handles after local rename mutation', async () => {
        const live = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        const cachedCollectionPromise = Promise.resolve(live);

        live.modify = async ({name}) => {
            live.calls.modify.push({name});
            live.name = name;
            throw new Error('live rename failed');
        };

        KB_ChromaManager._knowledgeBaseCollectionPromise = cachedCollectionPromise;
        KB_ChromaManager.knowledgeBaseCollection         = live;
        KB_ChromaManager.client = {
            createCollection: async ({name}) => createSpyCollection({name})
        };
        KB_ChromaManager.getKnowledgeBaseCollection = async () => live;

        writeFixtureJsonl(fixturePath, 3);

        await expect(
            KB_VectorService.embed(fixturePath, {staleStrategy: 'shadow-swap'})
        ).rejects.toThrow('live rename failed');

        expect(KB_ChromaManager._knowledgeBaseCollectionPromise).toBe(null);
        expect(KB_ChromaManager.knowledgeBaseCollection).toBe(null);
    });

    test('shadow-swap blocks cold-cache canonical recreation during the promote window', async () => {
        const registry = new Map();
        let coldCacheError;

        const live = createRegistryBackedCollection({
            existingIds: [],
            name       : KB_Config.data.collectionName,
            registry,
            onModify   : async ({name}) => {
                if (name.includes(`${KB_Config.data.collectionName}-parking-`)) {
                    KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();
                    try {
                        await KB_ChromaManager.getKnowledgeBaseCollection();
                    } catch (error) {
                        coldCacheError = error;
                    }
                }
            }
        });
        registry.set(live.name, live);

        const client = createRegistryBackedClient(registry);
        KB_ChromaManager.client = client;

        const result = await KB_VectorService.embedViaShadowSwap({
            liveCollection: live,
            knowledgeBase: [{
                id         : 'chunk-0',
                hash       : 'chunk-0',
                type       : 'method',
                name       : 'method0',
                className  : '',
                description: 'body 0'
            }],
            idsToDeleteCount: 0
        });

        expect(result.staleStrategy).toBe('shadow-swap');
        expect(coldCacheError).toMatchObject({
            code: 'KB_COLLECTION_SWAP_IN_PROGRESS'
        });
        expect(coldCacheError.activeSwapCollections).toEqual(expect.arrayContaining([
            result.parkedCollection,
            result.shadowCollection
        ]));
        expect(client.calls.createCollection).not.toContain(KB_Config.data.collectionName);
        expect(registry.get(KB_Config.data.collectionName).rows.size).toBe(1);
    });

    test('shadow-swap parks failed pre-promote shadow collections under a non-active name', async () => {
        const live = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        const originalEmbedChunks = KB_VectorService.embedChunks.bind(KB_VectorService);
        let shadow;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                shadow = createSpyCollection({name});
                return shadow;
            }
        };
        KB_VectorService.embedChunks = async () => {
            throw new Error('forced embed failure');
        };

        try {
            await expect(KB_VectorService.embedViaShadowSwap({
                liveCollection   : live,
                knowledgeBase    : [{id: 'chunk-0', type: 'method', name: 'method0'}],
                idsToDeleteCount : 0
            })).rejects.toThrow('forced embed failure');

            expect(live.calls.modify).toEqual([]);
            expect(shadow.calls.modify).toHaveLength(1);
            expect(shadow.calls.modify[0].name).toContain(`${KB_Config.data.collectionName}-failed-shadow-`);
            expect(shadow.calls.modify[0].name).not.toContain(`${KB_Config.data.collectionName}-shadow-`);
        } finally {
            KB_VectorService.embedChunks = originalEmbedChunks;
        }
    });

    test('shadow-swap MCP gate measures full-corpus rebuild volume before creating shadow collection', async () => {
        const live = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        let createCollectionCalls = 0;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                createCollectionCalls++;
                return createSpyCollection({name});
            }
        };
        KB_ChromaManager.getKnowledgeBaseCollection = async () => live;

        writeFixtureJsonl(fixturePath, 10);

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true, staleStrategy: 'shadow-swap'});

        expect(result.code).toBe('KB_SYNC_VOLUME_EXCEEDED');
        expect(result.chunksToProcess).toBe(10);
        expect(createCollectionCalls).toBe(0);
        expect(live.calls.upsert).toBe(0);
    });

    test('above-threshold MCP invocation returns KB_SYNC_VOLUME_EXCEEDED — adapter converts to isError', async () => {
        // 10 new chunks, threshold 5 — gate fires.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 10);

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        // Service-level shape (the {error, code, ...} payload).
        expect(result.code).toBe('KB_SYNC_VOLUME_EXCEEDED');
        expect(result.chunksToProcess).toBe(10);
        expect(result.threshold).toBe(5);
        expect(result.message).toContain('npm run ai:sync-kb');
        expect(spy.calls.upsert).toBe(0); // no embedding work attempted under the gate

        // Rendered tail-progress guidance must use the provider-owned logPath
        // leaf with no `undefined` interpolation.
        expect(result.message).toContain('tail -f');
        expect(result.message).toContain('kb-server-');
        expect(result.message).toContain(KB_Config.data.logPath);
        expect(result.message).not.toContain('undefined');

        // Wire-format boundary (RA2 per @neo-gpt cycle 1): the KB Server's adapter at
        // Server.mjs:202 — `isError = 'error' in result` — is the contract that converts
        // this service-level shape into the MCP-protocol `isError: true` the caller observes.
        // Inline the same expression here so this test asserts the observable wire-format
        // result, not just the service return shape. (We don't dispatch through callTool
        // because SDK init runs makeSafe, which Zod-strips closure-injected `viaMcp: true`
        // before it reaches the gate — a test-env artifact, not a production path.)
        const isError = Neo.isObject(result) && 'error' in result;
        expect(isError).toBe(true);
    });

    test('above-threshold CLI invocation bypasses the gate (explicit opt-in to long work)', async () => {
        // Same volume as the above-threshold test, but viaMcp: false (or omitted).
        // CLI callers (npm run ai:sync-kb) opt into long-running work.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 10);

        const result = await KB_VectorService.embed(fixturePath); // viaMcp omitted → false

        // Bypass succeeds: embedding completes; no error-shape returned.
        expect('error' in result).toBe(false);
        expect(result.message).toContain('Embedding complete');
        expect(spy.calls.upsert).toBeGreaterThan(0); // embedding actually happened
    });

});
