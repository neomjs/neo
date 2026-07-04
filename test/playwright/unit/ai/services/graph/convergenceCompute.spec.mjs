import {test, expect} from '@playwright/test';

import {
    buildConvergenceInputManifest,
    computeConvergenceSnapshots,
    computeIndependenceBudget
} from '../../../../../../ai/services/graph/convergenceCompute.mjs';

test.describe('convergenceCompute', () => {
    test('independence budget (OQ7): identical futures → 0, disjoint → 1, single → 1, partial in between', () => {
        expect(computeIndependenceBudget([['a', 'b'], ['a', 'b']])).toBe(0);       // fully correlated
        expect(computeIndependenceBudget([['a'], ['b']])).toBe(1);                 // disjoint
        expect(computeIndependenceBudget([['a', 'b', 'c']])).toBe(1);              // single future — trivially independent
        const partial = computeIndependenceBudget([['a', 'b'], ['a', 'c']]);       // jaccard 1/3 → distance 2/3
        expect(partial).toBeGreaterThan(0);
        expect(partial).toBeLessThan(1);

        // No-evidence semantics (empty futures dropped): all-empty is no-confidence 0, NOT "maximally independent".
        expect(computeIndependenceBudget([[], []])).toBe(0);
        expect(computeIndependenceBudget([['a'], []])).toBe(1);   // one real future after dropping the empty
        expect(computeIndependenceBudget([])).toBe(0);
    });

    test('firewall manifest (OQ8): clean only when neither peer sets nor prior convergence were read', () => {
        expect(buildConvergenceInputManifest({futureSource: 'seed'}).firewallClean).toBe(true);
        expect(buildConvergenceInputManifest({readPeerFutureSets: true}).firewallClean).toBe(false);
        expect(buildConvergenceInputManifest({readPriorConvergence: true}).firewallClean).toBe(false);
    });

    test('convergence weight = count of futures a canonical id lies on; keyed on the schema canonical id (no re-derivation)', () => {
        const {snapshots, independenceBudget, manifest} = computeConvergenceSnapshots({
            latticeNodeIds: ['CONCEPT:GoldenPath', 'first-revenue'],
            futurePaths   : [['golden-path', 'x'], ['golden-path'], ['first-revenue']],
            provenance    : 'spec',
            manifest      : {futureSource: 'seed'},
            now           : '2026-07-04T00:00:00.000Z'
        });

        const gp = snapshots.find(s => s.properties.canonicalId === 'golden-path');
        expect(gp.id).toBe('CONVERGENCE_SNAPSHOT:golden-path');   // schema canonicalization reused
        expect(gp.properties.convergenceWeight).toBe(2);          // in 2 of 3 futures
        expect(snapshots.find(s => s.properties.canonicalId === 'first-revenue').properties.convergenceWeight).toBe(1);
        // OQ7 budget attached to every snapshot; OQ8 firewall clean.
        expect(gp.properties.independenceBudget).toBe(independenceBudget);
        expect(manifest.firewallClean).toBe(true);
    });

    test('fail-open: a non-canonicalizable id is dropped, and the run still carries its firewall manifest', () => {
        const {snapshots, manifest} = computeConvergenceSnapshots({
            latticeNodeIds: ['', '###'],   // neither canonicalizes → no phantom snapshot
            futurePaths   : [['a']],
            manifest      : {readPeerFutureSets: true}
        });

        expect(snapshots).toEqual([]);
        expect(manifest.firewallClean).toBe(false);   // the manifest is emitted even when nothing is produced
    });

    test('empty input yields no snapshots (never throws, never mutates)', () => {
        expect(computeConvergenceSnapshots({}).snapshots).toEqual([]);
        expect(computeConvergenceSnapshots().snapshots).toEqual([]);
    });
});
