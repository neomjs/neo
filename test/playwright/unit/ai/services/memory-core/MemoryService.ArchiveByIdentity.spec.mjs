import { setup } from '../../../../setup.mjs';

const appName = 'MemoryServiceArchiveByIdentityTest';

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
import {drainMemoryWal}      from './util.mjs';

/**
 * The leak-test for `archiveMemoriesByAgentIdentity` (the tombstone + recall-exclusion op).
 *
 * Proves the tombstone (set `archivedAt`) makes a memory STOP surfacing in the Chroma-backed
 * recall paths (`queryMemories` / `listMemories`) while remaining retained + operator-reversible,
 * and that the sweep is identity-scoped, idempotent, and dry-runnable.
 *
 * Mirrors `MemoryService.TenantIsolation.spec.mjs`: a stateful in-memory spy collection records
 * every add/get/query/UPDATE so the sweep's `collection.update` (set archivedAt) is reflected in
 * subsequent queries. `GraphService.db` is stubbed to a no-op SQL + empty node-cache — the graph-SQL
 * exclusion (`queryRecentTurns`) + frontier exclusion are the proven `buildMailboxDelta`
 * `archivedAt IS NULL` pattern and are covered by a separate integration assertion; this spec pins
 * the Chroma content-recall paths, which are the primary recall-pollution surface.
 */
function createSpyCollection() {
    const rows = new Map();

    const matchesWhere = (metadata, where) => {
        if (!where) return true;
        if (where.$and) return where.$and.every(cond => matchesWhere(metadata, cond));
        if (where.$or)  return where.$or.some(cond => matchesWhere(metadata, cond));
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

        async add({ids, metadatas, documents}) {
            ids.forEach((id, i) => rows.set(id, {id, metadata: metadatas?.[i] ?? {}, document: documents?.[i] ?? ''}));
        },

        async get({ids, where} = {}) {
            let entries = ids ? ids.map(id => rows.get(id)).filter(Boolean) : Array.from(rows.values());
            entries = entries.filter(entry => matchesWhere(entry.metadata, where));
            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        },

        async query({nResults, where}) {
            const entries = Array.from(rows.values()).filter(entry => matchesWhere(entry.metadata, where)).slice(0, nResults);
            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map(() => 0)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            };
        },

        // The sweep's mutation path: full-metadata replacement per id (matches the production
        // `{...existingMeta, archivedAt, archivedReason}` payload).
        async update({ids, metadatas}) {
            ids.forEach((id, i) => {
                const row = rows.get(id);
                if (row) row.metadata = {...metadatas[i]};
            });
        }
    };
}

