import { setup } from '../../../../setup.mjs';

const appName = 'MemoryServiceTenantIsolationTest';

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
import * as core             from '../../../../../../src/core/_export.mjs';
import MemoryService         from '../../../../../../ai/services/memory-core/MemoryService.mjs';
import StorageRouter         from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * Tenant isolation across `MemoryService.addMemory` / `listMemories` / `queryMemories`.
 *
 * Uses an in-memory spy `collection` that records every `add`/`get`/`query` call and stores
 * metadata/documents by id so we can simulate the ChromaDB `where: {userId}` filter locally.
 * The `StorageRouter.getMemoryCollection` singleton is temporarily replaced with a factory
 * returning the spy; original is restored in `afterEach` per the symmetric-cleanup discipline.
 *
 * `GraphService.upsertNode` / `linkNodes` are also stubbed — `addMemory` calls them as
 * side-effects, and the graph write path is not this spec's concern.
 */
function createSpyCollection() {
    const rows = new Map();
    const addCalls   = [];
    const getCalls   = [];
    const queryCalls = [];

    const matchesWhere = (metadata, where) => {
        if (!where) return true;
        if (where.$and) {
            return where.$and.every(cond => matchesWhere(metadata, cond));
        }
        if (where.$or) {
            return where.$or.some(cond => matchesWhere(metadata, cond));
        }
        return Object.entries(where).every(([key, value]) => metadata?.[key] === value);
    };

    return {
        rows,
        addCalls,
        getCalls,
        queryCalls,

        async add({ids, metadatas, documents}) {
            addCalls.push({ids, metadatas, documents});
            ids.forEach((id, i) => rows.set(id, {
                id,
                metadata: metadatas?.[i] ?? {},
                document: documents?.[i] ?? ''
            }));
        },

        async get({ids, where, include} = {}) {
            getCalls.push({ids, where, include});

            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            entries = entries.filter(entry => matchesWhere(entry.metadata, where));

            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        },

        async query({queryTexts, nResults, where}) {
            queryCalls.push({queryTexts, nResults, where});

            const entries = Array
                .from(rows.values())
                .filter(entry => matchesWhere(entry.metadata, where))
                .slice(0, nResults);

            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map(() => 0)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            };
        }
    };
}

test.describe('MemoryService — tenant isolation (#10000)', () => {
    let spyCollection;
    let originalGetMemoryCollection;
    let originalUpsertNode;
    let originalLinkNodes;

    let GraphService;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        spyCollection                           = createSpyCollection();
        originalGetMemoryCollection             = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection       = async () => spyCollection;

        // Stub graph side-effects — the spec is narrowly about ChromaDB metadata tagging.
        originalUpsertNode          = GraphService.upsertNode;
        originalLinkNodes           = GraphService.linkNodes;
        GraphService.upsertNode     = () => {};
        GraphService.linkNodes      = () => {};
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        GraphService.upsertNode           = originalUpsertNode;
        GraphService.linkNodes            = originalLinkNodes;
    });

    test('addMemory attaches userId metadata when a request context is active', async () => {
        await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.addMemory({
                prompt   : 'hello',
                response : 'hi',
                thought  : 'greeting',
                sessionId: 'session-a'
            })
        );

        expect(spyCollection.addCalls).toHaveLength(1);
        const metadata = spyCollection.addCalls[0].metadatas[0];
        expect(metadata.userId).toBe('u-alice');
        expect(metadata.sessionId).toBe('session-a');
    });

    test('addMemory omits userId when no request context is active (stdio fallback)', async () => {
        await MemoryService.addMemory({
            prompt   : 'hello',
            response : 'hi',
            thought  : 'greeting',
            sessionId: 'session-solo'
        });

        expect(spyCollection.addCalls).toHaveLength(1);
        const metadata = spyCollection.addCalls[0].metadatas[0];
        expect(metadata.userId).toBeUndefined();
        expect(metadata.sessionId).toBe('session-solo');
    });

    test('listMemories filters by userId when a request context is active', async () => {
        // Seed: alice writes 2 memories to session-shared, bob writes 1 memory to session-shared.
        // All three share the same sessionId but carry distinct userId metadata.
        await RequestContextService.run({userId: 'u-alice'}, async () => {
            await MemoryService.addMemory({prompt: 'a1', response: '', thought: '', sessionId: 'session-shared'});
            await MemoryService.addMemory({prompt: 'a2', response: '', thought: '', sessionId: 'session-shared'});
        });
        await RequestContextService.run({userId: 'u-bob'}, () =>
            MemoryService.addMemory({prompt: 'b1', response: '', thought: '', sessionId: 'session-shared'})
        );

        // Alice reads the shared session — expects only her 2 memories.
        const aliceView = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.listMemories({sessionId: 'session-shared', limit: 10})
        );

        expect(aliceView.count).toBe(2);
        expect(aliceView.memories.map(m => m.prompt).sort()).toEqual(['a1', 'a2']);

        // Bob reads the same shared session — expects only his 1 memory.
        const bobView = await RequestContextService.run({userId: 'u-bob'}, () =>
            MemoryService.listMemories({sessionId: 'session-shared', limit: 10})
        );

        expect(bobView.count).toBe(1);
        expect(bobView.memories[0].prompt).toBe('b1');
    });

    test('listMemories without a request context returns all session memories (stdio fallback)', async () => {
        await MemoryService.addMemory({prompt: 'solo1', response: '', thought: '', sessionId: 'session-local'});
        await MemoryService.addMemory({prompt: 'solo2', response: '', thought: '', sessionId: 'session-local'});

        const view = await MemoryService.listMemories({sessionId: 'session-local', limit: 10});

        expect(view.count).toBe(2);
        // Assert the where clause sent to collection.get only contained sessionId — no userId.
        const getCall = spyCollection.getCalls.at(-1);
        expect(getCall.where).toEqual({sessionId: 'session-local'});
    });

    test('queryMemories merges userId with caller-provided sessionId in the where clause', async () => {
        await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({
                query    : 'anything',
                nResults : 5,
                sessionId: 'session-a'
            })
        );

        const queryCall = spyCollection.queryCalls.at(-1);
        // #10556: read filter became additive — tenant's own records OR records tagged
        // with SHARED_USER_ID. The sessionId filter remains in the outer $and.
        expect(queryCall.where).toEqual({
            $and: [
                {sessionId: 'session-a'},
                {$or: [{userId: 'u-alice'}, {userId: 'shared'}]}
            ]
        });
    });

    test('queryMemories without a request context leaves the where clause at caller-provided sessionId only', async () => {
        await MemoryService.queryMemories({
            query    : 'anything',
            nResults : 5,
            sessionId: 'session-a'
        });

        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toEqual({sessionId: 'session-a'});
    });
});

