import {setup} from '../../../setup.mjs';

const appName = 'AiGraphTraversalTest';

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

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import Database         from '../../../../../ai/graph/Database.mjs';
import {getPaths, findShortestPath} from '../../../../../ai/graph/queries/Traversal.mjs';

test.describe('Neo.ai.graph.queries.Traversal', () => {
    let db;
    let testRun = 0;

    test.beforeEach(async () => {
        testRun++;
        db = Neo.create(Database, {
            id: 'traversal-graph-db-' + testRun
        });

        // Scaffold an advanced graph topology for algorithms
        // A -> B -> C -> D
        // \         /
        //  \-> E --/  (cheaper path to C)
        // A -> A (circular loop)
        
        ['A', 'B', 'C', 'D', 'E', 'F'].forEach(id => {
            let type = (id === 'E') ? 'Microservice' : 'Component';
            db.addNode({ id, properties: { type } });
        });

        db.addEdge({ source: 'A', target: 'B', weight: 5 });
        db.addEdge({ source: 'B', target: 'C', weight: 5 });
        db.addEdge({ source: 'C', target: 'D', weight: 5 });
        
        db.addEdge({ source: 'A', target: 'E', weight: 1 });
        db.addEdge({ source: 'E', target: 'C', weight: 2 });
        
        // Cyclic relationships to ensure logic handles identical loops safely
        db.addEdge({ source: 'D', target: 'A', weight: 1 });
        db.addEdge({ source: 'A', target: 'A', weight: 0 }); // self-referencing
        
        // Isolated component
        db.addEdge({ source: 'F', target: 'F', weight: 0 });
    });

    test.afterEach(() => {
        db?.destroy();
        db = null;
    });

    test('getPaths should respect maxDepth bounded limits', async () => {
        let results = getPaths(db, 'A', { maxDepth: 1 });
        // Depth 0: A
        // Depth 1: B, E
        expect(results.length).toBe(3); // A is included natively since depth=0 ignores matchPredicate
        
        let pathIds = results.map(n => n.id).sort();
        expect(pathIds).toEqual(['A', 'B', 'E']);
    });

    test('getPaths should correctly handle matchPredicate lambda filtering', async () => {
        // Find only nodes marked as Microservice
        let results = getPaths(db, 'A', {
            maxDepth: 3,
            matchPredicate: (node) => node.properties.type === 'Microservice'
        });

        expect(results.length).toBe(1);
        expect(results[0].id).toBe('E');
    });

    test('getPaths should correctly abort recursion early via stopPredicate', async () => {
        // If we stop traversing when hitting E, we shouldn't reach C via the A->E->C route.
        // Wait, C is also reachable via B. But let's stop at B as well.
        let results = getPaths(db, 'A', {
            maxDepth: 3,
            stopPredicate: (node) => node.id === 'B' || node.id === 'E'
        });

        // Start at A. Reaches B and E. Stops at both. C should never be reached.
        let pathIds = results.map(n => n.id).sort();
        expect(pathIds).toEqual(['A', 'B', 'E']);
    });

    test('findShortestPath implements Dijkstra accurately calculating weighted maps natively without exploding', async () => {
        // Target path A -> C
        // A -> B -> C costs 10
        // A -> E -> C costs 3
        let path = findShortestPath(db, 'A', 'C', {
            weightFunction: (edge) => edge.weight || 1
        });

        // Path should include A, E, C chronologically
        expect(path.length).toBe(3);
        expect(path[0].id).toBe('A');
        expect(path[1].id).toBe('E');
        expect(path[2].id).toBe('C');
    });

    test('findShortestPath computes disconnected nodes safely as empty Arrays', async () => {
        let path = findShortestPath(db, 'A', 'F');
        expect(path.length).toBe(0);
    });

    test('findShortestPath resolves self-references successfully', async () => {
        let path = findShortestPath(db, 'A', 'A');
        expect(path.length).toBe(1);
        expect(path[0].id).toBe('A');
    });
});
