import {setup} from '../../../../setup.mjs';

const appName = 'QueryRecentTurnsTest';

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

/**
 * query_recent_turns recency-recall primitive — falsifier coverage for the graduated design.
 *
 * Test isolation by construction: under UNIT_TEST_MODE the config resolves storagePaths.graph
 * (→ ':memory:') + collections.{memory,session} (→ test-*) to test values — never mutate the
 * shared singleton.
 *
 *   AC6  freshness  — add_memory → immediately query_recent_turns → visible (NO REM cycle).
 *   AC7a isolation  — tenant A writes → tenant B query → A's turns NOT visible (cross-tenant fail-closed).
 *   AC7b no-scope   — no resolvable userId → EMPTY, never a deployment-wide read (the test that
 *                     mechanically prevents the fail-open default — AC7a alone passes even if this path is broken).
 */
test.describe('Neo.ai.services.memory-core.queryRecentTurns', () => {
    test.describe.configure({mode: 'serial'});

    let MemoryService, GraphService, LifecycleService, TextEmbeddingService, StorageRouter, originalGetMemoryCollection, originalEmbedText, memStore;

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;

        // CI unit has no ChromaDB server. The Chroma embed is DEFERRED after the durable WAL append,
        // so a missing Chroma no longer fails addMemory — but the deferred embed and the detail:'full'
        // join still hit the content store. Back it with an in-memory fake so the spec exercises the
        // real addMemory→queryRecentTurns flow without a live Chroma. The recency query reads graph-
        // projected rows plus WAL-pending rows whose graph projection has not caught up yet; content
        // comes from the fake store or, for not-yet-embedded turns, the WAL pending-overlay.
        memStore = new Map();
        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => ({
            add: async ({ids = [], metadatas = []} = {}) => { ids.forEach((id, i) => memStore.set(id, metadatas[i] || {})); },
            get: async ({ids = []} = {}) => {
                const found = ids.filter(id => memStore.has(id));
                return {ids: found, metadatas: found.map(id => memStore.get(id))};
            }
        });

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        // Offline tests cannot hit a real embedder. Save the original first so afterAll can restore
        // it: an unrestored embedText mock leaks a 4096-length vector into sibling specs sharing the
        // worker (e.g. the retry spec asserting a [0.1, 0.2, 0.3] return), reddening their unit run.
        originalEmbedText              = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        // Seed the AgentIdentity nodes the AUTHORED_BY edge + '@me' resolution depend on.
        GraphService.upsertNode({id: '@agent-a', type: 'AgentIdentity', name: 'AgentA', properties: {}});
        GraphService.upsertNode({id: '@agent-b', type: 'AgentIdentity', name: 'AgentB', properties: {}});
    });

    test.afterAll(async () => {
        if (originalGetMemoryCollection) StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        if (originalEmbedText)           TextEmbeddingService.embedText     = originalEmbedText;
        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();
    });

    test('AC6 freshness: a just-written memory is visible immediately, without a REM cycle', async () => {
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            await MemoryService.addMemory({prompt: 'fresh prompt', response: 'fresh response', thought: 'fresh thought'});
            return MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1});
        });

        expect(result.count).toBe(1);
        expect(result.turns[0].sessionId).toBeTruthy();
        // No live summarizer in unit → summary falls back to truncated raw (never content-empty).
        expect(result.turns[0].summary).toBeTruthy();
        expect(result.turns[0].summaryFallback).toBe(true);
        // summary projection does not surface raw prompt/thought directly
        expect(result.turns[0].prompt).toBeUndefined();
        expect(result.turns[0].thought).toBeUndefined();
    });

    test('AC7a isolation: tenant B cannot see tenant A\'s recent turns', async () => {
        await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            await MemoryService.addMemory({prompt: 'A-only prompt', response: 'A-only response', thought: 'A-only thought'});
        });

        const bResult = await RequestContextService.run({userId: 'tenant-b', agentIdentityNodeId: '@agent-b'}, async () =>
            MemoryService.queryRecentTurns({agentIdentity: '@agent-a', limit: 50})
        );

        // Tenant B's userId scope fail-closes — A's tenant-a-tagged rows are invisible even when
        // B explicitly asks for @agent-a's turns.
        expect(bResult.count).toBe(0);
    });

    test('AC7b no-scope fail-closed: no resolvable userId returns EMPTY, not all', async () => {
        // Seed real tenant data so there IS something a fail-open bug could leak.
        await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            await MemoryService.addMemory({prompt: 'tenant data', response: 'r', thought: 't'});
        });

        // Query with NO request context (no resolvable userId) — must be empty, never deployment-wide.
        const result = await MemoryService.queryRecentTurns({agentIdentity: '@agent-a', limit: 50});

        expect(result.count).toBe(0);
        expect(result.turns).toEqual([]);
    });

    test('detail:full joins Chroma content and the public projection excludes thought', async () => {
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            await MemoryService.addMemory({prompt: 'full prompt', response: 'full response', thought: 'secret thought'});
            return MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, detail: 'full', projection: 'public'});
        });

        expect(result.count).toBe(1);
        expect(result.turns[0].prompt).toBe('full prompt');
        expect(result.turns[0].response).toBe('full response');
        // AC5 — public projection must NOT surface the private thought field.
        expect(result.turns[0].thought).toBeUndefined();
    });

    test('AC8 fail-soft: add_memory succeeds and the turn is recallable (raw fallback) when summarization is unavailable', async () => {
        // Unit tests reach no chat-model provider (gemini has no API key) → buildMiniSummary returns
        // null. The write MUST still succeed; the turn MUST still be recallable; and the summary
        // projection falls back to truncated raw (RA3) so the feed is never content-empty.
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            const write = await MemoryService.addMemory({prompt: 'no-summarizer prompt', response: 'r', thought: 't'});
            expect(write.error).toBeUndefined();
            return MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1});
        });

        expect(result.count).toBe(1);
        expect(result.turns[0].summary).toBeTruthy();
        expect(result.turns[0].summaryFallback).toBe(true);
    });

    test('RA1 privacy: own-agent private projection includes thought', async () => {
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            await MemoryService.addMemory({prompt: 'own prompt', response: 'own response', thought: 'own secret'});
            return MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, detail: 'full', projection: 'private'});
        });

        expect(result.count).toBe(1);
        expect(result.turns[0].thought).toBe('own secret');   // own-agent → private grants thought
    });

    test('RA1 privacy: a peer cannot read another agent\'s thought via private (downgraded to public)', async () => {
        // agent-b writes in tenant-a.
        await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-b'}, async () => {
            await MemoryService.addMemory({prompt: 'b prompt', response: 'b response', thought: 'b secret'});
        });
        // agent-a (same tenant) requests agent-b's turns with private → must be forced to public.
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () =>
            MemoryService.queryRecentTurns({agentIdentity: '@agent-b', limit: 1, detail: 'full', projection: 'private'})
        );

        expect(result.count).toBe(1);
        expect(result.turns[0].response).toBe('b response');   // same-tenant content is visible
        expect(result.turns[0].thought).toBeUndefined();        // but thought NEVER crosses to a non-owner
    });

    test('RA2 cursor: (timestamp,id) pagination disambiguates equal timestamps (no dup, no skip)', async () => {
        // Two AGENT_MEMORY nodes, SAME timestamp, distinct ids, under an isolated identity so other
        // tests' memories can't interfere. miniSummary set → summary projection stays graph-only.
        const ts   = '2026-01-01T00:00:00.000Z';
        const seed = id => GraphService.upsertNode({
            id, type: 'AGENT_MEMORY', name: `Memory: ${ts}`, description: 'cursor test', semanticVectorId: id,
            properties: {agentIdentity: '@agent-cursor', userId: 'tenant-cursor', sessionId: 'cur-sess', timestamp: ts, miniSummary: id}
        });
        seed('mem-cursor-2');   // lexically-greater id → first under ORDER BY (timestamp DESC, id DESC)
        seed('mem-cursor-1');

        const ctx   = {userId: 'tenant-cursor', agentIdentityNodeId: '@agent-cursor'};
        const page1 = await RequestContextService.run(ctx, async () => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1}));
        expect(page1.count).toBe(1);
        expect(page1.turns[0].id).toBe('mem-cursor-2');
        expect(page1.nextCursor).toEqual({timestamp: ts, id: 'mem-cursor-2'});

        const page2 = await RequestContextService.run(ctx, async () => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, before: page1.nextCursor}));
        expect(page2.count).toBe(1);
        expect(page2.turns[0].id).toBe('mem-cursor-1');   // the OTHER equal-timestamp turn — no dup, no skip
    });

    test('backfillMiniSummaries summarizes pending rows most-recent-first and preserves tenant metadata', async () => {
        const oldTs = '2099-01-01T00:00:00.000Z';
        const newTs = '2099-01-02T00:00:00.000Z';

        memStore.set('backfill-old', {prompt: 'old prompt', response: 'old response'});
        memStore.set('backfill-new', {prompt: 'new prompt', response: 'new response'});

        GraphService.upsertNode({
            id              : 'backfill-old', type: 'AGENT_MEMORY', name: 'Memory: old', description: 'old',
            semanticVectorId: 'backfill-old',
            properties      : {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'backfill', timestamp: oldTs}
        });
        GraphService.upsertNode({
            id              : 'backfill-new', type: 'AGENT_MEMORY', name: 'Memory: new', description: 'new',
            semanticVectorId: 'backfill-new',
            properties      : {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'backfill', timestamp: newTs}
        });

        const calls = [];
        const result = await MemoryService.backfillMiniSummaries({
            limit           : 1,
            buildMiniSummary: async ({prompt}) => {
                calls.push(prompt);
                return `summary:${prompt}`;
            }
        });
        expect(calls).toEqual(['new prompt']);
        expect(result).toEqual({processed: 1, updated: 1, deferred: 0, missingContent: 0, runBudgetHit: false});

        const row  = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get('backfill-new');
        const data = JSON.parse(row.data);
        expect(data.properties.miniSummary).toBe('summary:new prompt');
        expect(data.properties.userId).toBe('tenant-a');
        expect(data.properties.agentIdentity).toBe('@agent-a');

        const oldRow  = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get('backfill-old');
        const oldData = JSON.parse(oldRow.data);
        expect(oldData.properties.miniSummary).toBeUndefined();
    });

    test('backfillMiniSummaries leaves provider failures retryable without aborting the batch', async () => {
        const ts = '2099-01-03T00:00:00.000Z';

        memStore.set('backfill-failure', {prompt: 'failure prompt', response: 'failure response'});
        GraphService.upsertNode({
            id              : 'backfill-failure', type: 'AGENT_MEMORY', name: 'Memory: failure', description: 'failure',
            semanticVectorId: 'backfill-failure',
            properties      : {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'backfill', timestamp: ts}
        });

        const result = await MemoryService.backfillMiniSummaries({
            limit           : 1,
            buildMiniSummary: async () => {
                throw new Error('provider unavailable');
            }
        });
        expect(result).toEqual({processed: 1, updated: 0, deferred: 1, missingContent: 0, runBudgetHit: false});

        const row  = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get('backfill-failure');
        const data = JSON.parse(row.data);
        expect(data.properties.miniSummary).toBeUndefined();
    });

    test('backfillMiniSummaries bounds a run by maxRunMs and defers the remainder to the next sweep', async () => {
        // Seed 3 pending rows with the highest timestamps so they sort first under the
        // (timestamp DESC, id DESC) scan and are exactly the rows this limited fetch returns.
        const ids = ['budget-row-a', 'budget-row-b', 'budget-row-c'];
        ids.forEach((id, i) => {
            memStore.set(id, {prompt: `p-${id}`, response: `r-${id}`});
            GraphService.upsertNode({
                id, type: 'AGENT_MEMORY', name: `Memory: ${id}`, description: id, semanticVectorId: id,
                properties: {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'budget', timestamp: `2099-12-31T23:59:5${2 - i}.000Z`}
            });
        });

        // Clock seam advanced by each summarize call: the first row runs while elapsed (0) is under the
        // 100ms budget; that one call pushes elapsed to 1000ms, so the next iteration exits the loop.
        let fakeNow   = 0;
        const calls   = [];
        const result  = await MemoryService.backfillMiniSummaries({
            limit           : 3,
            maxRunMs        : 100,
            now             : () => fakeNow,
            buildMiniSummary: async ({prompt}) => {
                calls.push(prompt);
                fakeNow += 1000;
                return `summary:${prompt}`;
            }
        });

        // Exactly one row processed before the budget bounded the run; the rest deferred to a later sweep.
        expect(result.runBudgetHit).toBe(true);
        expect(result.processed).toBe(1);
        expect(result.updated).toBe(1);
        expect(calls.length).toBe(1);

        // The two unprocessed rows retain no miniSummary, so a subsequent sweep drains them.
        const summarized = ids.filter(id => {
            const seeded = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
            return JSON.parse(seeded.data).properties.miniSummary !== undefined;
        });
        expect(summarized.length).toBe(1);
    });

    test('#13638: backfillMiniSummaries splits the batch across fresh + aged ends so the tail converges', async () => {
        // A newest-only (LIFO) fetch starves the aged tail forever. The split takes BOTH ends:
        // freshReserve newest + the remainder oldest. Extreme timestamps make the picks unambiguous
        // against rows left pending by sibling serial tests; the MIDDLE row proves the window is the
        // two ENDS, not a contiguous newest slice.
        const seedRow = (id, ts) => {
            memStore.set(id, {prompt: `p-${id}`, response: `r-${id}`});
            GraphService.upsertNode({
                id, type: 'AGENT_MEMORY', name: id, description: id, semanticVectorId: id,
                properties: {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'split', timestamp: ts}
            });
        };
        seedRow('split-aged',   '2000-01-01T00:00:00.000Z');  // oldest globally → the aged-drain pick
        seedRow('split-middle', '2050-01-01T00:00:00.000Z');  // neither end → left for a later sweep
        seedRow('split-fresh',  '2100-01-01T00:00:00.000Z');  // newest globally → the fresh-reserve pick

        const calls  = [];
        const result = await MemoryService.backfillMiniSummaries({
            limit           : 2, freshReserve: 1,
            buildMiniSummary: async ({prompt}) => { calls.push(prompt); return `summary:${prompt}`; }
        });

        // Both ends summarized in one run; the middle row deliberately untouched.
        expect(result.updated).toBe(2);
        expect(calls.sort()).toEqual(['p-split-aged', 'p-split-fresh']);

        const mid = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get('split-middle').data);
        expect(mid.properties.miniSummary).toBeUndefined();
    });

    test('#13566/#13638: backfillMiniSummaries skips rows already archived as un-summarizable', async () => {
        // An archived row keeps miniSummary:NULL; the fetch must exclude it (the scheduler + count
        // already do) so the aged drain does not burn budget re-archiving. Seed it as the NEWEST row,
        // so a green test proves the filter rather than ordering luck.
        memStore.set('arch-live', {prompt: 'live prompt', response: 'live response'});
        GraphService.upsertNode({
            id              : 'arch-archived', type: 'AGENT_MEMORY', name: 'arch-archived', description: 'archived',
            semanticVectorId: 'arch-archived',
            properties      : {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'arch',
                         timestamp: '2103-01-01T00:00:00.000Z', archivedAt: '2103-01-02T00:00:00.000Z'}
        });
        GraphService.upsertNode({
            id              : 'arch-live', type: 'AGENT_MEMORY', name: 'arch-live', description: 'live',
            semanticVectorId: 'arch-live',
            properties      : {agentIdentity: '@agent-a', userId: 'tenant-a', sessionId: 'arch',
                         timestamp: '2102-01-01T00:00:00.000Z'}
        });

        const calls = [];
        await MemoryService.backfillMiniSummaries({
            limit           : 1, freshReserve: 1,
            buildMiniSummary: async ({prompt}) => { calls.push(prompt); return `summary:${prompt}`; }
        });

        // The archived row is the newest, yet excluded by the fetch filter; only the live row runs.
        expect(calls).toEqual(['live prompt']);
    });
});
