import {test, expect} from '../../fixtures.mjs';

/**
 * The TourRunner L3 smoke: the named-live-page replay against `examples/dashboard/dock`.
 *
 * The runner + schema shipped with their unit floor (validator fail-closed cases, mode-identity,
 * two-run determinism over a FIXTURE seam); what a unit spec cannot certify is the live half of
 * the trinity contract: the same script, replayed through the REAL app-side dock seam on the
 * shipped dock example, twice, with identical operation logs — the determinism falsifier the
 * runner lane's remaining acceptance criterion names.
 *
 * The oracle is DERIVED, never assumed: the spec first reads the hydrated worker-owned document
 * through a zero-op replay (storage restore awaited inside the adapter), snapshots it whole as
 * the baseline, and builds the probe + exact-restore script FROM that baseline. After each run
 * the COMPLETE settled document must deep-equal the baseline (epsilon-aware for IEEE noise) —
 * so "run 2 starts from run 1's exact starting document" is proven, not presumed, and identical
 * logs certify the runner + seam + reducer pipeline rather than lucky initial state. The adapter
 * resolves only after the last deferred re-projection settles, so the page-survival verdict
 * covers the projection work, not just the reducer commits.
 *
 * All three reducer-owned `neo.tour.script.v1` step types are exercised (`op`,
 * `topology-assert`, `pause`). The conditionally executable `cross-window` type belongs to the
 * two-window Demo-B journey; spec mode skips pause waits but keeps their log entries.
 *
 * Paradigm (whitebox-e2e protocol): Playwright loads the page; every assertion below is App
 * Worker truth via the Neural Link fixture — no DOM locator carries a verdict.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DockTourSmokeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

// Epsilon-aware structural equality: full-document comparison must absorb IEEE float noise
// (split-size normalization can yield 0.30000000000000004-class values) without hiding any
// structural drift — same philosophy as the tour-script predicate evaluator's number epsilon.
const epsilonDeepEqual = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
        return (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length
            && a.every((value, index) => epsilonDeepEqual(value, b[index]))
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a), keysB = Object.keys(b);
        return keysA.length === keysB.length
            && keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && epsilonDeepEqual(a[key], b[key]))
    }
    return Object.is(a, b)
};

// Zero-op baseline read: a valid v1 script whose only step asserts the document schema — no
// mutation, but the adapter still awaits hydration + settlement and returns the whole document.
const baselineScript = {
    schema: 'neo.tour.script.v1',
    id    : 'dock-l3-baseline-read',
    title : 'Hydrated baseline read',
    scenes: [{
        id   : 'read',
        title: 'assert schema, mutate nothing',
        steps: [{type: 'topology-assert', expect: [{path: 'schema', equals: 'neo.dock.zone.v1'}]}]
    }]
};

// The smoke script, built FROM the hydrated baseline: probe away from the live sizes, assert,
// pause, restore the exact baseline values — self-restoring by construction, not by convention.
const buildSmokeScript = baselineSizes => {
    const
        delta = baselineSizes[0] <= 0.9 ? 0.05 : -0.05,
        probe = [baselineSizes[0] + delta, baselineSizes[1] - delta];

    return {
        schema: 'neo.tour.script.v1',
        id    : 'dock-l3-smoke',
        title : 'Dock example L3 smoke',
        scenes: [{
            id   : 'smoke',
            title: 'probe → assert → pause → exact restore',
            steps: [{
                type      : 'op',
                caption   : 'probe away from the baseline proportions',
                descriptor: {operation: 'resizeSplit', splitNodeId: 'root-split', sizes: probe},
                expect    : [{path: 'nodes.root-split.sizes.0', equals: probe[0]}]
            }, {
                type  : 'topology-assert',
                expect: [{path: 'nodes.root-split.sizes.1', equals: probe[1]}]
            }, {
                type   : 'pause',
                ms     : 120,
                caption: 'settle beat — spec mode skips the wait, keeps the log entry'
            }, {
                type      : 'op',
                caption   : 'restore the exact baseline proportions',
                descriptor: {operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [...baselineSizes]},
                expect    : [{path: 'nodes.root-split.sizes.0', equals: baselineSizes[0]}]
            }]
        }]
    }
};

test.describe('TourRunner L3 smoke (examples/dashboard/dock, Neural Link)', () => {
    test.setTimeout(120000);

    test('two consecutive spec-mode replays produce identical operation logs and restore the complete hydrated document', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', err => {pageErrors.push(err.message); console.error('BROWSER JS ERROR:', err)});

        await page.goto('/examples/dashboard/dock/index.html');
        await page.waitForSelector('.neo-tab-header-button', {timeout: 20000});

        const
            app    = await neuralLink.connectToApp('Neo.examples.dashboard.dock'),
            found  = await app.findInstances({className: 'Neo.examples.dashboard.dock.MainContainer'}, ['id']),
            mainId = (Array.isArray(found) ? found[0] : found)?.id;

        expect(mainId, 'the dock example MainContainer must exist in the App Worker').toBeTruthy();

        const runOnce = async script => {
            const response = await app.callMethod(mainId, 'runTourSpec', [script]);
            return response?.result ?? response
        };

        // ── the hydrated baseline: read the COMPLETE worker-owned document, mutate nothing ──
        const baselineRun = await runOnce(baselineScript);

        expect(baselineRun?.completed, `baseline read must complete; errors: ${JSON.stringify(baselineRun?.errors)}`).toBe(true);

        const baseline = baselineRun.document;

        // Precondition guard (clear failure over silent drift): the probe targets this split.
        expect(baseline?.nodes?.['root-split']?.sizes?.length,
            'the hydrated document must carry the root-split node this smoke probes').toBe(2);

        const smokeScript = buildSmokeScript(baseline.nodes['root-split'].sizes);

        // ── run 1: the smoke itself ─────────────────────────────────────────────────────────
        const run1 = await runOnce(smokeScript);

        expect(run1?.completed, `run 1 must complete; errors: ${JSON.stringify(run1?.errors)}`).toBe(true);
        expect(run1.errors, 'a completed run reports zero errors').toEqual([]);
        expect(run1.log.length, 'four steps → four log entries').toBe(4);

        const opEntries = run1.log.filter(entry => entry.type === 'op');

        expect(opEntries.length, 'both resizeSplit ops logged').toBe(2);
        expect(opEntries.every(entry => entry.applied), 'both ops accepted by the executor').toBe(true);

        // Guard the assertion-bearing set size BEFORE .every() — an empty filter must never pass.
        const assertedEntries = run1.log.filter(entry => entry.assertsPassed !== undefined);

        expect(assertedEntries.length, 'two op expects + one topology-assert carry assertion outcomes').toBe(3);
        expect(assertedEntries.every(entry => entry.assertsPassed), 'every asserted entry passed').toBe(true);

        // Full-document restoration after run 1 — the claim run 2's determinism stands on.
        expect(epsilonDeepEqual(run1.document, baseline),
            'run 1 must restore the COMPLETE hydrated document (epsilon-aware deep equality)').toBe(true);

        // ── run 2: THE determinism falsifier (the lane's remaining acceptance criterion) ────
        const run2 = await runOnce(smokeScript);

        expect(run2?.completed, `run 2 must complete; errors: ${JSON.stringify(run2?.errors)}`).toBe(true);
        expect(run2.log, 'two consecutive runs must produce identical operation logs').toEqual(run1.log);
        expect(epsilonDeepEqual(run2.document, baseline),
            'run 2 must also restore the COMPLETE hydrated document').toBe(true);

        // ── independent out-of-adapter witness: the committed model, read cold ──────────────
        const {dockModel} = await app.getComponent(mainId, ['dockModel']);

        expect(epsilonDeepEqual(dockModel, baseline),
            'the committed worker document read outside the adapter equals the baseline').toBe(true);

        // ── page survival, judged AFTER settled projections (the adapter awaits them) ───────
        expect(pageErrors, 'no page errors across the double replay').toEqual([]);
    });
});
