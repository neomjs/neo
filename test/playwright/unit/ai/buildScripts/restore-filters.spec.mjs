import {setup} from '../../../setup.mjs';

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

import {test, expect}   from '@playwright/test';
import fs               from 'fs';
import fsExtra          from 'fs-extra';
import os               from 'os';
import path             from 'path';

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
 *
 * NOT in this spec (deferred):
 *   - Full `runRestore` flow with filters (covered in restore.spec.mjs once
 *     #11142 lands and test isolation is hardened).
 *   - `INSERT OR IGNORE` row-level semantics (requires real SQLite; gated on
 *     #11142 wipe-path fix to run safely).
 *   - Chroma-side parity (#11144 follow-up).
 */
test.describe.configure({mode: 'serial'});

test.describe('restore.mjs filters + hooks (#11141)', () => {
    let parseArgs, prepareFilteredGraphDir, dispatchPostRestoreHook;
    let workRoot;

    const silentLogger = {log: () => {}, warn: () => {}, error: () => {}};

    test.beforeAll(async () => {
        const mod = await import('../../../../../buildScripts/ai/restore.mjs');
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
});
