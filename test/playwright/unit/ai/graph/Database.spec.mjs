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
import SQLite         from '../../../../../ai/graph/storage/SQLite.mjs';
import fs             from 'fs-extra';
import path           from 'path';
import os             from 'os';

test.describe('Neo.ai.graph.Database', () => {
    let db;
    let testRun = 0;
    
    // Build an isolated tmp path for the database file tests
    const dbPath = path.join(os.tmpdir(), 'neo-graph-test.db');

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

    test('should persist nodes and edges properly using SQLite storage adapter', async () => {
        // Clean out previous runs
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();
        
        let persistentDb = Neo.create(Database, {
            id: 'sqlite-graph-test',
            storage: storage
        });

        persistentDb.addNode({ id: 'node1', label: 'Person', properties: { name: 'Alice' } });
        persistentDb.addNode({ id: 'node2', label: 'Person', properties: { name: 'Bob' } });
        persistentDb.addEdge({ id: 'e1', source: 'node1', target: 'node2', type: 'KNOWS', weight: 1.0 });

        expect(persistentDb.nodes.getCount()).toBe(2);
        expect(persistentDb.edges.getCount()).toBe(1);

        // Discard DB and ensure disk mapping survives via new instance
        persistentDb.destroy();

        let storageReload = Neo.create(SQLite, { dbPath });
        await storageReload.initAsync();
        
        let reloadDb = Neo.create(Database, {
            id: 'sqlite-graph-reload',
            storage: storageReload
        });

        await storageReload.load();

        // Since Graph uses Distributed Lazy Loading, memory limits are 0 until accessed intelligently natively!
        expect(reloadDb.nodes.getCount()).toBe(0);
        expect(reloadDb.edges.getCount()).toBe(0);

        // Fetch Vicinity synchronously simulating standalone engine Traversal perfectly.
        reloadDb.getAdjacentNodes('node1');

        expect(reloadDb.nodes.getCount()).toBe(2);
        expect(reloadDb.edges.getCount()).toBe(1);
        expect(reloadDb.nodes.get('node1').properties.name).toBe('Alice');
        expect(reloadDb.edges.get('e1').type).toBe('KNOWS');

        reloadDb.destroy();
    });

    test('should execute graph mutations synchronously within an atomic transaction', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();
        
        let dbTransaction = Neo.create(Database, {
            id: 'sqlite-graph-transcation',
            storage: storage
        });

        dbTransaction.transaction(() => {
            dbTransaction.addNode({ id: 'X' });
            dbTransaction.addNode({ id: 'Y' });
            dbTransaction.addEdge({ id: 'E1', source: 'X', target: 'Y', type: 'TEST' });
            
            // Nested checks should "see" data instantly in isolated synchronous thread natively 
            expect(dbTransaction.nodes.getCount()).toBe(2);
            expect(dbTransaction.edges.getCount()).toBe(1);
        });

        // After transaction executes SQLite synchronously, verifying data survived cleanly natively
        expect(dbTransaction.nodes.getCount()).toBe(2);
        
        // Ensure disk mappings captured transaction cleanly
        dbTransaction.destroy();

        let storageReload = Neo.create(SQLite, { dbPath });
        await storageReload.initAsync();
        
        let reloadDb = Neo.create(Database, {
            id: 'sqlite-graph-txn-reload',
            storage: storageReload
        });
        await storageReload.load();

        // Distributed Vicinity Load mapping Lazy Memory internally perfectly
        reloadDb.getAdjacentNodes('X'); 

        expect(reloadDb.edges.getCount()).toBe(1);
        reloadDb.destroy();
    });

    test('should instantly rollback Memory Collections if transaction boundary throws', async () => {
        let dbRollback = Neo.create(Database, { id: 'graph-rollback-test' });

        dbRollback.addNode({ id: 'Base' });
        expect(dbRollback.nodes.getCount()).toBe(1);

        try {
            dbRollback.transaction(() => {
                dbRollback.addNode({ id: 'Poison' });
                dbRollback.addEdge({ id: 'badEdge', source: 'Base', target: 'Poison' });
                
                // Assert it works momentarily 
                expect(dbRollback.nodes.getCount()).toBe(2);
                
                throw new Error("Triggered Exception!");
            });
        } catch(e) {
            // Error intentionally caught gracefully natively 
        }

        // Memory rollback sequence has automatically fired instantly deleting uncommitted nodes cleanly!
        expect(dbRollback.nodes.getCount()).toBe(1);
        expect(dbRollback.edges.getCount()).toBe(0);
        expect(!dbRollback.nodes.has('Poison')).toBe(true);
        
        dbRollback.destroy();
    });

    test('should enforce Cache Coherence flushing stale footprints dynamically directly mapping SQLite hardware triggers seamlessly', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        let storagePrimary = Neo.create(SQLite, { dbPath });
        await storagePrimary.initAsync();
        await storagePrimary.load();
        let dbPrimary = Neo.create(Database, { id: 'cache-p', storage: storagePrimary });

        dbPrimary.addNode({ id: 'core' });
        dbPrimary.addNode({ id: 'branch' });
        dbPrimary.addEdge({ id: 'route1', source: 'core', target: 'branch', type: 'LINKS' });

        // Spin up second standalone Neo Database instance mimicking another Node.js App Worker process securely!
        let storageSecondary = Neo.create(SQLite, { dbPath });
        await storageSecondary.initAsync();
        let dbSecondary = Neo.create(Database, { id: 'cache-s', storage: storageSecondary });
        await storageSecondary.load();

        // Load Vicinity inside Secondary instance pulling it directly into Memory correctly
        dbSecondary.getAdjacentNodes('core');
        expect(dbSecondary.nodes.getCount()).toBe(2);
        
        // Emulate Primary Server completely bypassing Secondary Process Memory internally modifying disk bounds directly!
        dbPrimary.removeNode('branch'); 
        
        // Automatically hardware Trigger executed locally recording branch deletion on GraphLog internally.
        // If Secondary Process hits an adjacent lookup, it automatically sweeps Garbage Logs!
        dbSecondary.getAdjacentNodes('core');

        // Verify Secondary correctly invalidated Memory autonomously flawlessly natively!
        expect(dbSecondary.nodes.has('branch')).toBe(false);
        expect(dbSecondary.nodes.getCount()).toBe(1);

        dbPrimary.destroy();
        dbSecondary.destroy();
    });
});
