import {setup} from '../../../../setup.mjs';

const appName = 'MemoryWriteAheadTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {readPendingWalRecords} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';

/**
 * add_memory never-fail write path (write-ahead decouple, Phase 1) — falsifier coverage:
 *
 *   AC1 validation gate — empty/whitespace fields are rejected BEFORE any write.
 *   AC2 never-fail      — a throwing or HANGING embed no longer fails or stalls the tool;
 *                         the payload is durable in the WAL (pending) either way.
 *   AC3 recency         — the AGENT_MEMORY graph row stays synchronous: a just-written turn is
 *                         immediately visible to query_recent_turns even with the embed down,
 *                         and the WAL pending-overlay serves its content for BOTH detail levels.
 *   Marker reconcile    — a successful deferred embed marks the WAL record (no longer pending).
 *
 * Test isolation by construction: UNIT_TEST_MODE resolves memoryWal.dir → a per-worker-unique
 * temp directory and the graph → ':memory:'; the shared AiConfig singleton is never mutated
 * (the shared-singleton write ban). The spec reads the RESOLVED `memoryWal.dir` leaf from the same config instance
 * the service reads (assertion-targeting only) — pinning a different dir via env is worker-order
 * dependent, because another spec in the worker may construct the singleton first.
 */
test.describe('Neo.ai.services.memory-core.MemoryService.writeAhead', () => {
    test.describe.configure({mode: 'serial'});

    let MemoryService, GraphService, LifecycleService, TextEmbeddingService, StorageRouter,
        originalGetMemoryCollection, originalEmbedText, memStore, collectionMode, testWalDir;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        testWalDir     = aiConfig.memoryWal.dir;

        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;

        // Controllable content-store fake: 'ok' embeds into an in-memory map, 'throw' fails the
        // embed, 'hang' never resolves — the two failure shapes AC2 pins (error AND stall).
        memStore                    = new Map();
        collectionMode              = 'ok';
        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => {
            if (collectionMode === 'throw') throw new Error('chroma down (spec)');
            if (collectionMode === 'hang')  return new Promise(() => {}); // never settles
            return {
                add: async ({ids = [], metadatas = []} = {}) => { ids.forEach((id, i) => memStore.set(id, metadatas[i] || {})); },
                get: async ({ids = []} = {}) => {
                    const found = ids.filter(id => memStore.has(id));
                    return {ids: found, metadatas: found.map(id => memStore.get(id))};
                }
            };
        };

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        // Offline tests cannot hit a real embedder; restored in afterAll so the stub never leaks
        // into sibling specs sharing the worker.
        originalEmbedText              = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        GraphService.upsertNode({id: '@agent-wal', type: 'AgentIdentity', name: 'AgentWal', properties: {}});
    });

    test.afterAll(async () => {
        if (originalGetMemoryCollection) StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        if (originalEmbedText)           TextEmbeddingService.embedText     = originalEmbedText;
        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();
        // No rm of testWalDir: it is the per-worker config-resolved temp dir, shared with sibling
        // specs in the same worker process; the OS temp root reclaims it.
    });

    const asTenant = fn => RequestContextService.run({userId: 'tenant-wal', agentIdentityNodeId: '@agent-wal'}, fn);

    test('AC1: empty/whitespace fields are rejected before any write', async () => {
        const before = (await readPendingWalRecords({dir: testWalDir})).length;

        const result = await asTenant(() => MemoryService.addMemory({prompt: '', thought: '   ', response: 'real'}));

        expect(result.code).toBe('MEMORY_VALIDATION_ERROR');
        expect(result.message).toContain('prompt');
        expect(result.message).toContain('thought');
        expect(result.message).not.toContain('response');

        // Rejected payloads must not reach the WAL (nor, transitively, the embed path).
        expect((await readPendingWalRecords({dir: testWalDir})).length).toBe(before);
    });

    test('AC2: a THROWING embed no longer fails the save; the payload is durable + pending', async () => {
        collectionMode = 'throw';

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'embed-down prompt', thought: 'embed-down thought', response: 'embed-down response'
        }));

        expect(result.code).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.id).toBeTruthy();
        expect(result.message).toBe('Memory successfully added');

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);
        expect(pending[0].metadata.prompt).toBe('embed-down prompt');

        collectionMode = 'ok';
    });

    test('AC2: a HANGING embed no longer stalls the save', async () => {
        collectionMode = 'hang';

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'hang prompt', thought: 'hang thought', response: 'hang response'
        }));
        // Reaching these assertions at all proves the embed is off the await path — previously
        // this call suspended on the hung collection promise until an outer timeout killed it.
        expect(result.id).toBeTruthy();
        expect(result.error).toBeUndefined();

        collectionMode = 'ok';
    });

    test('AC3: with the embed down, a just-written turn is immediately recency-visible and the WAL overlay serves BOTH detail levels', async () => {
        collectionMode = 'throw';

        const {summaryResult, fullResult} = await asTenant(async () => {
            await MemoryService.addMemory({
                prompt: 'overlay prompt', thought: 'overlay thought', response: 'overlay response'
            });
            return {
                summaryResult: await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1}),
                fullResult   : await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, detail: 'full', projection: 'private'})
            };
        });

        // Graph row synchronous → immediately visible (read-after-write recency preserved).
        expect(summaryResult.count).toBe(1);
        // No Chroma content exists yet — the summary fallback comes from the WAL pending-overlay.
        expect(summaryResult.turns[0].summary).toContain('overlay prompt');
        expect(summaryResult.turns[0].summaryFallback).toBe(true);

        // detail:'full' hydration equally falls back to the WAL payload.
        expect(fullResult.count).toBe(1);
        expect(fullResult.turns[0].prompt).toBe('overlay prompt');
        expect(fullResult.turns[0].response).toBe('overlay response');
        expect(fullResult.turns[0].thought).toBe('overlay thought');

        collectionMode = 'ok';
    });

    test('purge guard: an embed deferred past a session purge is suppressed, never resurrected', async () => {
        collectionMode = 'throw'; // hold the embed back so the purge wins the race deterministically

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'purge-race prompt', thought: 'purge-race thought', response: 'purge-race response'
        }));
        expect(result.id).toBeTruthy();

        // Purge marker lands BEFORE the embed can run (mirrors SessionService.purgeSession).
        MemoryService.markSessionPurged({sessionId: result.sessionId, userId: 'tenant-wal'});

        collectionMode = 'ok';

        // Retry the pending record through the deferred-embed path (what the Phase-2 daemon —
        // or any later inline attempt — would do): the purge guard must skip the Chroma add and
        // reconcile the WAL record instead.
        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);

        const embedded = await MemoryService.embedPendingMemory({
            id        : pending[0].id,
            metadata  : pending[0].metadata,
            document  : pending[0].document,
            segmentKey: pending[0].segmentKey,
            dir       : testWalDir
        });

        expect(embedded).toBe(false);                 // suppressed, not embedded
        expect(memStore.has(result.id)).toBe(false);  // nothing resurrected into the content store
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(0); // reconciled
    });

    test('a successful deferred embed reconciles the WAL record (marker written, no longer pending)', async () => {
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'happy prompt', thought: 'happy thought', response: 'happy response'
        }));

        expect(result.id).toBeTruthy();

        // The embed is fire-and-forget — poll until it lands in the fake store + the marker
        // reconciles the WAL record.
        await expect.poll(async () => memStore.has(result.id), {timeout: 5000}).toBe(true);
        await expect.poll(
            async () => (await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length,
            {timeout: 5000}
        ).toBe(0);
    });
});
