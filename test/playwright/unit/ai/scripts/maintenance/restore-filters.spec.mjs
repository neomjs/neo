import {setup} from '../../../../setup.mjs';

const appName = 'RestoreFiltersTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

// Bootstrap parity with existing restore.spec.mjs (#11143/RA-2):
// Importing `restore.mjs` chains to `ai/services.mjs` which loads core classes that
// require `Neo.gatekeep` (Compare.mjs:166) to be registered. The setup() call only
// configures Neo; the core augmentation happens via these imports.
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import fsExtra         from 'fs-extra';
import os              from 'os';
import path            from 'path';

/**
 * #11141 — focused unit tests for the new restore.mjs surfaces:
 *
 * 1. `parseArgs` — new CLI flags (--filter-labels, --filter-edge-types,
 *    --only-substrate, --post-restore-hook) in both `=`-suffix and
 *    space-separated forms; CSV parsing; unknown-flag rejection retained.
 * 2. `prepareFilteredGraphDir` — three-stage FK-safe filter:
 *    cross-bundle node classification, live-snapshot union check, orphan-edge
 *    guard. Tests use synthetic JSONL fixtures (no live SQLite needed).
 * 3. `dispatchPostRestoreHook` — narrow allowlist; explicit reject for
 *    `dream-service`; unknown hook throws.
 * 4. **Graph merge `INSERT OR IGNORE` row-level semantics** — synthetic SQLite
 *    + production schema + `ON DELETE CASCADE` FK on Edges. Asserts the SQL
 *    primitive directly: merge mode preserves live rows + edges; replace mode
 *    overwrites + cascade-deletes (the documented asymmetry). See the inner
 *    `test.describe('graph merge: INSERT OR IGNORE preserves live rows + edges')`.
 *
 * NOT in this spec (deferred):
 *   - Full `runRestore` end-to-end flow against live MC services (covered in
 *     restore.spec.mjs orchestrator-shape tests; live-substrate runs require
 *     test isolation now that #11140/#11142 wipe-path fix is merged).
 *   - Chroma-side `#importMemories` preserve-live parity (#11144 follow-up).
 */
test.describe.configure({mode: 'serial'});

