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
        }
    });

    test.afterEach(() => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
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
});
