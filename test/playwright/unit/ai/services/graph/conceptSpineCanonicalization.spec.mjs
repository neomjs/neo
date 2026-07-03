import {test, expect} from '@playwright/test';

import {
    applyConceptSpineMergePlan,
    buildConceptSpineMergePlan,
    canonicalizeSemanticGraphNodeId,
    canonicalizeTaggedConceptIds,
    chooseCanonicalConceptId,
    executeConceptSpineMergePlan,
    normalizeConceptKey
} from '../../../../../../ai/services/graph/conceptSpineCanonicalization.mjs';

test.describe('conceptSpineCanonicalization', () => {
    test('normalizes legacy semantic prefixes to bare lower-kebab ids', () => {
        expect(normalizeConceptKey('CONCEPT:GoldenPath')).toBe('golden-path');
        expect(normalizeConceptKey('CLASS:Neo.ai.services.memory-core.MailboxService')).toBe('neo-ai-services-memory-core-mailbox-service');
        expect(normalizeConceptKey('PROCESS:Dream Pipeline')).toBe('dream-pipeline');
        expect(canonicalizeSemanticGraphNodeId({
            id  : 'CONCEPT:Golden Path Synthesis',
            type: 'CONCEPT'
        })).toBe('golden-path-synthesis');
        expect(canonicalizeSemanticGraphNodeId({
            id  : 'file:learn/agentos/DreamPipeline.md',
            type: 'FILE'
        })).toBe('file:learn/agentos/DreamPipeline.md');
    });

    test('canonicalizes tagged concept filters while preserving first-seen order', () => {
        expect(canonicalizeTaggedConceptIds([
            'CONCEPT:GoldenPath',
            'golden-path',
            'v13.1',
            'ADR-0019'
        ])).toEqual([
            'golden-path',
            'v13-1',
            'adr-0019'
        ]);
    });

    test('falls back to raw semantic ids when canonicalization would empty the key', () => {
        expect(canonicalizeSemanticGraphNodeId({
            id  : 'CONCEPT:日本語',
            type: 'CONCEPT',
            name: '日本語'
        })).toBe('CONCEPT:日本語');

        expect(canonicalizeSemanticGraphNodeId({
            id  : 'CONCEPT:★★★',
            type: 'CONCEPT'
        })).toBe('CONCEPT:★★★');
    });

    test('prefers existing bare canonical ids before deriving from prefixed aliases', () => {
        expect(chooseCanonicalConceptId(
            ['CONCEPT:GoldenPath', 'golden-path', 'CONCEPT:Golden Path Synthesis'],
            new Set(['golden-path', 'golden-path-synthesis'])
        )).toBe('golden-path');
    });

    test('plans and applies alias merges with MAX-weight edge collision handling', () => {
        const nodes = [
            {
                id        : 'golden-path',
                type      : 'CONCEPT',
                properties: {name: 'Golden Path'}
            },
            {
                id        : 'CONCEPT:GoldenPath',
                type      : 'CONCEPT',
                properties: {name: 'Golden Path'}
            },
            {
                id        : 'CONCEPT:Golden Path Synthesis',
                type      : 'CONCEPT',
                properties: {
                    name   : 'Golden Path Synthesis',
                    aliases: ['Golden Path']
                }
            },
            {
                id        : 'file:learn/agentos/DreamPipeline.md',
                type      : 'FILE',
                properties: {}
            }
        ];

        const edges = [
            {
                id        : 'edge-canonical',
                source    : 'golden-path',
                target    : 'file:learn/agentos/DreamPipeline.md',
                type      : 'EXPLAINED_BY',
                properties: {weight: 0.4}
            },
            {
                id        : 'edge-alias',
                source    : 'CONCEPT:GoldenPath',
                target    : 'file:learn/agentos/DreamPipeline.md',
                type      : 'EXPLAINED_BY',
                properties: {weight: 0.9}
            },
            {
                id        : 'edge-other-alias',
                source    : 'CONCEPT:Golden Path Synthesis',
                target    : 'file:learn/agentos/DreamPipeline.md',
                type      : 'IMPLEMENTED_BY',
                properties: {weight: 0.7}
            }
        ];

        const plan = buildConceptSpineMergePlan({
            nodes,
            edges,
            generatedAt: '2026-07-03T00:00:00.000Z'
        });

        expect(plan.clusters).toHaveLength(1);
        expect(plan.clusters[0].canonicalId).toBe('golden-path');
        expect(plan.clusters[0].aliases).toEqual([
            'CONCEPT:Golden Path Synthesis',
            'CONCEPT:GoldenPath'
        ]);

        const result        = applyConceptSpineMergePlan({nodes, edges, plan});
        const explainedBy   = result.edges.find(edge => edge.id === 'edge-canonical');
        const implementedBy = result.edges.find(edge => edge.type === 'IMPLEMENTED_BY');

        expect(explainedBy.source).toBe('golden-path');
        expect(explainedBy.properties.weight).toBe(0.9);
        expect(explainedBy.properties.conceptSpineMergeCollision).toBe(true);
        expect(result.edges.some(edge => edge.id === 'edge-alias')).toBe(false);
        expect(implementedBy.source).toBe('golden-path');

        const aliasNode = result.nodes.find(node => node.id === 'CONCEPT:GoldenPath');
        expect(aliasNode.properties.aliasOf).toBe('golden-path');
        expect(aliasNode.properties.conceptSpineTombstonedAt).toBe('2026-07-03T00:00:00.000Z');
        expect(result.applied.removedDuplicateEdges).toBe(1);
    });

    test('executes merge plans against a GraphService-like mutation seam', () => {
        const nodes = [
            {
                id        : 'golden-path',
                label     : 'CONCEPT',
                properties: {name: 'Golden Path'}
            },
            {
                id        : 'CONCEPT:GoldenPath',
                label     : 'CONCEPT',
                properties: {name: 'Golden Path'}
            },
            {
                id        : 'file:learn/agentos/DreamPipeline.md',
                label     : 'FILE',
                properties: {}
            }
        ];

        const edges = [
            {
                id        : 'edge-canonical',
                source    : 'golden-path',
                target    : 'file:learn/agentos/DreamPipeline.md',
                type      : 'EXPLAINED_BY',
                properties: {weight: 0.4}
            },
            {
                id        : 'edge-alias',
                source    : 'CONCEPT:GoldenPath',
                target    : 'file:learn/agentos/DreamPipeline.md',
                type      : 'EXPLAINED_BY',
                properties: {weight: 0.9}
            }
        ];

        const plan = buildConceptSpineMergePlan({
            nodes,
            edges,
            generatedAt: '2026-07-03T00:00:00.000Z'
        });

        const graphService = createFakeGraphService({nodes, edges});
        const applied      = executeConceptSpineMergePlan({graphService, plan});

        expect(applied).toEqual({
            clusters             : 1,
            tombstonedAliases    : 1,
            rewiredEdges         : 1,
            removedDuplicateEdges: 1
        });

        const edge = graphService.db.edges.get('edge-canonical');
        expect(edge.source).toBe('golden-path');
        expect(edge.properties.weight).toBe(0.9);
        expect(edge.properties.conceptSpineMergeCollision).toBe(true);
        expect(graphService.db.edges.get('edge-alias')).toBeNull();

        const aliasNode = graphService.db.nodes.get('CONCEPT:GoldenPath');
        expect(aliasNode.properties.aliasOf).toBe('golden-path');
        expect(graphService.acknowledged).toBe(true);
    });
});

