import {test, expect} from '../../fixtures.mjs';

/**
 * The TourRunner L3 smoke: the named-live-page replay against `examples/dashboard/dock`.
 *
 * The runner + schema shipped with their unit floor (validator fail-closed cases, mode-identity,
 * two-run determinism over a FIXTURE seam); what a unit spec cannot certify is the live half of
 * the trinity contract: the same script, replayed through the REAL app-side dock seam
 * (`Neo.ai.client.DockService` → the holder's `applyDockZoneOperation` reducer) on the shipped
 * dock example, twice, with identical operation logs. That two-run log identity is the runner
 * lane's remaining acceptance criterion — the determinism falsifier — and this spec delivers it.
 *
 * The smoke script is deliberately SELF-RESTORING (resize out → assert → pause → resize back),
 * so run 2 starts from the exact document run 1 started from: log identity is then a claim about
 * the runner + seam + reducer pipeline, never about lucky state. It exercises all three
 * executable step types of `neo.tour.script.v1` (`op`, `topology-assert`, `pause` — spec mode
 * skips the pause WAIT but keeps its log entry, per the pace-never-correctness contract).
 *
 * Fresh-context assumption: the example restores saved layouts from storage; a Playwright
 * context starts storage-clean, so the committed document is the example's `initialDockModel`
 * (`root-split` sizes [0.65, 0.35], `main-tabs` active item `strategy`).
 *
 * Paradigm (whitebox-e2e protocol): Playwright loads the page; every assertion below is App
 * Worker truth via the Neural Link fixture — no DOM locator carries a verdict.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DockTourSmokeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const smokeScript = {
    schema: 'neo.tour.script.v1',
    id    : 'dock-l3-smoke',
    title : 'Dock example L3 smoke',
    scenes: [{
        id   : 'smoke',
        title: 'resize → assert → pause → restore',
        steps: [{
            type      : 'op',
            caption   : 'widen the main zone',
            descriptor: {operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.7, 0.3]},
            expect    : [{path: 'nodes.root-split.sizes.0', equals: 0.7}]
        }, {
            type  : 'topology-assert',
            expect: [
                {path: 'nodes.root-split.sizes.1',     equals: 0.3},
                {path: 'nodes.main-tabs.activeItemId', equals: 'strategy'}
            ]
        }, {
            type   : 'pause',
            ms     : 120,
            caption: 'settle beat — spec mode skips the wait, keeps the log entry'
        }, {
            type      : 'op',
            caption   : 'restore the shipped proportions',
            descriptor: {operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.65, 0.35]},
            expect    : [{path: 'nodes.root-split.sizes.0', equals: 0.65}]
        }]
    }]
};

test.describe('#14640 TourRunner L3 smoke (examples/dashboard/dock, Neural Link)', () => {
    test.setTimeout(120000);

    test('two consecutive spec-mode replays produce identical operation logs and leave the document untouched', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', err => {pageErrors.push(err.message); console.error('BROWSER JS ERROR:', err)});

        await page.goto('/examples/dashboard/dock/index.html');
        await page.waitForSelector('.neo-tab-header-button', {timeout: 20000});

        const
            app    = await neuralLink.connectToApp('Neo.examples.dashboard.dock'),
            found  = await app.findInstances({className: 'Neo.examples.dashboard.dock.MainContainer'}, ['id']),
            mainId = (Array.isArray(found) ? found[0] : found)?.id;

        expect(mainId, 'the dock example MainContainer must exist in the App Worker').toBeTruthy();

        const runOnce = async () => {
            const response = await app.callMethod(mainId, 'runTourSpec', [smokeScript]);
            return response?.result ?? response
        };

        // ── run 1: the smoke itself ──────────────────────────────────────────────────────────
        const run1 = await runOnce();

        expect(run1?.completed, `run 1 must complete; errors: ${JSON.stringify(run1?.errors)}`).toBe(true);
        expect(run1.errors, 'a completed run reports zero errors').toEqual([]);
        expect(run1.log.length, 'four steps → four log entries').toBe(4);

        const ops = run1.log.filter(entry => entry.type === 'op');

        expect(ops.length, 'both resizeSplit ops logged').toBe(2);
        expect(ops.every(entry => entry.applied), 'both ops accepted by the executor').toBe(true);
        expect(
            run1.log.filter(entry => entry.assertsPassed !== undefined).every(entry => entry.assertsPassed),
            'every asserted entry passed'
        ).toBe(true);

        // ── run 2: THE determinism falsifier (the lane's remaining acceptance criterion) ────
        const run2 = await runOnce();

        expect(run2?.completed, `run 2 must complete; errors: ${JSON.stringify(run2?.errors)}`).toBe(true);
        expect(run2.log, 'two consecutive runs must produce identical operation logs').toEqual(run1.log);

        // ── worker truth: the self-restoring script left the committed document untouched ───
        const {dockModel} = await app.getComponent(mainId, ['dockModel']);

        expect(dockModel.nodes['root-split'].sizes[0]).toBeCloseTo(0.65, 9);
        expect(dockModel.nodes['root-split'].sizes[1]).toBeCloseTo(0.35, 9);
        expect(dockModel.nodes['main-tabs'].activeItemId).toBe('strategy');

        // ── the live page survived the double replay without a single thrown error ──────────
        expect(pageErrors, 'no page errors across the double replay').toEqual([]);
    });
});
