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

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../src/core/_export.mjs';
import fs                from 'fs';
import path              from 'path';
import os                from 'os';
import {fileURLToPath}   from 'url';
import {readResumeState} from '../../../../../../ai/services/knowledge-base/helpers/kbEmbeddingResumeStore.mjs';

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

/**
 * Evaluates the `$and`-of-`$eq` filter shape `VectorService.buildOwnedScopeFilter` emits.
 *
 * Only honored by spies created with `honorWhere: true`. That is opt-in rather than default
 * deliberately: the 20-odd existing spies here seed bare ids and assert add/delete volumes, not
 * corpus scoping, so filtering their reads would silently change what every one of those
 * expectations means. Two weaker designs were tried and rejected — a hardcoded default stamp
 * (passed alone, failed in-file: siblings mutate the shared config singleton, so the default
 * stamp is not constant across a run) and reading the stamp from the service per call (a sibling
 * leaves config in a state where `resolveTenantStamp` throws). An opt-in flag with explicit
 * per-row metadata depends on neither.
 *
 * Chroma rejects a multi-key `where` ("Expected 'where' to have exactly one operator, but got
 * 2"), so honoring only this shape matches the store rather than being permissive beyond it.
 *
 * @param {Object} metadata Row metadata.
 * @param {Object} [where] Chroma filter.
 * @returns {Boolean} True when the row satisfies the filter.
 */
function matchesWhere(metadata = {}, where) {
    if (!where) {
        return true;
    }

    if (Array.isArray(where.$and)) {
        return where.$and.every(clause => matchesWhere(metadata, clause));
    }

    return Object.entries(where).every(([field, condition]) => {
        const expected = condition && typeof condition === 'object' && '$eq' in condition
            ? condition.$eq
            : condition;

        return metadata[field] === expected;
    });
}

