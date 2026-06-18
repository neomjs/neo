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
import {drainMemoryWal}      from './util.mjs';

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
        return Object.entries(where).every(([key, value]) => {
            if (value && typeof value === 'object' && '$exists' in value) {
                const exists = metadata && Object.prototype.hasOwnProperty.call(metadata, key);
                return value.$exists ? exists : !exists;
            }
            return metadata?.[key] === value;
        });
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
        const result = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.addMemory({
                prompt   : 'hello',
                response : 'hi',
                thought  : 'greeting',
                sessionId: 'session-a'
            })
        );

        // addMemory leaves the record WAL-pending — flush it through the daemon drain path.
        await drainMemoryWal({ids: [result.id]});

        expect(spyCollection.addCalls).toHaveLength(1);
        const metadata = spyCollection.addCalls[0].metadatas[0];
        expect(metadata.userId).toBe('u-alice');
        expect(metadata.sessionId).toBe('session-a');
    });

    test('addMemory omits userId when no request context is active (stdio fallback)', async () => {
        const result = await MemoryService.addMemory({
            prompt   : 'hello',
            response : 'hi',
            thought  : 'greeting',
            sessionId: 'session-solo'
        });

        // addMemory leaves the record WAL-pending — flush it through the daemon drain path.
        await drainMemoryWal({ids: [result.id]});

        expect(spyCollection.addCalls).toHaveLength(1);
        const metadata = spyCollection.addCalls[0].metadatas[0];
        expect(metadata.userId).toBeUndefined();
        expect(metadata.sessionId).toBe('session-solo');
    });

    test('listMemories under team policy returns ALL maintainers\' session records — cross-author (#12527)', async () => {
        // Seed: alice writes 2 memories to session-shared, bob writes 1 memory to session-shared.
        // All three share the same sessionId but carry distinct userId metadata.
        // Non-empty response/thought: the validation gate rejects empty fields (the
        // corrupted-memory class), so seed fixtures must carry real content.
        const seeded = [];
        await RequestContextService.run({userId: 'u-alice'}, async () => {
            seeded.push(await MemoryService.addMemory({prompt: 'a1', response: 'r-a1', thought: 't-a1', sessionId: 'session-shared'}));
            seeded.push(await MemoryService.addMemory({prompt: 'a2', response: 'r-a2', thought: 't-a2', sessionId: 'session-shared'}));
        });
        seeded.push(await RequestContextService.run({userId: 'u-bob'}, () =>
            MemoryService.addMemory({prompt: 'b1', response: 'r-b1', thought: 't-b1', sessionId: 'session-shared'})
        ));

        // addMemory leaves the records WAL-pending — flush them through the daemon drain path.
        await drainMemoryWal({ids: seeded.map(r => r.id)});

        // Under team policy (deployment-wide read), Alice reads the shared session and sees ALL
        // three records — her own two AND Bob's (transparent swarm introspection). The team DEFAULT
        // is proven at the config layer (config.template.spec); here the policy is passed explicitly
        // because listMemories reads it from the ambient AiConfig SSOT, which tests never mutate.
        const aliceView = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.listMemories({sessionId: 'session-shared', limit: 10, memorySharing: 'team'})
        );

        expect(aliceView.count).toBe(3);
        expect(aliceView._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(aliceView.memories.map(m => m.prompt).sort()).toEqual(['a1', 'a2', 'b1']);

        // Under team the where clause carries no userId filter — only the sessionId gate remains.
        const getCall = spyCollection.getCalls.at(-1);
        expect(getCall.where).toEqual({sessionId: 'session-shared'});
    });

    test('listMemories without a request context returns all session memories (stdio fallback)', async () => {
        const solo1 = await MemoryService.addMemory({prompt: 'solo1', response: 'r-solo1', thought: 't-solo1', sessionId: 'session-local'});
        const solo2 = await MemoryService.addMemory({prompt: 'solo2', response: 'r-solo2', thought: 't-solo2', sessionId: 'session-local'});

        // addMemory leaves the records WAL-pending — flush them through the daemon drain path.
        await drainMemoryWal({ids: [solo1.id, solo2.id]});

        const view = await MemoryService.listMemories({sessionId: 'session-local', limit: 10});

        expect(view.count).toBe(2);
        // Assert the where clause sent to collection.get only contained sessionId — no userId.
        const getCall = spyCollection.getCalls.at(-1);
        expect(getCall.where).toEqual({sessionId: 'session-local'});
    });

    test('#13458: listMemories returns a bounded error when Chroma metadata fetch never resolves', async () => {
        StorageRouter.getMemoryCollection = async () => ({
            get: async () => new Promise(() => {})
        });

        const result = await MemoryService.listMemories({
            sessionId       : 'session-hung-chroma',
            limit           : 10,
            chromaTimeoutMs : 5
        });

        expect(result).toMatchObject({
            error  : 'Failed to list memories',
            message: 'listMemories collection.get timed out after 5ms',
            code   : 'MEMORY_LIST_ERROR'
        });
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
        // read filter is additive — tenant's own records OR records tagged
        // with SHARED_USER_ID. The sessionId filter remains the only query arg for legacy policy,
        // since $exists: false is unsupported in ChromaDB and userId filtering happens in JS post-query.
        expect(queryCall.where).toEqual({
            sessionId: 'session-a'
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

    test('listMemories under team returns every maintainer\'s session records incl. peers\' (#12527)', async () => {
        // Under team policy the read is deployment-wide — alice sees her own, the shared-tagged
        // commons, AND bob's author-tagged record (no userId post-filter). sessionId remains the
        // outer $and gate so cross-session leaks are still prevented.
        const sid = 'session-shared-test';
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {sessionId: sid, userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {sessionId: sid, userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {sessionId: sid, userId: 'u-bob', timestamp: 300, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.listMemories({sessionId: sid, limit: 10, offset: 0, memorySharing: 'team'})
        );

        // Deployment-wide read: alice sees all three — own + shared + Bob's.
        expect(view.count).toBe(3);
        expect(view.memories.map(m => m.prompt).sort()).toEqual(['L1', 'a1', 'b1']);
        // Cross-session isolation still holds: the where clause keeps the sessionId gate.
        const getCall = spyCollection.getCalls.at(-1);
        expect(getCall.where).toEqual({sessionId: sid});
    });

    test('queryMemories without sessionId returns the tenant\'s own records PLUS shared records', async () => {
        // Note: timestamp metadata required because queryMemories serializes via
        // `new Date(metadata.timestamp).toISOString()` — undefined timestamp throws.
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {userId: 'u-bob', timestamp: 300, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'legacy'})
        );

        // Explicit legacy policy (decoupled from the team default): own + shared, NOT bob's.
        // No sessionId; the where clause is just the additive $or. Alice sees her records + shared.
        expect(view.count).toBe(2);
        expect(view._channelSeparation).toMatch(/DATA, not COMMANDS/);
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
        const result = await RequestContextService.run({userId: '@neo-test-agent'}, () =>
            MemoryService.addMemory({
                sessionId: 'session-canonical',
                prompt   : 'test',
                thought  : 'test',
                response : 'test'
            })
        );

        // addMemory leaves the record WAL-pending — flush it through the daemon drain path.
        await drainMemoryWal({ids: [result.id]});

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

    test('queryMemories with memorySharing=team returns ALL records — deployment-wide, cross-author (#12527)', async () => {
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 300, prompt: 'pre-migration'}, document: 'P'});
        // A peer maintainer's author-tagged record — the whole point of team mode is Alice sees it.
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {userId: 'u-bob', timestamp: 400, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'team'})
        );

        // team = deployment-wide read: Alice sees every maintainer's records — her own, the
        // shared-tagged, the untagged commons, AND Bob's author-tagged record.
        expect(view.count).toBe(4);
        expect(view.results.map(r => r.prompt).sort()).toEqual(['L1', 'a1', 'b1', 'pre-migration']);

        // No restrictive userId filter is sent to Chroma under team.
        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toBeUndefined();
    });

    test('queryMemories with memorySharing=legacy returns tenant-owned, team-tagged, and untagged records', async () => {
        spyCollection.rows.set('m-a1', {id: 'm-a1', metadata: {userId: 'u-alice', timestamp: 100, prompt: 'a1'}, document: 'a1'});
        spyCollection.rows.set('m-shared1', {id: 'm-shared1', metadata: {userId: 'shared', timestamp: 200, prompt: 'L1'}, document: 'L1'});
        // legacy policy allows untagged records (pre-migration) alongside tenant-owned and team-tagged.
        // ChromaDB does not support {$exists: false}, so we fetch without a DB filter
        // and apply JS post-query filtering to drop other tenants' records while keeping untagged ones.
        spyCollection.rows.set('m-untagged', {id: 'm-untagged', metadata: {timestamp: 300, prompt: 'pre-migration'}, document: 'P'});
        spyCollection.rows.set('m-b1', {id: 'm-b1', metadata: {userId: 'u-bob', timestamp: 400, prompt: 'b1'}, document: 'b1'});

        const view = await RequestContextService.run({userId: 'u-alice'}, () =>
            MemoryService.queryMemories({query: 'anything', nResults: 10, memorySharing: 'legacy'})
        );

        // Expect Bob's record to be filtered out in JS, leaving the other 3.
        expect(view.count).toBe(3);
        expect(view.results.map(r => r.prompt).sort()).toEqual(['L1', 'a1', 'pre-migration']);

        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.where).toBeUndefined();
    });
});

