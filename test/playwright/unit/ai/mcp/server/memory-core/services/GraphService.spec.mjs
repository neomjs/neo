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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import GraphService   from '../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs';
import aiConfig       from '../../../../../../../../ai/mcp/server/memory-core/config.mjs';
import fs             from 'fs-extra';
import path           from 'path';
import os             from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.GraphService', () => {
    let service;
    const testDbPath = path.join(os.tmpdir(), `memory-core-graph-test-${process.pid}-${Date.now()}.db`);

    test.beforeAll(async () => {
        // Mock the SQLite target path to a safe pure temporary location
        aiConfig.sqlitePath = testDbPath;
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        await GraphService.initAsync();
    });

    test.beforeEach(async () => {
        // Clear graph nodes and edges before each test for isolation
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();
        }
    });

    test.afterEach(() => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
        GraphService.db.vicinityLoadedNodes.clear();
        }
    });

    test.afterAll(() => {
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
            } catch (e) {}
        }
    });

    test('should extract node neighbors properly', async () => {
        GraphService.upsertNode({ id: 'EpicA', name: 'Roadmap Planner' });
        GraphService.upsertNode({ id: 'Task1', name: 'Implementation' });
        GraphService.upsertNode({ id: 'Task2', name: 'Documentation' });
        
        GraphService.linkNodes('EpicA', 'Task1', 'CONTAINS', 1.0);
        GraphService.linkNodes('EpicA', 'Task2', 'CONTAINS', 0.8);
        GraphService.linkNodes('Task1', 'Task2', 'DEPENDENCY', 0.5);

        const neighbors = GraphService.getNeighbors({ id: 'EpicA' });
        
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
        GraphService.upsertNode({ id: 'frontier', type: 'SYSTEM_ANCHOR' });
        GraphService.upsertNode({ id: 'EpicB' });
        
        // Weight < 0.8 should be filtered out by getContextFrontier originally
        GraphService.linkNodes('frontier', 'EpicB', 'STRATEGIC_PIVOT', 0.9);
        
        const topology = GraphService.getContextFrontier();
        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('EpicB');
    });

    test('should trigger a SQLite lazy-load on cache miss when fetching a Node', async () => {
        GraphService.upsertNode({ id: 'LazyNode', name: 'Wait For It' });
        GraphService.upsertNode({ id: 'ConnectedNode', name: 'Linked' });
        GraphService.linkNodes('LazyNode', 'ConnectedNode', 'TEST_LINK', 1.0);

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
        const neighbors = GraphService.getNeighbors({ id: 'LazyNode' });
        expect(neighbors.length).toBe(1);
        expect(neighbors[0].id).toBe('ConnectedNode');
        expect(neighbors[0].relationship).toBe('TEST_LINK');

        // Verify the node itself is fully rehydrated in RAM
        const rehydratedNode = GraphService.getNode({ id: 'LazyNode' });
        expect(rehydratedNode.id).toBe('LazyNode');
        expect(rehydratedNode.name).toBe('Wait For It');
        
        // Verify it actually placed it back into the in-memory map
        expect(GraphService.db.nodes.has('LazyNode')).toBe(true);
    });

    test('should lazy-load topology for getContextFrontier when frontiers drop out of cache', async () => {
        GraphService.upsertNode({ id: 'frontier', type: 'SYSTEM_ANCHOR', name: 'AnchorData' });
        GraphService.upsertNode({ id: 'StrategicTarget', name: 'SecretGoal' });
        GraphService.linkNodes('frontier', 'StrategicTarget', 'FOCUS', 1.0);

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
        const topology = GraphService.getContextFrontier();
        
        expect(topology).toBeDefined();
        expect(topology.frontier.id).toBe('frontier');
        expect(topology.frontier.name).toBe('AnchorData');
        expect(topology.strategicNeighbors.length).toBe(1);
        expect(topology.strategicNeighbors[0].id).toBe('StrategicTarget');
        expect(topology.strategicNeighbors[0].name).toBe('SecretGoal');
    });
});
