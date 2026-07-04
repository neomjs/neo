import {test, expect} from '@playwright/test';

import {
    SEED_FUTURES,
    SEED_LATTICE,
    runConvergenceTerrainDemo
} from '../../../../../ai/examples/convergenceTerrainDemo.mjs';

test.describe('convergenceTerrainDemo (#14648 — epic #14581 end-to-end falsifier)', () => {
    const {ledger, text, falsifier} = runConvergenceTerrainDemo({now: '2026-07-04T00:00:00.000Z'});

    test('AC1: runs the full chain (schema → compute → render) end-to-end into a terrain ledger', () => {
        expect(ledger.kind).toBe('convergence-terrain-ledger');
        expect(ledger.rowCount).toBe(SEED_LATTICE.length);   // every seeded sub-goal is placed on the terrain
        expect(text).toContain('# Convergence Terrain Ledger');
    });

    test('AC2 (falsifier): surfaces a maximally-invariant AND a non-obvious sub-goal; discounts correlated futures', () => {
        // A sub-goal on ALL futures tops the terrain (the trivially-invariant endpoint).
        expect(falsifier.surfacesMaxInvariant).toBe(true);
        expect(falsifier.topInvariant.weight).toBe(SEED_FUTURES.length);
        // The insight convergence is FOR: high invariance but NOT on every future — `find-pmf` (3 of 4).
        expect(falsifier.nonTrivialInvariant).toBeTruthy();
        expect(falsifier.nonTrivialInvariant.id).toBe('find-pmf');
        expect(falsifier.nonTrivialInvariant.weight).toBe(3);
        // OQ7: two seeded futures are identical, so agreement is inflated — the budget must fall below a perfect 1.
        expect(falsifier.discountVisible).toBe(true);
        expect(falsifier.independenceBudget).toBeGreaterThan(0);
        expect(falsifier.independenceBudget).toBeLessThan(1);
        // The terrain SEPARATES invariant structure from future-specific noise.
        expect(falsifier.futureSpecificCount).toBeGreaterThanOrEqual(1);
    });

    test('AC3 (reach artifact): the terrain is shareable, provisional / notAuthority-labeled, and shows the discount', () => {
        expect(text).toContain('PROVISIONAL — notAuthority');
        expect(text).toContain('find-pmf');                       // the non-obvious insight is visible in the artifact
        expect(text).toMatch(/Independence budget \(OQ7\).*0\./); // the OQ7 discount is shown, not hidden
        expect(text).toContain('convergence-gp-demo:seeded-lattice'); // provenance traceable (no authority-by-typography)
    });

    test('AC4 (firewall): the demo consumes the notAuthority ledger, never an agent boot-path (OQ8 end-to-end)', () => {
        expect(falsifier.firewallPreserved).toBe(true);
        expect(ledger.notAuthority).toBe(true);
        expect(ledger.agentBootConsumable).toBe(false);
        expect(falsifier.firewallClean).toBe(true);   // the compute run itself read neither peer futures nor prior convergence
    });

    test('the lane-goal is proven end-to-end (falsifier.passed)', () => {
        expect(falsifier.passed).toBe(true);
    });
});
