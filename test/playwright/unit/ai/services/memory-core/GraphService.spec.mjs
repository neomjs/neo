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

test.describe('Neo.ai.services.memory-core.GraphService', () => {
    let GraphService;
    let SystemLifecycleService;
    let service;
    const testDbName = `memory-core-graph-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        // Reactive provider SSOT: storagePaths.graph (→ `:memory:`) + collections.{memory,session} (→ test-*)
        // resolve to test values BY CONSTRUCTION under UNIT_TEST_MODE (config.template's
        // `useTestDatabase` toggle). The test never mutates the shared AiConfig singleton.

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
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

        const result = await GraphService.getNeighbors({id: 'EpicA'});
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

    test('removeNodes rejects invalid node ids before Database.removeNode null path (#11698)', async () => {
        expect(() => GraphService.removeNodes([null])).toThrow(/invalid node id/);
        expect(() => GraphService.removeNodes(['ValidNode', undefined])).toThrow(/invalid node id/);
    });

    test('getOrphanedNodes preserves SYSTEM_ANCHOR nodes while returning ordinary orphans (#9945)', async () => {
        await GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR'});
        await GraphService.upsertNode({id: 'DisposableConcept', type: 'CONCEPT'});

        await new Promise(resolve => setTimeout(resolve, 50));

        const orphaned = GraphService.getOrphanedNodes();

        expect(orphaned).toContain('DisposableConcept');
        expect(orphaned).not.toContain('frontier');
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

    test('getNodeRecord applies the #10011 RLS visibility re-check (#11637)', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: SqliteError disk I/O - bucket G3 (#10924)');
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        let mockIdentity    = '@tenant-alpha';
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

    test('preBriefSession should hydrate episodic context through getNeighbors semanticVectorId', async () => {
        await GraphService.upsertNode({id: 'EpicA', name: 'Roadmap Planner'});
        await GraphService.upsertNode({id: 'MemoryA', name: 'Session Summary', semanticVectorId: 'summary-vector-1'});
        await GraphService.linkNodes('EpicA', 'MemoryA', 'RELATES_TO', 0.9);

        const StorageRouter = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        const MemoryService = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;

        const originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        const getCalls = [];

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

        let wasAutoSave          = GraphService.db.autoSave;
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
            id: '@test-identity',
            label: 'AgentIdentity',
            properties: {
                name: 'Test Identity',
                githubLogin: 'test-user',
                createdAt: '2026-04-23T00:00:00Z'
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
        let retries = 3;
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

        let wasAutoSave          = GraphService.db.autoSave;
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

        let wasAutoSave          = GraphService.db.autoSave;
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
        let cacheWarmTriggered = false;

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
        const originalIngest = MemorySessionIngestor.ingestSingleRow;

        // Mock the ingestor to simulate a successful back-fill — upsert a node and return success.
        MemorySessionIngestor.ingestSingleRow = async (id) => {
            const normalized = id.toLowerCase().startsWith('memory:') ? 'memory:' + id.slice(7) :
                               id.toLowerCase().startsWith('session:') ? 'session:' + id.slice(8) : id;
            await GraphService.upsertNode({id: normalized, type: 'MEMORY', name: normalized, properties: {backfilled: true}});
            return {success: true, reason: 'backfilled', graphNodeId: normalized};
        };

        try {
            await GraphService.upsertNode({id: 'NodeSrc', type: 'TEST', name: 'Src', properties: {}});

            const ok = await GraphService.linkNodesAsync('NodeSrc', 'memory:lazy-xyz', 'MENTIONED_IN', 1.0);

            expect(ok).toBe(true);
            expect(GraphService.db.nodes.get('memory:lazy-xyz')).toBeTruthy();
            const edge = GraphService.db.edges.items.find(e =>
                e.source === 'NodeSrc' && e.target === 'memory:lazy-xyz' && e.type === 'MENTIONED_IN'
            );
            expect(edge).toBeTruthy();
        } finally {
            MemorySessionIngestor.ingestSingleRow = originalIngest;
        }
    });

    test('linkNodesAsync normalizes uppercase MEMORY: prefix to canonical lowercase', async () => {
        const MemorySessionIngestor = (await import('../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        const originalIngest = MemorySessionIngestor.ingestSingleRow;

        MemorySessionIngestor.ingestSingleRow = async (id) => {
            // The resolver is called with the already-normalized id; verify that fact.
            expect(id).toBe('memory:upper-case-id');
            await GraphService.upsertNode({id: 'memory:upper-case-id', type: 'MEMORY', name: 'UC', properties: {backfilled: true}});
            return {success: true, reason: 'backfilled', graphNodeId: 'memory:upper-case-id'};
        };

        try {
            await GraphService.upsertNode({id: 'NodeSrc2', type: 'TEST', name: 'Src', properties: {}});

            // Caller passes uppercase prefix — linkNodesAsync normalizes before ensureNodeExists.
            const ok = await GraphService.linkNodesAsync('NodeSrc2', 'MEMORY:upper-case-id', 'REFERENCED_BY', 1.0);

            expect(ok).toBe(true);
            // Edge lands against canonical lowercase id, not the uppercase input.
            expect(GraphService.db.nodes.get('memory:upper-case-id')).toBeTruthy();
            expect(GraphService.db.nodes.get('MEMORY:upper-case-id')).toBeFalsy();
            const edge = GraphService.db.edges.items.find(e =>
                e.target === 'memory:upper-case-id' && e.type === 'REFERENCED_BY'
            );
            expect(edge).toBeTruthy();
        } finally {
            MemorySessionIngestor.ingestSingleRow = originalIngest;
        }
    });

    test('linkNodesAsync returns false when back-fill fails (hallucinated target)', async () => {
        const MemorySessionIngestor = (await import('../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        const originalIngest = MemorySessionIngestor.ingestSingleRow;

        MemorySessionIngestor.ingestSingleRow = async (id) => ({
            success: false,
            reason : 'chroma-row-not-found',
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
        let mockIdentity = '@identity-a';
        const originalGetId = RequestContextService.getAgentIdentityNodeId;
        RequestContextService.getAgentIdentityNodeId = () => mockIdentity;

        try {
            // Act: Upsert Node and Link Nodes as Agent A
            await GraphService.upsertNode({id: 'tenant-a-node-1', type: 'TEST', name: 'tenant-a', properties: {}});
            await GraphService.upsertNode({id: 'tenant-a-node-2', type: 'TEST', name: 'tenant-a', properties: {}});
            await GraphService.linkNodesAsync('tenant-a-node-1', 'tenant-a-node-2', 'RELATES_TO', 1.0);

            // Assert: Nodes and edges are stamped
            let node1 = GraphService.db.nodes.get('tenant-a-node-1');
            expect(node1.properties.userId).toBe('@identity-a');

            let edge = GraphService.db.edges.items.find(e => e.source === 'tenant-a-node-1' && e.target === 'tenant-a-node-2');
            expect(edge.properties.userId).toBe('@identity-a');

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
        let mockIdentity = '@identity-a';
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
