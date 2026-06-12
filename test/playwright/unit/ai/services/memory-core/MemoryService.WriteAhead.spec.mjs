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
import {appendWalEmbedMarker, readPendingWalRecords} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {drainMemoryWal}      from './util.mjs';

/**
 * add_memory never-fail write path (write-ahead decouple) — falsifier coverage:
 *
 *   AC1 validation gate — empty/whitespace fields are rejected BEFORE any write.
 *   AC2 never-fail      — the write path never touches the content store at all (the embed
 *                         daemon owns the drain), so a down OR hung store can neither fail nor
 *                         stall the tool; the payload is durable in the WAL (pending) either way.
 *   AC3 recency         — the AGENT_MEMORY graph row stays synchronous: a just-written turn is
 *                         immediately visible to query_recent_turns even with the embed down,
 *                         and the WAL pending-overlay serves its content for BOTH detail levels.
 *   Drain reconcile     — the daemon drain path (`drainWalOnce` via the `drainMemoryWal` spec
 *                         helper) embeds pending records and marks them reconciled, and never
 *                         re-embeds a purge-tombstoned record.
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
        originalGetMemoryCollection, originalEmbedText, memStore, collectionMode, collectionTouches, testWalDir;

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
        // `collectionTouches` counts resolution attempts: AC2's strongest form is that the write
        // path performs ZERO of them (the embed daemon is the only collection consumer).
        memStore                    = new Map();
        collectionMode              = 'ok';
        collectionTouches           = 0;
        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => {
            collectionTouches++;
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

    test('AC2: a DOWN content store cannot fail the save — the write path never touches it', async () => {
        collectionMode = 'throw';
        const touchesBefore = collectionTouches;

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'embed-down prompt', thought: 'embed-down thought', response: 'embed-down response'
        }));

        expect(result.code).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.id).toBeTruthy();
        expect(result.message).toBe('Memory successfully added');

        // Strongest form of never-fail: addMemory performed ZERO collection resolutions —
        // the embed daemon is the only consumer of the content store on the memory write side.
        expect(collectionTouches).toBe(touchesBefore);

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);
        expect(pending[0].metadata.prompt).toBe('embed-down prompt');

        collectionMode = 'ok';
    });

    test('AC2: a HUNG content store cannot stall the save — nothing on the write path awaits it', async () => {
        collectionMode = 'hang';
        const touchesBefore = collectionTouches;

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'hang prompt', thought: 'hang thought', response: 'hang response'
        }));
        // Reaching these assertions at all proves nothing on the write path awaited the hung
        // collection promise — and the touch counter proves it was never even resolved.
        expect(result.id).toBeTruthy();
        expect(result.error).toBeUndefined();
        expect(collectionTouches).toBe(touchesBefore);

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

    test('purge tombstone: a record tombstoned before the drain is never re-embedded', async () => {
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'purge-race prompt', thought: 'purge-race thought', response: 'purge-race response'
        }));
        expect(result.id).toBeTruthy();

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);

        // Purge tombstone lands BEFORE any drain runs (mirrors SessionService.purgeSession's
        // tombstone-before-delete ordering): the marker reconciles the record, so the daemon's
        // pending read never surfaces it again.
        await appendWalEmbedMarker({id: result.id, segmentKey: pending[0].segmentKey}, {dir: testWalDir});

        const summary = await drainMemoryWal({ids: [result.id]});

        expect(summary.pending).toBe(0);              // the tombstoned record is not pending work
        expect(memStore.has(result.id)).toBe(false);  // nothing resurrected into the content store
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(0); // reconciled
    });

    test('the daemon drain reconciles a pending record (embedded + marker written)', async () => {
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'happy prompt', thought: 'happy thought', response: 'happy response'
        }));

        expect(result.id).toBeTruthy();

        // New write-path contract: addMemory leaves the record PENDING — only the daemon drains.
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(1);

        // One targeted production drain cycle (the exact daemon logic) — deterministic, no polling.
        const summary = await drainMemoryWal({ids: [result.id]});

        expect(summary.embedded).toBe(1);
        expect(memStore.has(result.id)).toBe(true);
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(0);
    });
});
