import {test, expect} from '@playwright/test';

import {
    CONVERGENCE_SNAPSHOT_NODE_TYPE,
    EVOLUTION_GOAL_SCHEMA_REF,
    buildConvergenceSnapshotNode,
    pickContractAxes,
    resolveRenderTarget
} from '../../../../../../ai/services/graph/convergenceSnapshotSchema.mjs';

test.describe('convergenceSnapshotSchema', () => {
    test('keys the snapshot on the CANONICAL concept id + records provenance, never inventing a weight (OQ1)', () => {
        const node = buildConvergenceSnapshotNode({
            latticeNodeId: 'CONCEPT:GoldenPath',
            provenance   : 'lattice-import:2026-07-04',
            now          : '2026-07-04T00:00:00.000Z'
        });

        expect(node.type).toBe('CONVERGENCE_SNAPSHOT');
        expect(node.id).toBe('CONVERGENCE_SNAPSHOT:golden-path');
        expect(node.properties.canonicalId).toBe('golden-path');
        expect(node.properties.provenance).toBe('lattice-import:2026-07-04');
        // Leaf 2 compute fills these — the schema builder must never invent a weight.
        expect(node.properties.convergenceWeight).toBeNull();
        expect(node.properties.independenceBudget).toBeNull();
        expect(node.properties.createdAt).toBe('2026-07-04T00:00:00.000Z');
    });

    test('carries the risk-node flag + the born-scheduled longitudinal falsifier', () => {
        const node = buildConvergenceSnapshotNode({
            latticeNodeId: 'first-revenue',
            provenance   : 'p',
            riskNode     : true,
            remeasureAt  : '2026-08-04T00:00:00.000Z'
        });

        expect(node.properties.riskNode).toBe(true);
        expect(node.properties.remeasureAt).toBe('2026-08-04T00:00:00.000Z');
    });

    test('defaults are honest: no risk, no schedule, null provenance — nothing fabricated', () => {
        const node = buildConvergenceSnapshotNode({latticeNodeId: 'x'});

        expect(node.properties.riskNode).toBe(false);
        expect(node.properties.remeasureAt).toBeNull();
        expect(node.properties.provenance).toBeNull();
    });

    test('keeps the four axes SEPARATE — never flattened, unknown axes dropped', () => {
        const axes = pickContractAxes({
            authority           : {trustTier: 'system'},
            fidelity            : {sourceTier: 'curated'},
            extractionProvenance: {curated: true},
            lifecycle           : {state: 'candidate'},
            composite           : 0.87  // a flattened score must NOT survive
        });

        expect(Object.keys(axes).sort()).toEqual(['authority', 'extractionProvenance', 'fidelity', 'lifecycle']);
        expect(axes).not.toHaveProperty('composite');
        expect(axes.lifecycle).toEqual({state: 'candidate'});
    });

    test('render-target is firewalled (OQ8): notAuthority, NOT agent-boot-consumable, FM-cockpit home', () => {
        const target = resolveRenderTarget();

        expect(target.target).toBe('convergence-terrain-ledger');
        expect(target.notAuthority).toBe(true);
        expect(target.agentBootConsumable).toBe(false);
        expect(target.home).toBe('fm-cockpit-terrain-panel');
        expect(target.fallback).toBe('redaction-filter');
        // The built node's render-target must be the firewalled ledger, not a boot-path surface.
        expect(buildConvergenceSnapshotNode({latticeNodeId: 'y'}).properties.renderTarget).toBe('convergence-terrain-ledger');
    });

    test('returns null when the lattice id does not canonicalize (no phantom snapshot)', () => {
        expect(buildConvergenceSnapshotNode({latticeNodeId: ''})).toBeNull();
        expect(buildConvergenceSnapshotNode({latticeNodeId: '###'})).toBeNull();
        expect(buildConvergenceSnapshotNode({})).toBeNull();
    });

    test('EVOLUTION_GOAL binding is an explicit unresolved stub (#14626 unmerged), reconciled later', () => {
        expect(EVOLUTION_GOAL_SCHEMA_REF.ref).toBe('EVOLUTION_GOAL');
        expect(EVOLUTION_GOAL_SCHEMA_REF.resolved).toBe(false);
        expect(buildConvergenceSnapshotNode({latticeNodeId: 'z'}).properties.evolutionGoalRef).toBe('EVOLUTION_GOAL');
    });
});
