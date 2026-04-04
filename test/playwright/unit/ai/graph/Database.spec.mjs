import {setup} from '../../../setup.mjs';

const appName = 'AiGraphTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Database       from '../../../../../ai/graph/Database.mjs';

test.describe('Neo.ai.graph.Database', () => {
    let db;
    let testRun = 0;

    test.beforeEach(async () => {
        testRun++;
        db = Neo.create(Database, {
            id: 'my-graph-db-' + testRun
        });
    });

    test.afterEach(() => {
        db?.destroy();
        db = null;
    });

    test('should add and retrieve a node correctly', async () => {
        db.addNode({ id: 'node1', label: 'Person', properties: { name: 'Alice' } });
        
        expect(db.nodes.getCount()).toBe(1);
        expect(db.nodes.get('node1').label).toBe('Person');
        expect(db.nodes.get('node1').properties.name).toBe('Alice');
    });

    test('should add an edge correctly', async () => {
        db.addNode({ id: 'node1' });
        db.addNode({ id: 'node2' });
        
        db.addEdge({ id: 'edge1', source: 'node1', target: 'node2', type: 'KNOWS' });
        
        expect(db.edges.getCount()).toBe(1);
        expect(db.edges.get('edge1').type).toBe('KNOWS');
    });

    test('should traverse adjacent nodes (outbound)', async () => {
        db.addNode({ id: 'node1' });
        db.addNode({ id: 'node2' });
        db.addNode({ id: 'node3' });
        
        db.addEdge({ source: 'node1', target: 'node2', type: 'KNOWS' });
        db.addEdge({ source: 'node1', target: 'node3', type: 'LIKES' });
        
        let adjacent = db.getAdjacentNodes('node1', 'outbound', 'KNOWS');
        expect(adjacent.length).toBe(1);
        expect(adjacent[0].id).toBe('node2');

        let allOutbound = db.getAdjacentNodes('node1', 'outbound');
        expect(allOutbound.length).toBe(2);
    });

    test('should cascade delete edges when a node is removed', async () => {
        db.addNode({ id: 'node1' });
        db.addNode({ id: 'node2' });
        
        db.addEdge({ id: 'edge1', source: 'node1', target: 'node2', type: 'KNOWS' });
        expect(db.edges.getCount()).toBe(1);

        db.removeNode('node1');
        
        expect(db.nodes.getCount()).toBe(1);
        expect(db.edges.getCount()).toBe(0); // Edge should be deleted because its source node is gone
    });
});
