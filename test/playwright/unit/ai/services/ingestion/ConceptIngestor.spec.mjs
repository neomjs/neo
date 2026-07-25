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

import {test, expect}                          from '@playwright/test';
import Neo                                     from '../../../../../../src/Neo.mjs';
import * as core                               from '../../../../../../src/core/_export.mjs';
import fs                                      from 'fs';
import path                                    from 'path';
import os                                      from 'os';
import {snapshotAiConfig, TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.ConceptIngestor', () => {
    let GraphService;
    let ConceptIngestor;
    let ConceptService;
    let logger;
    let SystemLifecycleService;

    let tmpConceptsDir;
    let restoreAiConfig;

    let originalWarn;
    let warnMessages = [];

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        restoreAiConfig = snapshotAiConfig(aiConfig, ['handoffFilePath']);

        // Isolation is by construction: `storagePaths.graph` is a formula resolving `graphTest`
        // (`:memory:`) under `UNIT_TEST_MODE`, and a `:memory:` store is process-local — stronger
        // than the shared tmp file this suite used to repoint it at.
        aiConfig.handoffFilePath    = path.join(tmpDir, 'mock_sandman_handoff_concept_ingestor.md');

        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        ConceptIngestor        = (await import('../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        ConceptService         = (await import('../../../../../../ai/services/ConceptService.mjs')).default;
        logger                 = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.afterAll(() => {
        restoreAiConfig?.();
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
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, fs, 'clear');
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

    /**
     * Returns the Concept Ontology-owned outbound edges for a source node.
     * @param {String} sourceId
     * @returns {Object[]}
     */
    function getOwnedEdges(sourceId) {
        return GraphService.db.edges.getByIndex('source', sourceId)
            .filter(edge => edge.properties?.projectionSource === 'concept-ontology-jsonl')
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

    test('should reconcile edge-only JSONL changes while the node payload stays skipped', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        await ConceptIngestor.syncConceptsToGraph();

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs',                      type: 'IMPLEMENTED_BY'},
            {source: 'threading', target: 'file:learn/agentos/ConceptOntology.md', type: 'EXPLAINED_BY'}
        ]);

        const second = await ConceptIngestor.syncConceptsToGraph();

        expect(second.conceptsSkipped).toBe(1);
        expect(second.conceptsUpserted).toBe(0);
        expect(second.edgesAdded).toBe(1);
        expect(getOwnedEdges('threading').map(edge => edge.type).sort()).toEqual(['EXPLAINED_BY', 'IMPLEMENTED_BY']);
    });

    test('should preserve matching edge identity and decayed weight while updating source metadata', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY', note: 'Original note'}
        ]);

        await ConceptIngestor.syncConceptsToGraph();

        const firstEdge = getOwnedEdges('threading')[0];
        const firstId   = firstEdge.id;

        GraphService.db.transaction(() => {
            GraphService.db.edges.remove(firstEdge);
            GraphService.db.addEdge({
                id        : firstEdge.id,
                source    : firstEdge.source,
                target    : firstEdge.target,
                type      : firstEdge.type,
                properties: {...firstEdge.properties, weight: 0.42}
            })
        });

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY', note: 'Corrected note'}
        ]);

        const second = await ConceptIngestor.syncConceptsToGraph();
        const edge   = getOwnedEdges('threading')[0];

        expect(second.conceptsSkipped).toBe(1);
        expect(second.edgesUpdated).toBe(1);
        expect(edge.id).toBe(firstId);
        expect(edge.properties.weight).toBe(0.42);
        expect(edge.properties.note).toBe('Corrected note');
        expect(edge.properties.axes).toEqual({
            authority           : {trustTier: 'repo-trusted'},
            extractionProvenance: {curated: true, source: 'concept-ontology-jsonl'},
            fidelity            : {degraded: false, sourceTier: 'curated'},
            lifecycle           : {state: 'promoted'}
        });
    });

    test('should re-derive a declared edge after ambient pruning without changing protection policy', async () => {
        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const firstId = getOwnedEdges('threading')[0].id;

        GraphService.decayGlobalTopology(0.1, 0.2, true);
        expect(GraphService.db.edges.get(firstId)).toBeNull();

        const second = await ConceptIngestor.syncConceptsToGraph();
        const edge   = getOwnedEdges('threading')[0];

        expect(second.edgesAdded).toBe(1);
        expect(edge.id).not.toBe(firstId);
        expect(edge.properties.weight).toBe(1.0);
    });

    test('should remove only JSONL-owned rows while preserving a foreign same-tuple edge', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        await ConceptIngestor.syncConceptsToGraph();

        GraphService.db.addEdge({
            source    : 'threading',
            target    : 'file-src/Neo.mjs',
            type      : 'IMPLEMENTED_BY',
            properties: {projectionSource: 'foreign-producer', weight: 0.7}
        });

        writeFixture([node], []);

        const second   = await ConceptIngestor.syncConceptsToGraph();
        const outbound = GraphService.db.edges.getByIndex('source', 'threading').filter(edge => edge.type === 'IMPLEMENTED_BY');

        expect(second.edgesRemoved).toBe(1);
        expect(outbound).toHaveLength(1);
        expect(outbound[0].properties.projectionSource).toBe('foreign-producer');
        expect(outbound[0].properties.weight).toBe(0.7);
    });

    test('should discard index-only ghosts instead of adopting them as live projection state', async () => {
        const ghost = {
            id        : 'index-only-ghost',
            source    : 'threading',
            target    : 'file-src/Neo.mjs',
            type      : 'IMPLEMENTED_BY',
            properties: {projectionSource: 'concept-ontology-jsonl', weight: 0.2}
        };

        GraphService.db.edges.updateIndexMaps([ghost], null);

        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const stats = await ConceptIngestor.syncConceptsToGraph();
        const edges = getOwnedEdges('threading');

        expect(stats.edgesAdded).toBe(1);
        expect(GraphService.db.edges.get('index-only-ghost')).toBeNull();
        expect(edges).toHaveLength(1);
        expect(edges[0].id).not.toBe('index-only-ghost');
        expect(edges[0].properties.weight).toBe(1);
    });

    test('should not reconcile a same-ID edge whose canonical source moved elsewhere', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        await ConceptIngestor.syncConceptsToGraph();

        const moved = getOwnedEdges('threading')[0];

        GraphService.upsertNode({id: 'foreign-source', type: 'CONCEPT'});
        GraphService.db.transaction(() => {
            GraphService.db.edges.remove(moved);
            GraphService.db.addEdge({...moved, source: 'foreign-source'})
        });

        const stats     = await ConceptIngestor.syncConceptsToGraph();
        const projected = getOwnedEdges('threading');
        const foreign   = GraphService.db.edges.getByIndex('source', 'foreign-source');

        expect(stats.edgesAdded).toBe(1);
        expect(projected).toHaveLength(1);
        expect(projected[0].id).not.toBe(moved.id);
        expect(foreign).toHaveLength(1);
        expect(foreign[0].id).toBe(moved.id);
    });

    test('should migrate legacy file: projection once and retire only the unreferenced verified stub', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        GraphService.upsertNode({
            id        : 'threading',
            type      : 'CONCEPT',
            name      : node.name,
            properties: {payloadHash: ConceptIngestor.computePayloadHash(node)}
        });
        GraphService.upsertNode({
            id        : 'file:src/Neo.mjs',
            type      : 'FILE',
            name      : 'src/Neo.mjs',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.db.addEdge({
            id        : 'legacy-concept-edge',
            source    : 'threading',
            target    : 'file:src/Neo.mjs',
            type      : 'IMPLEMENTED_BY',
            properties: {weight: 0.64}
        });

        const stats = await ConceptIngestor.syncConceptsToGraph();

        expect(stats.legacyStubsRemoved).toBe(1);
        expect(GraphService.db.nodes.get('file:src/Neo.mjs')).toBeNull();
        expect(getOwnedEdges('threading')).toHaveLength(1);
        expect(getOwnedEdges('threading')[0]).toMatchObject({
            id        : 'legacy-concept-edge',
            target    : 'file-src/Neo.mjs',
            properties: {weight: 0.64}
        });
        const persistedEdge = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Edges WHERE id = ?')
            .get('legacy-concept-edge').data);
        expect(persistedEdge).toMatchObject({
            id        : 'legacy-concept-edge',
            target    : 'file-src/Neo.mjs',
            properties: {weight: 0.64}
        });
        expect(GraphService.db.storage.db.prepare('SELECT id FROM Nodes WHERE id = ?')
            .get('file:src/Neo.mjs')).toBeUndefined();
        expect(GraphService.db.nodes.get('threading').properties.conceptProjectionVersion).toBe(1);
    });

    test('should not adopt an ownerless ontology edge without historical payload-hash proof', async () => {
        const node = {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        GraphService.upsertNode({id: 'threading', type: 'CONCEPT', name: node.name});
        GraphService.upsertNode({id: 'file-src/Neo.mjs', type: 'FILE'});
        GraphService.db.addEdge({
            id        : 'unproven-ownerless-edge',
            source    : 'threading',
            target    : 'file-src/Neo.mjs',
            type      : 'IMPLEMENTED_BY',
            properties: {weight: 0.55}
        });

        const stats = await ConceptIngestor.syncConceptsToGraph();

        const outbound = GraphService.db.edges.getByIndex('source', 'threading')
            .filter(edge => edge.target === 'file-src/Neo.mjs' && edge.type === 'IMPLEMENTED_BY');

        expect(GraphService.db.edges.get('unproven-ownerless-edge')).toMatchObject({
            id        : 'unproven-ownerless-edge',
            properties: {weight: 0.55}
        });
        expect(GraphService.db.edges.get('unproven-ownerless-edge').properties.projectionSource).toBeUndefined();
        expect(outbound).toHaveLength(2);
        expect(outbound.find(edge => edge.id !== 'unproven-ownerless-edge')?.properties.projectionSource)
            .toBe('concept-ontology-jsonl');
        expect(stats).toMatchObject({edgesAdded: 1, edgesRemoved: 0, edgesUpdated: 0});
    });

    test('should not re-enter legacy adoption for a future projection version', async () => {
        const node = {id: 'future-threading', name: 'Future Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']};

        writeFixture([node], [
            {source: 'future-threading', target: 'file:src/Neo.mjs',       type: 'IMPLEMENTED_BY'},
            {source: 'future-threading', target: 'file:missing/Future.mjs', type: 'IMPLEMENTED_BY'}
        ]);

        GraphService.upsertNode({
            id        : 'future-threading',
            type      : 'CONCEPT',
            name      : node.name,
            properties: {
                conceptProjectionVersion: 2,
                payloadHash             : ConceptIngestor.computePayloadHash(node)
            }
        });
        GraphService.upsertNode({id: 'file-src/Neo.mjs', type: 'FILE'});
        GraphService.db.addEdge({
            id        : 'future-ownerless-edge',
            source    : 'future-threading',
            target    : 'file-src/Neo.mjs',
            type      : 'IMPLEMENTED_BY',
            properties: {weight: 0.45}
        });

        const stats    = await ConceptIngestor.syncConceptsToGraph();
        const outbound = GraphService.db.edges.getByIndex('source', 'future-threading')
            .filter(edge => edge.target === 'file-src/Neo.mjs' && edge.type === 'IMPLEMENTED_BY');

        expect(GraphService.db.edges.get('future-ownerless-edge').properties).toMatchObject({weight: 0.45});
        expect(GraphService.db.edges.get('future-ownerless-edge').properties.projectionSource).toBeUndefined();
        expect(GraphService.db.nodes.get('future-threading').properties.conceptProjectionVersion).toBe(2);
        expect(GraphService.db.nodes.get('future-threading').properties.conceptProjectionIntegrityFindings)
            .toEqual([expect.objectContaining({code: 'MISSING_FILE', target: 'file:missing/Future.mjs'})]);
        expect(outbound).toHaveLength(2);
        expect(stats.integrityFindings).toHaveLength(1);
        expect(stats).toMatchObject({edgesAdded: 1, edgesRemoved: 0, edgesUpdated: 0});
    });

    test('should preserve richer FileSystemIngestor metadata across a cold-cache projection', async () => {
        GraphService.upsertNode({
            id        : 'file-src/Neo.mjs',
            type      : 'FILE',
            name      : 'Neo.mjs',
            properties: {
                hash             : 'real-hash',
                isConceptEdgeStub: false,
                mtimeMs          : 123,
                path             : 'src/Neo.mjs'
            }
        });

        GraphService.db.nodes.clearSilent();
        GraphService.db.edges.clearSilent();
        GraphService.db.vicinityLoadedNodes.clear();

        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']}],
            [{source: 'threading', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const fileNode = GraphService.db.nodes.get('file-src/Neo.mjs');

        expect(fileNode.properties).toMatchObject({
            hash             : 'real-hash',
            isConceptEdgeStub: false,
            mtimeMs          : 123,
            name             : 'Neo.mjs',
            path             : 'src/Neo.mjs'
        });
    });

    test('should retire a verified orphan legacy stub even when it starts outside the RAM cache', async () => {
        GraphService.upsertNode({
            id        : 'file:legacy/orphan.mjs',
            type      : 'FILE',
            properties: {isConceptEdgeStub: true}
        });

        GraphService.db.nodes.clearSilent();
        GraphService.db.edges.clearSilent();
        GraphService.db.vicinityLoadedNodes.clear();

        expect(ConceptIngestor.cleanupLegacyFileStubs()).toBe(1);
        expect(GraphService.db.nodes.get('file:legacy/orphan.mjs')).toBeNull();
        expect(GraphService.db.storage.db.prepare('SELECT id FROM Nodes WHERE id = ?')
            .get('file:legacy/orphan.mjs')).toBeUndefined();
    });

    test('should retain a legacy stub when a cold persisted foreign edge still references it', async () => {
        GraphService.upsertNode({
            id        : 'file:src/Neo.mjs',
            type      : 'FILE',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.upsertNode({id: 'foreign-source', type: 'CONCEPT'});
        GraphService.db.addEdge({
            id        : 'foreign-legacy-reference',
            source    : 'foreign-source',
            target    : 'file:src/Neo.mjs',
            type      : 'REFERENCES',
            properties: {projectionSource: 'foreign-producer'}
        });

        GraphService.db.nodes.clearSilent();
        GraphService.db.edges.clearSilent();
        GraphService.db.vicinityLoadedNodes.clear();

        const
            wasAutoSave = GraphService.db.autoSave,
            storedNode  = GraphService.db.storage.db.prepare('SELECT id, data FROM Nodes WHERE id = ?')
                .get('file:src/Neo.mjs');

        const storedData = JSON.parse(storedNode.data);

        GraphService.db.autoSave = false;
        GraphService.db.nodes.add({
            id        : storedNode.id,
            label     : storedData.label,
            properties: storedData.properties
        });
        GraphService.db.autoSave = wasAutoSave;

        expect(GraphService.db.edges.getByIndex('target', 'file:src/Neo.mjs')).toHaveLength(0);
        expect(ConceptIngestor.cleanupLegacyFileStubs()).toBe(0);
        expect(GraphService.db.nodes.get('file:src/Neo.mjs')).toBeTruthy();
        expect(GraphService.db.edges.get('foreign-legacy-reference')).toBeTruthy();
    });

    test('should retain a legacy stub when an edge arrives after enumeration but before atomic deletion', () => {
        GraphService.upsertNode({
            id        : 'file:legacy/race.mjs',
            type      : 'FILE',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.upsertNode({id: 'late-foreign-source', type: 'CONCEPT'});

        const
            db             = GraphService.db,
            originalRemove = db.removeNodeIfUnreferenced.bind(db);

        db.removeNodeIfUnreferenced = (nodeId, options) => {
            if (nodeId === 'file:legacy/race.mjs') {
                db.addEdge({
                    id    : 'late-foreign-edge',
                    source: 'late-foreign-source',
                    target: nodeId,
                    type  : 'REFERENCES'
                })
            }

            return originalRemove(nodeId, options)
        };

        try {
            expect(ConceptIngestor.cleanupLegacyFileStubs()).toBe(0);
        } finally {
            delete db.removeNodeIfUnreferenced
        }

        expect(db.nodes.get('file:legacy/race.mjs')).toBeTruthy();
        expect(db.edges.get('late-foreign-edge')).toBeTruthy();
    });

    test('should retain a legacy stub when its proof marker is revoked before atomic deletion', () => {
        GraphService.upsertNode({
            id        : 'file:legacy/revoked.mjs',
            type      : 'FILE',
            properties: {isConceptEdgeStub: true}
        });

        const
            db             = GraphService.db,
            originalRemove = db.removeNodeIfUnreferenced.bind(db);

        db.removeNodeIfUnreferenced = (nodeId, options) => {
            if (nodeId === 'file:legacy/revoked.mjs') {
                const
                    row  = db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(nodeId),
                    data = JSON.parse(row.data);

                data.properties.isConceptEdgeStub = false;
                db.storage.db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(data), nodeId)
            }

            return originalRemove(nodeId, options)
        };

        try {
            expect(ConceptIngestor.cleanupLegacyFileStubs()).toBe(0);
        } finally {
            delete db.removeNodeIfUnreferenced
        }

        const persisted = JSON.parse(db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?')
            .get('file:legacy/revoked.mjs').data);
        expect(persisted.properties.isConceptEdgeStub).toBe(false);
    });

    test('should compare null cleanup markers with null-safe SQLite semantics', () => {
        const db = GraphService.db;

        GraphService.upsertNode({
            id        : 'atomic-null-marker',
            type      : 'FILE',
            properties: {cleanupMarker: null}
        });

        expect(db.removeNodeIfUnreferenced('atomic-null-marker', {
            requiredPropertyPath : '$.properties.cleanupMarker',
            requiredPropertyValue: null
        })).toBe(true);
        expect(db.storage.db.prepare('SELECT id FROM Nodes WHERE id = ?').get('atomic-null-marker')).toBeUndefined();
    });

    test('should not acknowledge past a peer invalidation after atomic node removal', () => {
        const db = GraphService.db;

        GraphService.upsertNode({
            id        : 'atomic-delete-candidate',
            type      : 'FILE',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.upsertNode({
            id        : 'peer-updated-node',
            type      : 'CONCEPT',
            properties: {version: 1}
        });

        const
            storage        = db.storage,
            originalRemove = storage.removeNodeIfUnreferenced.bind(storage);

        storage.removeNodeIfUnreferenced = (nodeId, options) => {
            const removed = originalRemove(nodeId, options);

            if (removed) {
                const
                    row  = storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get('peer-updated-node'),
                    data = JSON.parse(row.data);

                data.properties.version = 2;
                storage.db.prepare('UPDATE Nodes SET data = ? WHERE id = ?')
                    .run(JSON.stringify(data), 'peer-updated-node')
            }

            return removed
        };

        try {
            expect(db.removeNodeIfUnreferenced('atomic-delete-candidate', {
                requiredPropertyPath : '$.properties.isConceptEdgeStub',
                requiredPropertyValue: true
            })).toBe(true);
        } finally {
            delete storage.removeNodeIfUnreferenced
        }

        expect(db.nodes.get('peer-updated-node').properties.version).toBe(1);

        db.syncCache();
        db.getAdjacentNodes('peer-updated-node', 'both');

        expect(db.nodes.get('peer-updated-node').properties.version).toBe(2);
    });

    test('should persist exact-row integrity findings and never admit a missing file as evidence', async () => {
        writeFixture(
            [{id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Workers', uniqueToNeo: true, tags: ['arch']}],
            [
                {source: 'threading', target: 'file:missing/Nope.mjs', type: 'IMPLEMENTED_BY'},
                {source: 'threading', target: 'file:missing/Nope.mjs', type: 'IMPLEMENTED_BY'}
            ]
        );

        const stats    = await ConceptIngestor.syncConceptsToGraph();
        const node     = GraphService.db.nodes.get('threading');
        const findings = node.properties.conceptProjectionIntegrityFindings;

        expect(getOwnedEdges('threading')).toHaveLength(0);
        expect(stats.integrityFindings).toHaveLength(2);
        expect(findings).toHaveLength(2);
        expect(findings[0]).toMatchObject({
            code  : 'MISSING_FILE',
            source: 'threading',
            target: 'file:missing/Nope.mjs',
            type  : 'IMPLEMENTED_BY'
        });
        expect(findings[0].sourceRow).toBe('{"source":"threading","target":"file:missing/Nope.mjs","type":"IMPLEMENTED_BY"}');
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

    test('should persist process/MX ontology layer projection fields (#13840)', async () => {
        writeFixture(
            [{
                id             : 'coordination-saturation-cycle',
                name           : 'Coordination Saturation Cycle',
                tier           : 3,
                description    : 'Message-born swarm process vocabulary.',
                uniqueToNeo    : false,
                tags           : ['process-mx', 'message-concept-harvest'],
                ontologyLayer  : 'process-mx',
                codeGapEligible: false,
                verifiedAt     : null
            }],
            []
        );

        await ConceptIngestor.syncConceptsToGraph();

        const node = GraphService.db.nodes.get('coordination-saturation-cycle');
        expect(node.properties.ontologyLayer).toBe('process-mx');
        expect(node.properties.codeGapEligible).toBe(false);
        expect(node.properties.tags).toEqual(expect.arrayContaining(['process-mx', 'message-concept-harvest']));
    });

    test('should count orphan concepts in stats without emitting per-orphan logger.warn (#10087)', async () => {
        // Orphan surfacing moved from the ephemeral logger.warn channel to the
        // durable capabilityGap channel via GapInferenceEngine.inferConceptGraphGaps. ConceptIngestor
        // retains the count for the cycle-summary info line but no longer warns per orphan.
        writeFixture(
            [
                {id: 'anchored', name: 'Anchored Concept', tier: 1, description: 'Has implementation', uniqueToNeo: false, tags: []},
                {id: 'orphan',   name: 'Orphan Concept',   tier: 1, description: 'No source anchor',   uniqueToNeo: false, tags: []}
            ],
            [{source: 'anchored', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}]
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
                {source: 'a', target: 'file:src/Neo.mjs',                       type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'file:learn/agentos/ConceptOntology.md',  type: 'EXPLAINED_BY'},
                {source: 'a', target: 'a',                                      type: 'REQUIRES'},
                {source: 'a', target: 'file:src/core/Base.mjs',                 type: 'INVALID_TYPE'}
            ]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const outbound = GraphService.db.edges.getByIndex('source', 'a');
        const types    = outbound.map(e => e.type);

        expect(types).toContain('IMPLEMENTED_BY');
        expect(types).toContain('EXPLAINED_BY');
        expect(types).toContain('REQUIRES');
        expect(types).not.toContain('INVALID_TYPE');
    });

    test('should seed stub nodes for edge targets with correct namespace labels (file:/ext:/concept)', async () => {
        writeFixture(
            [
                {id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []},
                {id: 'b', name: 'B', tier: 2, description: '', uniqueToNeo: false, tags: []}
            ],
            [
                {source: 'a', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'ext:react-hooks', type: 'ANALOGOUS_TO'},
                {source: 'a', target: 'b',               type: 'PARENT_CONCEPT'}
            ]
        );

        await ConceptIngestor.syncConceptsToGraph();

        const fileNode = GraphService.db.nodes.get('file-src/Neo.mjs');
        expect(fileNode).toBeDefined();
        expect(fileNode.label).toBe('FILE');
        expect(GraphService.db.nodes.get('file:src/Neo.mjs')).toBeNull();

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
                {source: 'a', target: 'file:src/Neo.mjs',      type: 'IMPLEMENTED_BY'},
                {source: 'b', target: 'file:src/core/Base.mjs', type: 'IMPLEMENTED_BY'},
                {source: 'a', target: 'b',          type: 'PARENT_CONCEPT'}
            ]
        );

        const first           = await ConceptIngestor.syncConceptsToGraph();
        const nodesAfterFirst = new Set(GraphService.db.nodes.items.map(n => n.id));
        const edgesAfterFirst = GraphService.db.edges.items
            .map(e => `${e.source}|${e.target}|${e.type}`)
            .sort()
            .join('\n');

        const second           = await ConceptIngestor.syncConceptsToGraph();
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

    test('should project the complete repository fixture with all 182 source-owned relationships', async () => {
        ConceptService.defaultConceptsDir = path.resolve(process.cwd(), '.neo-ai-data/concepts');

        const first      = await ConceptIngestor.syncConceptsToGraph();
        const firstEdges = GraphService.db.edges.items
            .filter(edge => edge.properties?.projectionSource === 'concept-ontology-jsonl');
        const firstState = new Map(firstEdges.map(edge => [
            `${edge.source}|${edge.target}|${edge.type}`,
            {id: edge.id, weight: edge.properties.weight}
        ]));

        expect(first.conceptsProcessed).toBe(65);
        expect(first.integrityFindings).toHaveLength(0);
        expect(first.errors).toHaveLength(0);
        expect(firstEdges).toHaveLength(182);
        expect(firstEdges.filter(edge => edge.type === 'REQUIRES')).toHaveLength(14);
        expect(GraphService.db.nodes.items.some(node => node.id.startsWith('file:'))).toBe(false);

        const second      = await ConceptIngestor.syncConceptsToGraph();
        const secondEdges = GraphService.db.edges.items
            .filter(edge => edge.properties?.projectionSource === 'concept-ontology-jsonl');

        expect(second.conceptsSkipped).toBe(65);
        expect(second.edgesReplaced).toBe(0);
        expect(second.edgesUnchanged).toBe(182);
        expect(secondEdges).toHaveLength(182);

        secondEdges.forEach(edge => {
            expect({id: edge.id, weight: edge.properties.weight}).toEqual(firstState.get(`${edge.source}|${edge.target}|${edge.type}`))
        });
    });

    test('should return stats object with the documented shape', async () => {
        writeFixture(
            [{id: 'a', name: 'A', tier: 1, description: '', uniqueToNeo: false, tags: []}],
            [{source: 'a', target: 'file:src/Neo.mjs', type: 'IMPLEMENTED_BY'}]
        );

        const stats = await ConceptIngestor.syncConceptsToGraph();

        expect(stats).toHaveProperty('conceptsProcessed');
        expect(stats).toHaveProperty('conceptsUpserted');
        expect(stats).toHaveProperty('conceptsSkipped');
        expect(stats).toHaveProperty('edgesAdded');
        expect(stats).toHaveProperty('edgesRemoved');
        expect(stats).toHaveProperty('edgesReplaced');
        expect(stats).toHaveProperty('edgesUnchanged');
        expect(stats).toHaveProperty('edgesUpdated');
        expect(stats).toHaveProperty('integrityFindings');
        expect(stats).toHaveProperty('legacyStubsRemoved');
        expect(stats).toHaveProperty('orphansDetected');
        expect(stats).toHaveProperty('errors');

        expect(typeof stats.conceptsProcessed).toBe('number');
        expect(typeof stats.conceptsUpserted).toBe('number');
        expect(typeof stats.conceptsSkipped).toBe('number');
        expect(typeof stats.edgesAdded).toBe('number');
        expect(typeof stats.edgesRemoved).toBe('number');
        expect(typeof stats.edgesReplaced).toBe('number');
        expect(typeof stats.edgesUnchanged).toBe('number');
        expect(typeof stats.edgesUpdated).toBe('number');
        expect(Array.isArray(stats.integrityFindings)).toBe(true);
        expect(typeof stats.legacyStubsRemoved).toBe('number');
        expect(typeof stats.orphansDetected).toBe('number');
        expect(Array.isArray(stats.errors)).toBe(true);
    });
});
