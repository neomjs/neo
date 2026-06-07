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
    let MemoryService, GraphService, LifecycleService, TextEmbeddingService, StorageRouter, originalGetMemoryCollection;

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;

        // CI unit has no ChromaDB server, so addMemory's Chroma write (its first step, before the
        // AGENT_MEMORY graph node the recency query reads) would throw. Back the content store with
        // an in-memory fake so the spec exercises the real addMemory→queryRecentTurns flow without a
        // live Chroma. The recency query reads the GRAPH; the fake only stands in for the content
        // store (the write + the detail:'full' join).
        const memStore = new Map();
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

        // Offline tests cannot hit a real embedder.
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        // Seed the AgentIdentity nodes the AUTHORED_BY edge + '@me' resolution depend on.
        GraphService.upsertNode({id: '@agent-a', type: 'AgentIdentity', name: 'AgentA', properties: {}});
        GraphService.upsertNode({id: '@agent-b', type: 'AgentIdentity', name: 'AgentB', properties: {}});
    });

    test.afterAll(async () => {
        if (originalGetMemoryCollection) StorageRouter.getMemoryCollection = originalGetMemoryCollection;
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
});