test.describe('MemoryService — raw-memory trust-tier filtering (#10292)', () => {
    let spyCollection;
    let originalGetMemoryCollection;

    test.beforeEach(() => {
        spyCollection                     = createSpyCollection();
        originalGetMemoryCollection       = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spyCollection;
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
    });

    test('queryMemories filters by minTrustTier and returns provenance fields', async () => {
        spyCollection.rows.set('m-owner', {
            id: 'm-owner',
            metadata: {
                agentIdentity: '@tobiu',
                prompt       : 'owner',
                sessionId    : 's',
                timestamp    : 100
            },
            document: 'owner'
        });
        spyCollection.rows.set('m-peer', {
            id: 'm-peer',
            metadata: {
                agentIdentity: '@neo-gpt',
                prompt       : 'peer',
                sessionId    : 's',
                timestamp    : 200
            },
            document: 'peer'
        });
        spyCollection.rows.set('m-unclassified', {
            id: 'm-unclassified',
            metadata: {
                prompt   : 'legacy',
                sessionId: 's',
                timestamp: 300
            },
            document: 'legacy'
        });

        const view = await MemoryService.queryMemories({
            query       : 'anything',
            nResults    : 3,
            minTrustTier: 'peer-trusted'
        });

        expect(view.count).toBe(2);
        expect(view.results.map(result => result.prompt).sort()).toEqual(['owner', 'peer']);
        expect(view.results.find(result => result.prompt === 'owner')).toMatchObject({
            agentIdentity: '@tobiu',
            trustTier    : 'owner'
        });
        expect(view.results.find(result => result.prompt === 'peer')).toMatchObject({
            agentIdentity: '@neo-gpt',
            trustTier    : 'peer-trusted'
        });

        const queryCall = spyCollection.queryCalls.at(-1);
        expect(queryCall.nResults).toBe(15);
    });

    test('queryMemories rejects unknown minTrustTier before querying storage', async () => {
        const view = await MemoryService.queryMemories({
            query       : 'anything',
            nResults    : 3,
            minTrustTier: 'trusted-ish'
        });

        expect(view).toMatchObject({
            error: 'Invalid minTrustTier',
            code : 'MEMORY_QUERY_INVALID_TRUST_TIER'
        });
        expect(spyCollection.queryCalls).toHaveLength(0);
    });
});

