import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ConceptNeighborhoodProbeTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    CONTRACT_AXES,
    applyPrivacyContract,
    buildConceptProbeReport,
    conceptClusterKey,
    detectAxisPresence,
    findAliasCluster,
    readRawNodeEdges,
    renderConceptProbeMarkdown,
    walkConceptNeighborhood
} from '../../../../../../ai/services/graph/conceptNeighborhoodProbe.mjs';

/**
 * Hermetic GraphService fake exposing exactly the seams the probe consumes.
 * Any write-path access fails the test — the probe's zero-write contract (#14474 AC; ticket-ref-ok: owning-leaf anchor).
 */
function createGraphServiceFixture({edges = [], nodes = [], failOnWrite = null} = {}) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    return {
        db: {
            storage: {
                db: {
                    prepare(sql) {
                        if (!/^SELECT id, source, target, type, data FROM Edges/.test(sql)) {
                            throw new Error(`Unexpected SQL from read-only probe: ${sql}`)
                        }
                        return {
                            all: (a, b) => edges
                                .filter(e => e.source === a || e.target === b || e.source === b || e.target === a)
                                .map(e => ({
                                    id    : e.id,
                                    source: e.source,
                                    target: e.target,
                                    type  : e.type,
                                    data  : JSON.stringify({properties: e.properties || {}})
                                }))
                        }
                    }
                }
            },
            nodes: {
                get: id => nodeMap.get(id) || null
            },
            addEdge: () => {
                (failOnWrite || (() => { throw new Error('probe wrote an edge') }))()
            }
        },
        upsertNode() {
            (failOnWrite || (() => { throw new Error('probe wrote a node') }))()
        },
        listNodeRecordsByType({type}) {
            return {records: nodes.filter(n => n.label === type).map(n => ({id: n.id}))}
        }
    }
}

const FIXTURE = () => createGraphServiceFixture({
    nodes: [
        {id: 'golden-path',                    label: 'CONCEPT'},
        {id: 'CONCEPT:GoldenPath',             label: 'CONCEPT'},
        {id: 'CONCEPT:Golden Path Synthesis',  label: 'CONCEPT'},
        {id: 'file:src/a.mjs',                 label: 'FILE'},
        {id: 'mem-1',                          label: 'MEMORY'},
        {id: 'issue-1',                        label: 'ISSUE'}
    ],
    edges: [
        {id: 'e1', source: 'golden-path', target: 'file:src/a.mjs', type: 'IMPLEMENTED_BY',
            properties: {weight: 0.83, sourceTier: 'digest'}},
        {id: 'e2', source: 'mem-1', target: 'golden-path', type: 'TAGGED_CONCEPT',
            properties: {weight: 1.0, userId: 'neo-opus-vega'}},
        {id: 'e3', source: 'CONCEPT:GoldenPath', target: 'issue-1', type: 'RESOLVES',
            properties: {weight: 2.0}}
    ]
});

