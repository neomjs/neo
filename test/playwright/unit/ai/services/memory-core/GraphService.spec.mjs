import {setup} from '../../../../setup.mjs';

const appName = 'GraphServiceTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import os              from 'os';
import {getPaths}      from '../../../../../../ai/graph/queries/traversal.mjs';
import {
    createGraphBootSeedManifest,
    evaluateGraphBootSeedFreshness
} from '../../../../../../ai/graph/bootSeedManifest.mjs';

test.describe('Neo.ai.services.memory-core.GraphService', () => {
    let GraphService;
    let protectedEdgeTypes;
    let SystemLifecycleService;
    let service;
    const testDbName = `memory-core-graph-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        // Reactive provider SSOT: storagePaths.graph (→ `:memory:`) + collections.{memory,session} (→ test-*)
        // resolve to test values BY CONSTRUCTION under UNIT_TEST_MODE (config.template's
        // `useTestDatabase` toggle). The test never mutates the shared AiConfig singleton.

        const graphModule = await import('../../../../../../ai/services/memory-core/GraphService.mjs');
        GraphService       = graphModule.default;
        protectedEdgeTypes = graphModule.PROTECTED_EDGE_TYPES;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        // Wipe any RAM caches created by the automated Base constructor async initialization loop cleanly
        // preventing Foreign Key races when `ready` is re-launched pointing to the wiped `testDbPath`!
        const { TestLifecycleHelper } = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, null, 'clear');

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }

        if (!GraphService.db) {
            GraphService._initPromise = null;
            await GraphService.initAsync();
        }
    });

    test.beforeEach(async () => {
        // Clear graph nodes and edges before each test for isolation
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                // We MUST wipe the log and reset syncId to prevent cross-test coherence corruption
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterEach(async () => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(async () => {
        const { cleanupChromaManager, TestLifecycleHelper } = await import('./util.mjs');
        await cleanupChromaManager();
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    test('should extract node neighbors properly', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        await GraphService.upsertNode({id: 'EpicA', name: 'Roadmap Planner'});
        await GraphService.upsertNode({id: 'Task1', name: 'Implementation', semanticVectorId: 'vector-task-1'});
        await GraphService.upsertNode({id: 'Task2', name: 'Documentation'});

        await GraphService.linkNodes('EpicA', 'Task1', 'CONTAINS', 1.0);
        await GraphService.linkNodes('EpicA', 'Task2', 'CONTAINS', 0.8);
        await GraphService.linkNodes('Task1', 'Task2', 'DEPENDENCY', 0.5);

        const result      = await GraphService.getNeighbors({id: 'EpicA'});
        const {neighbors} = result || {};

        // Validation of extraction
        expect(neighbors && neighbors.length).toBe(2);

        const task1 = neighbors.find(n => n.id === 'Task1');
        const task2 = neighbors.find(n => n.id === 'Task2');

        expect(task1).toBeDefined();
        expect(task1.weight).toBe(1.0);
        expect(task1.relationship).toBe('CONTAINS');
        expect(task1.semanticVectorId).toBe('vector-task-1');

        expect(task2).toBeDefined();
        expect(task2.weight).toBe(0.8);
    });

    test('linkNodes keeps a hydrated existing-edge record coherent with SQLite on relink (#16273)', async () => {
        await GraphService.upsertNode({id: 'RelinkSource', type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'RelinkTarget', type: 'TEST_NODE'});
        GraphService.linkNodes('RelinkSource', 'RelinkTarget', 'RELATES_TO', 1, {phase: 'initial'});

        const selectEdge = GraphService.db.storage.db.prepare(`
            SELECT id, data
            FROM Edges
            WHERE source = ?
              AND target = ?
              AND type = ?
        `);
        const initialRow = selectEdge.get('RelinkSource', 'RelinkTarget', 'RELATES_TO');
        const cachedEdge = GraphService.db.edges.get(initialRow.id);

        expect(cachedEdge.isRecord).toBe(true);
        expect(cachedEdge.get('properties')).toMatchObject({phase: 'initial', weight: 1});

        GraphService.linkNodes('RelinkSource', 'RelinkTarget', 'RELATES_TO', 2, {phase: 'updated'});

        const storedProperties = JSON.parse(
            selectEdge.get('RelinkSource', 'RelinkTarget', 'RELATES_TO').data
        ).properties;

        expect(storedProperties).toMatchObject({phase: 'updated'});
        expect(storedProperties.weight).toBeCloseTo(1.2);
        expect(GraphService.db.edges.get(initialRow.id)).toBe(cachedEdge);
        expect(cachedEdge.get('properties')).toEqual(storedProperties);

        const reinforcementLogs = GraphService.db.storage.db.prepare(`
            SELECT entity_id
            FROM GraphLog
            WHERE entity_type = 'edges'
              AND entity_id = ?
        `).all(initialRow.id);

        expect(reinforcementLogs).toHaveLength(2);
    });

    test('structural edge verification is write-idempotent while property drift stays explicit (#17056)', () => {
        GraphService.upsertNode({id: 'StructuralSource', type: 'TEST_NODE'});
        GraphService.upsertNode({id: 'StructuralTarget', type: 'TEST_NODE'});

        const
            sqlite     = GraphService.db.storage.db,
            selectEdge = sqlite.prepare(`
                SELECT id, data
                FROM Edges
                WHERE source = ?
                  AND target = ?
                  AND type = ?
            `),
            edgeLogs   = () => sqlite.prepare("SELECT * FROM GraphLog WHERE entity_type = 'edges' ORDER BY log_id").all();

        sqlite.exec('DELETE FROM GraphLog');

        const created = GraphService.ensureStructuralEdge(
            'StructuralSource',
            'StructuralTarget',
            'CONTAINS',
            1,
            {projection: 'filesystem'}
        );

        expect(created).toEqual({status: 'created'});
        expect(edgeLogs()).toHaveLength(1);

        // Intentional learning can raise the historical weight; structural verification must
        // preserve that authority rather than normalize it back to the creation weight.
        GraphService.linkNodes(
            'StructuralSource',
            'StructuralTarget',
            'CONTAINS',
            2,
            {projection: 'filesystem'}
        );

        const reinforcedRow = selectEdge.get('StructuralSource', 'StructuralTarget', 'CONTAINS');
        expect(JSON.parse(reinforcedRow.data).properties.weight).toBeCloseTo(1.2);

        sqlite.exec('DELETE FROM GraphLog');

        const verified = GraphService.ensureStructuralEdge(
            'StructuralSource',
            'StructuralTarget',
            'CONTAINS',
            1,
            {projection: 'filesystem'}
        );

        expect(verified).toEqual({status: 'verified'});
        expect(selectEdge.get('StructuralSource', 'StructuralTarget', 'CONTAINS').data).toBe(reinforcedRow.data);
        expect(edgeLogs()).toEqual([]);

        const drifted = GraphService.ensureStructuralEdge(
            'StructuralSource',
            'StructuralTarget',
            'CONTAINS',
            1,
            {projection: 'different-authority'}
        );

        expect(drifted).toMatchObject({
            status       : 'drifted',
            divergentKeys: ['projection']
        });
        expect(selectEdge.get('StructuralSource', 'StructuralTarget', 'CONTAINS').data).toBe(reinforcedRow.data);
        expect(edgeLogs()).toEqual([]);

        GraphService.upsertNode({id: 'PrivateTarget', type: 'TEST_NODE'});
        GraphService.linkNodes(
            'StructuralSource',
            'PrivateTarget',
            'CONTAINS',
            1,
            {userId: 'tenant-a'}
        );
        sqlite.exec('DELETE FROM GraphLog');

        expect(GraphService.ensureStructuralEdge(
            'StructuralSource',
            'PrivateTarget',
            'CONTAINS'
        )).toEqual({status: 'drifted', divergentKeys: ['userId']});
        expect(edgeLogs()).toEqual([]);
    });

    test('structural edge verification rejects an outer transaction instead of reading a partial overlay (#17056)', () => {
        GraphService.upsertNode({id: 'QueuedSource', type: 'TEST_NODE'});
        GraphService.upsertNode({id: 'QueuedTarget', type: 'TEST_NODE'});
        GraphService.db.storage.db.exec('DELETE FROM GraphLog');

        expect(() => GraphService.db.transaction(() => {
            GraphService.ensureStructuralEdge('QueuedSource', 'QueuedTarget', 'CONTAINS')
        })).toThrow(/owns its transaction/);
        expect(GraphService.db.storage.db.prepare(`
            SELECT COUNT(*) AS count
            FROM Edges
            WHERE source = 'QueuedSource'
              AND target = 'QueuedTarget'
              AND type = 'CONTAINS'
        `).get().count).toBe(0);
        expect(GraphService.db.storage.db.prepare(
            "SELECT COUNT(*) AS count FROM GraphLog WHERE entity_type = 'edges'"
        ).get().count).toBe(0)
    });

    test('structural edge verification recreates a peer-deleted SQLite edge despite stale RAM (#17056)', () => {
        GraphService.upsertNode({id: 'StaleSource', type: 'TEST_NODE'});
        GraphService.upsertNode({id: 'StaleTarget', type: 'TEST_NODE'});
        GraphService.ensureStructuralEdge('StaleSource', 'StaleTarget', 'CONTAINS');

        const
            sqlite      = GraphService.db.storage.db,
            originalRow = sqlite.prepare(`
                SELECT id
                FROM Edges
                WHERE source = 'StaleSource'
                  AND target = 'StaleTarget'
                  AND type = 'CONTAINS'
            `).get();

        // Simulate a peer-process delete before this process consumes the GraphLog invalidation.
        // The old edge deliberately remains in the RAM store and must not satisfy verification.
        sqlite.exec('DELETE FROM GraphLog');
        sqlite.prepare('DELETE FROM Edges WHERE id = ?').run(originalRow.id);

        expect(GraphService.db.edges.has(originalRow.id)).toBe(true);
        expect(GraphService.ensureStructuralEdge(
            'StaleSource',
            'StaleTarget',
            'CONTAINS'
        )).toEqual({status: 'created'});

        const persisted = sqlite.prepare(`
            SELECT id
            FROM Edges
            WHERE source = 'StaleSource'
              AND target = 'StaleTarget'
              AND type = 'CONTAINS'
        `).all();

        expect(persisted).toHaveLength(1);
        expect(persisted[0].id).not.toBe(originalRow.id);

        const cachedTuple = GraphService.db.edges.getByIndex('source', 'StaleSource')
            .filter(edge => edge.target === 'StaleTarget' && edge.type === 'CONTAINS');

        expect(cachedTuple.map(edge => edge.id)).toEqual([persisted[0].id]);
        expect(GraphService.db.edges.has(originalRow.id)).toBe(false);
        expect(sqlite.prepare(
            "SELECT entity_id FROM GraphLog WHERE entity_type = 'edges' ORDER BY log_id"
        ).all().map(row => row.entity_id)).toEqual([originalRow.id, persisted[0].id])
    });

    test('removeNodes rejects invalid node ids before Database.removeNode null path (#11698)', async () => {
        expect(() => GraphService.removeNodes([null])).toThrow(/invalid node id/);
        expect(() => GraphService.removeNodes(['ValidNode', undefined])).toThrow(/invalid node id/);
    });

    test('getOrphanedNodes preserves SYSTEM_ANCHOR and ADR nodes while returning ordinary orphans (#9945, #11377)', async () => {
        await GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR'});
        await GraphService.upsertNode({id: 'adr-0006', type: 'ADR'});
        await GraphService.upsertNode({id: 'DisposableConcept', type: 'CONCEPT'});

        await new Promise(resolve => setTimeout(resolve, 50));

        const orphaned = GraphService.getOrphanedNodes();

        expect(orphaned).toContain('DisposableConcept');
        expect(orphaned).not.toContain('frontier');
        expect(orphaned).not.toContain('adr-0006');
    });

    test('decayGlobalTopology updates cached _SYSTEM_STATE records without losing the node id (#12070)', async () => {
        await GraphService.upsertNode({
            id        : '_SYSTEM_STATE',
            type      : 'SYSTEM_CLOCK',
            properties: {lastDecayedAt: 0}
        });
        await GraphService.upsertNode({id: 'DecaySource', type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'DecayTarget', type: 'TEST_NODE'});
        GraphService.linkNodes('DecaySource', 'DecayTarget', 'RELATES_TO', 1);

        expect(() => GraphService.decayGlobalTopology(0.98, 0.2, true)).not.toThrow();

        const systemNode = await GraphService.getNodeRecord({id: '_SYSTEM_STATE'});
        expect(typeof systemNode.properties.lastDecayedAt).toBe('number');
        expect(systemNode.properties.lastDecayedAt).toBeGreaterThan(0);
    });

    test('decayGlobalTopology preserves factual RESOLVES edges while pruning weak ambient edges (#12644)', async () => {
        await GraphService.upsertNode({id: 'pr-12644', type: 'PULL_REQUEST'});
        await GraphService.upsertNode({id: 'issue-12644', type: 'ISSUE'});
        await GraphService.upsertNode({id: 'AmbientSource', type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'AmbientTarget', type: 'TEST_NODE'});

        GraphService.linkNodes('pr-12644', 'issue-12644', 'RESOLVES', 0.05);
        GraphService.linkNodes('AmbientSource', 'AmbientTarget', 'RELATES_TO', 0.05);

        GraphService.decayGlobalTopology(0.5, 0.2, true);

        const edgeRow = GraphService.db.storage.db.prepare(`
            SELECT data
            FROM Edges
            WHERE source = ?
              AND target = ?
              AND type = ?
        `);

        const resolvesRow = edgeRow.get('pr-12644', 'issue-12644', 'RESOLVES');
        expect(resolvesRow).toBeTruthy();
        expect(JSON.parse(resolvesRow.data).properties.weight).toBe(0.05);

        expect(edgeRow.get('AmbientSource', 'AmbientTarget', 'RELATES_TO')).toBeUndefined();
    });

    test('getInboundStructuralSupport separates canonical protected facts from current decaying scent', async () => {
        await GraphService.upsertNode({id: 'discussion-15105', type: 'DISCUSSION'});

        for (const [index, type] of protectedEdgeTypes.entries()) {
            const source = `protected-source-${index}`;
            await GraphService.upsertNode({id: source, type: 'TEST_NODE'});
            GraphService.linkNodes(source, 'discussion-15105', type, 1)
        }

        await GraphService.upsertNode({id: 'scent-source', type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'blocker-source', type: 'TEST_NODE', properties: {state: 'OPEN'}});
        await GraphService.upsertNode({id: 'parent-source', type: 'ISSUE'});
        await GraphService.upsertNode({id: 'frontier', type: 'CONTEXT_FRONTIER'});
        await GraphService.upsertNode({id: 'outbound-target', type: 'TEST_NODE'});
        GraphService.linkNodes('scent-source', 'discussion-15105', 'GUIDES', 2);
        GraphService.linkNodes('frontier', 'discussion-15105', 'GUIDES', 3);
        GraphService.linkNodes('parent-source', 'discussion-15105', 'PARENT_OF', 1);
        GraphService.linkNodes('blocker-source', 'discussion-15105', 'BLOCKS', 5);
        GraphService.linkNodes('discussion-15105', 'outbound-target', 'RELATES_TO', 7);

        expect(GraphService.getInboundStructuralSupport({id: 'discussion-15105'})).toEqual({
            totalWeight      : protectedEdgeTypes.length + 6,
            decayingWeight   : 3,
            totalEdgeCount   : protectedEdgeTypes.length + 3,
            decayingEdgeCount: 2,
            hasOpenBlocker   : true,
            parentId         : 'parent-source'
        })
    });

    test('getInboundStructuralSupport propagates graph-store failures to the fail-loud caller', async () => {
        await GraphService.upsertNode({id: 'discussion-support-failure', type: 'DISCUSSION'});
        const originalGetAdjacentNodes = GraphService.db.getAdjacentNodes;

        GraphService.db.getAdjacentNodes = () => {
            throw new Error('simulated structural projection failure')
        };

        try {
            expect(() => GraphService.getInboundStructuralSupport({id: 'discussion-support-failure'}))
                .toThrow('simulated structural projection failure')
        } finally {
            GraphService.db.getAdjacentNodes = originalGetAdjacentNodes
        }
    });

    test('decayGlobalTopology preserves business ADVANCED_BY edges — advancement is a fact, not scent (#14446)', async () => {
        await GraphService.upsertNode({id: 'business-goal-search-share', type: 'BUSINESS_GOAL'});
        await GraphService.upsertNode({id: 'issue-14446',                type: 'ISSUE'});
        await GraphService.upsertNode({id: 'ScentSource',                type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'ScentTarget',                type: 'TEST_NODE'});

        GraphService.linkNodes('business-goal-search-share', 'issue-14446', 'ADVANCED_BY', 0.05);
        GraphService.linkNodes('ScentSource', 'ScentTarget', 'RELATES_TO', 0.05);

        GraphService.decayGlobalTopology(0.5, 0.2, true);

        const edgeRow = GraphService.db.storage.db.prepare(`
            SELECT data
            FROM Edges
            WHERE source = ?
              AND target = ?
              AND type = ?
        `);

        const advancedRow = edgeRow.get('business-goal-search-share', 'issue-14446', 'ADVANCED_BY');
        expect(advancedRow).toBeTruthy();
        expect(JSON.parse(advancedRow.data).properties.weight).toBe(0.05);

        expect(edgeRow.get('ScentSource', 'ScentTarget', 'RELATES_TO')).toBeUndefined();
    });

    test('decayGlobalTopology preserves mailbox read/authorization carriers — read state is record, not scent (#15973)', async () => {
        await GraphService.upsertNode({id: 'MESSAGE:decay-proof', type: 'MESSAGE'});
        await GraphService.upsertNode({id: '@decay-recipient',    type: 'AGENT_IDENTITY'});
        await GraphService.upsertNode({id: '@decay-sender',       type: 'AGENT_IDENTITY'});
        await GraphService.upsertNode({id: 'MailScentSource',     type: 'TEST_NODE'});
        await GraphService.upsertNode({id: 'MailScentTarget',     type: 'TEST_NODE'});

        // Seed every mailbox carrier at a weight ALREADY below the prune threshold — the exact
        // state the countdown produces. Read/archive state ride ON the per-recipient broadcast
        // edge (MailboxService markRead / archiveMessage), so survival must mean "with
        // properties intact", not merely "row exists".
        GraphService.linkNodes('MESSAGE:decay-proof', '@decay-recipient', 'DELIVERED_TO', 0.05, {
            archivedAt: '2026-07-02T00:00:00.000Z',
            readAt    : '2026-07-01T00:00:00.000Z'
        });
        GraphService.linkNodes('MESSAGE:decay-proof', '@decay-recipient', 'SENT_TO', 0.05);
        GraphService.linkNodes('MESSAGE:decay-proof', '@decay-sender',    'SENT_BY', 0.05);

        // Control: an unprotected edge at the same weight must still be pruned, so this spec
        // cannot pass by disabling decay itself.
        GraphService.linkNodes('MailScentSource', 'MailScentTarget', 'RELATES_TO', 0.05);

        // Storage read-back, not cache read-back: a durability assertion must be answered by
        // the durable store on principle. (decayGlobalTopology does call syncCache(), so the
        // cache is not known-stale here — which is precisely why cache agreement would prove
        // nothing on its own.)
        const edgeRow = GraphService.db.storage.db.prepare(`
            SELECT data
            FROM Edges
            WHERE source = ?
              AND target = ?
              AND type = ?
        `);

        // Self-validating seed: prove the read state landed in storage BEFORE decay runs,
        // so a green survival assertion cannot be a seeding artifact.
        const seededProps = JSON.parse(edgeRow.get('MESSAGE:decay-proof', '@decay-recipient', 'DELIVERED_TO').data).properties;
        expect(seededProps.readAt).toBe('2026-07-01T00:00:00.000Z');

        GraphService.decayGlobalTopology(0.5, 0.2, true);

        const deliveredRow = edgeRow.get('MESSAGE:decay-proof', '@decay-recipient', 'DELIVERED_TO');
        expect(deliveredRow).toBeTruthy();

        const deliveredProps = JSON.parse(deliveredRow.data).properties;
        expect(deliveredProps.readAt).toBe('2026-07-01T00:00:00.000Z');
        expect(deliveredProps.archivedAt).toBe('2026-07-02T00:00:00.000Z');
        expect(deliveredProps.weight).toBe(0.05);

        expect(edgeRow.get('MESSAGE:decay-proof', '@decay-recipient', 'SENT_TO')).toBeTruthy();
        expect(edgeRow.get('MESSAGE:decay-proof', '@decay-sender',    'SENT_BY')).toBeTruthy();

        expect(edgeRow.get('MailScentSource', 'MailScentTarget', 'RELATES_TO')).toBeUndefined();
    });

    test('getNodeRecord returns the properties blob that getNode strips (#11637)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        await GraphService.upsertNode({
            id        : 'kb-config:tenant-alpha',
            type      : 'KnowledgeBaseTenantConfig',
            properties: {useDefaultSources: true, customParsers: [{parserId: 'p1'}], version: 3}
        });

        const record = await GraphService.getNodeRecord({id: 'kb-config:tenant-alpha'});
        expect(record.id).toBe('kb-config:tenant-alpha');
        expect(record.type).toBe('KnowledgeBaseTenantConfig');
        expect(record.properties.useDefaultSources).toBe(true);
        expect(record.properties.customParsers).toEqual([{parserId: 'p1'}]);
        expect(record.properties.version).toBe(3);

        // getNode projects only hoisted fields — the structured payload is absent.
        const projected = await GraphService.getNode({id: 'kb-config:tenant-alpha'});
        expect(projected.properties).toBeUndefined();

        // Absent id → null.
        expect(await GraphService.getNodeRecord({id: 'kb-config:does-not-exist'})).toBe(null);
    });

    test('getNode opt-in full projection: lean default byte-identical, full adds the properties bag (#15430)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        await GraphService.upsertNode({
            id        : '@projection-witness',
            type      : 'AgentIdentity',
            properties: {name: 'Projection Witness', participationStatus: 'active_full_member', modelFamily: 'kimi', trustTier: 'probation'}
        });

        // the lean regression pin: the DEFAULT projection stays byte-identical to the pre-opt-in
        // contract — exactly the six hoisted fields, never a properties key
        const lean = await GraphService.getNode({id: '@projection-witness'});
        expect(Object.keys(lean).sort()).toEqual(['description', 'id', 'name', 'semanticVectorId', 'state', 'type']);
        expect(lean.properties).toBeUndefined();

        // full = the SAME lean shape plus the complete properties bag (a superset, not a
        // different shape) — the identity probe is answerable through the graph's own read verb
        const full = await GraphService.getNode({id: '@projection-witness', projection: 'full'});
        expect(full).toMatchObject(lean);
        expect(full.properties.participationStatus).toBe('active_full_member');
        expect(full.properties.modelFamily).toBe('kimi');
        expect(full.properties.trustTier).toBe('probation');

        // an absent node stays null in both projections — full widens what a node shows,
        // never whether one exists
        expect(await GraphService.getNode({id: '@projection-absent', projection: 'full'})).toBe(null);
    });

    test('the full projection is type-allowlisted: a shared-row MESSAGE can never reveal bodyText through getNode (#15430)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        // the reviewer falsifier, pinned: MESSAGE rows are deliberately RLS-moot
        // (sharedEntity: true — every requester sees the row) while the BODY is guarded by the
        // mailbox audience edges (MailboxService.getMessage). Row visibility is not field
        // authorization — the full projection must refuse the raw bag for non-allowlisted types.
        await GraphService.upsertNode({
            id        : 'MESSAGE:projection-guard',
            type      : 'MESSAGE',
            properties: {name: 'audience-gated message', bodyText: 'SECRET-BODY-NEVER-THROUGH-GET-NODE', sharedEntity: true}
        });

        const full = await GraphService.getNode({id: 'MESSAGE:projection-guard', projection: 'full'});

        // the row IS visible (shared), the shape IS the lean projection — no properties key, and
        // the guarded body appears nowhere in the answer
        expect(full).toBeTruthy();
        expect(full.properties).toBeUndefined();
        expect(Object.keys(full).sort()).toEqual(['description', 'id', 'name', 'semanticVectorId', 'state', 'type']);
        expect(JSON.stringify(full)).not.toContain('SECRET-BODY-NEVER-THROUGH-GET-NODE');
    });

    test('getNodeRecord applies the #10011 RLS visibility re-check (#11637)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        let   mockIdentity  = '@tenant-alpha';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Written as tenant-alpha → upsertNode auto-stamps properties.userId.
            await GraphService.upsertNode({
                id        : 'kb-config:tenant-alpha',
                type      : 'KnowledgeBaseTenantConfig',
                properties: {useDefaultSources: false, version: 1}
            });

            // Force a disk reload so the RLS re-check runs against a cache-warmed node.
            GraphService.db.nodes.clearSilent();

            // Owner reads its own record.
            mockIdentity = '@tenant-alpha';
            const ownRecord = await GraphService.getNodeRecord({id: 'kb-config:tenant-alpha'});
            expect(ownRecord?.properties.version).toBe(1);

            // Cross-tenant read → null, not a leak.
            mockIdentity = '@tenant-beta';
            expect(await GraphService.getNodeRecord({id: 'kb-config:tenant-alpha'})).toBe(null);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('listNodeRecordsByType enumerates visible typed records with optional id prefix (#14404)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');

        await GraphService.upsertNode({
            id        : 'kb-config:tenant-alpha',
            type      : 'KnowledgeBaseTenantConfig',
            properties: {tenantId: 'tenant-alpha', tenantRepos: [], visibility: 'team'}
        });
        await GraphService.upsertNode({
            id        : 'kb-config:tenant-beta',
            type      : 'KnowledgeBaseTenantConfig',
            properties: {tenantId: 'tenant-beta', tenantRepos: [], visibility: 'team'}
        });
        await GraphService.upsertNode({
            id        : 'kb-manifest:tenant-alpha',
            type      : 'KnowledgeBaseTenantManifest',
            properties: {tenantId: 'tenant-alpha', visibility: 'team'}
        });

        const {records} = GraphService.listNodeRecordsByType({
            type    : 'KnowledgeBaseTenantConfig',
            idPrefix: 'kb-config:'
        });

        expect(records.map(record => record.id)).toEqual([
            'kb-config:tenant-alpha',
            'kb-config:tenant-beta'
        ]);
        expect(records[0]).toMatchObject({
            id        : 'kb-config:tenant-alpha',
            type      : 'KnowledgeBaseTenantConfig',
            properties: {tenantId: 'tenant-alpha'}
        });
    });

    test('listNodeRecordsByType applies the #10011 RLS visibility re-check (#14404)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        let   mockIdentity  = '@tenant-alpha';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            await GraphService.upsertNode({
                id        : 'kb-config:tenant-alpha-private',
                type      : 'KnowledgeBaseTenantConfig',
                properties: {tenantId: 'tenant-alpha-private', tenantRepos: []}
            });

            GraphService.db.nodes.clearSilent();

            mockIdentity = '@tenant-alpha';
            expect(GraphService.listNodeRecordsByType({
                type    : 'KnowledgeBaseTenantConfig',
                idPrefix: 'kb-config:tenant-alpha'
            }).records.map(record => record.id)).toEqual(['kb-config:tenant-alpha-private']);

            mockIdentity = '@tenant-beta';
            expect(GraphService.listNodeRecordsByType({
                type    : 'KnowledgeBaseTenantConfig',
                idPrefix: 'kb-config:tenant-alpha'
            }).records).toEqual([]);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('cold SQLite lazy-load recovers an owner\'s own normalized-user_id node (#13571)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        let   mockIdentity  = '@tenant-gamma';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        const recool = () => {
            const wasAutoSave = GraphService.db.autoSave;
            GraphService.db.autoSave = false;
            GraphService.db.nodes.clear();
            GraphService.db.vicinityLoadedNodes.clear();
            GraphService.db.autoSave = wasAutoSave;
        };

        try {
            // Seed directly into SQLite with a NORMALIZED (no-`@`) user_id — the form MemoryService
            // writes and the old @-form-only cold predicate filtered out. Bypasses upsertNode's stamp.
            GraphService.db.storage.addNodes([{
                id        : 'cold-own-normalized',
                label     : 'TestNode',
                properties: {userId: 'tenant-gamma', name: 'cold own normalized'}
            }]);

            // Owner reads its own normalized-user_id node through the COLD lazy-load (loadNodeVicinitySync).
            recool();
            mockIdentity = '@tenant-gamma';
            expect((await GraphService.getNode({id: 'cold-own-normalized'}))?.id).toBe('cold-own-normalized');

            // Cross-tenant read on the persisted path → null (no widening on the cold load either).
            recool();
            mockIdentity = '@tenant-delta';
            expect(await GraphService.getNode({id: 'cold-own-normalized'})).toBe(null);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('upsertNode stamps the normalized canonical user_id, not the @-form node id (#13578)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => '@tenant-writer';

        try {
            await GraphService.upsertNode({id: 'write-canon-node', label: 'TestNode'});
            await new Promise(resolve => setTimeout(resolve, 50));   // let the Store → SQLite projection flush

            // The persisted user_id COLUMN (what RLS filters on) must be the normalized form, never the @-form.
            const row = GraphService.db.storage.db.prepare('SELECT user_id FROM Nodes WHERE id = ?').get('write-canon-node');
            expect(row?.user_id).toBe('tenant-writer');
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('preBriefSession should hydrate episodic context through getNeighbors semanticVectorId', async () => {
        await GraphService.upsertNode({id: 'EpicA', name: 'Roadmap Planner'});
        await GraphService.upsertNode({id: 'MemoryA', name: 'Session Summary', semanticVectorId: 'summary-vector-1'});
        await GraphService.linkNodes('EpicA', 'MemoryA', 'RELATES_TO', 0.9);

        const StorageRouter = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        const MemoryService = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;

        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const getCalls                     = [];

        StorageRouter.getSummaryCollection = async () => ({
            async get(args) {
                getCalls.push(args);
                return {documents: ['Hydrated episodic context']};
            }
        });

        try {
            const brief = await MemoryService.preBriefSession({targetId: 'EpicA', limit: 5});

            expect(getCalls).toHaveLength(1);
            expect(getCalls[0].ids).toEqual(['summary-vector-1']);
            expect(brief.context).toHaveLength(1);
            expect(brief.context[0].id).toBe('MemoryA');
            expect(brief.context[0].episodicContext).toBe('Hydrated episodic context');
        } finally {
            StorageRouter.getSummaryCollection = originalGetSummaryCollection;
        }
    });

    test('should dynamically compute getNodeGravity natively', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        await GraphService.upsertNode({id: 'NodeA'});
        await GraphService.upsertNode({id: 'NodeB'});
        await GraphService.upsertNode({id: 'NodeC'});
        await GraphService.upsertNode({id: 'NodeD'});

        await GraphService.linkNodes('NodeA', 'NodeB', 'DEPENDS_ON');
        await GraphService.linkNodes('NodeA', 'NodeC', 'IMPLEMENTS');
        await GraphService.linkNodes('NodeD', 'NodeA', 'RELATES_TO');

        const gravityA = await GraphService.getNodeGravity('NodeA');
        const gravityB = await GraphService.getNodeGravity('NodeB');

        // NodeA out:2 (NodeB, NodeC), in:1 (NodeD)
        expect(gravityA.out_degree).toBe(2);
        expect(gravityA.in_degree).toBe(1);

        // NodeB out:0, in:1 (NodeA)
        expect(gravityB.out_degree).toBe(0);
        expect(gravityB.in_degree).toBe(1);
    });

    test('should correctly expose getContextFrontier topology', async () => {
        await GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR'});
        await GraphService.upsertNode({id: 'EpicB'});

        // Weight < 0.8 should be filtered out by getContextFrontier originally
        await GraphService.linkNodes('frontier', 'EpicB', 'STRATEGIC_PIVOT', 0.9);

        const topology = await GraphService.getContextFrontier();
        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('EpicB');
    });

    test('should trigger a SQLite lazy-load on cache miss when fetching a Node', async () => {
        await GraphService.upsertNode({id: 'LazyNode', name: 'Wait For It'});
        await GraphService.upsertNode({id: 'ConnectedNode', name: 'Linked'});
        await GraphService.linkNodes('LazyNode', 'ConnectedNode', 'TEST_LINK', 1.0);

        // Let the asynchronous store mutations propagate to SQLite natively
        await new Promise(resolve => setTimeout(resolve, 50));

        let wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;

        // Explicitly clear RAM cache WITHOUT cascading to SQLite
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        GraphService.db.autoSave = wasAutoSave;

        // Access via getNeighbors which should trigger SQLite rehydration
        const {neighbors} = await GraphService.getNeighbors({id: 'LazyNode'});
        expect(neighbors.length).toBe(1);
        expect(neighbors[0].id).toBe('ConnectedNode');
        expect(neighbors[0].relationship).toBe('TEST_LINK');

        // Verify the node itself is fully rehydrated in RAM
        const rehydratedNode = await GraphService.getNode({id: 'LazyNode'});
        expect(rehydratedNode.id).toBe('LazyNode');
        expect(rehydratedNode.name).toBe('Wait For It');

        // Verify it actually placed it back into the in-memory map
        expect(GraphService.db.nodes.has('LazyNode')).toBe(true);
    });

    test('upsertNode should lazy-load from SQLite to prevent cold-cache stub overwriting (resolves #10230)', async () => {
        // Bypass upsertNode to simulate a rich node seeded directly into SQLite
        GraphService.db.storage.addNodes([{
            id        : '@test-identity',
            label     : 'AgentIdentity',
            properties: {
                name       : 'Test Identity',
                githubLogin: 'test-user',
                createdAt  : '2026-04-23T00:00:00Z'
            }
        }]);

        // Let the asynchronous store mutations propagate natively
        await new Promise(resolve => setTimeout(resolve, 50));

        // Simulate cold cache
        GraphService.db.nodes.clear();

        // Perform the upsert with a stub payload
        await GraphService.upsertNode({id: '@test-identity', type: 'AGENT'});

        // Wait for potential async writes
        await new Promise(resolve => setTimeout(resolve, 50));

        // Re-read directly from SQLite to assert nothing was overwritten
        const rows = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').all('@test-identity');
        expect(rows.length).toBe(1);
        const data = JSON.parse(rows[0].data);

        expect(data.label).toBe('AGENT'); // Type is updated
        expect(data.properties.name).toBe('Test Identity'); // Original properties preserved
        expect(data.properties.githubLogin).toBe('test-user');
        expect(data.properties.createdAt).toBe('2026-04-23T00:00:00Z');
    });

    test('should recover from boot-time identity cache race (stuck vicinity cache)', async () => {
        await GraphService.upsertNode({id: '@neo-opus-ada', name: 'Identity Node'});

        // Let the asynchronous store mutations propagate to SQLite natively
        await new Promise(resolve => setTimeout(resolve, 50));

        let wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;

        try {
            // Simulate the stuck state: vicinityLoadedNodes marks the nodeId as "loaded"
            // but db.nodes doesn't have it (the broken state we saw in production)
            GraphService.db.nodes.clear();
            GraphService.db.vicinityLoadedNodes.add('@neo-opus-ada');
        } finally {
            GraphService.db.autoSave = wasAutoSave;
        }

        // Note: GraphService.getNode('@neo-opus-ada') directly would return null here.
        // We simulate the bindAgentIdentity retry logic that explicitly deletes the stuck cache.
        let retries        = 3;
        let rehydratedNode = null;
        while (retries > 0) {
            rehydratedNode = await GraphService.getNode({id: '@neo-opus-ada'});
            if (rehydratedNode) break;

            if (GraphService.db && GraphService.db.vicinityLoadedNodes) {
                GraphService.db.vicinityLoadedNodes.delete('@neo-opus-ada');
            }
            // Use 50ms interval for faster test execution instead of the 200ms prod value
            await new Promise(resolve => setTimeout(resolve, 50));
            retries--;
        }

        expect(rehydratedNode).toBeTruthy();
        expect(rehydratedNode.id).toBe('@neo-opus-ada');
        expect(rehydratedNode.name).toBe('Identity Node');

        // Verify it actually placed it back into the in-memory map
        expect(GraphService.db.nodes.has('@neo-opus-ada')).toBe(true);
    });

    test('should lazy-load topology for getContextFrontier when frontiers drop out of cache', async () => {
        await GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'AnchorData'});
        await GraphService.upsertNode({id: 'StrategicTarget', name: 'SecretGoal'});
        await GraphService.linkNodes('frontier', 'StrategicTarget', 'FOCUS', 1.0);

        // Let the asynchronous store mutations propagate to SQLite natively
        await new Promise(resolve => setTimeout(resolve, 50));

        let wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;

        // Wipe RAM cache to simulate memory eviction over time WITHOUT cascading to SQLite
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        GraphService.db.autoSave = wasAutoSave;

        // The method should seamlessly recover the topology from SQLite
        const topology = await GraphService.getContextFrontier();

        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.frontier.name).toBe('AnchorData');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('StrategicTarget');
        expect(topology.strategicNeighbors[0].name).toBe('SecretGoal');
    });

    test('should execute getPaths and lazy-load recursively across deep dependencies when RAM cache is missed', async () => {
        await GraphService.upsertNode({id: 'Root', name: 'Starting Point'});
        await GraphService.upsertNode({id: 'Depth1', name: 'First Hop'});
        await GraphService.upsertNode({id: 'Depth2', name: 'Second Hop'});
        await GraphService.upsertNode({id: 'Depth3', name: 'Final Hop'});

        await GraphService.linkNodes('Root', 'Depth1', 'CHAIN', 1.0);
        await GraphService.linkNodes('Depth1', 'Depth2', 'CHAIN', 1.0);
        await GraphService.linkNodes('Depth2', 'Depth3', 'CHAIN', 1.0);

        // Let the asynchronous store mutations propagate to SQLite natively
        await new Promise(resolve => setTimeout(resolve, 50));

        let wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;

        // Explicitly clear RAM cache WITHOUT cascading to SQLite
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        GraphService.db.autoSave = wasAutoSave;

        // Traverse using getPaths. Depth parameter is set to 3 to hit all nodes.
        // It relies on getting immediate edges at each layer recursively.
        let results = getPaths(GraphService.db, 'Root', {maxDepth: 3});

        // Depth 0: Root
        // Depth 1: Depth1
        // Depth 2: Depth2
        // Depth 3: Depth3
        expect(results.length).toBe(4);

        let pathIds = results.map(n => n.id).sort();
        expect(pathIds).toEqual(['Depth1', 'Depth2', 'Depth3', 'Root']);

        // Verify that deeply resolved nodes were structurally hydrated into memory
        expect(GraphService.db.nodes.has('Depth3')).toBe(true);
        expect((await GraphService.getNode({id: 'Depth3'})).name).toBe('Final Hop');
    });

    test('should automatically execute LRU garbage collection Native Graph footprints when maxGraphNodes is exceeded', async () => {
        // Guarantee pristine isolated boundary baseline natively for this LRU physics test exclusively smoothly
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.lastAccessMap.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        // Set maximum capacity constraint to 3 nodes
        GraphService.db.maxGraphNodes = 3;

        await GraphService.upsertNode({id: 'N1', name: 'First'});
        await GraphService.getNode({id: 'N1'}); // Register to LRU Matrix natively

        // Let timestamp differential tick natively avoiding micro-millisecond collisions gracefully
        await new Promise(resolve => setTimeout(resolve, 5));
        await GraphService.upsertNode({id: 'N2', name: 'Second'});
        await GraphService.getNode({id: 'N2'});

        await new Promise(resolve => setTimeout(resolve, 5));
        await GraphService.upsertNode({id: 'N3', name: 'Third'});
        await GraphService.getNode({id: 'N3'});

        // V8 footprint holds 3 items flawlessly locally smoothly
        expect(GraphService.db.nodes.getCount()).toBe(3);
        expect(GraphService.db.nodes.has('N1')).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 5));

        // This 4th insert will push the length over 3 when accessed.
        await GraphService.upsertNode({id: 'N4', name: 'Fourth'});
        await GraphService.getNode({id: 'N4'}); // GC fires here natively!

        // V8 footprint must hold 3 items cleanly locally natively. Output should be N2, N3, N4
        expect(GraphService.db.nodes.getCount()).toBe(3);

        expect(GraphService.db.nodes.has('N1')).toBe(false); // N1 dropped out of cache natively gracefully!
        expect(GraphService.db.nodes.has('N2')).toBe(true);
        expect(GraphService.db.nodes.has('N3')).toBe(true);
        expect(GraphService.db.nodes.has('N4')).toBe(true);

        // Restore maxGraphNodes constraint cleanly safely natively
        GraphService.db.maxGraphNodes = null;
    });

    test('should resolve queryNodeTopology correctly formatting root and neighbors', async () => {
        await GraphService.upsertNode({id: 'RootT', name: 'Topology Start'});
        await GraphService.upsertNode({id: 'AdjacentT', name: 'Adjacency Target', semanticVectorId: 'vec-123'});
        await GraphService.upsertNode({id: 'DeepT', name: 'Deep Target', semanticVectorId: 'vec-456'});

        await GraphService.linkNodes('RootT', 'AdjacentT', 'REFERENCES', 0.95);
        await GraphService.linkNodes('AdjacentT', 'DeepT', 'REFERENCES', 0.85);

        // Fetch using the new endpoint topology function - depth 1
        const topology1 = await GraphService.queryNodeTopology({nodeId: 'RootT', maxDepth: 1});

        // Verify root mapping
        expect(topology1).toBeDefined();
        expect(topology1.root.id).toBe('RootT');
        expect(topology1.root.name).toBe('Topology Start');

        // Verify boundaries (depth 1 shouldn't include DeepT)
        expect(topology1.nodes.length).toBe(2);
        expect(topology1.edges.length).toBe(1);
        expect(topology1.nodes.find(n => n.id === 'AdjacentT')).toBeDefined();
        expect(topology1.nodes.find(n => n.id === 'DeepT')).toBeUndefined();

        // Fetch using depth 2
        const topology2 = await GraphService.queryNodeTopology({nodeId: 'RootT', maxDepth: 2});
        expect(topology2.nodes.length).toBe(3);
        expect(topology2.edges.length).toBe(2);
        expect(topology2.nodes.find(n => n.id === 'DeepT').semanticVectorId).toBe('vec-456');

        // Check edge logic
        const link = topology2.edges.find(e => e.target === 'AdjacentT');
        expect(link.relationship).toBe('REFERENCES');
        expect(link.weight).toBe(0.95);
        expect(link.source).toBe('RootT');
    });

    test('linkNodes handles WAL-snapshot lag via cache-warm retry mechanism', async () => {
        // We simulate WAL snapshot lag by ensuring the node is NOT in SQLite during the first FK check,
        // but appears in SQLite exactly when the cache-warm mechanism is triggered.

        await GraphService.upsertNode({ id: 'AnchorNode', type: 'AGENT', name: 'Anchor', properties: {} });

        expect(GraphService.db.nodes.has('GhostNode')).toBe(false);

        // Spy on getAdjacentNodes to simulate another process writing the node during the cache-warm retry
        const originalGetAdjacent = GraphService.db.getAdjacentNodes.bind(GraphService.db);
        let   cacheWarmTriggered  = false;

        GraphService.db.getAdjacentNodes = (nodeId, direction, type) => {
            if (nodeId === 'GhostNode') {
                cacheWarmTriggered = true;
                // Simulate peer process writing the Node into SQLite exactly now
                GraphService.db.storage.db.exec(`
                    INSERT INTO Nodes (id, data) VALUES (
                        'GhostNode',
                        json('{"id":"GhostNode","label":"AGENT","properties":{"name":"Ghost"}}')
                    )
                `);
            }
            return originalGetAdjacent(nodeId, direction, type);
        };

        // linkNodes should hit the first FK check failure (count=1), trigger cache warm, find the ghost, and succeed
        await GraphService.linkNodes('AnchorNode', 'GhostNode', 'SEES_GHOST', 1.0);

        // Restore original method
        GraphService.db.getAdjacentNodes = originalGetAdjacent;

        // Verify the cache warm was actually triggered
        expect(cacheWarmTriggered).toBe(true);

        // Verify the edge was created successfully after the retry
        const edgeCount = GraphService.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE source = ? AND target = ?').get('AnchorNode', 'GhostNode').count;
        expect(edgeCount).toBe(1);

        // Verify cache warming pulled the ghost node into memory
        expect(GraphService.db.nodes.has('GhostNode')).toBe(true);
    });

    // ----------------------------------------------------------------------------------------
    // linkNodesAsync + ensureNodeExists + normalizeGraphNodeId — lazy back-fill path.
    // Sync `linkNodes` preserved unchanged for existing callers; these tests exercise the
    // async path that resolves missing endpoints via `MemorySessionIngestor.ingestSingleRow`.
    // ----------------------------------------------------------------------------------------

    test('normalizeGraphNodeId lowercases memory:/session: prefixes and passes others through', async () => {
        expect(await GraphService.normalizeGraphNodeId('MEMORY:abc')).toBe('memory:abc');
        expect(await GraphService.normalizeGraphNodeId('memory:abc')).toBe('memory:abc');
        expect(await GraphService.normalizeGraphNodeId('SESSION:xyz')).toBe('session:xyz');
        expect(await GraphService.normalizeGraphNodeId('session:xyz')).toBe('session:xyz');
        expect(await GraphService.normalizeGraphNodeId('CONCEPT:foo')).toBe('CONCEPT:foo');
        expect(await GraphService.normalizeGraphNodeId('frontier')).toBe('frontier');
        expect(await GraphService.normalizeGraphNodeId(null)).toBe(null);
        expect(await GraphService.normalizeGraphNodeId('')).toBe('');
    });

    test('linkNodesAsync creates the edge when both endpoints already exist', async () => {
        await GraphService.upsertNode({id: 'NodeA', type: 'TEST', name: 'A', properties: {}});
        await GraphService.upsertNode({id: 'NodeB', type: 'TEST', name: 'B', properties: {}});

        const ok = await GraphService.linkNodesAsync('NodeA', 'NodeB', 'RELATES_TO', 1.0);

        expect(ok).toBe(true);
        const edge = GraphService.db.edges.items.find(e =>
            e.source === 'NodeA' && e.target === 'NodeB' && e.type === 'RELATES_TO'
        );
        expect(edge).toBeTruthy();
    });

    test('linkNodesAsync back-fills missing memory: target via MemorySessionIngestor', async () => {
        const MemorySessionIngestor = (await import('../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        const originalIngest        = MemorySessionIngestor.ingestSingleRow;

        // Mock the ingestor to simulate a verified raw-row back-fill.
        MemorySessionIngestor.ingestSingleRow = async (id) => {
            expect(id).toBe('memory:lazy-xyz');
            await GraphService.upsertNode({id: 'lazy-xyz', type: 'AGENT_MEMORY', name: 'lazy-xyz', properties: {backfilled: true, chromaId: 'lazy-xyz'}});
            return {success: true, reason: 'backfilled', graphNodeId: 'lazy-xyz'};
        };

        try {
            await GraphService.upsertNode({id: 'NodeSrc', type: 'TEST', name: 'Src', properties: {}});

            const ok = await GraphService.linkNodesAsync('NodeSrc', 'memory:lazy-xyz', 'MENTIONED_IN', 1.0);

            expect(ok).toBe(true);
            expect(GraphService.db.nodes.get('lazy-xyz')?.label).toBe('AGENT_MEMORY');
            expect(GraphService.db.nodes.get('memory:lazy-xyz')).toBeFalsy();
            const edge = GraphService.db.edges.items.find(e =>
                e.source === 'NodeSrc' && e.target === 'lazy-xyz' && e.type === 'MENTIONED_IN'
            );
            expect(edge).toBeTruthy();
        } finally {
            MemorySessionIngestor.ingestSingleRow = originalIngest;
        }
    });

    test('linkNodesAsync resolves an uppercase raw-memory request to the bare canonical node', async () => {
        const MemorySessionIngestor = (await import('../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        const originalIngest        = MemorySessionIngestor.ingestSingleRow;

        MemorySessionIngestor.ingestSingleRow = async (id) => {
            // Prefix grammar is normalized before the Chroma-backed resolver sees it, but the
            // verified raw row returns the existing AGENT_MEMORY identity.
            expect(id).toBe('memory:upper-case-id');
            await GraphService.upsertNode({id: 'upper-case-id', type: 'AGENT_MEMORY', name: 'UC', properties: {backfilled: true, chromaId: 'upper-case-id'}});
            return {success: true, reason: 'backfilled', graphNodeId: 'upper-case-id'};
        };

        try {
            await GraphService.upsertNode({id: 'NodeSrc2', type: 'TEST', name: 'Src', properties: {}});

            // Caller passes uppercase prefix. The persisted edge must follow the resolver's returned
            // canonical identity, not the pre-resolution prefix normalization.
            const ok = await GraphService.linkNodesAsync('NodeSrc2', 'MEMORY:upper-case-id', 'REFERENCED_BY', 1.0);

            expect(ok).toBe(true);
            expect(GraphService.db.nodes.get('upper-case-id')?.label).toBe('AGENT_MEMORY');
            expect(GraphService.db.nodes.get('memory:upper-case-id')).toBeFalsy();
            expect(GraphService.db.nodes.get('MEMORY:upper-case-id')).toBeFalsy();
            const edge = GraphService.db.edges.items.find(e =>
                e.target === 'upper-case-id' && e.type === 'REFERENCED_BY'
            );
            expect(edge).toBeTruthy();
        } finally {
            MemorySessionIngestor.ingestSingleRow = originalIngest;
        }
    });

    test('linkNodesAsync preserves a cache-cold semantic MEMORY node with no raw Chroma provenance', async () => {
        await GraphService.upsertNode({id: 'NodeSemanticSrc', type: 'TEST', name: 'Src', properties: {}});
        GraphService.db.storage.addNodes([{
            id        : 'memory:semantic-cold',
            label     : 'MEMORY',
            properties: {concept: 'curated', userId: null}
        }]);
        GraphService.db.nodes.remove('memory:semantic-cold');
        GraphService.db.vicinityLoadedNodes.delete('memory:semantic-cold');

        const ok = await GraphService.linkNodesAsync(
            'NodeSemanticSrc',
            'MEMORY:semantic-cold',
            'REFERENCED_BY',
            1.0
        );

        expect(ok).toBe(true);
        expect(GraphService.db.nodes.get('memory:semantic-cold')?.label).toBe('MEMORY');
        expect(GraphService.db.nodes.get('semantic-cold')).toBeFalsy();
        expect(GraphService.db.edges.items.some(edge =>
            edge.source === 'NodeSemanticSrc' &&
            edge.target === 'memory:semantic-cold' &&
            edge.type === 'REFERENCED_BY'
        )).toBe(true)
    });

    test('linkNodesAsync returns false when back-fill fails (hallucinated target)', async () => {
        const MemorySessionIngestor = (await import('../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        const originalIngest        = MemorySessionIngestor.ingestSingleRow;

        MemorySessionIngestor.ingestSingleRow = async (id) => ({
            success    : false,
            reason     : 'chroma-row-not-found',
            graphNodeId: id
        });

        try {
            await GraphService.upsertNode({id: 'NodeSrc3', type: 'TEST', name: 'Src', properties: {}});

            const ok = await GraphService.linkNodesAsync('NodeSrc3', 'memory:does-not-exist', 'MENTIONED_IN', 1.0);

            expect(ok).toBe(false);
            // No edge created — genuine hallucination, cull stands.
            const edge = GraphService.db.edges.items.find(e =>
                e.source === 'NodeSrc3' && e.target === 'memory:does-not-exist'
            );
            expect(edge).toBeFalsy();
        } finally {
            MemorySessionIngestor.ingestSingleRow = originalIngest;
        }
    });

    test('linkNodesAsync returns false for unrecognized-prefix targets (non-back-fillable)', async () => {
        await GraphService.upsertNode({id: 'NodeSrc4', type: 'TEST', name: 'Src', properties: {}});

        // No mock needed — ingestSingleRow will return {success: false, reason: 'unrecognized-prefix'}
        // for the CONCEPT: prefix (not a memory:/session: target).
        const ok = await GraphService.linkNodesAsync('NodeSrc4', 'CONCEPT:not-a-node', 'RELATES_TO', 1.0);

        expect(ok).toBe(false);
    });

    test('ensureNodeExists returns true when node already in graph', async () => {
        await GraphService.upsertNode({id: 'memory:present', type: 'MEMORY', name: 'present', properties: {}});

        const ready = await GraphService.ensureNodeExists('memory:present');

        expect(ready).toBe(true);
    });

    test('should auto-provision all identity roots at boot via initAsync', async () => {
        // Guarantee pristine isolated boundary baseline natively
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }

        // Wipe the init promise and db to force complete re-initialization
        GraphService._initPromise = null;
        GraphService.db = null;

        // Run the boot sequence
        await GraphService.initAsync();

        // Assert the system sender plus core identities are present with correct types
        const system = await GraphService.getNode({id: '@system'});
        expect(system).toBeTruthy();
        expect(system.type).toBe('System');

        const geminiPro = await GraphService.getNode({id: '@neo-gemini-pro'});
        expect(geminiPro).toBeTruthy();
        expect(geminiPro.type).toBe('AgentIdentity');

        const claudeOpus = await GraphService.getNode({id: '@neo-opus-ada'});
        expect(claudeOpus).toBeTruthy();
        expect(claudeOpus.type).toBe('AgentIdentity');

        const tobiu = await GraphService.getNode({id: '@tobiu'});
        expect(tobiu).toBeTruthy();
        expect(tobiu.type).toBe('AgentIdentity');

        const broadcast = await GraphService.getNode({id: 'AGENT:*'});
        expect(broadcast).toBeTruthy();
        expect(broadcast.type).toBe('BroadcastSentinel');
    });

    test('boot provisioning adds missing identity roots without rewriting persisted state (#15431)', () => {
        const
            existingId       = '@boot-existing',
            missingId        = '@boot-missing',
            persistedCreated = '2026-07-19T19:15:34.000Z';

        // Simulate a graph projection that is newer than this process-local registry snapshot.
        // Writing through storage keeps the falsifier on the persisted authority, not RAM alone.
        GraphService.db.storage.addNodes([{
            id        : existingId,
            label     : 'AgentIdentity',
            properties: {
                createdAt          : persistedCreated,
                displayName        : 'Persisted Iris',
                participationStatus: 'active',
                runtimeWitness     : 'must-survive'
            }
        }]);

        GraphService.db.nodes.clearSilent();
        GraphService.db.vicinityLoadedNodes.delete(existingId);

        const before  = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(existingId).data;
        const created = GraphService.provisionMissingIdentityRoots([{
            id        : existingId,
            type      : 'AgentIdentity',
            name      : 'Stale local identity',
            properties: {
                createdAt          : '2026-07-19T09:40:49.000Z',
                displayName        : 'Neo Kimi Iris',
                participationStatus: 'temporarily_unreachable'
            }
        }, {
            id        : missingId,
            type      : 'AgentIdentity',
            name      : 'Fresh identity',
            properties: {
                createdAt          : '2026-07-19T20:00:00.000Z',
                participationStatus: 'temporarily_unreachable'
            }
        }]);

        const
            after   = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(existingId).data,
            missing = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(missingId).data);

        expect(created).toBe(1);
        expect(after).toBe(before);
        expect(JSON.parse(after).properties).toMatchObject({
            createdAt          : persistedCreated,
            displayName        : 'Persisted Iris',
            participationStatus: 'active',
            runtimeWitness     : 'must-survive'
        });
        expect(missing).toMatchObject({
            id        : missingId,
            label     : 'AgentIdentity',
            properties: {participationStatus: 'temporarily_unreachable', userId: null}
        });
    });

    test('boot and recovery share one exact idempotent seed manifest', () => {
        const
            manifest = createGraphBootSeedManifest(),
            first    = GraphService.provisionMissingBootSeeds(manifest),
            db       = GraphService.db.storage.db,
            before   = db.prepare(`
                SELECT data
                FROM Edges
                WHERE source = 'frontier'
                  AND target = 'Neo-Master-Architecture'
                  AND type = 'SYSTEM_TENET'
            `).get().data,
            second   = GraphService.provisionMissingBootSeeds(manifest),
            after    = db.prepare(`
                SELECT data
                FROM Edges
                WHERE source = 'frontier'
                  AND target = 'Neo-Master-Architecture'
                  AND type = 'SYSTEM_TENET'
            `).get().data,
            freshness = evaluateGraphBootSeedFreshness({
                nodes: db.prepare('SELECT data FROM Nodes').all(),
                edges: db.prepare('SELECT data FROM Edges').all(),
                manifest
            });

        expect(first).toEqual({
            nodesCreated: manifest.nodes.length,
            edgesCreated: manifest.edges.length
        });
        expect(second).toEqual({nodesCreated: 0, edgesCreated: 0});
        expect(after).toBe(before);
        expect(freshness).toMatchObject({
            fresh    : true,
            nodeCount: manifest.nodes.length,
            edgeCount: manifest.edges.length
        })
    });

    test('cross-tenant data isolation and identity stamping', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        // Ensure pristine GraphService
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
            }
        }

        // Mock identity A
        let   mockIdentity  = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Act: Upsert Node and Link Nodes as Agent A
            await GraphService.upsertNode({id: 'tenant-a-node-1', type: 'TEST', name: 'tenant-a', properties: {}});
            await GraphService.upsertNode({id: 'tenant-a-node-2', type: 'TEST', name: 'tenant-a', properties: {}});
            await GraphService.linkNodesAsync('tenant-a-node-1', 'tenant-a-node-2', 'RELATES_TO', 1.0);

            // Assert: nodes and edges are stamped with the normalized canonical user_id (no @-form)
            let node1 = GraphService.db.nodes.get('tenant-a-node-1');
            expect(node1.properties.userId).toBe('identity-a');

            let edge = GraphService.db.edges.items.find(e => e.source === 'tenant-a-node-1' && e.target === 'tenant-a-node-2');
            expect(edge.properties.userId).toBe('identity-a');

            // Wait for DB to sync memory to disk (flush mutations if any are async, though upsert is sync RAM + async disk?)
            // upsertNode pushes to RAM and then directly calls storage.addNodes() synchronously.

            // Clear RAM to force disk load without deleting from SQLite
            GraphService.db.nodes.clearSilent();
            GraphService.db.edges.clearSilent();
            GraphService.db.vicinityLoadedNodes.clear();

            // Switch to Identity B
            mockIdentity = '@identity-b';

            // Act: Attempt to search for Tenant A's node using GraphService search
            const resultsB = await GraphService.searchNodes({query: 'tenant-a'});
            expect(resultsB.nodes.length).toBe(0);

            // Attempt to load vicinity for Tenant A's node (should return nothing or fail to traverse to other tenant's nodes)
            await GraphService.db.getAdjacentNodes('tenant-a-node-1', 1);
            let edgeLoadedB = GraphService.db.edges.items.find(e => e.source === 'tenant-a-node-1' && e.target === 'tenant-a-node-2');
            expect(edgeLoadedB).toBeFalsy();

            // Mock Identity A again
            mockIdentity = '@identity-a';
            const resultsA = await GraphService.searchNodes({query: 'tenant-a'});
            expect(resultsA.nodes.length).toBeGreaterThan(0);

            // Test legacy "untagged" node isolation (should be visible to both)
            mockIdentity = undefined; // System level / legacy
            await GraphService.upsertNode({id: 'legacy-node-1', type: 'TEST', name: 'legacy-node', properties: {}});
            // Legacy nodes are synced directly via upsertNode to db.storage.addNodes

            mockIdentity = '@identity-b';
            const resultsLegacyB = await GraphService.searchNodes({query: 'legacy-node'});
            expect(resultsLegacyB.nodes.length).toBe(1);

            mockIdentity = '@identity-a';
            const resultsLegacyA = await GraphService.searchNodes({query: 'legacy-node'});
            expect(resultsLegacyA.nodes.length).toBe(1);

        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('cross-tenant visibility of shared entities', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        // Ensure pristine GraphService
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
            }
        }

        // Mock identity A
        let   mockIdentity  = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Act: Upsert Node as Agent A but mark it as shared
            await GraphService.upsertNode({id: 'shared-node-1', type: 'TEST', name: 'shared-node', properties: { sharedEntity: true }});
            await GraphService.upsertNode({id: 'private-node-1', type: 'TEST', name: 'private-node', properties: {}});
            await GraphService.linkNodesAsync('shared-node-1', 'private-node-1', 'RELATES_TO', 1.0);

            // Clear RAM to force disk load without deleting from SQLite
            GraphService.db.nodes.clearSilent();
            GraphService.db.edges.clearSilent();
            GraphService.db.vicinityLoadedNodes.clear();

            // Switch to Identity B
            mockIdentity = '@identity-b';

            // Act: Attempt to search for shared node using GraphService search
            const resultsB_shared = await GraphService.searchNodes({query: 'shared-node'});
            expect(resultsB_shared.nodes.length).toBe(1);
            expect(resultsB_shared.nodes[0].id).toBe('shared-node-1');

            const resultsB_private = await GraphService.searchNodes({query: 'private-node'});
            expect(resultsB_private.nodes.length).toBe(0);

            // Attempt to load vicinity for shared node (should succeed)
            await GraphService.db.getAdjacentNodes('shared-node-1', 1);
            let nodeLoadedB = GraphService.db.nodes.get('shared-node-1');
            expect(nodeLoadedB).toBeTruthy();

            // Wait, edges might be private if not explicitly shared, but RLS clause applies to edges too.
            // Edge between shared and private might not be loaded if private is not accessible.
            // Since edge has `user_id = @identity-a`, Identity B won't see it unless the edge is shared.
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('ensureGlobalBootSeedNode restores an absent hub from the manifest, idempotently (#15985)', async () => {
        const {getGraphBootSeedNodeSpec} = await import('../../../../../../ai/graph/bootSeedManifest.mjs');

        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        if (GraphService.db.storage?.db) {
            await GraphService.db.storage.clear();
        }

        expect(GraphService.db.nodes.has('frontier')).toBe(false);

        // Heals, and says so, so a caller can surface that boot left the graph non-manifest-equal.
        expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(true);
        expect(GraphService.db.nodes.has('frontier')).toBe(true);

        // DECLARED-FIELD compliant, not merely present: the description must be the canonical one,
        // never the drifted copy the extractor used to declare inline. Deliberately not "manifest-
        // equal" — the open contract preserves undeclared runtime fields, so the full-manifest
        // fingerprint predicate can still read fresh:false on a compliant row.
        const restored  = GraphService.db.nodes.get('frontier'),
              canonical = getGraphBootSeedNodeSpec('frontier');

        expect(restored.properties.description).toBe(canonical.description);
        expect(restored.properties.description).not.toContain('actively tracked development front');

        // Idempotent: a present hub is not re-upserted and does not re-warn.
        expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(false);

        // Unknown ids fail loud rather than silently inviting a hand-written spec back.
        expect(() => GraphService.ensureGlobalBootSeedNode('not-a-boot-seed')).toThrow(/not a fixed boot-seed node/);
    });

    test('ensureGlobalBootSeedNode REPAIRS a present-but-invalid seed, not just an absent one (#15985)', async () => {
        const RequestContextService      = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default,
              {getGraphBootSeedNodeSpec} = await import('../../../../../../ai/graph/bootSeedManifest.mjs');

        let   mockIdentity  = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;

        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Case 1: the exact pre-fix shape an upgraded graph already carries — the old
            // extractor's local literal, written through plain upsertNode so it is TENANT-STAMPED
            // and its description has drifted. A presence-only predicate returns early here and
            // leaves the defect in place, which is what makes this the upgrade-path blocker.
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
            }

            GraphService.upsertNode({
                id              : 'frontier',
                type            : 'SYSTEM_ANCHOR',
                name            : 'Active Context Frontier',
                description     : 'The actively tracked development front for the current project scope.',
                semanticVectorId: null
            });

            expect(GraphService.db.nodes.get('frontier').properties.userId).not.toBe(null);

            // Repaired, and it reports that it healed rather than silently no-opping.
            expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(true);

            const canonical = getGraphBootSeedNodeSpec('frontier'),
                  repaired  = GraphService.db.nodes.get('frontier');

            expect(repaired.properties.userId).toBe(null);
            expect(repaired.properties.description).toBe(canonical.description);

            // The open contract, witnessed: the legacy UNDECLARED field seeded above SURVIVES the
            // repair. upsertNode merges, so a repair cannot strip it — which is also why this
            // method promises declared-field compliance rather than full manifest equality.
            expect(repaired.properties.semanticVectorId).toBe(null);

            // Case 2: drifted description on an otherwise-global row is still a violation.
            GraphService.upsertGlobalNode({
                id         : 'frontier',
                type       : 'SYSTEM_ANCHOR',
                name       : 'Active Context Frontier',
                description: 'drifted text that is not the manifest declaration'
            });

            expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(true);
            expect(GraphService.db.nodes.get('frontier').properties.description).toBe(canonical.description);

            // Case 3: a compliant row is a genuine no-op — the method must not churn writes.
            expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(false);

            // Case 4: an unrelated row under an unknown id must NOT let the caller skip the
            // fail-loud contract — the id is validated before any early return.
            GraphService.upsertNode({id: 'not-a-boot-seed', type: 'TEST', name: 'squatter'});
            expect(() => GraphService.ensureGlobalBootSeedNode('not-a-boot-seed')).toThrow(/not a fixed boot-seed node/);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('a tenant-stamped hub loses support on the RLS READ path, not to an unwritten edge (#15985)', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        let   mockIdentity  = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;

        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
            }

            // Identity A leaves the pre-fix shape behind: a TENANT-STAMPED hub.
            GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'Active Context Frontier'});

            // Identity B links from it. This is the distinction the earlier prose got wrong:
            // linkNodes' endpoint check is `SELECT count(*) FROM Nodes WHERE id IN (?, ?)` — RLS-BLIND —
            // so a tenant-invisible hub still satisfies it and the edge IS written.
            mockIdentity = '@identity-b';
            GraphService.upsertNode({id: 'discussion-rls', type: 'DISCUSSION', name: 'B target'});
            GraphService.linkNodes('frontier', 'discussion-rls', 'GUIDES', 5);

            const writtenEdges = GraphService.db.edges.getByIndex('target', 'discussion-rls')
                .filter(edge => edge.type === 'GUIDES' && edge.source === 'frontier');

            expect(writtenEdges.length).toBe(1);

            // …and it is the READ that drops it: getInboundStructuralSupport skips any edge whose
            // SOURCE node fails the RLS predicate, so support reads zero despite the edge existing.
            expect(GraphService.getInboundStructuralSupport({id: 'discussion-rls'}).totalWeight).toBe(0);

            // Repair the hub to global. No new edge is written — the same edge becomes readable.
            expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(true);

            const afterEdges = GraphService.db.edges.getByIndex('target', 'discussion-rls')
                .filter(edge => edge.type === 'GUIDES' && edge.source === 'frontier');

            expect(afterEdges.length).toBe(1);
            expect(GraphService.getInboundStructuralSupport({id: 'discussion-rls'}).totalWeight).toBeGreaterThan(0);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('a disk-present cache-cold rich row is warmed and preserved, never stubbed over (#15985)', async () => {
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        if (GraphService.db.storage?.db) {
            await GraphService.db.storage.clear();
        }

        // A compliant hub carrying RUNTIME-OWNED enrichment the manifest does not declare.
        GraphService.upsertGlobalNode({
            id              : 'frontier',
            type            : 'SYSTEM_ANCHOR',
            name            : 'Active Context Frontier',
            description     : 'The shifting focal point of the active Neo OS agent session.',
            semanticVectorId: 'vec-runtime-owned'
        });

        // Drop RAM without deleting from SQLite — the cold-cache case upsertNode's own comment warns about.
        GraphService.db.nodes.clearSilent();
        GraphService.db.vicinityLoadedNodes.clear();

        // The warm read must find it, so this is a NO-OP rather than a stub overwrite.
        expect(GraphService.ensureGlobalBootSeedNode('frontier')).toBe(false);

        // Runtime-owned enrichment survives: the reconciliation contract is OPEN on undeclared fields.
        expect(GraphService.db.nodes.get('frontier').properties.semanticVectorId).toBe('vec-runtime-owned');
    });

    test('the restored hub is GLOBAL, so a second identity sees its GUIDES support (#15985)', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        if (GraphService.db.storage?.db) {
            await GraphService.db.storage.clear();
        }

        let   mockIdentity  = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;

        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Identity A restores the hub. The tenancy claim is the whole point: plain
            // upsertNode would stamp '@identity-a' here, which is what made the pre-fix
            // extractor shape invisible to every other tenant.
            GraphService.ensureGlobalBootSeedNode('frontier');
            expect(GraphService.db.nodes.get('frontier').properties.userId).toBe(null);

            // Identity B now writes a GUIDES edge FROM that hub. Pre-fix, a tenant-stamped hub would
            // be RLS-invisible to B — the edge would still be WRITTEN (the endpoint check is RLS-blind)
            // and then skipped by the structural-support read. See the dedicated RLS-read test below.
            mockIdentity = '@identity-b';

            GraphService.upsertNode({id: 'discussion-b', type: 'DISCUSSION', name: 'B-owned target'});
            GraphService.linkNodes('frontier', 'discussion-b', 'GUIDES', 7);

            const support = GraphService.getInboundStructuralSupport({id: 'discussion-b'});

            // The edge LANDED rather than being silently culled for a missing source endpoint.
            expect(support.totalWeight).toBeGreaterThan(0);
        } finally {
            RequestContextService.getAgentIdentityNodeId = originalGetId;
        }
    });

    test('listSharedNodeRecordsByLabels reads persisted shared rows and excludes tenant rows (#17627)', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        const originalGetUserId     = RequestContextService.getUserId;

        try {
            RequestContextService.getUserId = () => null;
            GraphService.upsertGlobalNode({id: 'issue-shared', type: 'ISSUE', name: 'Shared issue'});
            GraphService.upsertGlobalNode({id: 'pr-shared', type: 'PULL_REQUEST', name: 'Shared PR'});

            RequestContextService.getUserId = () => 'tenant-a';
            GraphService.upsertNode({id: 'issue-tenant', type: 'ISSUE', name: 'Tenant issue'});

            // Prove the method reads SQLite rather than the request-local lazy cache.
            GraphService.db.nodes.clearSilent();
            GraphService.db.vicinityLoadedNodes.clear();

            expect(GraphService.listSharedNodeRecordsByLabels(['ISSUE'])).toEqual([{
                id        : 'issue-shared',
                label     : 'ISSUE',
                properties: expect.objectContaining({name: 'Shared issue', userId: null})
            }]);
            expect(GraphService.listSharedNodeRecordsByLabels(['PULL_REQUEST']).map(node => node.id))
                .toEqual(['pr-shared'])
        } finally {
            RequestContextService.getUserId = originalGetUserId
        }
    });
});

test.describe('GraphService — getLifecycleCensus (#10158)', () => {
    let GraphService, originalDb;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => { originalDb = GraphService.db; });
    test.afterEach(()  => { GraphService.db = originalDb; });

    // Fake the better-sqlite3 handle: route the Nodes/Edges COUNT queries to fixed values by SQL shape.
    function fakeSqliteDb({nodes = {}, edges = {}} = {}) {
        return {
            prepare(sql) {
                return {
                    get(...args) {
                        const label = args[0];
                        if (sql.includes('FROM Edges')) return {count: edges[label]};
                        if (sql.includes('FROM Nodes')) return {count: nodes[label]};
                        return undefined;
                    }
                };
            }
        };
    }

    test('counts MEMORY/SESSION nodes + SQLite file size; omits incident edges by default', async () => {
        const tmpFile = path.join(os.tmpdir(), `neo-census-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        await fs.writeFile(tmpFile, 'x'.repeat(4096));
        try {
            GraphService.db = {storage: {db: fakeSqliteDb({nodes: {MEMORY: 3, SESSION: 2}}), dbPath: tmpFile}};

            const census = await GraphService.getLifecycleCensus();

            expect(census.available).toBe(true);
            expect(census.memoryNodes).toBe(3);
            expect(census.sessionNodes).toBe(2);
            expect(census.sqliteBytes).toBe(4096);
            expect(census.sqliteWalBytes).toBe(0);  // sibling absent → 0, not throw
            expect(census.sqliteShmBytes).toBe(0);
            expect(census.memoryIncidentEdges).toBeUndefined();  // O(edges) scan is opt-in only
        } finally {
            await fs.remove(tmpFile);
        }
    });

    test('includeIncidentEdges runs the O(edges) incident-edge counts', async () => {
        GraphService.db = {storage: {db: fakeSqliteDb({nodes: {MEMORY: 1, SESSION: 1}, edges: {MEMORY: 7, SESSION: 5}}), dbPath: '/no/such/graph.db'}};

        const census = await GraphService.getLifecycleCensus({includeIncidentEdges: true});

        expect(census.memoryIncidentEdges).toBe(7);
        expect(census.sessionIncidentEdges).toBe(5);
        expect(census.sqliteBytes).toBe(0);  // absent dbPath → stat fails → 0, not throw
    });

    test('returns available:false when the graph SQLite store is unmounted', async () => {
        GraphService.db = {storage: {db: null, dbPath: null}};

        const census = await GraphService.getLifecycleCensus();

        expect(census.available).toBe(false);
        expect(census.memoryNodes).toBe(0);
        expect(census.error).toContain('unavailable');
    });
});