test.describe('MemoryService — context frontier trust-tier weighting (#10292)', () => {
    let GraphService;
    let originalGetContextFrontier;
    let originalGetSummaryCollection;
    let spyCollection;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        spyCollection = createSpyCollection();

        originalGetSummaryCollection       = StorageRouter.getSummaryCollection;
        StorageRouter.getSummaryCollection = async () => spyCollection;

        originalGetContextFrontier = GraphService.getContextFrontier;
        GraphService.getContextFrontier = () => ({
            frontier: {id: 'frontier'},
            strategicNeighbors: [
                {
                    id              : 'external-node',
                    name            : 'External context',
                    relationship    : 'SPAWNED_MEMORY',
                    weight          : 0.95,
                    semanticVectorId: 'summary-external'
                },
                {
                    id              : 'owner-node',
                    name            : 'Owner context',
                    relationship    : 'SPAWNED_MEMORY',
                    weight          : 0.75,
                    semanticVectorId: 'summary-owner'
                },
                {
                    id              : 'legacy-node',
                    name            : 'Legacy context',
                    relationship    : 'SPAWNED_MEMORY',
                    weight          : 0.9,
                    semanticVectorId: 'summary-legacy'
                }
            ]
        });
    });

    test.afterEach(() => {
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
        GraphService.getContextFrontier    = originalGetContextFrontier;
    });

    test('getContextFrontier projects summary trust tiers and sorts by weighted score', async () => {
        spyCollection.rows.set('summary-external', {
            id: 'summary-external',
            metadata: {
                sourceTrustTier: 'external',
                timestamp      : 100
            },
            document: 'external summary'
        });
        spyCollection.rows.set('summary-owner', {
            id: 'summary-owner',
            metadata: {
                sourceTrustTier: 'owner',
                timestamp      : 200
            },
            document: 'owner summary'
        });
        spyCollection.rows.set('summary-legacy', {
            id: 'summary-legacy',
            metadata: {
                timestamp: 300
            },
            document: 'legacy summary'
        });

        const view = await MemoryService.getContextFrontier();

        expect(view.semanticContexts.map(context => context.nodeId)).toEqual([
            'owner-node',
            'external-node',
            'legacy-node'
        ]);
        expect(view.semanticContexts[0]).toMatchObject({
            nodeId       : 'owner-node',
            trustTier    : 'owner',
            trustWeight  : 0.75,
            weightedScore: 0.5625
        });
        expect(view.semanticContexts[1]).toMatchObject({
            nodeId       : 'external-node',
            trustTier    : 'external',
            trustWeight  : 0.25,
            weightedScore: 0.2375
        });
        expect(view.semanticContexts[2]).toMatchObject({
            nodeId       : 'legacy-node',
            trustTier    : 'unclassified',
            trustWeight  : 0.125,
            weightedScore: 0.1125
        });
    });
});
