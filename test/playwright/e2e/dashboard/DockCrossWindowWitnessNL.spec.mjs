import { test, expect } from '../../fixtures.mjs';

/**
 * The two-window cross-window drag SAFETY witness — the L3 receipt (cold first gesture).
 *
 * The dock product example is single-workspace, so it cannot produce this witness; the
 * `examples/dashboard/crossWindowWitness` harness (verification-only) composes the
 * `DockCrossWindowParticipation` scenario — a registered remote target + a real `DockTabSortZone` source
 * in the same `sortGroup`, the REAL `DragCoordinator` + executor — in a REAL browser App-Worker, and
 * drives the FIRST gesture COLD (no `resolveDragCoordinator` await; the drop depends entirely on
 * `construct()`'s off-hot-path preload). This spec loads that harness and reads its reported outcome.
 *
 * Asserts exactly the ticket's safety AC: cold first gesture → cross-window transfer commits ONCE, the
 * source's local drop is suppressed ONCE, the suppression flag is consumed, and the coordinator was
 * warmed by construct-preload before the gesture.
 *
 * Run: NEO_E2E_PORT=8093 npx playwright test dashboard/DockCrossWindowWitnessNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('#15065 cross-window drag safety witness (L3, cold first gesture)', () => {
    test.setTimeout(120000);

    test('cross-window transfer commits ONCE and the source local drop is suppressed ONCE', async ({ page, neuralLink }) => {
        await page.goto('/examples/dashboard/crossWindowWitness/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        const app = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindowWitness');

        // the harness runs the cold composition on construct and stamps the outcome onto the
        // `#witness-result` component's vdom data-attributes (a config `findInstances` returns)
        let vdom = null;

        await expect.poll(async () => {
            const found = await app.findInstances({ id: 'witness-result' }, ['vdom']),
                  inst  = Array.isArray(found) ? found[0] : found;

            vdom = inst?.properties?.vdom ?? inst?.vdom ?? null;

            return vdom?.['data-status'] === 'done' ? 'reported' : 'pending';
        }, { message: 'the cross-window witness harness must report its result', timeout: 60000, intervals: [1000] }).toBe('reported');

        expect(vdom['data-transfer-count'],    'the cross-window transferItem commits EXACTLY once').toBe('1');
        expect(vdom['data-drop-fires'],        'the source local dockCrossZoneDrop is SUPPRESSED (never fires) on a committed remote drop').toBe('0');
        expect(vdom['data-remote-committed'],  'the one-shot suppression flag is consumed, not sticky').toBe('false');
        expect(vdom['data-coordinator-warmed'],'construct-preload warmed the coordinator BEFORE the cold first gesture').toBe('true');
        // the same gesture crossed a second root's popup first — same bare workspace ids, another
        // commit authority: no preview, no staged embodiment, no commit, its documents byte-identical
        expect(vdom['data-foreign-previews'],     'a target of another Group never previews').toBe('0');
        expect(vdom['data-foreign-transfers'],    'a target of another Group never commits, locally or by transfer').toBe('0');
        expect(vdom['data-foreign-proxy-hidden'], 'no staged embodiment: the source proxy stayed visible over the foreign popup').toBe('false');
        expect(vdom['data-foreign-docs-intact'],  'the other root\'s documents are byte-identical after the gesture').toBe('true');
        expect(vdom['data-pass'],              'the AC2 cross-window safety witness passes end-to-end').toBe('true')
    });
});
