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

import {test, expect}                                from '@playwright/test';
import Neo                                           from '../../../../../../src/Neo.mjs';
import RequestContextService                         from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {appendWalEmbedMarker, readPendingWalRecords} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {drainMemoryWal}                              from './util.mjs';

/**
 * add_memory never-fail write path (write-ahead decouple) — falsifier coverage:
 *
 *   AC1 validation gate — empty/whitespace fields are rejected BEFORE any write.
 *   AC2 never-fail      — the write path never touches the content store at all (the embed
 *                         daemon owns the drain), so a down OR hung store can neither fail nor
 *                         stall the tool; the payload is durable in the WAL (pending) either way.
 *   AC3 recency         — graph projection is derived/fail-soft: a just-written turn is immediately
 *                         visible to query_recent_turns through the WAL pending-overlay even when
 *                         graph projection has not caught up, and that overlay serves content for
 *                         BOTH detail levels.
 *   Graph backstop      — graph-pending WAL records have a hosted re-drive path after process
 *                         restart or exhausted in-process retries; embed reconciliation alone does
 *                         not hide graph-pending work.
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

    test('AC3: graph projection failure cannot fail the save and recency uses the pending WAL overlay', async () => {
        const originalUpsertNode   = GraphService.upsertNode;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        GraphService.upsertNode       = () => { throw new Error('graph down (spec)'); };
        MemoryService.buildMiniSummary = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'graph-down prompt', thought: 'graph-down thought', response: 'graph-down response'
            }));

            expect(result.code).toBeUndefined();
            expect(result.error).toBeUndefined();
            expect(result.id).toBeTruthy();
            expect(result.message).toBe('Memory successfully added');

            // Let the scheduled projection attempt run and fail under the stub. The failure must
            // stay logged/fail-soft, not turn into a rejected add_memory result or unhandled throw.
            await new Promise(resolve => setImmediate(resolve));

            const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
            expect(pending).toHaveLength(1);

            const recent = await asTenant(() => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, detail: 'full', projection: 'private'}));

            expect(recent.count).toBe(1);
            expect(recent.turns[0].id).toBe(result.id);
            expect(recent.turns[0].projectionPending).toBe(true);
            expect(recent.turns[0].prompt).toBe('graph-down prompt');
            expect(recent.turns[0].response).toBe('graph-down response');
            expect(recent.turns[0].thought).toBe('graph-down thought');
        } finally {
            GraphService.upsertNode        = originalUpsertNode;
            MemoryService.buildMiniSummary = originalBuildSummary;
        }
    });

    test('graph-pending WAL records are re-driven by the hosted graph projection drain', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'graph-drain prompt', thought: 'graph-drain thought', response: 'graph-drain response'
            }));

            expect(result.id).toBeTruthy();

            const graphPendingBefore = await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            });
            expect(graphPendingBefore).toHaveLength(1);

            const embedSummary = await drainMemoryWal({ids: [result.id]});
            expect(embedSummary.embedded).toBe(1);
            expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]}))).toHaveLength(0);

            // Embed reconciliation is deliberately separate from graph reconciliation: an
            // embedded-but-unprojected record must stay visible to the graph drain.
            expect((await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            }))).toHaveLength(1);

            const graphSummary = await MemoryService.drainPendingGraphProjections({ids: [result.id]});

            expect(graphSummary).toEqual({pending: 1, projected: 1, failed: 0});
            expect((await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            }))).toHaveLength(0);

            const recent = await asTenant(() => MemoryService.queryRecentTurns({
                agentIdentity: '@me',
                limit        : 20,
                detail       : 'full',
                projection   : 'private'
            }));
            const turn = recent.turns.find(item => item.id === result.id);

            expect(turn).toBeTruthy();
            expect(turn.projectionPending).toBe(false);
            expect(turn.prompt).toBe('graph-drain prompt');
            expect(turn.response).toBe('graph-drain response');
            expect(turn.thought).toBe('graph-drain thought');
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('the AUTHORED_BY provenance edge persists a normalized user_id (#13578)', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;
        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'authored-by prompt', thought: 'authored-by thought', response: 'authored-by response'
            }));
            await MemoryService.drainPendingGraphProjections({ids: [result.id]});

            // The AUTHORED_BY provenance edge for THIS write (source === result.id, not an earlier serial
            // edge): target stays the @-form author identity, but the user_id column is the normalized form.
            const authoredBy = GraphService.db.edges.items.find(e => e.type === 'AUTHORED_BY' && e.source === result.id);
            expect(authoredBy).toBeTruthy();
            expect(authoredBy.target).toBe('@agent-wal');
            expect(authoredBy.properties.userId).toBe('agent-wal');
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('RA1: the newest graph-pending turn stays recency-visible when the segment exceeds the page size', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        // Leave every write graph-pending (never projected), and silence summarization noise.
        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const writes = [];

            // Write more turns than the recency page size below, all graph-pending in the same
            // UTC-day segment. A 2ms gap gives each a strictly-increasing timestamp so "newest" is
            // unambiguous under the (timestamp, id) ordering.
            for (let i = 0; i < 5; i++) {
                writes.push(await asTenant(() => MemoryService.addMemory({
                    prompt: `ra1 prompt ${i}`, thought: `ra1 thought ${i}`, response: `ra1 response ${i}`
                })));
                await new Promise(resolve => setTimeout(resolve, 2));
            }

            const newest = writes[writes.length - 1];

            // Page size 3 < 5 pending. A raw read-limit would walk the append-ordered segment and
            // return the OLDEST 3, dropping the newest just-written turn; the recency-eligible bound
            // (sort + slice in queryRecentTurns) must keep it visible and first.
            const recent = await asTenant(() => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 3}));

            expect(recent.turns.map(turn => turn.id)).toContain(newest.id);
            expect(recent.turns[0].id).toBe(newest.id);
            expect(recent.turns[0].projectionPending).toBe(true);
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('AC3: with the embed down, a just-written turn is immediately recency-visible and the WAL overlay serves BOTH detail levels', async () => {
        collectionMode = 'throw';

        const {write, summaryResult, fullResult} = await asTenant(async () => {
            const write = await MemoryService.addMemory({
                prompt: 'overlay prompt', thought: 'overlay thought', response: 'overlay response'
            });
            return {
                write,
                summaryResult: await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 20}),
                fullResult   : await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 20, detail: 'full', projection: 'private'})
            };
        });

        // The row is immediately visible even if graph projection has not caught up yet.
        expect(summaryResult.count).toBeGreaterThan(0);
        // No Chroma content exists yet — the summary fallback comes from the WAL pending-overlay.
        const summaryTurn = summaryResult.turns.find(turn => turn.id === write.id);
        expect(summaryTurn).toBeTruthy();
        expect(summaryTurn.summary).toContain('overlay prompt');
        expect(summaryTurn.summaryFallback).toBe(true);

        // detail:'full' hydration equally falls back to the WAL payload.
        const fullTurn = fullResult.turns.find(turn => turn.id === write.id);
        expect(fullTurn).toBeTruthy();
        expect(fullTurn.prompt).toBe('overlay prompt');
        expect(fullTurn.response).toBe('overlay response');
        expect(fullTurn.thought).toBe('overlay thought');

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
