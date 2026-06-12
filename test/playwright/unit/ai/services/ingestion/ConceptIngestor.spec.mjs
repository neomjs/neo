import {setup} from '../../../../setup.mjs';

const appName = 'ConceptIngestorTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.ConceptIngestor', () => {
    let GraphService;
    let ConceptIngestor;
    let ConceptService;
    let logger;
    let SystemLifecycleService;

    const testDbName = `memory-core-concept-ingestor-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    let tmpConceptsDir;

    let originalWarn;
    let warnMessages = [];

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph   = testDbPath;
        aiConfig.autoIngestFileSystem = false;
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff_concept_ingestor.md');

        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        ConceptIngestor        = (await import('../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        ConceptService         = (await import('../../../../../../ai/services/ConceptService.mjs')).default;
        logger                 = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.beforeEach(() => {
        ConceptService.nodes.clear();
        ConceptService.edgesBySource.clear();
        ConceptService.edgesByTarget.clear();
        ConceptService.aliasIndex.clear();
        ConceptService.loaded = false;

        tmpConceptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-ingestor-test-'));
        ConceptService.defaultConceptsDir = tmpConceptsDir;

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }

        warnMessages = [];
        originalWarn = logger.warn;
        logger.warn  = (...args) => {
            warnMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        };
    });

    test.afterEach(() => {
        if (originalWarn) logger.warn = originalWarn;

        if (tmpConceptsDir && fs.existsSync(tmpConceptsDir)) {
            try { fs.rmSync(tmpConceptsDir, {recursive: true}); } catch (e) {}
        }

        // Symmetric cleanup: ConceptService is a cross-spec singleton. Under `fullyParallel: true`
        // Playwright interleaves tests from multiple spec files in the same worker, so leaving
        // `loaded = true` after our last sync call leaks state into ConceptService.spec.mjs tests
        // that assert fresh-module state (e.g. `should throw if query methods are called before
        // loadGraph`). Resetting here, not only in beforeEach, closes that cross-spec door.
        ConceptService.nodes.clear();
        ConceptService.edgesBySource.clear();
        ConceptService.edgesByTarget.clear();
        ConceptService.aliasIndex.clear();
        ConceptService.loaded = false;
    });

    test.afterAll(async () => {
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    /**
     * Writes the given nodes + edges into the per-test concept fixture dir as JSONL files
     * the ConceptService will pick up on the next `loadGraph()` call.
     * @param {Object[]} nodes
     * @param {Object[]} edges
     */
    function writeFixture(nodes, edges) {
        fs.writeFileSync(
            path.join(tmpConceptsDir, 'nodes.jsonl'),
            nodes.map(n => JSON.stringify(n)).join('\n'),
            'utf8'
        );
        fs.writeFileSync(
            path.join(tmpConceptsDir, 'edges.jsonl'),
            edges.map(e => JSON.stringify(e)).join('\n'),
            'utf8'
        );
    }

    test('should skip unchanged concepts via payload hash match (differential sync)', async () => {
        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const first = await ConceptIngestor.syncConceptsToGraph();
        expect(first.conceptsProcessed).toBe(1);
        expect(first.conceptsUpserted).toBe(1);
        expect(first.conceptsSkipped).toBe(0);
        expect(GraphService.db.nodes.get('threading').properties.verifiedAt).toBeNull();

        const second = await ConceptIngestor.syncConceptsToGraph();
        expect(second.conceptsProcessed).toBe(1);
        expect(second.conceptsUpserted).toBe(0);
        expect(second.conceptsSkipped).toBe(1);
    });

    test('should re-upsert concept when payload fields change (hash mismatch)', async () => {
        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Original description', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'}]
        );

        await ConceptIngestor.syncConceptsToGraph();

        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Updated description', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const second = await ConceptIngestor.syncConceptsToGraph();
        expect(second.conceptsUpserted).toBe(1);
        expect(second.conceptsSkipped).toBe(0);

        const node = GraphService.db.nodes.get('threading');
        expect(node.properties.description).toBe('Updated description');
    });

    test('should persist verifiedAt and re-upsert concept when freshness changes (#10574)', async () => {
        writeFixture(
            [{
                id         : 'threading',
                name       : 'Multi-Threading',
                tier       : 1,
                description: 'Workers',
                uniqueToNeo: true,
                tags       : ['arch'],
                verifiedAt : null
            }],
            [{source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'}]
        );

        await ConceptIngestor.syncConceptsToGraph();

        let node = GraphService.db.nodes.get('threading');
        expect(node.properties.verifiedAt).toBeNull();

        writeFixture(
            [{
                id         : 'threading',
                name       : 'Multi-Threading',
                tier       : 1,
                description: 'Workers',
                uniqueToNeo: true,
                tags       : ['arch'],
                verifiedAt : '2026-05-01T00:00:00.000Z'
            }],
            [{source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const second = await ConceptIngestor.syncConceptsToGraph();

        expect(second.conceptsUpserted).toBe(1);
        expect(second.conceptsSkipped).toBe(0);

        node = GraphService.db.nodes.get('threading');
        expect(node.properties.verifiedAt).toBe('2026-05-01T00:00:00.000Z');
    });

    test('should count orphan concepts in stats without emitting per-orphan logger.warn (#10087)', async () => {
        // Post-#10087: orphan surfacing moved from the ephemeral logger.warn channel to the
        // durable capabilityGap channel via GapInferenceEngine.inferConceptGraphGaps. ConceptIngestor
        // retains the count for the cycle-summary info line but no longer warns per orphan.
        writeFixture(
            [
                {id: 'anchored', name: 'Anchored Concept', tier: 1, description: 'Has implementation', uniqueToNeo: false, tags: []},
                {id: 'orphan',   name: 'Orphan Concept',   tier: 1, description: 'No source anchor',   uniqueToNeo: false, tags: []}
            ],
            [{source: 'anchored', target: 'file:src/Anchored.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const stats = await ConceptIngestor.syncConceptsToGraph();

        expect(stats.orphansDetected).toBe(1);

        // The per-orphan warn was deliberately removed — only the cycle-summary info line should
        // reference the count, and nothing at warn level should mention this specific orphan.
        const perOrphanWarn = warnMessages.find(m => m.includes('Orphan concept detected') || m.includes('Orphan Concept'));
        expect(perOrphanWarn).toBeUndefined();
    });

    test('should persist only edges with canonical CONCEPT_EDGE_TYPES', async () => {
        writeFixture(
            [{id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []}],
            [
                {source: 'a', target: 'file:a.mjs',         type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'file:a-guide.md',    type: 'EXPLAINED_BY'},
                {source: 'a', target: 'file:a-invalid.md',  type: 'INVALID_TYPE'}
            ]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const outbound = GraphService.db.edges.getByIndex('source', 'a');
        const types    = outbound.map(e => e.type);

        expect(types).toContain('IMPLEMENTED_BY');
        expect(types).toContain('EXPLAINED_BY');
        expect(types).not.toContain('INVALID_TYPE');
    });

    test('should seed stub nodes for edge targets with correct namespace labels (file:/ext:/concept)', async () => {
        writeFixture(
            [
                {id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []},
                {id: 'b', name: 'B', tier: 2, description: '', uniqueToNeo: false, tags: []}
            ],
            [
                {source: 'a', target: 'file:src/A.mjs',  type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'ext:react-hooks', type: 'ANALOGOUS_TO'},
                {source: 'a', target: 'b',               type: 'PARENT_CONCEPT'}
            ]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const fileNode = GraphService.db.nodes.get('file:src/A.mjs');
        expect(fileNode).toBeDefined();
        expect(fileNode.label).toBe('FILE');

        const extNode = GraphService.db.nodes.get('ext:react-hooks');
        expect(extNode).toBeDefined();
        expect(extNode.label).toBe('EXT');

        // Concept 'b' is materialized as a real CONCEPT node by its own upsert (no stub), not by the stub pathway.
        const conceptB = GraphService.db.nodes.get('b');
        expect(conceptB).toBeDefined();
        expect(conceptB.label).toBe('CONCEPT');
    });

    test('should produce identical graph state across two consecutive sync calls (idempotency)', async () => {
        writeFixture(
            [
                {id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []},
                {id: 'b', name: 'B', tier: 2, description: '', uniqueToNeo: false, tags: []}
            ],
            [
                {source: 'a', target: 'file:a.mjs', type: 'IMPLEMENTED_BY'},
                {source: 'b', target: 'file:b.mjs', type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'b',          type: 'PARENT_CONCEPT'}
            ]
        );

        const first = await ConceptIngestor.syncConceptsToGraph();
        const nodesAfterFirst = new Set(GraphService.db.nodes.items.map(n => n.id));
        const edgesAfterFirst = GraphService.db.edges.items
            .map(e => `${e.source}|${e.target}|${e.type}`)
            .sort()
            .join('\n');

        const second = await ConceptIngestor.syncConceptsToGraph();
        const nodesAfterSecond = new Set(GraphService.db.nodes.items.map(n => n.id));
        const edgesAfterSecond = GraphService.db.edges.items
            .map(e => `${e.source}|${e.target}|${e.type}`)
            .sort()
            .join('\n');

        // Graph-state equivalence
        expect(nodesAfterSecond.size).toBe(nodesAfterFirst.size);
        for (const id of nodesAfterFirst) {
            expect(nodesAfterSecond.has(id)).toBe(true);
        }
        expect(edgesAfterSecond).toBe(edgesAfterFirst);

        // Skip-path contract: idempotency means the second sync must hit the hash-match skip path
        // rather than re-upsert (which could silently diverge if differential-sync regressed).
        // Without this assertion, a broken skip path that still produced identical final state
        // would pass the graph-equivalence checks above — false green.
        expect(second.conceptsSkipped).toBe(first.conceptsProcessed);
        expect(second.conceptsUpserted).toBe(0);
        expect(second.edgesReplaced).toBe(0);
    });

    test('should return stats object with the documented shape', async () => {
        writeFixture(
            [{id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []}],
            [{source: 'a', target: 'file:a.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const stats = await ConceptIngestor.syncConceptsToGraph();

        expect(stats).toHaveProperty('conceptsProcessed');
        expect(stats).toHaveProperty('conceptsUpserted');
        expect(stats).toHaveProperty('conceptsSkipped');
        expect(stats).toHaveProperty('edgesReplaced');
        expect(stats).toHaveProperty('orphansDetected');
        expect(stats).toHaveProperty('errors');

        expect(typeof stats.conceptsProcessed).toBe('number');
        expect(typeof stats.conceptsUpserted).toBe('number');
        expect(typeof stats.conceptsSkipped).toBe('number');
        expect(typeof stats.edgesReplaced).toBe('number');
        expect(typeof stats.orphansDetected).toBe('number');
        expect(Array.isArray(stats.errors)).toBe(true);
    });
});