test.describe('Neo.ai.services.graph.conceptNeighborhoodProbe (#14474)', () => {

    test('conceptClusterKey folds all three minted id-conventions onto one cluster key', () => {
        expect(conceptClusterKey('CONCEPT:GoldenPath')).toBe('golden-path');
        expect(conceptClusterKey('golden-path')).toBe('golden-path');
        expect(conceptClusterKey('CONCEPT:Golden Path')).toBe('golden-path');
        expect(conceptClusterKey('CLASS:DreamPipeline')).toBe('dream-pipeline');
        expect(conceptClusterKey('dream-pipeline')).toBe('dream-pipeline');
    });

    test('readRawNodeEdges surfaces the FULL stored property set the getNeighbors projection drops', () => {
        const rows = readRawNodeEdges({graphService: FIXTURE(), nodeId: 'golden-path'});

        expect(rows).toHaveLength(2);

        const e1 = rows.find(r => r.id === 'e1');

        // The projection exposes only weight; the raw read must surface sourceTier too.
        expect(e1.propertyKeys).toEqual(['sourceTier', 'weight']);
        expect(e1.properties.sourceTier).toBe('digest');
        expect(typeof e1.readAt).toBe('string');
        expect(Date.parse(e1.readAt)).not.toBeNaN();
    });

    test('detectAxisPresence distinguishes absent-in-storage from present, per contract axis', () => {
        const withFidelity = detectAxisPresence({weight: 1, sourceTier: 'digest'});

        expect(withFidelity.fidelity).toEqual({present: true, keys: ['sourceTier']});
        expect(withFidelity.authority.present).toBe(false);
        expect(withFidelity.lifecycle.present).toBe(false);

        const bare = detectAxisPresence({weight: 1});

        for (const axis of Object.keys(CONTRACT_AXES)) {
            expect(bare[axis].present).toBe(false)
        }
    });

    test('walkConceptNeighborhood is bounded, stamped, and performs zero writes', () => {
        let   wrote   = false;
        const fixture = createGraphServiceFixture({
            nodes: FIXTURE().listNodeRecordsByType({type: 'CONCEPT'}).records
                .map(r => ({id: r.id, label: 'CONCEPT'}))
                .concat([{id: 'file:src/a.mjs', label: 'FILE'}, {id: 'mem-1', label: 'MEMORY'}]),
            edges: [
                {id: 'e1', source: 'golden-path', target: 'file:src/a.mjs', type: 'IMPLEMENTED_BY', properties: {weight: 1}},
                {id: 'e2', source: 'mem-1', target: 'golden-path', type: 'TAGGED_CONCEPT', properties: {weight: 1}}
            ],
            failOnWrite: () => { wrote = true }
        });

        const walk = walkConceptNeighborhood({graphService: fixture, conceptId: 'golden-path', maxHops: 2, hopBudget: 3});

        expect(wrote).toBe(false);
        expect(walk.hops.length).toBeGreaterThan(0);
        expect(walk.hops.length).toBeLessThanOrEqual(3);
        expect(walk.hops.every(h => typeof h.readAt === 'string')).toBe(true);
        expect(walk.hops.every(h => h.axisPresence)).toBeTruthy();
    });

    test('applyPrivacyContract aggregates MEMORY neighbors — no private ids in structural output', () => {
        const walk                            = walkConceptNeighborhood({graphService: FIXTURE(), conceptId: 'golden-path'});
        const {structural, privateAggregates} = applyPrivacyContract(walk.hops);

        expect(privateAggregates.MEMORY?.count).toBe(1);
        expect(structural.some(h => h.neighborId === 'mem-1')).toBe(false);
        expect(structural.some(h => h.neighborId === 'file:src/a.mjs')).toBe(true);
    });

    test('findAliasCluster groups the three Golden Path aliases via the cluster key', () => {
        const cluster = findAliasCluster({graphService: FIXTURE(), conceptId: 'golden-path'});

        expect(cluster.clusterKey).toBe('golden-path');
        // 'CONCEPT:Golden Path Synthesis' folds to 'golden-path-synthesis' — a DIFFERENT cluster.
        expect(cluster.members).toEqual(['CONCEPT:GoldenPath', 'golden-path']);
        expect(typeof cluster.readAt).toBe('string');
    });

    test('buildConceptProbeReport + renderConceptProbeMarkdown produce the artifact sections', () => {
        const report = buildConceptProbeReport({graphService: FIXTURE(), sample: ['golden-path'], maxHops: 2});

        expect(report.concepts).toHaveLength(1);
        expect(report.concepts[0].cluster.members).toEqual(['CONCEPT:GoldenPath', 'golden-path']);
        // The queried root is always probed, even when the cluster scan misses it (label-atypical roots).
        expect(report.concepts[0].perMember.map(m => m.memberId)).toContain('golden-path');

        const md = renderConceptProbeMarkdown(report);

        expect(md).toContain('## Reachability matrix');
        expect(md).toContain('## Four-axis presence (storage-level, per member)');
        expect(md).toContain('## Fragmentation (alias clusters in-sample)');
        expect(md).toContain('## OQ5 decision inputs (data only — the epic decides)');
        expect(md).toContain('aggregate-only');
        expect(md).not.toContain('mem-1');
    });
});