test.describe('restore.mjs filters + hooks (#11141)', () => {
    let parseArgs, prepareFilteredGraphDir, dispatchPostRestoreHook;
    let workRoot;

    const silentLogger = {log: () => {}, warn: () => {}, error: () => {}};

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/maintenance/restore.mjs');
        parseArgs               = mod.parseArgs;
        prepareFilteredGraphDir = mod.prepareFilteredGraphDir;
        dispatchPostRestoreHook = mod.dispatchPostRestoreHook;

        workRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'restore-filters-spec-'));
    });

    test.afterAll(async () => {
        if (workRoot) await fsExtra.remove(workRoot);
    });

    // ─────────────────────────────────────────────────────────────────────
    // parseArgs — new flag coverage
    // ─────────────────────────────────────────────────────────────────────

    test('parseArgs: --filter-labels accepts space-separated CSV', () => {
        const args = parseArgs(['/tmp/bundle', '--filter-labels', 'FILE,DIRECTORY,KB_GAP']);
        expect(args.filterLabels).toEqual(['FILE', 'DIRECTORY', 'KB_GAP']);
    });

    test('parseArgs: --filter-labels=<csv> equals-suffix form', () => {
        const args = parseArgs(['/tmp/bundle', '--filter-labels=FILE,DIRECTORY']);
        expect(args.filterLabels).toEqual(['FILE', 'DIRECTORY']);
    });

    test('parseArgs: --filter-edge-types accepts CSV both forms', () => {
        const a = parseArgs(['/tmp/bundle', '--filter-edge-types', 'CONTAINS,DISCOVERED_IN']);
        const b = parseArgs(['/tmp/bundle', '--filter-edge-types=CONTAINS,DISCOVERED_IN']);
        expect(a.filterEdgeTypes).toEqual(['CONTAINS', 'DISCOVERED_IN']);
        expect(b.filterEdgeTypes).toEqual(['CONTAINS', 'DISCOVERED_IN']);
    });

    test('parseArgs: --only-substrate restricts to listed', () => {
        const args = parseArgs(['/tmp/bundle', '--only-substrate=graph,mc']);
        expect(args.onlySubstrate).toEqual(['graph', 'mc']);
    });

    test('parseArgs: --post-restore-hook accepts allowlist name', () => {
        const args = parseArgs(['/tmp/bundle', '--post-restore-hook=filesystem-ingestor']);
        expect(args.postRestoreHook).toBe('filesystem-ingestor');
    });

    test('parseArgs: defaults preserved when new flags absent', () => {
        const args = parseArgs(['/tmp/bundle']);
        expect(args.filterLabels).toEqual([]);
        expect(args.filterEdgeTypes).toEqual([]);
        expect(args.onlySubstrate).toBeNull();
        expect(args.postRestoreHook).toBeNull();
        expect(args.mode).toBe('merge');
    });

    test('parseArgs: unknown-flag rejection still fires', () => {
        expect(() => parseArgs(['/tmp/bundle', '--bogus-flag'])).toThrow(/Unknown flag/);
    });

    test('parseArgs: empty CSV yields empty array (filter inactive)', () => {
        const args = parseArgs(['/tmp/bundle', '--filter-labels=']);
        expect(args.filterLabels).toEqual([]);
    });

    // ─────────────────────────────────────────────────────────────────────
    // prepareFilteredGraphDir — three-stage FK-safe filter
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Builds a synthetic graph JSONL file with the given nodes/edges.
     * Returns the directory path containing the file.
     */
    async function buildSyntheticGraphBundle(testName, nodes, edges) {
        const dir  = path.join(workRoot, testName);
        await fsExtra.ensureDir(dir);
        const file = path.join(dir, 'graph-backup-test.jsonl');
        const lines = [
            ...nodes.map(n => JSON.stringify({type: 'node', data: n})),
            ...edges.map(e => JSON.stringify({type: 'edge', data: e}))
        ];
        await fsExtra.writeFile(file, lines.join('\n') + '\n');
        return dir;
    }

    async function readJsonlRecords(dir) {
        const files = (await fsExtra.readdir(dir)).filter(f => f.endsWith('.jsonl'));
        const records = [];
        for (const f of files) {
            const content = await fsExtra.readFile(path.join(dir, f), 'utf8');
            for (const line of content.split('\n')) {
                if (line.trim()) records.push(JSON.parse(line));
            }
        }
        return records;
    }

    test('filter: drops nodes with matching labels', async () => {
        const sourceDir = await buildSyntheticGraphBundle('label-filter', [
            {id: 'n1', label: 'CONCEPT', properties: {}},
            {id: 'n2', label: 'FILE',    properties: {}},
            {id: 'n3', label: 'CLASS',   properties: {}},
            {id: 'n4', label: 'KB_GAP',  properties: {}}
        ], []);
        const stats = {filteredNodes: 0, filteredEdges: 0, orphanEdges: 0, acceptedNodes: 0};

        const tempDir = await prepareFilteredGraphDir({
            sourceDir,
            filterLabels   : ['FILE', 'KB_GAP'],
            filterEdgeTypes: [],
            liveNodeIds    : new Set(),
            stats,
            logger         : silentLogger
        });

        expect(stats.filteredNodes).toBe(2);
        expect(stats.acceptedNodes).toBe(2);

        const records = await readJsonlRecords(tempDir);
        const ids     = records.filter(r => r.type === 'node').map(r => r.data.id);
        expect(ids.sort()).toEqual(['n1', 'n3']);
    });

    test('filter: drops edges with matching types', async () => {
        const sourceDir = await buildSyntheticGraphBundle('type-filter', [
            {id: 'a', label: 'CONCEPT', properties: {}},
            {id: 'b', label: 'CONCEPT', properties: {}}
        ], [
            {id: 'e1', source: 'a', target: 'b', type: 'TAGGED_CONCEPT', properties: {}},
            {id: 'e2', source: 'a', target: 'b', type: 'CONTAINS',       properties: {}},
            {id: 'e3', source: 'a', target: 'b', type: 'DISCOVERED_IN',  properties: {}}
        ]);
        const stats = {filteredNodes: 0, filteredEdges: 0, orphanEdges: 0, acceptedNodes: 0};

        const tempDir = await prepareFilteredGraphDir({
            sourceDir,
            filterLabels   : [],
            filterEdgeTypes: ['CONTAINS', 'DISCOVERED_IN'],
            liveNodeIds    : new Set(),
            stats,
            logger         : silentLogger
        });

        expect(stats.filteredEdges).toBe(2);
        const records = await readJsonlRecords(tempDir);
        const types   = records.filter(r => r.type === 'edge').map(r => r.data.type);
        expect(types).toEqual(['TAGGED_CONCEPT']);
    });

    test('filter: orphan-edge guard drops edges whose endpoint was filtered out', async () => {
        const sourceDir = await buildSyntheticGraphBundle('orphan-edge', [
            {id: 'concept1', label: 'CONCEPT', properties: {}},
            {id: 'file1',    label: 'FILE',    properties: {}}  // will be filtered
        ], [
            {id: 'edge-to-file', source: 'concept1', target: 'file1', type: 'ORIGINATES_IN', properties: {}}
        ]);
        const stats = {filteredNodes: 0, filteredEdges: 0, orphanEdges: 0, acceptedNodes: 0};

        const tempDir = await prepareFilteredGraphDir({
            sourceDir,
            filterLabels   : ['FILE'],
            filterEdgeTypes: [],
            liveNodeIds    : new Set(),
            stats,
            logger         : silentLogger
        });

        expect(stats.filteredNodes).toBe(1);
        expect(stats.orphanEdges).toBe(1);
        const records = await readJsonlRecords(tempDir);
        // concept1 stays; file1 + ORIGINATES_IN edge dropped
        expect(records.length).toBe(1);
        expect(records[0].data.id).toBe('concept1');
    });

    test('filter: edges to live-only endpoints are preserved (FK-safe via union)', async () => {
        const sourceDir = await buildSyntheticGraphBundle('live-union', [
            {id: 'backup-concept', label: 'CONCEPT', properties: {}}
        ], [
            // edge to live-existing node — must be preserved
            {id: 'e-live', source: 'backup-concept', target: 'live-existing-id', type: 'TAGGED_CONCEPT', properties: {}},
            // edge to nonexistent node — must be dropped
            {id: 'e-orphan', source: 'backup-concept', target: 'never-existed', type: 'TAGGED_CONCEPT', properties: {}}
        ]);
        const stats = {filteredNodes: 0, filteredEdges: 0, orphanEdges: 0, acceptedNodes: 0};

        const tempDir = await prepareFilteredGraphDir({
            sourceDir,
            filterLabels   : [],
            filterEdgeTypes: [],
            liveNodeIds    : new Set(['live-existing-id']),  // simulates a live node ID
            stats,
            logger         : silentLogger
        });

        expect(stats.orphanEdges).toBe(1);
        const records = await readJsonlRecords(tempDir);
        const edges   = records.filter(r => r.type === 'edge');
        expect(edges.length).toBe(1);
        expect(edges[0].data.id).toBe('e-live');
    });

    // ─────────────────────────────────────────────────────────────────────
    // dispatchPostRestoreHook — narrow allowlist
    // ─────────────────────────────────────────────────────────────────────

    test('hook: dream-service explicit-reject', async () => {
        await expect(dispatchPostRestoreHook({hook: 'dream-service', logger: silentLogger}))
            .rejects.toThrow(/intentionally not supported/);
    });

    test('hook: unknown name rejected with allowlist hint', async () => {
        await expect(dispatchPostRestoreHook({hook: 'mystery-hook', logger: silentLogger}))
            .rejects.toThrow(/Unknown post-restore hook.*Allowlist: filesystem-ingestor/);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Row-level INSERT OR IGNORE preserve-live semantics (RA-3 from /pr-review)
    //
    // This is the core semantic correction the entire PR exists for: in merge
    // mode, conflicting graph IDs must preserve the LIVE row (not overwrite
    // with backup, and crucially NOT cascade-delete live edges via the
    // DELETE-then-INSERT shape that `INSERT OR REPLACE` produces under SQLite's
    // implementation).
    //
    // Tests use synthetic SQLite (better-sqlite3 directly) with the production
    // schema shape (Nodes + Edges + ON DELETE CASCADE FK on Edges.source/target).
    // No dependency on GraphService / Memory_DatabaseService boot lifecycle —
    // this asserts the SQL primitive directly.
    // ─────────────────────────────────────────────────────────────────────

    test.describe('graph merge: INSERT OR IGNORE preserves live rows + edges (#11141 core semantic)', () => {
        let Database;

        test.beforeAll(async () => {
            const mod = await import('better-sqlite3');
            Database  = mod.default;
        });

        function buildSyntheticGraphDb() {
            const dbFile = path.join(workRoot, `graph-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
            const db     = new Database(dbFile);
            db.pragma('foreign_keys = ON');
            db.exec(`
                CREATE TABLE Nodes (
                    id      TEXT PRIMARY KEY,
                    user_id TEXT,
                    data    TEXT
                );
                CREATE TABLE Edges (
                    id      TEXT PRIMARY KEY,
                    user_id TEXT,
                    source  TEXT NOT NULL REFERENCES Nodes(id) ON DELETE CASCADE,
                    target  TEXT NOT NULL REFERENCES Nodes(id) ON DELETE CASCADE,
                    type    TEXT NOT NULL,
                    data    TEXT
                );
            `);
            return {db, dbFile};
        }

        test('merge mode (OR IGNORE): conflicting node-id keeps live row, no cascade-delete on its edges', () => {
            const {db, dbFile} = buildSyntheticGraphDb();
            try {
                // Live state: one node + one edge.
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n1', 'LIVE-VERSION')").run();
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n2', 'live')").run();
                db.prepare("INSERT INTO Edges (id, source, target, type) VALUES ('e1', 'n1', 'n2', 'LIVE_EDGE')").run();

                // Backup-style import (merge mode = OR IGNORE) for a conflicting node.
                const insertNodeMerge = db.prepare("INSERT OR IGNORE INTO Nodes (id, user_id, data) VALUES (?, ?, ?)");
                const result = insertNodeMerge.run('n1', null, 'BACKUP-VERSION-WOULD-OVERWRITE');

                // OR IGNORE must report 0 changes (skipped) for the conflict.
                expect(result.changes).toBe(0);

                // Live row preserved.
                const liveData = db.prepare("SELECT data FROM Nodes WHERE id = 'n1'").get();
                expect(liveData.data).toBe('LIVE-VERSION');

                // Critical: live edge NOT cascade-deleted (this would happen with OR REPLACE
                // because SQLite implements OR REPLACE as DELETE-then-INSERT, which fires
                // ON DELETE CASCADE on Edges.source/target → live edge gone).
                const edge = db.prepare("SELECT id, type FROM Edges WHERE id = 'e1'").get();
                expect(edge).toBeDefined();
                expect(edge.type).toBe('LIVE_EDGE');
            } finally {
                db.close();
                fs.unlinkSync(dbFile);
            }
        });

        test('replace mode (OR REPLACE): conflicting node-id overwrites + cascade-deletes its edges (DOCUMENTED behavior)', () => {
            const {db, dbFile} = buildSyntheticGraphDb();
            try {
                // Live state: one node + one edge.
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n1', 'LIVE-VERSION')").run();
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n2', 'live')").run();
                db.prepare("INSERT INTO Edges (id, source, target, type) VALUES ('e1', 'n1', 'n2', 'LIVE_EDGE')").run();

                // Replace mode (OR REPLACE).
                const insertNodeReplace = db.prepare("INSERT OR REPLACE INTO Nodes (id, user_id, data) VALUES (?, ?, ?)");
                const result = insertNodeReplace.run('n1', null, 'BACKUP-VERSION');

                // OR REPLACE reports 1 changes (replaced).
                expect(result.changes).toBe(1);

                // Live row replaced.
                const replacedData = db.prepare("SELECT data FROM Nodes WHERE id = 'n1'").get();
                expect(replacedData.data).toBe('BACKUP-VERSION');

                // The cascade-delete is the empirical reason merge mode MUST NOT use OR REPLACE:
                // Edge with source='n1' was destroyed by ON DELETE CASCADE during the implicit
                // DELETE phase of INSERT OR REPLACE.
                const edge = db.prepare("SELECT id FROM Edges WHERE id = 'e1'").get();
                expect(edge).toBeUndefined();
            } finally {
                db.close();
                fs.unlinkSync(dbFile);
            }
        });

        test('merge mode (OR IGNORE) on edges: conflicting edge-id preserves live edge data', () => {
            const {db, dbFile} = buildSyntheticGraphDb();
            try {
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n1', 'live')").run();
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('n2', 'live')").run();
                db.prepare("INSERT INTO Edges (id, source, target, type, data) VALUES ('e1', 'n1', 'n2', 'LIVE_TYPE', 'LIVE-EDGE-DATA')").run();

                const insertEdgeMerge = db.prepare(`INSERT OR IGNORE INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)`);
                const result = insertEdgeMerge.run('e1', null, 'n1', 'n2', 'BACKUP_TYPE', 'BACKUP-EDGE-DATA-WOULD-OVERWRITE');

                expect(result.changes).toBe(0);

                const live = db.prepare("SELECT type, data FROM Edges WHERE id = 'e1'").get();
                expect(live.type).toBe('LIVE_TYPE');
                expect(live.data).toBe('LIVE-EDGE-DATA');
            } finally {
                db.close();
                fs.unlinkSync(dbFile);
            }
        });

        test('merge mode: backup-only IDs INSERT cleanly (changes=1)', () => {
            const {db, dbFile} = buildSyntheticGraphDb();
            try {
                db.prepare("INSERT INTO Nodes (id, data) VALUES ('live-only', 'live')").run();

                const insertNodeMerge = db.prepare("INSERT OR IGNORE INTO Nodes (id, user_id, data) VALUES (?, ?, ?)");
                const result = insertNodeMerge.run('backup-only', null, 'BACKUP');

                expect(result.changes).toBe(1);

                const both = db.prepare("SELECT id, data FROM Nodes ORDER BY id").all();
                expect(both).toEqual([
                    {id: 'backup-only', data: 'BACKUP'},
                    {id: 'live-only',   data: 'live'}
                ]);
            } finally {
                db.close();
                fs.unlinkSync(dbFile);
            }
        });
    });
});