function createFakeGraphService({nodes, edges}) {
    const
        nodeMap = new Map(nodes.map(node => [node.id, cloneFixtureRecord(node)])),
        edgeMap = new Map(edges.map(edge => [edge.id, cloneFixtureRecord(edge)]));

    const graphService = {
        acknowledged: false,
        db          : null,
        upsertNode(node) {
            const existing = nodeMap.get(node.id) || {
                id        : node.id,
                label     : node.type,
                properties: {}
            };

            existing.label      = node.type || existing.label;
            existing.properties = {
                ...(existing.properties || {}),
                ...(node.properties || {})
            };
            nodeMap.set(node.id, existing);
        }
    };

    graphService.db = {
        get autoSave() {
            return true;
        },
        nodes: {
            get: id => nodeMap.get(id) || null
        },
        edges: {
            get  : id => edgeMap.get(id) || null,
            items: [...edgeMap.values()]
        },
        storage: {
            addEdges(updatedEdges) {
                for (const edge of updatedEdges) {
                    edgeMap.set(edge.id, edge);
                }
                graphService.db.edges.items = [...edgeMap.values()];
            }
        },
        removeEdge(id) {
            edgeMap.delete(id);
            this.edges.items = [...edgeMap.values()];
        },
        transaction(fn) {
            return fn();
        },
        acknowledgeLocalMutations() {
            graphService.acknowledged = true;
        }
    };

    return graphService;
}

function cloneFixtureRecord(record) {
    return {
        ...record,
        properties: {...(record.properties || {})}
    };
}