test.describe('MemoryService — additive shared-commons access (#10556)', () => {
    let spyCollection;
    let originalGetMemoryCollection;

    test.beforeEach(() => {
        spyCollection                       = createSpyCollection();
        originalGetMemoryCollection         = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection   = async () => spyCollection;
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
    });

    test('listMemories returns the tenant\'s OWN records PLUS SHARED_USER_ID-tagged records (sessionId-scoped)', async () => {
        // Pre-#10145 records (backfilled by the migration runner with userId='shared') become
        // accessible to every tenant via the additive $or filter, alongside the tenant's own data.
        // sessionId remains the outer $and gate so cross-session leaks are still prevented.
        const sid = 'session-shared-test';
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {sessionId: sid, userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {sessionId: sid, userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {sessionId: sid, userId: 'u-bob', timestamp: 300, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.listMemories({sessionId: sid, limit: 10, offset: 0})
        );

        // Alice sees her own memory + the shared-tagged legacy memory, but not Bob's.
        expect(view.count).toBe(2);
        expect(view.memories.map(m => m.prompt).sort()).toEqual(['L1', 'a1']);
    });

    test('queryMemories without sessionId returns the tenant\'s own records PLUS shared records', async () => {
        // Note: timestamp metadata required because queryMemories serializes via
        // `new Date(metadata.timestamp).toISOString()` — undefined timestamp throws.
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {userId: 'u-bob', timestamp: 300, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10})
        );

        // No sessionId; the where clause is just the additive $or. Alice sees her records + shared.
        expect(view.count).toBe(2);
        expect(view.results.map(r => r.prompt).sort()).toEqual(['L1', 'a1']);
    });

    test('queryMemories without sessionId AND without context preserves single-tenant fallthrough', async () => {
        // Daemon contexts (offline, no env-var, no gh-cli) yield undefined userId. No where clause
        // applied; all records returned regardless of tag — single-tenant fallthrough.
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 200, prompt: 'pre-migration'}, document: 'P'});

        const view = await MemoryService.queryMemories({query: 'anything', nResults: 10});

        // Both records visible (untagged + tagged) — no filter applied.
        expect(view.count).toBe(2);
    });

    test('addMemory tags new writes with the normalized userId (no `@` prefix)', async () => {
        // Canonical-form invariant on the write side: AgentIdentity nodeId form is `@x`,
        // ChromaDB userId form is `x`. The boundary helper strips the prefix at write time
        // so a future read filter using either form will always match.
        await RequestContextService.run({userId: '@neo-test-agent'}, () =>
            MemoryService.addMemory({
                sessionId: 'session-canonical',
                prompt   : 'test',
                thought  : 'test',
                response : 'test'
            })
        );

        const addCall = spyCollection.addCalls.at(-1);
        const tagged  = addCall.metadatas[0]?.userId;
        // The stored tag should be `neo-test-agent` (no prefix), NOT `@neo-test-agent`.
        expect(tagged).toBe('neo-test-agent');
    });
});

test.describe('MemoryService — memorySharing policy (#10010)', () => {
    let spyCollection;
    let originalGetMemoryCollection;

    test.beforeEach(() => {
        spyCollection                       = createSpyCollection();
        originalGetMemoryCollection         = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection   = async () => spyCollection;
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
    });

    test('queryMemories with memorySharing=private returns only tenant-owned records', async () => {
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 300, prompt: 'pre-migration'}, document: 'P'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'private'})
        );

        expect(view.count).toBe(1);
        expect(view.results[0].prompt).toBe('a1');
        
        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toEqual({userId: 'u-alice'});
    });

    test('queryMemories with memorySharing=team returns only team-tagged records', async () => {
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 300, prompt: 'pre-migration'}, document: 'P'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'team'})
        );

        expect(view.count).toBe(1);
        expect(view.results[0].prompt).toBe('L1');
        
        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toEqual({userId: 'shared'});
    });

    test('queryMemories with memorySharing=legacy returns tenant-owned plus team-tagged, ignoring untagged', async () => {
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 300, prompt: 'pre-migration'}, document: 'P'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'legacy'})
        );

        expect(view.count).toBe(2);
        expect(view.results.map(r => r.prompt).sort()).toEqual(['L1', 'a1']);
        
        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toEqual({$or: [{userId: 'u-alice'}, {userId: 'shared'}]});
    });
});

