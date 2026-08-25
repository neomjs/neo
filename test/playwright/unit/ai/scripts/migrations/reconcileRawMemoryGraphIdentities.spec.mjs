import {setup} from '../../../../setup.mjs';

const appName = 'ReconcileRawMemoryGraphIdentitiesMigrationTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    applyRawMemoryIdentityReconciliation,
    assertApplyPosture,
    parseArgs,
    planRawMemoryIdentityReconciliation,
    readGraphSnapshot,
    scanChromaRows
} from '../../../../../../ai/scripts/migrations/reconcileRawMemoryGraphIdentities.mjs';

/**
 * @param {Object} db
 */
function createSchema(db) {
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE Nodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT NOT NULL
        );
        CREATE TABLE Edges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
        );
    `)
}

/**
 * @param {Object} db
 * @param {Object} node
 */
function insertNode(db, node) {
    const data = {
        id        : node.id,
        label     : node.label,
        properties: node.properties || {}
    };

    db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
        .run(node.id, node.userId ?? null, JSON.stringify(data))
}

/**
 * @param {Object} db
 * @param {Object} edge
 */
function insertEdge(db, edge) {
    const data = {
        id        : edge.id,
        source    : edge.source,
        target    : edge.target,
        type      : edge.type,
        properties: edge.properties || {}
    };

    db.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(edge.id, edge.userId ?? null, edge.source, edge.target, edge.type, JSON.stringify(data))
}

test.describe('reconcileRawMemoryGraphIdentities migration', () => {
    let db;

    test.beforeEach(() => {
        db = new Database(':memory:');
        createSchema(db)
    });

    test.afterEach(() => {
        db.close()
    });

    test('dry-run defaults and unknown flags refuse', () => {
        expect(parseArgs([])).toEqual({apply: false, db: null, help: false, offline: false});
        expect(parseArgs(['--apply']).apply).toBe(true);
        expect(parseArgs(['--apply', '--offline'])).toMatchObject({apply: true, offline: true});
        expect(() => assertApplyPosture(parseArgs(['--apply']))).toThrow(/requires --offline/);
        expect(() => assertApplyPosture(parseArgs(['--apply', '--offline']))).not.toThrow();
        expect(() => parseArgs(['--db'])).toThrow(/non-empty path/);
        expect(() => parseArgs(['--unknown'])).toThrow(/unknown argument/)
    });

    test('the Chroma census walks every page rather than treating one full page as complete', async () => {
        const rows = Array.from({length: 4500}, (_, index) => ({
            id      : `row-${index}`,
            metadata: {sessionId: `session-${index}`}
        }));
        const collection = {
            get: async ({limit, offset}) => {
                const page = rows.slice(offset, offset + limit);

                return {
                    ids      : page.map(row => row.id),
                    metadatas: page.map(row => row.metadata)
                }
            }
        };

        const scanned = await scanChromaRows(collection);

        expect(scanned).toHaveLength(4500);
        expect(scanned[0].id).toBe('row-0');
        expect(scanned.at(-1).id).toBe('row-4499')
    });

    test('classifies every population and plans only verified legacy raw rows', () => {
        const chromaRows = [
            {id: 'agent-only', metadata: {sessionId: 's-a', userId: 'u'}},
            {id: 'legacy-only', metadata: {sessionId: 's-b', userId: 'u'}},
            {id: 'dual', metadata: {sessionId: 's-c', userId: 'u'}},
            {id: 'neither', metadata: {sessionId: 's-d', userId: 'u'}}
        ];
        const graphNodes = [
            {id: 'agent-only', label: 'AGENT_MEMORY', userId: 'u', properties: {chromaId: 'agent-only', sessionId: 's-a', userId: 'u'}},
            {id: 'memory:legacy-only', label: 'MEMORY', userId: 'u', properties: {chromaId: 'legacy-only', sessionId: 's-b', userId: 'u'}},
            {id: 'dual', label: 'AGENT_MEMORY', userId: 'u', properties: {chromaId: 'dual', sessionId: 's-c', userId: 'u', miniSummary: 'keep', name: 'Memory: timestamp'}},
            {id: 'memory:dual', label: 'MEMORY', userId: 'u', properties: {chromaId: 'dual', sessionId: 's-c', userId: 'u', backfilled: true, name: 'dual'}},
            {id: 'tomb', label: 'AGENT_MEMORY', userId: 'u', properties: {archivedAt: '2026-01-01T00:00:00Z'}},
            {id: 'agent-orphan', label: 'AGENT_MEMORY', userId: 'u', properties: {}},
            {id: 'memory:legacy-orphan', label: 'MEMORY', userId: 'u', properties: {chromaId: 'missing'}},
            {id: 'memory:semantic', label: 'MEMORY', userId: null, properties: {concept: 'curated'}}
        ];

        const plan = planRawMemoryIdentityReconciliation({chromaRows, graphNodes, graphEdges: []});

        expect(plan.coverage).toEqual({
            agentOnly         : ['agent-only'],
            legacyOnly        : ['legacy-only'],
            dual              : ['dual'],
            neither           : ['neither'],
            tombstone         : ['tomb'],
            agentOrphan       : ['agent-orphan'],
            legacyOrphan      : ['memory:legacy-orphan'],
            legacyMalformed   : [],
            canonicalCollision: [],
            semanticOnly      : ['memory:semantic']
        });
        expect(plan.nodeActions.map(action => action.canonicalId)).toEqual(['dual', 'legacy-only']);
        expect(plan.conflicts).toEqual([]);
        expect(plan.nodeActions.find(action => action.canonicalId === 'dual').data.properties)
            .toMatchObject({miniSummary: 'keep', backfilled: true, name: 'Memory: timestamp'})
    });

    test('apply retargets edges, collapses an equivalent duplicate, and preserves negative controls', () => {
        for (const node of [
            {id: 'source', label: 'CONCEPT', properties: {}},
            {id: 'session:s', label: 'SESSION', properties: {}},
            {id: 'dual', label: 'AGENT_MEMORY', userId: 'u', properties: {chromaId: 'dual', sessionId: 's', userId: 'u', miniSummary: 'keep'}},
            {id: 'memory:dual', label: 'MEMORY', userId: 'u', properties: {chromaId: 'dual', sessionId: 's', userId: 'u', backfilled: true}},
            {id: 'memory:legacy', label: 'MEMORY', userId: 'u', properties: {chromaId: 'legacy', sessionId: 's', userId: 'u'}},
            {id: 'memory:semantic', label: 'MEMORY', properties: {concept: 'keep'}},
            {id: 'tomb', label: 'AGENT_MEMORY', userId: 'u', properties: {archivedAt: '2026-01-01T00:00:00Z'}}
        ]) insertNode(db, node);

        for (const edge of [
            {id: 'edge-canonical', userId: 'u', source: 'source', target: 'dual', type: 'MENTIONED_IN', properties: {weight: 1, userId: 'u'}},
            {id: 'edge-legacy', userId: 'u', source: 'source', target: 'memory:dual', type: 'MENTIONED_IN', properties: {weight: 2, userId: 'u'}},
            {id: 'edge-origin', userId: 'u', source: 'memory:legacy', target: 'session:s', type: 'ORIGINATES_IN', properties: {weight: 1, userId: 'u'}},
            {id: 'edge-semantic', source: 'source', target: 'memory:semantic', type: 'DESCRIBES', properties: {weight: 1}}
        ]) insertEdge(db, edge);

        const semanticNodeBefore = db.prepare('SELECT user_id, data FROM Nodes WHERE id = ?').get('memory:semantic');
        const semanticEdgeBefore = db.prepare('SELECT user_id, source, target, type, data FROM Edges WHERE id = ?').get('edge-semantic');

        const snapshot = readGraphSnapshot(db);
        const plan     = planRawMemoryIdentityReconciliation({
            chromaRows: [
                {id: 'dual', metadata: {sessionId: 's', userId: 'u'}},
                {id: 'legacy', metadata: {sessionId: 's', userId: 'u'}},
                {id: 'semantic', metadata: {sessionId: 'other', userId: 'u'}}
            ],
            graphNodes: snapshot.nodes,
            graphEdges: snapshot.edges
        });

        expect(plan.conflicts).toEqual([]);
        expect(applyRawMemoryIdentityReconciliation(db, plan)).toEqual({
            nodesMerged   : 2,
            edgesRewritten: 2,
            edgesDropped  : 1
        });

        const nodeIds = db.prepare('SELECT id FROM Nodes ORDER BY id').all().map(row => row.id);
        expect(nodeIds).toContain('dual');
        expect(nodeIds).toContain('legacy');
        expect(nodeIds).not.toContain('memory:dual');
        expect(nodeIds).not.toContain('memory:legacy');
        expect(nodeIds).toContain('memory:semantic');
        expect(nodeIds).toContain('tomb');

        const edges = db.prepare('SELECT source, target, type, data FROM Edges ORDER BY id').all();
        expect(edges).toHaveLength(3);
        expect(edges.some(edge => edge.source === 'source' && edge.target === 'dual')).toBe(true);
        expect(edges.some(edge => edge.source === 'legacy' && edge.target === 'session:s')).toBe(true);
        const merged = JSON.parse(edges.find(edge => edge.target === 'dual').data);
        expect(merged.properties.weight).toBe(2);
        expect(db.prepare('SELECT user_id, data FROM Nodes WHERE id = ?').get('memory:semantic'))
            .toEqual(semanticNodeBefore);
        expect(db.prepare('SELECT user_id, source, target, type, data FROM Edges WHERE id = ?').get('edge-semantic'))
            .toEqual(semanticEdgeBefore)
    });

    test('semantic suffix collisions stay distinct while malformed raw identities fail closed', () => {
        const graphNodes = [
            {id: 'memory:collision', label: 'MEMORY', userId: null, properties: {concept: 'curated'}},
            {id: 'memory:wrong-key', label: 'MEMORY', userId: 'u', properties: {chromaId: 'raw', userId: 'u'}}
        ];
        const plan = planRawMemoryIdentityReconciliation({
            chromaRows: [
                {id: 'collision', metadata: {userId: 'u'}},
                {id: 'raw', metadata: {userId: 'u'}}
            ],
            graphNodes,
            graphEdges: []
        });

        expect(plan.coverage.neither).toEqual(['collision', 'raw']);
        expect(plan.coverage.semanticOnly).toEqual(['memory:collision']);
        expect(plan.coverage.legacyMalformed).toEqual(['memory:wrong-key']);
        expect(plan.nodeActions).toEqual([]);
        expect(plan.conflicts).toEqual([expect.objectContaining({kind: 'legacy-identity-conflict'})])
    });

    test('a bare-id occupant with a different label is reported and never overwritten', () => {
        insertNode(db, {id: 'raw', label: 'CONCEPT', userId: 'u', properties: {userId: 'u'}});
        insertNode(db, {id: 'memory:raw', label: 'MEMORY', userId: 'u', properties: {chromaId: 'raw', userId: 'u'}});

        const snapshot = readGraphSnapshot(db, {chromaIds: ['raw']});
        const plan     = planRawMemoryIdentityReconciliation({
            chromaRows: [{id: 'raw', metadata: {userId: 'u'}}],
            graphNodes: snapshot.nodes,
            graphEdges: snapshot.edges
        });

        expect(plan.coverage.legacyOnly).toEqual(['raw']);
        expect(plan.coverage.canonicalCollision).toEqual(['raw']);
        expect(plan.nodeActions).toEqual([]);
        expect(plan.conflicts).toEqual([expect.objectContaining({kind: 'canonical-identity-conflict', foundLabel: 'CONCEPT'})]);
        expect(() => applyRawMemoryIdentityReconciliation(db, plan)).toThrow(/refused/);
        expect(JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get('raw').data).label).toBe('CONCEPT')
    });

    test('cross-tenant edge custody blocks retargeting', () => {
        insertNode(db, {id: 'source', label: 'CONCEPT', properties: {}});
        insertNode(db, {id: 'memory:raw', label: 'MEMORY', userId: 'owner-a', properties: {chromaId: 'raw', userId: 'owner-a'}});
        insertEdge(db, {id: 'edge', userId: 'owner-b', source: 'source', target: 'memory:raw', type: 'MENTIONED_IN', properties: {userId: 'owner-b'}});

        const snapshot = readGraphSnapshot(db);
        const plan     = planRawMemoryIdentityReconciliation({
            chromaRows: [{id: 'raw', metadata: {userId: 'owner-a'}}],
            graphNodes: snapshot.nodes,
            graphEdges: snapshot.edges
        });

        expect(plan.conflicts).toEqual([expect.objectContaining({kind: 'edge-property-conflict', fields: ['edge.userId']})]);
        expect(() => applyRawMemoryIdentityReconciliation(db, plan)).toThrow(/refused/);
        expect(db.prepare('SELECT id FROM Nodes ORDER BY id').all()).toEqual([{id: 'memory:raw'}, {id: 'source'}])
    });

    test('a node-property conflict refuses the whole apply and deletes nothing', () => {
        insertNode(db, {id: 'raw', label: 'AGENT_MEMORY', userId: 'owner-a', properties: {chromaId: 'raw', sessionId: 's-a', userId: 'owner-a'}});
        insertNode(db, {id: 'memory:raw', label: 'MEMORY', userId: 'owner-b', properties: {chromaId: 'raw', sessionId: 's-b', userId: 'owner-b'}});

        const snapshot = readGraphSnapshot(db);
        const plan     = planRawMemoryIdentityReconciliation({
            chromaRows: [{id: 'raw', metadata: {sessionId: 's-a', userId: 'owner-a'}}],
            graphNodes: snapshot.nodes,
            graphEdges: snapshot.edges
        });

        expect(plan.conflicts).toHaveLength(1);
        expect(plan.conflicts[0]).toMatchObject({chromaId: 'raw', kind: 'node-property-conflict'});
        expect(() => applyRawMemoryIdentityReconciliation(db, plan)).toThrow(/refused/);
        expect(db.prepare('SELECT COUNT(*) AS count FROM Nodes').get().count).toBe(2)
    });

    test('a second plan after apply is idempotent', () => {
        insertNode(db, {id: 'memory:raw', label: 'MEMORY', userId: 'u', properties: {chromaId: 'raw', sessionId: 's', userId: 'u'}});

        const chromaRows    = [{id: 'raw', metadata: {sessionId: 's', userId: 'u'}}];
        const firstSnapshot = readGraphSnapshot(db);
        const first         = planRawMemoryIdentityReconciliation({
            chromaRows,
            graphNodes: firstSnapshot.nodes,
            graphEdges: firstSnapshot.edges
        });

        applyRawMemoryIdentityReconciliation(db, first);

        const secondSnapshot = readGraphSnapshot(db);
        const second         = planRawMemoryIdentityReconciliation({
            chromaRows,
            graphNodes: secondSnapshot.nodes,
            graphEdges: secondSnapshot.edges
        });

        expect(second.coverage.agentOnly).toEqual(['raw']);
        expect(second.nodeActions).toEqual([]);
        expect(second.edgeActions).toEqual([]);
        expect(second.conflicts).toEqual([])
    })

    test('an apply-time failure rolls the node and edge phases back together', () => {
        insertNode(db, {id: 'source', label: 'CONCEPT', properties: {}});
        insertNode(db, {id: 'memory:raw', label: 'MEMORY', userId: 'u', properties: {chromaId: 'raw', userId: 'u'}});
        insertEdge(db, {id: 'edge', userId: 'u', source: 'source', target: 'memory:raw', type: 'MENTIONED_IN', properties: {weight: 1, userId: 'u'}});

        const snapshot = readGraphSnapshot(db);
        const plan     = planRawMemoryIdentityReconciliation({
            chromaRows: [{id: 'raw', metadata: {userId: 'u'}}],
            graphNodes: snapshot.nodes,
            graphEdges: snapshot.edges
        });

        db.exec(`
            CREATE TRIGGER fail_edge_retarget
            BEFORE UPDATE ON Edges
            BEGIN
                SELECT RAISE(ABORT, 'injected edge failure');
            END;
        `);

        expect(() => applyRawMemoryIdentityReconciliation(db, plan)).toThrow(/injected edge failure/);
        expect(db.prepare('SELECT id FROM Nodes ORDER BY id').all()).toEqual([{id: 'memory:raw'}, {id: 'source'}]);
        expect(db.prepare('SELECT source, target FROM Edges WHERE id = ?').get('edge'))
            .toEqual({source: 'source', target: 'memory:raw'})
    })
});
