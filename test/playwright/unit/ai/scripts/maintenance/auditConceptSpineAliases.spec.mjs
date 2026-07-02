import {test, expect} from '@playwright/test';

import {
    createConceptSpineAliasReport,
    normalizeConceptKey,
    parseEdgeRows,
    parseNodeRows,
    renderMarkdownReport
} from '../../../../../../ai/scripts/maintenance/auditConceptSpineAliases.mjs';

function nodeRow(id, label, properties = {}) {
    return {
        id,
        data: JSON.stringify({
            id,
            label,
            properties
        })
    };
}

function edgeRow(id, source, target, type = 'TAGGED_CONCEPT') {
    return {
        id,
        source,
        target,
        type,
        data: JSON.stringify({
            id,
            source,
            target,
            type,
            properties: {weight: 1}
        })
    };
}

test.describe('auditConceptSpineAliases', () => {
    test('normalizes semantic concept ids into kebab keys', () => {
        expect(normalizeConceptKey('CONCEPT:GoldenPath')).toBe('golden-path');
        expect(normalizeConceptKey('CLASS:Dream Pipeline')).toBe('dream-pipeline');
        expect(normalizeConceptKey('PROCESS:Dream_Pipeline')).toBe('dream-pipeline');
        expect(normalizeConceptKey('Golden Path (GP) Ranking Engine')).toBe('golden-path-gp-ranking-engine');
    });

    test('clusters ids bridged by id, name, and alias keys without live graph writes', () => {
        const nodes = parseNodeRows([
            nodeRow('golden-path', 'CONCEPT', {
                name   : 'Golden Path Synthesis',
                aliases: ['Computed Golden Path']
            }),
            nodeRow('CONCEPT:GoldenPath', 'CONCEPT', {
                name: 'Golden Path (GP) Ranking Engine'
            }),
            nodeRow('CONCEPT:Golden Path Synthesis', 'CONCEPT', {
                name: 'Golden Path Synthesis'
            }),
            nodeRow('CLASS:Computed Golden Path', 'CLASS', {
                name: 'Computed Golden Path'
            }),
            nodeRow('CONCEPT:golden-path-dependency', 'CONCEPT', {
                name: 'golden-path-dependency'
            }),
            nodeRow('file-ai/services/graph/GoldenPathSynthesizer.mjs', 'FILE', {
                name: 'GoldenPathSynthesizer.mjs'
            })
        ]);

        const edges = parseEdgeRows([
            edgeRow('e1', 'golden-path', 'file:learn/agentos/DreamPipeline.md', 'EXPLAINED_BY'),
            edgeRow('e2', 'CONCEPT:GoldenPath', 'file:ai/services/graph/GoldenPathSynthesizer.mjs', 'IMPLEMENTED_BY'),
            edgeRow('e3', 'CONCEPT:Golden Path Synthesis', 'file:learn/agentos/DreamPipeline.md', 'EXPLAINED_BY'),
            edgeRow('e4', 'CLASS:Computed Golden Path', 'memory:1', 'TAGGED_CONCEPT'),
            edgeRow('e5', 'CONCEPT:golden-path-dependency', 'memory:2', 'TAGGED_CONCEPT')
        ]);

        const report = createConceptSpineAliasReport({
            nodes,
            edges,
            generatedAt: '2026-07-02T20:00:00.000Z',
            graphDb    : '/tmp/mock.sqlite'
        });

        expect(report.summary.semanticNodeCount).toBe(5);
        expect(report.summary.aliasClusterCount).toBe(1);

        const [cluster] = report.clusters;
        expect(cluster.canonicalCandidate).toBe('golden-path');
        expect(cluster.nodeIds).toEqual([
            'CLASS:Computed Golden Path',
            'CONCEPT:Golden Path Synthesis',
            'CONCEPT:GoldenPath',
            'golden-path'
        ]);
        expect(cluster.keys).toContain('golden-path');
        expect(cluster.keys).toContain('golden-path-synthesis');
        expect(cluster.keys).toContain('computed-golden-path');
        expect(cluster.neighborhood.totalNeighborSignatures).toBe(3);
        expect(cluster.neighborhood.sharedNeighborCount).toBe(1);
        expect(cluster.neighborhood.disjointNeighborCount).toBe(2);
    });

    test('renders known probe clusters and summary into markdown', () => {
        const report = createConceptSpineAliasReport({
            generatedAt: '2026-07-02T20:00:00.000Z',
            graphDb    : '/tmp/mock.sqlite',
            nodes      : parseNodeRows([
                nodeRow('dream-pipeline', 'CONCEPT', {name: 'Dream Pipeline'}),
                nodeRow('CONCEPT:DreamPipeline', 'CONCEPT', {name: 'Dream Pipeline'}),
                nodeRow('CLASS:DreamPipeline', 'CLASS', {name: 'Dream Pipeline'})
            ]),
            edges: parseEdgeRows([
                edgeRow('e1', 'dream-pipeline', 'file:learn/agentos/DreamPipeline.md', 'EXPLAINED_BY'),
                edgeRow('e2', 'CONCEPT:DreamPipeline', 'memory:1', 'TAGGED_CONCEPT')
            ])
        });

        const markdown = renderMarkdownReport(report, {top: 1});

        expect(markdown).toContain('# Concept Spine Alias Cluster Report - 2026-07-02');
        expect(markdown).toContain('- Dream Pipeline: 3 nodes');
        expect(markdown).toContain('| 1 | `dream-pipeline` | 3 |');
        expect(markdown).toContain('Detection only: this artifact performs no graph writes');
    });
});