function createSpyCollection({existingIds = [], name = 'spy-knowledge-base', honorWhere = false, stamp = {}, rowStamps = {}} = {}) {
    const rows = new Map();

    existingIds.forEach(id => rows.set(id, {id, metadata: {...stamp, ...(rowStamps[id] || {})}, document: ''}));

    const calls = {get: 0, upsert: 0, delete: 0, count: 0, modify: []};

    const collection = {
        rows,
        calls,
        name,

        async get({ids, where, limit = 2000, offset = 0, include = []} = {}) {
            calls.get++;
            const all = Array.from(rows.entries())
                .filter(([, row]) => !honorWhere || matchesWhere(row.metadata, where))
                .map(([id]) => id);
            const slice = all.slice(offset, offset + limit);
            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(id => rows.get(id).metadata) : [],
                documents: include.includes('documents') ? slice.map(() => '') : []
            };
        },

        async upsert({ids, embeddings, metadatas}) {
            calls.upsert++;
            ids.forEach((id, i) => rows.set(id, {
                id,
                metadata : metadatas?.[i] ?? {},
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
    let SDK, KB_VectorService, KB_ChromaManager, KB_Config, Memory_Config;
    let TextEmbeddingService_orig;
    let originalGetCollection;
    let originalClient;
    let originalThreshold;
    let originalEmbeddingLimits;
    let originalEmbeddingProvider;
    let originalResumeStateDir;
    let tmpDir, fixturePath;

    let TextEmbeddingService;

    test.beforeAll(async () => {
        SDK              = await import('../../../../../../ai/services.mjs');
        KB_ChromaManager = SDK.KB_ChromaManager;
        KB_Config        = SDK.KB_Config;
        Memory_Config    = SDK.Memory_Config;
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
        originalEmbeddingLimits = {
            contextLimitTokens       : Number(KB_Config.data.localModels.embedding.contextLimitTokens),
            safeProcessingLimitTokens: Number(KB_Config.data.localModels.embedding.safeProcessingLimitTokens)
        };
        originalEmbeddingProvider = Memory_Config.data.embeddingProvider;
        originalResumeStateDir     = KB_VectorService.resumeStateDir;

        tmpDir      = path.resolve(os.tmpdir(), `kb-work-volume-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        fixturePath = path.join(tmpDir, 'fixture.jsonl');
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_ChromaManager.client                     = originalClient;
        KB_Config.data.mcpSyncMaxChunks             = originalThreshold;
        KB_Config.data.localModels.embedding.contextLimitTokens        = originalEmbeddingLimits.contextLimitTokens;
        KB_Config.data.localModels.embedding.safeProcessingLimitTokens = originalEmbeddingLimits.safeProcessingLimitTokens;
        Memory_Config.data.embeddingProvider        = originalEmbeddingProvider;
        KB_VectorService.resumeStateDir              = originalResumeStateDir;
        TextEmbeddingService.embedTexts             = TextEmbeddingService_orig;
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        KB_Config.data.mcpSyncMaxChunks = 5; // tight threshold for predictable branching
        KB_Config.data.localModels.embedding.contextLimitTokens        = originalEmbeddingLimits.contextLimitTokens;
        KB_Config.data.localModels.embedding.safeProcessingLimitTokens = originalEmbeddingLimits.safeProcessingLimitTokens;
        Memory_Config.data.embeddingProvider = originalEmbeddingProvider;
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));
        KB_ChromaManager.client         = originalClient;
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        // Isolate the shadow-swap resume-state marker per test (never touch the real .neo-ai-data tree).
        KB_VectorService.resumeStateDir = path.join(tmpDir, 'kb-resume-state');
        fs.rmSync(KB_VectorService.resumeStateDir, {recursive: true, force: true});
    });

    test('resume-state storage uses the explicit seam or the resolved KB config leaf', () => {
        expect(KB_VectorService.getResumeStateDir()).toBe(path.join(tmpDir, 'kb-resume-state'));

        KB_VectorService.resumeStateDir = null;
        expect(KB_VectorService.getResumeStateDir()).toBe(KB_Config.embeddingResumeStateDir);

        KB_VectorService.resumeStateDir = '';
        expect(() => KB_VectorService.getResumeStateDir())
            .toThrow(/aiConfig\.embeddingResumeStateDir is required/)
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

    test('#17017 unchanged poison is skipped across sweeps while changed content and replay re-enter', async () => {
        const originalBatch = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };
        const spy           = createSpyCollection({existingIds: []});
        let   providerCalls = 0;

        Object.assign(KB_Config.data, {batchSize: 1, batchDelay: 0, maxRetries: 1});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        TextEmbeddingService.embedTexts = async texts => {
            providerCalls++;

            if (texts.some(text => text.includes('method0'))) {
                throw new Error('private provider detail')
            }

            return texts.map(() => new Array(384).fill(0))
        };

        try {
            writeFixtureJsonl(fixturePath, 3);

            const first         = await KB_VectorService.embed(fixturePath);
            const firstPoisonId = first.poisonedChunks[0].chunkId;

            expect(first.embedded).toBe(2);
            expect(first.poisonedChunks).toHaveLength(1);
            expect(providerCalls).toBe(4);
            expect(JSON.stringify(first.poisonedChunks)).not.toContain('private provider detail');

            const beforeSecondSweep = providerCalls;
            const second            = await KB_VectorService.embed(fixturePath);

            expect(providerCalls, 'unchanged poison is never re-offered').toBe(beforeSecondSweep);
            expect(second.embedded).toBe(0);
            expect(second.poisonedChunks).toEqual(first.poisonedChunks);
            expect(second.message).toContain('proven poison');

            const rows = fs.readFileSync(fixturePath, 'utf8').split('\n').map(line => JSON.parse(line));
            rows[0].hash = 'changed-poison-content-id';
            fs.writeFileSync(fixturePath, rows.map(row => JSON.stringify(row)).join('\n'), 'utf8');

            const beforeChangedContent = providerCalls;
            const changed              = await KB_VectorService.embed(fixturePath);

            expect(providerCalls - beforeChangedContent, 'changed content re-enters A-B-A proof').toBe(3);
            expect(changed.poisonedChunks).toHaveLength(1);
            expect(changed.poisonedChunks[0].chunkId).not.toBe(firstPoisonId);

            const beforeReplay = providerCalls;
            const replayed     = await KB_VectorService.embed(fixturePath, {replayEmbeddingPoison: true});

            expect(providerCalls - beforeReplay, 'explicit replay clears and re-offers the current poison').toBe(3);
            expect(replayed.poisonedChunks).toHaveLength(1);
        } finally {
            Object.assign(KB_Config.data, originalBatch)
        }
    });

    test('splits over-budget full-sync chunks before provider invocation while embedding the safe remainder', async () => {
        const originalResolveEmbeddingGuardrail = KB_VectorService.resolveEmbeddingGuardrail.bind(KB_VectorService);

        KB_VectorService.resolveEmbeddingGuardrail = () => ({
            enabled                  : true,
            contextLimitTokens       : 100,
            safeProcessingLimitTokens: 80,
            model                    : 'unit-test-embedding-model'
        });

        try {
            const embeddedTexts = [];
            TextEmbeddingService.embedTexts = async texts => {
                embeddedTexts.push(...texts);
                return texts.map(() => new Array(384).fill(0));
            };

            const spy = createSpyCollection({existingIds: []});
            KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

            fs.writeFileSync(fixturePath, [
                JSON.stringify({
                    hash       : 'small-chunk',
                    type       : 'method',
                    name       : 'small',
                    className  : '',
                    description: 'small body',
                    content    : 'small body'
                }),
                JSON.stringify({
                    hash       : 'large-chunk',
                    type       : 'ticket',
                    kind       : 'ticket',
                    name       : 'issue-12065',
                    className  : '',
                    description: Array.from({length: 12}, (_, index) => `section-${index} ${'x'.repeat(24)}`).join('\n'),
                    content    : Array.from({length: 12}, (_, index) => `section-${index} ${'x'.repeat(24)}`).join('\n'),
                    source     : 'resources/content/issues/chunk-2/issue-12065.md'
                })
            ].join('\n'), 'utf8');

            const result = await KB_VectorService.embed(fixturePath);

            expect(result.embedded).toBeGreaterThan(1);
            expect('skipped' in result).toBe(false);
            expect(result.message).toContain('Embedding complete');
            expect(spy.calls.upsert).toBe(1);
            expect(spy.rows.size).toBe(result.embedded);
            expect(embeddedTexts).toHaveLength(result.embedded);
            expect(embeddedTexts[0]).toContain('small body');

            const splitRows = Array.from(spy.rows.values())
                .filter(row => row.metadata.source === 'resources/content/issues/chunk-2/issue-12065.md');

            expect(splitRows.length).toBeGreaterThan(1);
            expect(splitRows.every(row => row.metadata.oversizedSplit === true)).toBe(true);
            expect(splitRows.map(row => row.metadata.oversizedSplitIndex)).toEqual(splitRows.map((_, index) => index));
            expect(new Set(splitRows.map(row => row.id)).size).toBe(splitRows.length);

            const upsertCountAfterFirstRun = spy.calls.upsert;
            const secondResult             = await KB_VectorService.embed(fixturePath);

            expect(secondResult.embedded).toBe(0);
            expect(secondResult.message).toContain('No changes detected');
            expect(spy.calls.upsert).toBe(upsertCountAfterFirstRun);
        } finally {
            KB_VectorService.resolveEmbeddingGuardrail = originalResolveEmbeddingGuardrail;
        }
    });

    test('#17013 splits a production-sized single line in linear time without breaking Unicode', () => {
        const
            ascii              = 'x'.repeat(100_000),
            astral             = '🧠'.repeat(2_500),
            source             = ascii + astral,
            maxBytes           = 100_000,
            originalByteLength = Buffer.byteLength;

        let durationMs,
            parts,
            scannedChars = 0;

        Buffer.byteLength = (value, encoding) => {
            scannedChars += String(value).length;
            return originalByteLength(value, encoding)
        };

        try {
            const startedAt = performance.now();

            parts      = KB_VectorService.splitLongStringByByteBudget(source, maxBytes);
            durationMs = performance.now() - startedAt
        } finally {
            Buffer.byteLength = originalByteLength
        }

        expect(durationMs).toBeLessThan(1_000);
        expect(scannedChars).toBe(source.length);
        expect(parts.length).toBeGreaterThan(1);
        expect(parts.join('')).toBe(source);
        expect(parts.every(part => part.length > 0)).toBe(true);
        expect(parts.every(part => Buffer.byteLength(part, 'utf8') <= maxBytes)).toBe(true);
        expect(parts.every(part => !/[\uD800-\uDBFF]$/u.test(part) && !/^[\uDC00-\uDFFF]/u.test(part))).toBe(true);
    });

    test('#17013 packs many short lines without rescanning the growing output prefix', () => {
        const
            source             = Array.from({length: 12_000}, (_, index) => `${index.toString().padStart(5, '0')}:${'y'.repeat(24)}\n`).join(''),
            maxBytes           = 100_000,
            originalByteLength = Buffer.byteLength;

        let durationMs,
            parts,
            scannedChars = 0;

        Buffer.byteLength = (value, encoding) => {
            scannedChars += String(value).length;
            return originalByteLength(value, encoding)
        };

        try {
            const startedAt = performance.now();

            parts      = KB_VectorService.splitTextByByteBudget(source, maxBytes);
            durationMs = performance.now() - startedAt
        } finally {
            Buffer.byteLength = originalByteLength
        }

        expect(durationMs).toBeLessThan(1_000);
        expect(scannedChars).toBe(source.length * 2);
        expect(parts.length).toBeGreaterThan(1);
        expect(parts.join('')).toBe(source);
        expect(parts.every(part => part.length > 0)).toBe(true);
        expect(parts.every(part => Buffer.byteLength(part, 'utf8') <= maxBytes)).toBe(true);
    });

    test('applies the band on a non-local provider too — over-band input is refused before the provider', async () => {
        // Pre-fix this test pinned the fail-open: gemini was outside a hand-maintained local
        // set, so the guard skipped the measurement and the provider was called with an
        // over-band input. The guard now measures every provider.
        Memory_Config.data.embeddingProvider                            = 'gemini';
        KB_Config.data.localModels.embedding.contextLimitTokens        = 50;
        KB_Config.data.localModels.embedding.safeProcessingLimitTokens = 1;

        const explicitProviders = [];
        TextEmbeddingService.embedTexts = async (texts, explicitProvider) => {
            explicitProviders.push(explicitProvider);
            return texts.map(() => new Array(384).fill(0));
        };

        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        fs.writeFileSync(fixturePath, JSON.stringify({
            hash       : 'remote-provider-large-chunk',
            type       : 'method',
            name       : 'x'.repeat(300),
            className  : '',
            description: '',
            content    : ''
        }), 'utf8');

        const result = await KB_VectorService.embed(fixturePath);

        expect(result.embedded).toBe(0);
        expect(explicitProviders).toEqual([]); // the provider was never called
        expect(spy.calls.upsert).toBe(0);
    });

    test('a non-local provider embeds an under-band document — measured, not exempt', async () => {
        Memory_Config.data.embeddingProvider                            = 'gemini';
        KB_Config.data.localModels.embedding.contextLimitTokens        = 50_000;
        KB_Config.data.localModels.embedding.safeProcessingLimitTokens = 40_000;

        const explicitProviders = [];
        TextEmbeddingService.embedTexts = async (texts, explicitProvider) => {
            explicitProviders.push(explicitProvider);
            return texts.map(() => new Array(384).fill(0));
        };

        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        fs.writeFileSync(fixturePath, JSON.stringify({
            hash       : 'remote-provider-small-chunk',
            type       : 'method',
            name       : 'remote-small',
            className  : '',
            description: 'x'.repeat(300),
            content    : 'x'.repeat(300)
        }), 'utf8');

        const result = await KB_VectorService.embed(fixturePath);

        expect(result.embedded).toBe(1);
        expect(explicitProviders).toEqual(['gemini']);
        expect(spy.calls.upsert).toBe(1);
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

    test('shadow-swap refuses promotion when an over-budget chunk would make the rebuilt corpus incomplete', async () => {
        KB_Config.data.localModels.embedding.contextLimitTokens        = 50;
        KB_Config.data.localModels.embedding.safeProcessingLimitTokens = 40;

        const live = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        let shadow;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                shadow = createSpyCollection({name});
                return shadow;
            }
        };
        KB_ChromaManager.getKnowledgeBaseCollection = async () => live;

        fs.writeFileSync(fixturePath, [
            JSON.stringify({
                hash       : 'small-chunk',
                type       : 'method',
                name       : 'small',
                className  : '',
                description: 'small body',
                content    : 'small body'
            }),
            JSON.stringify({
                hash       : 'large-chunk',
                type       : 'method',
                name       : 'x'.repeat(300),
                className  : '',
                description: '',
                content    : ''
            })
        ].join('\n'), 'utf8');

        await expect(KB_VectorService.embed(fixturePath, {staleStrategy: 'shadow-swap'}))
            .rejects.toThrow(/KB_EMBEDDING_INPUT_SIZE_EXCEEDED/);

        expect(live.calls.modify).toEqual([]);
        expect(shadow.calls.modify).toHaveLength(1);
        expect(shadow.calls.modify[0].name).toContain(`${KB_Config.data.collectionName}-failed-shadow-`);
        expect(shadow.rows.size).toBe(1);
    });

    test('shadow-swap failure invalidates cached canonical handles after local rename mutation', async () => {
        const live                    = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
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
            knowledgeBase : [{
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

    test('shadow-swap PRESERVES the shadow on a transient failure for resume (records resume-state)', async () => {
        const live                = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
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
                liveCollection  : live,
                knowledgeBase   : [{id: 'chunk-0', type: 'method', name: 'method0'}],
                idsToDeleteCount: 0
            })).rejects.toThrow('forced embed failure');

            // A transient embed failure PRESERVES the shadow (NOT renamed to a dead failed-shadow) and records
            // a resume-state marker, so the next run resumes from the completed batches instead of rebuilding.
            expect(live.calls.modify).toEqual([]);
            expect(shadow.calls.modify).toEqual([]);

            const resumeState = await readResumeState({dir: KB_VectorService.resumeStateDir});
            expect(resumeState?.shadowName).toBe(shadow.name);
            expect(resumeState?.attempts).toBe(1);
        } finally {
            KB_VectorService.embedChunks = originalEmbedChunks;
        }
    });

    test('shadow-swap PRESERVES the shadow on a cooperative lease YIELD — no promote, marker intact', async () => {
        const live                = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        const originalEmbedChunks = KB_VectorService.embedChunks.bind(KB_VectorService);
        let shadow;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                shadow = createSpyCollection({name});
                return shadow;
            }
        };
        // Simulate embedChunks yielding mid-corpus — the embedChunks-level yield mechanism (between-batch,
        // forward-progress) is covered in VectorService.leaseYield.spec.mjs; here we assert embedViaShadowSwap's
        // yield HANDLING reuses the same preserve-not-promote path as a transient failure.
        KB_VectorService.embedChunks = async () => ({embedded: 1, skipped: 0, yielded: true});

        try {
            const result = await KB_VectorService.embedViaShadowSwap({
                liveCollection  : live,
                knowledgeBase   : [{id: 'chunk-0', type: 'method', name: 'method0'}],
                idsToDeleteCount: 0,
                shouldYield     : () => true
            });

            // On yield: a {yielded:true} envelope (the lease holder releases on it), the shadow is preserved-
            // not-promoted (NEITHER collection renamed), and the write-ahead resume marker is NOT cleared — so
            // the next sweep re-acquires and resumes from the completed batches instead of rebuilding.
            expect(result.yielded).toBe(true);
            expect(live.calls.modify).toEqual([]);
            expect(shadow.calls.modify).toEqual([]);

            const resumeState = await readResumeState({dir: KB_VectorService.resumeStateDir});
            expect(resumeState?.shadowName).toBe(shadow.name);
        } finally {
            KB_VectorService.embedChunks = originalEmbedChunks;
        }
    });

    test('fresh-build records the resume marker BEFORE creating the shadow (write-ahead — no orphan on a double failure)', async () => {
        const live                = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        const originalEmbedChunks = KB_VectorService.embedChunks.bind(KB_VectorService);
        let shadow;
        let markerShadowAtCreate = null;

        KB_ChromaManager.client = {
            createCollection: async ({name}) => {
                // The write-ahead marker must already be on disk when the shadow is created, so a shadow can
                // never exist without a marker indexing it. Without write-ahead, a transient embed failure
                // whose catch-path marker-write ALSO fails would strand the shadow with no marker, and the
                // next fresh-build's discardResumeShadow(resumeState?.shadowName) would no-op — orphaning it.
                const stateAtCreate = await readResumeState({dir: KB_VectorService.resumeStateDir});
                markerShadowAtCreate = stateAtCreate?.shadowName ?? null;
                shadow = createSpyCollection({name});
                return shadow;
            }
        };
        KB_VectorService.embedChunks = async () => {
            throw new Error('forced embed failure');
        };

        try {
            await expect(KB_VectorService.embedViaShadowSwap({
                liveCollection  : live,
                knowledgeBase   : [{id: 'chunk-0', type: 'method', name: 'method0'}],
                idsToDeleteCount: 0
            })).rejects.toThrow('forced embed failure');

            // Write-ahead: the marker indexed THIS shadow at creation time, not only in the failure catch.
            expect(markerShadowAtCreate).toBe(shadow.name);

            // And it persists through the failure for the next run to resume into / reclaim.
            const resumeState = await readResumeState({dir: KB_VectorService.resumeStateDir});
            expect(resumeState?.shadowName).toBe(shadow.name);
        } finally {
            KB_VectorService.embedChunks = originalEmbedChunks;
        }
    });

    test('shadow-swap MCP gate measures full-corpus rebuild volume before creating shadow collection', async () => {
        const live                  = createSpyCollection({existingIds: [], name: KB_Config.data.collectionName});
        let   createCollectionCalls = 0;

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

    test('stale-id gathering is scoped: embedding one corpus never deletes another tenant repo (#16584)', async () => {
        // The live specimen this pins: a sync pass over the `neo` corpus deleted a tenant repo's
        // 50 rows, because `existingIds` was gathered across the WHOLE collection, so every row
        // outside the corpus being embedded looked stale. It recurred on every sweep interval,
        // which made kbSync and multi-tenant ingestion mutually exclusive.
        const stamp   = {tenantId: 'neo-shared', repoSlug: 'neo'};
        const foreign = 'tenant-row-create-app';

        const spy = createSpyCollection({
            existingIds: [foreign],
            honorWhere : true,
            rowStamps  : {[foreign]: {tenantId: 'neo-shared', repoSlug: 'create-app'}}
        });
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 2);

        // Default stale handling (delete-bearing) against a corpus that shares the collection.
        const result = await KB_VectorService.embed(fixturePath, {tenantContext: stamp});

        expect('error' in result).toBe(false);

        // The foreign row is untouched. This is the whole point: it is absent from the embedded
        // corpus, so the unscoped implementation classified it stale and removed it.
        expect(spy.rows.has(foreign)).toBe(true);
        expect(result.deleted).toBe(0);

        // Positive control — without it, `deleted: 0` could equally mean the delete path is
        // simply unreachable in this fixture. An OWN orphan under the embedded corpus's stamp
        // must still be deleted, or the fix has over-corrected into deleting nothing at all.
        const ownOrphan = 'own-orphan-row';
        const spy2      = createSpyCollection({
            existingIds: [ownOrphan, foreign],
            honorWhere : true,
            stamp,
            rowStamps  : {[foreign]: {tenantId: 'neo-shared', repoSlug: 'create-app'}}
        });
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy2;

        const scopedResult = await KB_VectorService.embed(fixturePath, {tenantContext: stamp});

        expect(scopedResult.deleted).toBe(1);
        expect(spy2.rows.has(ownOrphan)).toBe(false); // own orphan removed
        expect(spy2.rows.has(foreign)).toBe(true);    // foreign row still safe
    });

    test('the work-volume gate counts deletions, and nothing is deleted above it (#16584)', async () => {
        // Two defects in one branch: `workVolume` counted only ADDS, so a call adding almost
        // nothing while deleting the corpus presented to the gate as tiny; and the no-adds
        // branch deleted and returned BEFORE the gate was evaluated, so the largest possible
        // deletion was the one case no guard ever saw.
        const stamp   = {tenantId: 'neo-shared', repoSlug: 'neo'};
        const orphans = Array.from({length: 12}, (_, i) => `stale-${i}`);

        const spy = createSpyCollection({existingIds: orphans, honorWhere: true, stamp});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        // Zero adds (empty corpus file), 12 deletions, threshold below the deletion count.
        writeFixtureJsonl(fixturePath, 0);
        KB_Config.data.mcpSyncMaxChunks = 5;

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true, tenantContext: stamp});

        // Refused rather than executed.
        expect(result.code).toBe('KB_SYNC_VOLUME_EXCEEDED');
        expect(result.idsToDelete).toBe(12);

        // And crucially: refused BEFORE deleting. A gate that fires after the delete would
        // report the same payload while the rows were already gone.
        expect(spy.calls.delete).toBe(0);
        orphans.forEach(id => expect(spy.rows.has(id)).toBe(true));
    });

    test('a delete-bearing pass with no adds does not report "no changes" (#16584)', async () => {
        // The report used to invert the effect: this branch returned
        // "No changes detected. Knowledge base is up to date." beside a non-zero `deleted`
        // count. A caller reading the message saw a no-op while rows were removed.
        const stamp   = {tenantId: 'neo-shared', repoSlug: 'neo'};
        const orphans = ['stale-a', 'stale-b'];

        const spy = createSpyCollection({existingIds: orphans, honorWhere: true, stamp});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 0);
        KB_Config.data.mcpSyncMaxChunks = 500; // gate must not interfere

        const result = await KB_VectorService.embed(fixturePath, {tenantContext: stamp});

        expect(result.deleted).toBe(2);
        expect(result.message).not.toContain('No changes detected');
        expect(result.message).not.toContain('up to date');
        expect(result.message).toContain('Collection now contains');

        // A GENUINE no-op still reports as one — the message is only wrong when it contradicts
        // the effect, so the honest case must keep its wording.
        const emptySpy = createSpyCollection({existingIds: [], honorWhere: true, stamp});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => emptySpy;

        const noop = await KB_VectorService.embed(fixturePath, {tenantContext: stamp});

        expect(noop.deleted).toBe(0);
        expect(noop.message).toContain('No changes detected');
    });

});
