import {test, expect} from '@playwright/test';

import {
    createGraphBootSeedEdgeRecord,
    createGraphBootSeedManifest,
    createGraphBootSeedNodeRecord,
    evaluateGraphBootSeedFreshness,
    GRAPH_BOOT_SEED_VERSION
} from '../../../../../ai/graph/bootSeedManifest.mjs';
import {IDENTITIES} from '../../../../../ai/graph/identityRoots.mjs';

test.describe('graph boot-seed manifest', () => {
    test('enumerates the fixed roots, every identity root, and one system edge', () => {
        const manifest = createGraphBootSeedManifest();

        expect(manifest.version).toBe(GRAPH_BOOT_SEED_VERSION);
        expect(manifest.nodes.map(node => node.id)).toEqual([
            'frontier',
            'Neo-Master-Architecture',
            ...IDENTITIES.map(identity => identity.id)
        ]);
        expect(manifest.edges).toEqual([expect.objectContaining({
            source: 'frontier',
            target: 'Neo-Master-Architecture',
            type  : 'SYSTEM_TENET',
            weight: 1
        })]);
        expect(manifest.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    test('accepts only the complete exact persisted seed record set', () => {
        const
            manifest = createGraphBootSeedManifest(),
            nodes    = manifest.nodes.map(createGraphBootSeedNodeRecord),
            edges    = manifest.edges.map((edge, index) => ({
                id: `storage-minted-${index}`,
                ...createGraphBootSeedEdgeRecord(edge)
            }));

        expect(evaluateGraphBootSeedFreshness({nodes, edges, manifest})).toMatchObject({
            fresh    : true,
            reason   : null,
            nodeCount: nodes.length,
            edgeCount: 1
        });
    });

    test('rejects extra, missing, or altered records and ignores only the random edge id', () => {
        const
            manifest = createGraphBootSeedManifest(),
            nodes    = manifest.nodes.map(createGraphBootSeedNodeRecord),
            edge     = createGraphBootSeedEdgeRecord(manifest.edges[0]);

        const extraNode = [...nodes, {
            id        : 'unexpected',
            label     : 'NODE',
            properties: {name: 'unexpected', description: '', userId: null}
        }];
        expect(evaluateGraphBootSeedFreshness({nodes: extraNode, edges: [edge], manifest}).fresh).toBe(false);

        expect(evaluateGraphBootSeedFreshness({nodes: nodes.slice(1), edges: [edge], manifest}).fresh).toBe(false);

        const alteredNodes = structuredClone(nodes);
        alteredNodes[0].properties.description = 'altered';
        expect(evaluateGraphBootSeedFreshness({nodes: alteredNodes, edges: [edge], manifest}).fresh).toBe(false);

        expect(evaluateGraphBootSeedFreshness({
            nodes,
            edges: [{id: 'any-id', ...edge, properties: {...edge.properties, weight: 1.1}}],
            manifest
        }).fresh).toBe(false);
    });
});
