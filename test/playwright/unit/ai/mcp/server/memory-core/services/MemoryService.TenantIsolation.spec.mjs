import { setup } from '../../../../../../setup.mjs';

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
import Neo                   from '../../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../../src/core/_export.mjs';
import MemoryService         from '../../../../../../../../ai/mcp/server/memory-core/services/MemoryService.mjs';
import StorageRouter         from '../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs';
import GraphService          from '../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs';
import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

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
        expect(queryCall.where).toEqual({sessionId: 'session-a', userId: 'u-alice'});
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