test.describe('MemoryService — archiveMemoriesByAgentIdentity tombstone + recall-exclusion (#13384)', () => {
    let spyCollection, originalGetMemoryCollection, GraphService, originalDb, originalUpsertNode, originalLinkNodes;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        spyCollection                     = createSpyCollection();
        originalGetMemoryCollection       = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spyCollection;

        originalUpsertNode      = GraphService.upsertNode;
        originalLinkNodes       = GraphService.linkNodes;
        GraphService.upsertNode = () => {};
        GraphService.linkNodes  = () => {};

        // The sweep runs a graph-side SQL UPDATE + an in-memory node-cache sync. Stub both to no-ops
        // so the Chroma-path assertions are the spec's concern (the graph-SQL exclusion is the proven
        // buildMailboxDelta pattern). `nodes` is an empty Map — the cache-sync loop finds nothing.
        originalDb       = GraphService.db;
        GraphService.db  = {storage: {db: {prepare: () => ({run: () => {}})}}, nodes: new Map()};
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        GraphService.upsertNode           = originalUpsertNode;
        GraphService.linkNodes            = originalLinkNodes;
        GraphService.db                   = originalDb;
    });

    // Seed one memory stamped to a distinct agent identity, drained into the spy collection.
    async function seedMemory({sessionId, agent}) {
        const r = await MemoryService.addMemory({
            prompt   : `${agent} prompt`,
            response : `${agent} response`,
            thought  : `${agent} thought`,
            sessionId,
            agent
        });
        await drainMemoryWal({ids: [r.id]});
        return r.id;
    }

    // Resolve the actually-stamped agentIdentity (robust to the canonical-stamping rules).
    async function stampedIdentity(memoryId) {
        const q = await MemoryService.queryMemories({query: 'prompt', nResults: 50});
        return q.results.find(m => m.id === memoryId)?.agentIdentity;
    }

    test('archived memory is excluded from queryMemories + listMemories; unarchive restores it', async () => {
        const memId    = await seedMemory({sessionId: 'session-ghost', agent: 'ghost-agent'});
        const identity = await stampedIdentity(memId);
        expect(identity, 'the seeded memory must carry a stamped agentIdentity').toBeTruthy();

        // Pre-archive: the memory recalls via both Chroma paths.
        let q = await MemoryService.queryMemories({query: 'prompt', nResults: 50});
        expect(q.results.map(m => m.id)).toContain(memId);
        let l = await MemoryService.listMemories({sessionId: 'session-ghost', limit: 50});
        expect(l.memories.map(m => m.id)).toContain(memId);

        // Archive.
        const res = await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: identity, reason: 'leak-test'});
        expect(res.matchedCount).toBe(1);
        expect(res.archivedCount).toBe(1);
        expect(res.dryRun).toBe(false);

        // Post-archive: excluded from BOTH recall paths (a genuine no-match, not an error).
        q = await MemoryService.queryMemories({query: 'prompt', nResults: 50});
        expect(q.results.map(m => m.id)).not.toContain(memId);
        l = await MemoryService.listMemories({sessionId: 'session-ghost', limit: 50});
        expect(l.memories.map(m => m.id)).not.toContain(memId);

        // Reversible: unarchive restores recall.
        const un = await MemoryService.unarchiveMemoriesByAgentIdentity({agentIdentity: identity});
        expect(un.restoredCount).toBe(1);
        q = await MemoryService.queryMemories({query: 'prompt', nResults: 50});
        expect(q.results.map(m => m.id)).toContain(memId);
    });

    test('dryRun reports matchedCount without tombstoning', async () => {
        const memId    = await seedMemory({sessionId: 'session-dry', agent: 'dry-agent'});
        const identity = await stampedIdentity(memId);

        const dry = await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: identity, dryRun: true});
        expect(dry.matchedCount).toBe(1);
        expect(dry.archivedCount).toBe(0);
        expect(dry.dryRun).toBe(true);

        // Untouched — still recalls.
        const l = await MemoryService.listMemories({sessionId: 'session-dry', limit: 50});
        expect(l.memories.map(m => m.id)).toContain(memId);
    });

    test('idempotent: a second archive tombstones 0 new rows', async () => {
        const memId    = await seedMemory({sessionId: 'session-idem', agent: 'idem-agent'});
        const identity = await stampedIdentity(memId);

        const first = await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: identity});
        expect(first.archivedCount).toBe(1);

        const second = await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: identity});
        expect(second.matchedCount).toBe(1);   // the row still matches the identity
        expect(second.archivedCount).toBe(0);  // but it is already tombstoned
    });

    test('identity-scoped: a different identity\'s memory is NOT swept', async () => {
        const ghostId = await seedMemory({sessionId: 'session-ghost2', agent: 'ghost-agent-2'});
        const keepId  = await seedMemory({sessionId: 'session-keep',   agent: 'live-agent'});
        const ghostIdentity = await stampedIdentity(ghostId);

        await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: ghostIdentity});

        // The other identity's memory still recalls.
        const l = await MemoryService.listMemories({sessionId: 'session-keep', limit: 50});
        expect(l.memories.map(m => m.id)).toContain(keepId);
    });

    test('missing agentIdentity is rejected (fail-closed)', async () => {
        const res = await MemoryService.archiveMemoriesByAgentIdentity({});
        expect(res.code).toBe('MISSING_AGENT_IDENTITY');
    });
});
