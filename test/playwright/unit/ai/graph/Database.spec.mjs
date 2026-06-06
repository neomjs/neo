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
import BetterSqlite   from 'better-sqlite3';
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

    function seedLegacyGraphFile({schemaVersion} = {}) {
        const legacyDb = new BetterSqlite(dbPath);

        try {
            legacyDb.exec(`
                CREATE TABLE Nodes (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                );
                CREATE TABLE Edges (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    target TEXT NOT NULL,
                    type TEXT NOT NULL,
                    data TEXT NOT NULL
                );
            `);

            legacyDb.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(
                'legacy-source',
                JSON.stringify({id: 'legacy-source', label: 'Legacy', properties: {name: 'Source'}})
            );
            legacyDb.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(
                'legacy-target',
                JSON.stringify({id: 'legacy-target', label: 'Legacy', properties: {name: 'Target'}})
            );
            legacyDb.prepare('INSERT INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)').run(
                'legacy-edge',
                'legacy-source',
                'legacy-target',
                'LEGACY',
                JSON.stringify({id: 'legacy-edge', source: 'legacy-source', target: 'legacy-target', type: 'LEGACY'})
            );

            if (schemaVersion !== undefined) {
                legacyDb.exec(`
                    CREATE TABLE SchemaVersion (
                        id TEXT PRIMARY KEY,
                        version INTEGER NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                legacyDb.prepare('INSERT INTO SchemaVersion (id, version) VALUES (?, ?)').run('graph', schemaVersion);
            }
        } finally {
            legacyDb.close();
        }
    }

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

    test('should reject invalid node ids before Store.remove sees null (#11698)', async () => {
        expect(() => db.removeNode(null)).toThrow(/non-empty string node id/);
        expect(() => db.removeNode(undefined)).toThrow(/non-empty string node id/);
        expect(() => db.removeNode('')).toThrow(/non-empty string node id/);
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

    test('SQLite storage rejects invalid node ids before persistence (#11698)', async () => {
        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();

        try {
            expect(() => storage.addNodes([{ id: null, label: 'Broken', properties: {} }])).toThrow(/non-empty string id/);
            expect(() => storage.addNodes([{ label: 'Broken', properties: {} }])).toThrow(/non-empty string id/);
        } finally {
            storage.destroy();
        }
    });

    test('SQLite initSchema preserves legacy graph rows when GraphLog is missing (#10233)', async () => {
        seedLegacyGraphFile();

        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();

        try {
            expect(storage.db.prepare('SELECT COUNT(*) as c FROM Nodes').get().c).toBe(2);
            expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(1);
            expect(storage.db.prepare('SELECT version FROM SchemaVersion WHERE id = ?').get('graph').version).toBe(1);
            expect(storage.db.prepare('PRAGMA table_info(Nodes)').all().map(column => column.name)).toContain('user_id');
            expect(storage.db.prepare('PRAGMA table_info(Edges)').all().map(column => column.name)).toContain('user_id');
            expect(storage.db.prepare('SELECT COUNT(*) as c FROM GraphLog').get().c).toBe(0);
        } finally {
            if (storage.db?.open) storage.db.close();
            storage.destroy();
        }
    });

    test('SQLite initSchema refuses unsupported graph schema versions without wipe opt-in (#10233)', async () => {
        seedLegacyGraphFile({schemaVersion: 999});

        let storage = Neo.create(SQLite, { dbPath });

        try {
            await expect(storage.initAsync()).rejects.toThrow(/Unsupported SQLite graph schema version 999/);
        } finally {
            if (storage.db?.open) storage.db.close();
            storage.destroy();
        }

        const verifyDb = new BetterSqlite(dbPath);

        try {
            expect(verifyDb.prepare('SELECT COUNT(*) as c FROM Nodes').get().c).toBe(2);
            expect(verifyDb.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(1);
            expect(verifyDb.prepare('SELECT version FROM SchemaVersion WHERE id = ?').get('graph').version).toBe(999);
        } finally {
            verifyDb.close();
        }
    });

    test('SQLite initSchema resets unsupported graph schema only with explicit wipe opt-in (#10233)', async () => {
        seedLegacyGraphFile({schemaVersion: 999});

        const previousWipeOptIn = process.env.NEO_ALLOW_SCHEMA_WIPE;
        const originalWarn      = console.warn;
        const warnings          = [];
        let storage             = Neo.create(SQLite, { dbPath });

        try {
            process.env.NEO_ALLOW_SCHEMA_WIPE = 'true';
            console.warn = message => warnings.push(String(message));

            await storage.initAsync();

            expect(storage.db.prepare('SELECT COUNT(*) as c FROM Nodes').get().c).toBe(0);
            expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(0);
            expect(storage.db.prepare('SELECT version FROM SchemaVersion WHERE id = ?').get('graph').version).toBe(1);
            expect(warnings.join('\n')).toContain('NEO_ALLOW_SCHEMA_WIPE=true');
            expect(warnings.join('\n')).toContain('Unsupported SQLite graph schema version 999');
        } finally {
            console.warn = originalWarn;
            if (previousWipeOptIn === undefined) {
                delete process.env.NEO_ALLOW_SCHEMA_WIPE;
            } else {
                process.env.NEO_ALLOW_SCHEMA_WIPE = previousWipeOptIn;
            }
            if (storage.db?.open) storage.db.close();
            storage.destroy();
        }
    });

    test('SQLite storage enables foreign_keys pragma — source-side Edges cascade-delete (#10856)', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();

        // The pragma must be ON for the schema-declared `Edges` ON DELETE CASCADE to fire.
        // SQLite default is OFF; explicit init pragma is the only enable path per-connection.
        const pragmaState = storage.db.pragma('foreign_keys', { simple: true });
        expect(pragmaState).toBe(1);

        // Direct-SQL fixture (bypasses application-layer edge cleanup so we test FK cascade specifically).
        storage.db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('cascade-source', '{}');
        storage.db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('cascade-target', '{}');
        storage.db.prepare('INSERT INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)')
            .run('cascade-edge', 'cascade-source', 'cascade-target', 'KNOWS', '{}');

        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(1);

        // Direct-SQL delete of the source Node — only the FK ON DELETE CASCADE can remove the edge here.
        storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run('cascade-source');

        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(0);
        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Nodes').get().c).toBe(1);

        storage.destroy();
    });

    test('SQLite storage enables foreign_keys pragma — target-side Edges cascade-delete (#10856)', async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

        let storage = Neo.create(SQLite, { dbPath });
        await storage.initAsync();

        // Mirror of the source-side test. The schema declares both source AND target FKs with
        // ON DELETE CASCADE; this test asserts the target-side cascade fires equivalently.
        const pragmaState = storage.db.pragma('foreign_keys', { simple: true });
        expect(pragmaState).toBe(1);

        storage.db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('cascade-source', '{}');
        storage.db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('cascade-target', '{}');
        storage.db.prepare('INSERT INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)')
            .run('cascade-edge', 'cascade-source', 'cascade-target', 'KNOWS', '{}');

        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(1);

        // Direct-SQL delete of the TARGET Node — target-side FK ON DELETE CASCADE.
        storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run('cascade-target');

        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Edges').get().c).toBe(0);
        expect(storage.db.prepare('SELECT COUNT(*) as c FROM Nodes').get().c).toBe(1);

        storage.destroy();
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

    test('should rollback remove-by-key node removal without TypeError on string.Symbol assignment (#11595)', async () => {
        // Regression #11595: GraphMaintenanceService apoptosis pass called
        // GraphService.removeNodes(['CONCEPT:foo', ...]) inside a transaction; on rollback, the
        // mutate event payload's removedItems contained STRING IDs (not actual node objects)
        // because Collection.Base.splice() emitted `toRemoveArray || removedItems` — the INPUT
        // key array, not the locally-computed actual-removed-objects array. Rollback then called
        // store.add(stringIds) which triggered Store.assignInternalId() to attempt setting
        // Symbol(Neo.internalId) on a primitive string → TypeError.
        //
        // Fix at src/collection/Base.mjs:1611: emit `removedItems` (local objects), not
        // `toRemoveArray || removedItems`. This test exercises the exact failure path: remove
        // node by key inside transaction → throw → rollback must restore the node-as-object
        // without TypeError.
        let dbRollbackByKey = Neo.create(Database, { id: 'graph-rollback-by-key-test' });

        dbRollbackByKey.addNode({ id: 'CONCEPT:sunset-restart-cycle', type: 'CONCEPT', label: 'pre-remove-state' });
        expect(dbRollbackByKey.nodes.getCount()).toBe(1);

        try {
            dbRollbackByKey.transaction(() => {
                dbRollbackByKey.removeNode('CONCEPT:sunset-restart-cycle'); // remove by STRING key
                expect(dbRollbackByKey.nodes.getCount()).toBe(0);
                throw new Error('Simulated apoptosis pass failure (post-removal)');
            });
        } catch(e) {
            expect(e.message).toBe('Simulated apoptosis pass failure (post-removal)');
        }

        // Rollback must restore the original node WITHOUT throwing TypeError on string-as-object.
        expect(dbRollbackByKey.nodes.getCount()).toBe(1);
        expect(dbRollbackByKey.nodes.has('CONCEPT:sunset-restart-cycle')).toBe(true);
        // Verify the restored node is the original OBJECT (not a string wrapper).
        const restored = dbRollbackByKey.nodes.get('CONCEPT:sunset-restart-cycle');
        expect(typeof restored).toBe('object');
        expect(restored.label).toBe('pre-remove-state');

        dbRollbackByKey.destroy();
    });

    test('should rollback remove-by-key edge removal without TypeError (#11595)', async () => {
        // Sibling regression #11595: same shape-mismatch class on the edge-removal path.
        // `Database.removeEdge(edgeId)` flows STRING IDs through the mutate event. Rollback must
        // restore the edge as an OBJECT without TypeError on string.Symbol assignment. Per #11595
        // AC explicit requirement (caught by @neo-gpt PR #11611 Cycle 1 review): "Edge rollback
        // remains covered; removing edges by string ID must not regress."
        let dbEdgeRollback = Neo.create(Database, { id: 'graph-edge-rollback-test' });

        dbEdgeRollback.addNode({ id: 'A', label: 'src' });
        dbEdgeRollback.addNode({ id: 'B', label: 'dst' });
        dbEdgeRollback.addEdge({ id: 'AB', source: 'A', target: 'B', type: 'TEST' });
        expect(dbEdgeRollback.edges.getCount()).toBe(1);
        expect(dbEdgeRollback.edges.get('AB').type).toBe('TEST');

        try {
            dbEdgeRollback.transaction(() => {
                dbEdgeRollback.removeEdge('AB'); // remove by STRING key
                expect(dbEdgeRollback.edges.getCount()).toBe(0);
                throw new Error('Simulated post-edge-removal failure');
            });
        } catch(e) {
            expect(e.message).toBe('Simulated post-edge-removal failure');
        }

        // Rollback must restore the original edge OBJECT (not a string wrapper).
        expect(dbEdgeRollback.edges.getCount()).toBe(1);
        expect(dbEdgeRollback.edges.has('AB')).toBe(true);
        const restoredEdge = dbEdgeRollback.edges.get('AB');
        expect(typeof restoredEdge).toBe('object');
        expect(restoredEdge.source).toBe('A');
        expect(restoredEdge.target).toBe('B');
        expect(restoredEdge.type).toBe('TEST');

        dbEdgeRollback.destroy();
    });

    test('Collection.splice mutate-event removedItems is always object-shaped, regardless of remove-by-key vs remove-by-object input (#11595)', async () => {
        // Direct contract test: the mutate event payload's removedItems must be the locally-built
        // actual-removed-objects array, not the input keys. V-B-A on consumer impact across the
        // 5 mutate-event listeners in the codebase (per @neo-gpt PR #11611 Cycle 1 review):
        // 2 require object-shape (Database.onEdgesMutate + onNodesMutate); 3 are payload-neutral
        // or shape-flexible (Collection.Base.onMutate forwards via splice which handles both,
        // Data.Store.onCollectionMutate uses only addedItems, Grid.Container.onColumnsMutate
        // ignores mutation payload). Fix at Collection.Base.splice() is consumer-safe.
        let dbContract = Neo.create(Database, { id: 'graph-mutate-contract-test' });
        let capturedPayloads = [];

        dbContract.addNode({ id: 'node-a', type: 'TEST' });
        dbContract.nodes.on('mutate', mutation => {
            if (mutation.removedItems?.length > 0) {
                capturedPayloads.push(mutation.removedItems);
            }
        });

        // Path 1: remove by STRING key
        dbContract.nodes.remove('node-a');
        expect(capturedPayloads.length).toBe(1);
        expect(typeof capturedPayloads[0][0]).toBe('object');
        expect(capturedPayloads[0][0].id).toBe('node-a');

        // Path 2: remove by OBJECT
        dbContract.addNode({ id: 'node-b', type: 'TEST' });
        const nodeB = dbContract.nodes.get('node-b');
        dbContract.nodes.remove(nodeB);
        expect(capturedPayloads.length).toBe(2);
        expect(typeof capturedPayloads[1][0]).toBe('object');
        expect(capturedPayloads[1][0].id).toBe('node-b');

        dbContract.destroy();
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
