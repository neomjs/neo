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
    let MemoryService, GraphService, LifecycleService, TextEmbeddingService;

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

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
        // default detail='summary' → compact projection, no raw content
        expect(result.turns[0].prompt).toBeUndefined();
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

    test('AC8 fail-soft: add_memory succeeds and the turn is recallable when summarization is unavailable', async () => {
        // Unit tests reach no chat-model provider (gemini has no API key) → buildMiniSummary returns
        // null. The write MUST still succeed and the turn MUST still be recallable (raw fallback) —
        // a null summary never blocks the write or hides the turn.
        const result = await RequestContextService.run({userId: 'tenant-a', agentIdentityNodeId: '@agent-a'}, async () => {
            const write = await MemoryService.addMemory({prompt: 'no-summarizer prompt', response: 'r', thought: 't'});
            expect(write.error).toBeUndefined();
            return MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1});
        });

        expect(result.count).toBe(1);
        expect(result.turns[0].miniSummary).toBeNull();
    });
});
