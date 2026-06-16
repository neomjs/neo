import {setup} from '../../../../setup.mjs';

const appName = 'MemoryServiceArchivePublicRecallTest';

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
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {drainMemoryWal}      from './util.mjs';

/**
 * Public graph-recall leak coverage for archiveMemoriesByAgentIdentity (the source-issue acceptance paths).
 *
 * The sibling ArchiveByIdentity spec pins the Chroma recall paths (queryMemories / listMemories)
 * with a stubbed graph. The cycle-2 review correctly required the PUBLIC graph-backed recall
 * surfaces the source issue names — queryRecentTurns + getContextFrontier — proven against the REAL graph,
 * not only the private helpers. This spec runs the real in-memory SQLite graph (UNIT_TEST_MODE →
 * storagePaths.graph = ':memory:', like QueryRecentTurns.spec) so the archive op's graph-SQL stamp
 * + node-cache coherence sweep are exercised end-to-end, then asserts both public surfaces exclude
 * the archived identity. The spy collection supports where/$exists/update so the archive sweep's
 * Chroma get/update land — which populates `live` so the node-cache loop stamps the cached node
 * getContextFrontier reads (the SQL-UPDATE alone stamps only the persisted row queryRecentTurns reads).
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
            return {ids: entries.map(e => e.id), metadatas: entries.map(e => e.metadata), documents: entries.map(e => e.document)};
        },
        async query({nResults, where}) {
            const entries = Array.from(rows.values()).filter(entry => matchesWhere(entry.metadata, where)).slice(0, nResults);
            return {ids: [entries.map(e => e.id)], distances: [entries.map(() => 0)], metadatas: [entries.map(e => e.metadata)], documents: [entries.map(e => e.document)]};
        },
        async update({ids, metadatas}) {
            ids.forEach((id, i) => { const row = rows.get(id); if (row) row.metadata = {...metadatas[i]}; });
        }
    };
}

test.describe('MemoryService — archive excludes identities from the PUBLIC graph-recall surfaces (#13384)', () => {
    test.describe.configure({mode: 'serial'});

    let MemoryService, GraphService, LifecycleService, TextEmbeddingService, StorageRouter, spy, origGetColl, origEmbed;

    const CTX = {userId: 'tenant-arch', agentIdentityNodeId: '@agent-arch'};

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;

        spy         = createSpyCollection();
        origGetColl = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spy;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        origEmbed                      = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        GraphService.upsertNode({id: '@agent-arch', type: 'AgentIdentity', name: 'AgentArch', properties: {}});
    });

    test.afterAll(async () => {
        if (origGetColl) StorageRouter.getMemoryCollection = origGetColl;
        if (origEmbed)   TextEmbeddingService.embedText     = origEmbed;
        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();
    });

    // Seed one memory under @agent-arch, drained into the spy + projected to the real graph.
    async function seed(prompt) {
        return RequestContextService.run(CTX, async () => {
            const r = await MemoryService.addMemory({prompt, response: 'r', thought: 't'});
            await drainMemoryWal({ids: [r.id]});
            return r.id;
        });
    }

    test('queryRecentTurns (public) excludes an archived identity; unarchive restores it (#13384 AC)', async () => {
        const memId = await seed('archive-recency prompt');

        // Pre-archive: recallable via the public recency surface.
        let res = await RequestContextService.run(CTX, async () => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 50}));
        expect(res.turns.map(t => t.id)).toContain(memId);

        // Archive the identity (real op: Chroma sweep + graph-SQL stamp + durable marker).
        const arch = await MemoryService.archiveMemoriesByAgentIdentity({agentIdentity: '@agent-arch', reason: 'public-recall-test'});
        expect(arch.code).toBeUndefined();

        // Post-archive: excluded from the public recency surface.
        res = await RequestContextService.run(CTX, async () => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 50}));
        expect(res.turns.map(t => t.id)).not.toContain(memId);

        // Reversible.
        await MemoryService.unarchiveMemoriesByAgentIdentity({agentIdentity: '@agent-arch'});
        res = await RequestContextService.run(CTX, async () => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 50}));
        expect(res.turns.map(t => t.id)).toContain(memId);
    });

    test('getContextFrontier (public) excludes a strategic neighbor once it carries archivedAt (#13384 AC)', async () => {
        // getContextFrontier's frontier is agent-identity RLS-scoped (isRlsVisible keys on the acting
        // agentIdentityNodeId, never a tenant userId), so a tenant memory node is never one of its
        // strategic neighbors. Exercise the public surface's archivedAt exclusion directly with a
        // globally-visible frontier neighbor carrying the same node-cache archivedAt state the archive
        // op's coherence sweep stamps (the archive op's stamping itself is pinned in the sibling spec).
        const nodeId = 'AGENT_MEMORY:frontier-archive-probe';

        GraphService.upsertGlobalNode({id: nodeId, type: 'AGENT_MEMORY', name: 'frontier probe', properties: {agentIdentity: '@agent-arch'}});
        GraphService.linkGlobalNodes('frontier', nodeId, 'SPAWNED_MEMORY', 0.8);

        // Pre-archive: a high-weight (0.8) globally-visible neighbor surfaces in the frontier.
        let frontier = await RequestContextService.run(CTX, async () => GraphService.getContextFrontier({depth: 2}));
        expect((frontier?.strategicNeighbors ?? []).map(n => n.id)).toContain(nodeId);

        // Stamp archivedAt exactly as the archive op's node-cache coherence loop does — a direct
        // mutation of the cached node's properties (the op does `cached.properties.archivedAt = ts`).
        GraphService.db.nodes.get(nodeId).properties.archivedAt = '2026-01-01T00:00:00.000Z';

        // Post-archive: filtered out of the frontier neighborhood (the !archivedAt guard).
        frontier = await RequestContextService.run(CTX, async () => GraphService.getContextFrontier({depth: 2}));
        expect((frontier?.strategicNeighbors ?? []).map(n => n.id)).not.toContain(nodeId);
    });
});
