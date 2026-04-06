import {setup} from '../../../../../../setup.mjs';

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
import Neo             from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import os              from 'os';
import {getPaths}      from '../../../../../../../../ai/graph/queries/Traversal.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.GraphService', () => {
    let GraphService;
    let service;
    const testDbName = `memory-core-graph-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        // Mock the SQLite target path to a safe pure temporary location
        aiConfig.engines.neo.dataDir  = tmpDir;
        aiConfig.engines.neo.filename = testDbName;

        GraphService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        // Wipe any RAM caches created by the automated Base constructor async initialization loop cleanly
        // preventing Foreign Key races when `initAsync` is re-launched pointing to the wiped `testDbPath`!
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
        }

        await GraphService.initAsync();
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

    test.afterAll(() => {
        if (GraphService?.db) {
            if (GraphService.db.storage && GraphService.db.storage.db) {
                try {
                    GraphService.db.storage.db.close();
                } catch (e) {
                }
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
            } catch (e) {}
        }
    });

    test('should extract node neighbors properly', async () => {
        GraphService.upsertNode({id: 'EpicA', name: 'Roadmap Planner'});
        GraphService.upsertNode({id: 'Task1', name: 'Implementation'});
        GraphService.upsertNode({id: 'Task2', name: 'Documentation'});

        GraphService.linkNodes('EpicA', 'Task1', 'CONTAINS', 1.0);
        GraphService.linkNodes('EpicA', 'Task2', 'CONTAINS', 0.8);
        GraphService.linkNodes('Task1', 'Task2', 'DEPENDENCY', 0.5);

        const {neighbors} = GraphService.getNeighbors({id: 'EpicA'});

        // Validation of extraction
        expect(neighbors.length).toBe(2);

        const task1 = neighbors.find(n => n.id === 'Task1');
        const task2 = neighbors.find(n => n.id === 'Task2');

        expect(task1).toBeDefined();
        expect(task1.weight).toBe(1.0);
        expect(task1.relationship).toBe('CONTAINS');

        expect(task2).toBeDefined();
        expect(task2.weight).toBe(0.8);
    });

    test('should correctly expose getContextFrontier topology', async () => {
        GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR'});
        GraphService.upsertNode({id: 'EpicB'});

        // Weight < 0.8 should be filtered out by getContextFrontier originally
        GraphService.linkNodes('frontier', 'EpicB', 'STRATEGIC_PIVOT', 0.9);

        const topology = GraphService.getContextFrontier();
        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('EpicB');
    });

    test('should trigger a SQLite lazy-load on cache miss when fetching a Node', async () => {
        GraphService.upsertNode({id: 'LazyNode', name: 'Wait For It'});
        GraphService.upsertNode({id: 'ConnectedNode', name: 'Linked'});
        GraphService.linkNodes('LazyNode', 'ConnectedNode', 'TEST_LINK', 1.0);

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
        const {neighbors} = GraphService.getNeighbors({id: 'LazyNode'});
        expect(neighbors.length).toBe(1);
        expect(neighbors[0].id).toBe('ConnectedNode');
        expect(neighbors[0].relationship).toBe('TEST_LINK');

        // Verify the node itself is fully rehydrated in RAM
        const rehydratedNode = GraphService.getNode({id: 'LazyNode'});
        expect(rehydratedNode.id).toBe('LazyNode');
        expect(rehydratedNode.name).toBe('Wait For It');

        // Verify it actually placed it back into the in-memory map
        expect(GraphService.db.nodes.has('LazyNode')).toBe(true);
    });

    test('should lazy-load topology for getContextFrontier when frontiers drop out of cache', async () => {
        GraphService.upsertNode({id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'AnchorData'});
        GraphService.upsertNode({id: 'StrategicTarget', name: 'SecretGoal'});
        GraphService.linkNodes('frontier', 'StrategicTarget', 'FOCUS', 1.0);

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
        const topology = GraphService.getContextFrontier();

        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.frontier.name).toBe('AnchorData');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('StrategicTarget');
        expect(topology.strategicNeighbors[0].name).toBe('SecretGoal');
    });

    test('should execute getPaths and lazy-load recursively across deep dependencies when RAM cache is missed', async () => {
        GraphService.upsertNode({id: 'Root', name: 'Starting Point'});
        GraphService.upsertNode({id: 'Depth1', name: 'First Hop'});
        GraphService.upsertNode({id: 'Depth2', name: 'Second Hop'});
        GraphService.upsertNode({id: 'Depth3', name: 'Final Hop'});

        GraphService.linkNodes('Root', 'Depth1', 'CHAIN', 1.0);
        GraphService.linkNodes('Depth1', 'Depth2', 'CHAIN', 1.0);
        GraphService.linkNodes('Depth2', 'Depth3', 'CHAIN', 1.0);

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
        expect(GraphService.getNode({id: 'Depth3'}).name).toBe('Final Hop');
    });

    test('should automatically execute LRU garbage collection Native Graph footprints when maxGraphNodes is exceeded', async () => {
        // Guarantee pristine isolated boundary baseline natively for this LRU physics test exclusively smoothly
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.lastAccessMap.clear();
        GraphService.db.vicinityLoadedNodes.clear();

        // Set maximum capacity constraint to 3 nodes
        GraphService.db.maxGraphNodes = 3;

        GraphService.upsertNode({id: 'N1', name: 'First'});
        GraphService.getNode({id: 'N1'}); // Register to LRU Matrix natively

        // Let timestamp differential tick natively avoiding micro-millisecond collisions gracefully
        await new Promise(resolve => setTimeout(resolve, 5));
        GraphService.upsertNode({id: 'N2', name: 'Second'});
        GraphService.getNode({id: 'N2'});

        await new Promise(resolve => setTimeout(resolve, 5));
        GraphService.upsertNode({id: 'N3', name: 'Third'});
        GraphService.getNode({id: 'N3'});

        // V8 footprint holds 3 items flawlessly locally smoothly
        expect(GraphService.db.nodes.getCount()).toBe(3);
        expect(GraphService.db.nodes.has('N1')).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 5));

        // This 4th insert will push the length over 3 when accessed.
        GraphService.upsertNode({id: 'N4', name: 'Fourth'});
        GraphService.getNode({id: 'N4'}); // GC fires here natively!

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
        GraphService.upsertNode({id: 'RootT', name: 'Topology Start'});
        GraphService.upsertNode({id: 'AdjacentT', name: 'Adjacency Target', semanticVectorId: 'vec-123'});
        GraphService.upsertNode({id: 'DeepT', name: 'Deep Target', semanticVectorId: 'vec-456'});

        GraphService.linkNodes('RootT', 'AdjacentT', 'REFERENCES', 0.95);
        GraphService.linkNodes('AdjacentT', 'DeepT', 'REFERENCES', 0.85);

        // Fetch using the new endpoint topology function - depth 1
        const topology1 = GraphService.queryNodeTopology({nodeId: 'RootT', maxDepth: 1});

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
        const topology2 = GraphService.queryNodeTopology({nodeId: 'RootT', maxDepth: 2});
        expect(topology2.nodes.length).toBe(3);
        expect(topology2.edges.length).toBe(2);
        expect(topology2.nodes.find(n => n.id === 'DeepT').semanticVectorId).toBe('vec-456');

        // Check edge logic
        const link = topology2.edges.find(e => e.target === 'AdjacentT');
        expect(link.relationship).toBe('REFERENCES');
        expect(link.weight).toBe(0.95);
        expect(link.source).toBe('RootT');
    });
});
