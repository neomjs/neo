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

test.describe('Neo.ai.graph.Database', () => {
    let db;
    let testRun = 0;
    
    // Build an isolated tmp path for the database file tests
    const tmpDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    let dbPath;

    test.beforeEach(async () => {
        testRun++;
        dbPath = path.join(tmpDir, `neo-graph-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
        db = Neo.create(Database, {
            id: 'my-graph-db-' + testRun
        });
    });

    test.afterEach(() => {
        db?.destroy();
        db = null;
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
        }
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

        // Verify Secondary sees additions by Primary
        dbPrimary.addNode({ id: 'new-branch' });
        // The node insertion will trigger a delta log for 'new-branch', which invalidates 'new-branch'.
        // Let's verify B sees the new node if it tries to load its vicinity.
        dbSecondary.getAdjacentNodes('new-branch');
        expect(dbSecondary.nodes.has('new-branch')).toBe(true);

        dbPrimary.destroy();
        dbSecondary.destroy();
    });

    test('should replay GraphLog mutations even on fresh boot when lastSyncId is 0 (Bug A)', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        let storageFresh = Neo.create(SQLite, { dbPath });
        await storageFresh.initAsync();
        let dbFresh = Neo.create(Database, { id: 'cache-fresh', storage: storageFresh });
        await storageFresh.load(); // DB empty -> lastSyncId = 0
        
        expect(dbFresh.lastSyncId).toBe(0);

        let storageOther = Neo.create(SQLite, { dbPath });
        await storageOther.initAsync();
        let dbOther = Neo.create(Database, { id: 'cache-other', storage: storageOther });
        await storageOther.load();
        
        dbOther.addNode({ id: 'race-node' });
        
        // With Bug A fix, syncCache() processes the delta and lastSyncId advances
        dbFresh.syncCache();
        expect(dbFresh.lastSyncId).toBeGreaterThan(0);
        
        dbFresh.destroy();
        dbOther.destroy();
    });

    test('should not mark vicinityLoadedNodes if lazy load returns empty (Bug B)', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();
        let db = Neo.create(Database, { id: 'bug-b', storage });
        await storage.load();

        db.getAdjacentNodes('ghost-node');

        // Should NOT be marked loaded since vicinity was empty
        expect(db.vicinityLoadedNodes.has('ghost-node')).toBe(false);

        db.destroy();
    });

    test('should invalidate vicinity of both endpoints when syncCache invalidates edges (#10260)', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        
        // Setup Primary instance (Agent A)
        let storageA = Neo.create(SQLite, { dbPath });
        await storageA.initAsync();
        let dbA = Neo.create(Database, { id: 'cache-a', storage: storageA });
        await storageA.load();

        // Setup Secondary instance (Agent B)
        let storageB = Neo.create(SQLite, { dbPath });
        await storageB.initAsync();
        let dbB = Neo.create(Database, { id: 'cache-b', storage: storageB });
        await storageB.load();

        // Instance A creates two nodes
        dbA.addNode({ id: 'node-x' });
        dbA.addNode({ id: 'node-y' });

        // Instance B syncs and then accesses both nodes, warming its vicinity cache
        dbB.syncCache();
        dbB.getAdjacentNodes('node-x');
        dbB.getAdjacentNodes('node-y');
        
        expect(dbB.vicinityLoadedNodes.has('node-x')).toBe(true);
        expect(dbB.vicinityLoadedNodes.has('node-y')).toBe(true);
        expect(dbB.edges.getCount()).toBe(0);

        // Instance A adds a new edge between the nodes
        dbA.addEdge({ id: 'edge-xy', source: 'node-x', target: 'node-y', type: 'LINKS' });

        // Without the #10260 fix, dbB.syncCache() would remove the edge ID from delta, 
        // but it wouldn't clear 'node-x' or 'node-y' from vicinityLoadedNodes.
        dbB.syncCache();
        
        // With #10260, they should no longer be marked as loaded
        expect(dbB.vicinityLoadedNodes.has('node-x')).toBe(false);
        expect(dbB.vicinityLoadedNodes.has('node-y')).toBe(false);

        // A subsequent call to getAdjacentNodes triggers a SQLite fetch and hydrates the new edge
        let adjacentToX = dbB.getAdjacentNodes('node-x');
        expect(adjacentToX.length).toBe(1);
        expect(adjacentToX[0].id).toBe('node-y');
        expect(dbB.edges.getCount()).toBe(1);
        expect(dbB.edges.get('edge-xy')).toBeTruthy();

        dbA.destroy();
        dbB.destroy();
    });
});
