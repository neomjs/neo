import {computeConvergenceSnapshots}                               from '../services/graph/convergenceCompute.mjs';
import {buildConvergenceRenderLedger, renderConvergenceLedgerText} from '../services/graph/convergenceRenderLedger.mjs';

/**
 * @module ai/examples/convergenceTerrainDemo
 * @summary Convergence-weighted Golden Path — end-to-end demo + lane falsifier (ticket-ref-ok: #14648 owning-leaf anchor; demo leaf of #14581).
 *
 * Runs the full convergence chain — snapshot schema → weighting compute → render-ledger — on a realistic,
 * seeded goal→sub-goal lattice + N imagined futures, and proves the epic's lane-goal: convergence-weighting
 * surfaces the sub-goals that lie on the most viable futures at once (cross-future-invariant — worth doing
 * regardless of which future wins), while honestly discounting correlated futures.
 *
 * FALSIFIER (the reason a demo leaf exists — machinery is unproven until a run on real data is decision-useful):
 *   1. A maximally-invariant sub-goal surfaces at the top of the terrain (on ALL futures).
 *   2. A NON-TRIVIAL invariant surfaces too — high-invariance but NOT on every future (the non-obvious insight
 *      convergence is for; a terrain that only re-finds the obvious endpoints proves nothing).
 *   3. Correlated futures are visibly discounted: the OQ7 independence budget drops below 1 because two of the
 *      seeded futures are deliberately identical (agreement among clones is not cross-future invariance).
 *   4. OQ8 firewall preserved end-to-end: the demo consumes the `notAuthority` ledger surface, never an agent
 *      boot-path.
 *
 * The seeded lattice is a startup's goal graph ("reach first revenue") across four strategy futures; `ship-mvp`
 * and `first-revenue` lie on all four (trivially invariant endpoints), `find-pmf` on three (the non-obvious
 * invariant), and `raise-seed` / `hire-sales` / `build-brand` are each future-specific. The lean-pivot future
 * is intentionally identical to the bootstrap future so the independence budget must discount the agreement.
 */

/** @summary The seeded goal→sub-goal lattice (canonical ids — idempotent under normalizeConceptKey). @type {String[]} */
export const SEED_LATTICE = Object.freeze(['ship-mvp', 'find-pmf', 'first-revenue', 'raise-seed', 'hire-sales', 'build-brand']);

/** @summary Four imagined strategy futures over the lattice; the last is a deliberate clone of the first. @type {String[][]} */
export const SEED_FUTURES = Object.freeze([
    ['ship-mvp', 'find-pmf', 'first-revenue'],                   // bootstrap
    ['ship-mvp', 'raise-seed', 'hire-sales', 'first-revenue'],  // venture-backed
    ['ship-mvp', 'find-pmf', 'build-brand', 'first-revenue'],   // organic
    ['ship-mvp', 'find-pmf', 'first-revenue']                   // lean pivot — identical to bootstrap (correlated)
]);

/**
 * @summary Runs the convergence chain over the seeded lattice and returns the terrain artifact plus a
 * structured falsifier verdict. Pure over its `now` injection — no I/O, no clock read — so the falsifier is
 * CI-guarded, not a one-off console print.
 * @param {Object} [options]
 * @param {String} [options.now='2026-07-04T00:00:00.000Z'] ISO window anchor for deterministic output.
 * @returns {{compute: Object, ledger: Object, text: String, falsifier: Object}} the run + its falsifier verdict.
 */
export function runConvergenceTerrainDemo({now = '2026-07-04T00:00:00.000Z'} = {}) {
    const compute = computeConvergenceSnapshots({
        latticeNodeIds: SEED_LATTICE,
        futurePaths   : SEED_FUTURES,
        provenance    : 'convergence-gp-demo:seeded-lattice',
        manifest      : {futureSource: 'demo:4-imagined-strategy-futures'},
        now
    });

    const ledger = buildConvergenceRenderLedger(compute, {now}),
          text   = renderConvergenceLedgerText(ledger);

    const maxFutures         = SEED_FUTURES.length,
          rows               = ledger.rows,
          topRow             = rows[0] || null,
          invariantRows      = rows.filter(row => (row.convergenceWeight ?? 0) >= 3),
          futureSpecificRows = rows.filter(row => (row.convergenceWeight ?? 0) <= 1),
          // the insight: a high-invariance sub-goal that is NOT on every future (weight 3 of 4 here).
          nonTrivialInvariant = rows.find(row => (row.convergenceWeight ?? 0) >= 3 && (row.convergenceWeight ?? 0) < maxFutures) || null,
          budget              = ledger.independenceBudget?.value ?? null;

    const falsifier = {
        maxFutures,
        topInvariant        : topRow && {id: topRow.canonicalId, weight: topRow.convergenceWeight},
        surfacesMaxInvariant: !!topRow && topRow.convergenceWeight === maxFutures,
        nonTrivialInvariant : nonTrivialInvariant && {id: nonTrivialInvariant.canonicalId, weight: nonTrivialInvariant.convergenceWeight},
        invariantCount      : invariantRows.length,
        futureSpecificCount : futureSpecificRows.length,
        independenceBudget  : budget,
        // two futures are identical → agreement is inflated → the budget must fall below a perfect 1.
        discountVisible  : typeof budget === 'number' && budget < 1 && budget > 0,
        firewallClean    : ledger.firewall?.clean === true,
        firewallPreserved: ledger.notAuthority === true && ledger.agentBootConsumable === false
    };

    // The lane-goal is proven only if ALL of these hold together.
    falsifier.passed = falsifier.surfacesMaxInvariant &&
        !!falsifier.nonTrivialInvariant &&
        falsifier.discountVisible &&
        falsifier.firewallPreserved &&
        falsifier.futureSpecificCount >= 1;   // the terrain SEPARATES invariant from future-specific structure

    return {compute, ledger, text, falsifier};
}

/**
 * @summary Runnable entry point: prints the shareable terrain artifact + the falsifier verdict, and exits
 * non-zero if the lane-goal is not proven (so the demo doubles as an executable falsifier).
 * @returns {void}
 */
function main() {
    const {text, falsifier} = runConvergenceTerrainDemo();

    console.log('\n================ Convergence Terrain (shareable, provisional / notAuthority) ================\n');
    console.log(text);
    console.log('\n================ Lane falsifier verdict ================\n');
    console.log(JSON.stringify(falsifier, null, 2));
    console.log(`\n${falsifier.passed ? '✅ PASSED' : '❌ FAILED'} — convergence-weighting ${falsifier.passed ? 'surfaced a non-obvious cross-future-invariant sub-goal and discounted correlated agreement.' : 'did NOT prove the lane-goal.'}\n`);

    process.exit(falsifier.passed ? 0 : 1);
}

// Run only when executed directly (`node ai/examples/convergenceTerrainDemo.mjs`), not when imported by the spec.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
