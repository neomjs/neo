import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the end-to-end gesture proof for the auto-hide interaction contract — a committed
 * auto-hidden item collapses to a real edge-rail BUTTON, a native CLICK on that button opens a
 * transient reveal overlay WITHOUT touching worker truth, and the overlay's PIN button commits
 * `setItemPinned(true)` through the reducer.
 *
 * This is the epic's gesture-proof guardrail ridden in the same PR as the affordance: the product
 * truths a unit spec cannot certify are (1) the rail projects real, clickable buttons in the DOM,
 * (2) the reveal is genuinely runtime-only — the committed dockZone.v1 document in the App Worker
 * is byte-stable across reveal open/close, (3) the pin gesture mutates worker truth exactly once,
 * through the semantic operation path, and the affordance instances retire from the worker.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives native mouse gestures; the Neural Link
 * fixture reads the holder's committed document (dockModel) at every stage and performs the ONE
 * programmatic setup commit (auto-hiding the inspector) through the example's own reducer seam.
 *
 * Run: NEO_E2E_PORT=8091 npx playwright test DockAutoHideRevealNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 * (the port override isolates from any foreign dev-server squatting on 8080)
 */

const bootDockExample = async ({ page, neuralLink }) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

    await page.waitForTimeout(2500); // settle worker boot + first render

    const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
    const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
    const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;

    expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

    const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel;

    return { app, holderId, readModel }
};

const tuckInspector = async ({ app, holderId, page }) => {
    const commitResult = await app.callMethod(holderId, 'applyDockZoneOperation', [
        { autoHidden: true, itemId: 'inspector', operation: 'setItemAutoHidden' }
    ]);
    expect(commitResult?.errors, 'the auto-hide commit must pass the model guards').toEqual([]);
    await app.callMethod(holderId, 'onDockZoneDocumentChange', [commitResult.document]);
    await page.waitForTimeout(1000)
};

test.describe('Dock auto-hide reveal/pin journey (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('rail click reveals without persisting; the pin gesture commits setItemPinned through the reducer', async ({ page, neuralLink }) => {
        const { app, holderId, readModel } = await bootDockExample({ page, neuralLink });

        // Setup truth: inspector sits visible in the right edge band; nothing rails yet.
        const before = await readModel();
        expect(before?.nodes?.['inspector-tabs']?.items, 'the example must seed the inspector in the right edge band').toEqual(['inspector']);
        expect(before?.items?.inspector?.autoHidden, 'the inspector must start visible').not.toBe(true);
        await expect(page.locator('.neo-dashboard-dock-edge-rail .neo-dashboard-dock-rail-tab')).toHaveCount(0);

        await tuckInspector({ app, holderId, page });

        // Product truth #1: the committed auto-hidden item projects as a REAL rail button.
        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab, 'the inspector must collapse to a labeled edge-rail tab').toBeVisible({ timeout: 10000 });

        const hidden = await readModel();
        expect(hidden?.items?.inspector?.autoHidden, 'worker truth must carry autoHidden: true').toBe(true);

        // Native gesture: CLICK the rail tab -> transient reveal overlay.
        await railTab.click();
        await page.waitForTimeout(600);

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');
        await expect(overlay, 'the reveal overlay must open on rail-tab click').toBeVisible({ timeout: 10000 });
        await expect(overlay.locator('.neo-dashboard-dock-reveal-title'), 'the overlay must title the revealed item').toHaveText('Inspector');

        // Product truth #2: reveal is runtime-only — worker truth is byte-stable across the reveal.
        const revealed = await readModel();
        expect(JSON.stringify(revealed), 'the committed document must NOT change on reveal').toBe(JSON.stringify(hidden));

        // Embodied focus: real browser focus moved INSIDE the overlay on click-reveal.
        expect(await page.evaluate(() =>
            document.activeElement?.closest('.neo-dashboard-dock-reveal-overlay') !== null
        ), 'click-reveal must move real focus into the overlay').toBe(true);

        // Escape dismisses — runtime-only, document byte-stable.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await expect(overlay, 'Escape must dismiss the reveal').toBeHidden();
        expect(JSON.stringify(await readModel()), 'Escape dismissal must not touch the document').toBe(JSON.stringify(hidden));

        // Outside-click dismissal (focused reveal): clicking outside moves focus out -> focus-leave dismisses.
        await railTab.click();
        await page.waitForTimeout(400);
        await expect(overlay).toBeVisible();
        await page.locator('.neo-tab-header-button', { hasText: 'Strategy' }).first().click();
        await page.waitForTimeout(400);
        await expect(overlay, 'an outside click must dismiss the focused reveal').toBeHidden();
        expect(JSON.stringify(await readModel()), 'outside-click dismissal must not touch the document').toBe(JSON.stringify(hidden));

        // Hover mode (workspace opt-in, live-configured): dwell opens; leaving the tab without
        // ever entering the overlay dismisses through the grace window.
        const railInstances = await app.findInstances({ ntype: 'dashboard-dock-rail' }, ['id']);
        const railId        = Array.isArray(railInstances) ? railInstances[0]?.id : railInstances?.id;
        await app.setProperties(railId, { autoHideRevealOnHover: true, revealDismissGraceMs: 400, revealDwellMs: 100 });

        const railBox = await railTab.boundingBox();
        await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
        await page.waitForTimeout(350); // > dwell
        await expect(overlay, 'opt-in hover must reveal after the dwell').toBeVisible();

        await page.mouse.move(100, 100); // jump far outside — never crosses the overlay
        await page.waitForTimeout(150);  // < grace: still shown
        await expect(overlay, 'the grace window must hold the overlay briefly').toBeVisible();
        await page.waitForTimeout(600);  // > grace
        await expect(overlay, 'hover-away without entering the overlay must dismiss through grace').toBeHidden();

        await app.setProperties(railId, { autoHideRevealOnHover: false });

        // Re-open for the pin tail.
        await railTab.click();
        await page.waitForTimeout(600);
        await expect(overlay).toBeVisible();

        // Native gesture: PIN -> the one committed operation of the interaction.
        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();
        await page.waitForTimeout(1500);

        // Product truth #3: the pin gesture mutated worker truth through the semantic path.
        const pinned = await readModel();
        console.log('[auto-hide] inspector:', JSON.stringify(hidden?.items?.inspector), '->', JSON.stringify(pinned?.items?.inspector));
        expect(pinned?.items?.inspector?.pinned,     'the pin gesture must commit setItemPinned(true)').toBe(true);
        expect(pinned?.items?.inspector?.autoHidden, 'the model must clear autoHidden on pin (landed guard)').toBe(false);

        // ...and the affordance retires from WORKER truth: the re-projected tree rails nothing.
        expect(await app.findInstances({ ntype: 'dashboard-dock-rail' }, ['id']),
            'no rail instance may survive the post-pin re-projection').toEqual([]);
        expect(await app.findInstances({ ntype: 'dashboard-dock-reveal-overlay' }, ['id']),
            'no overlay instance may survive the post-pin re-projection').toEqual([]);
    });

    // Regression guard: a wholesale workspace refresh (removeAll + add) must remove the retired
    // affordance's DOM, not just its worker instances — a destroyed component's lingering
    // in-flight update entry once wedged the ancestor's yielded refresh forever, orphaning the
    // subtree in the main thread.
    test('post-pin DOM reconciliation removes the retired rail affordance (#14911)', async ({ page, neuralLink }) => {

        const { app, holderId } = await bootDockExample({ page, neuralLink });

        await tuckInspector({ app, holderId, page });

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab).toBeVisible({ timeout: 10000 });
        await railTab.click();
        await page.waitForTimeout(600);

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');
        await expect(overlay).toBeVisible({ timeout: 10000 });
        await overlay.locator('.neo-dashboard-dock-reveal-pin').first().click();
        await page.waitForTimeout(1500);

        await expect(page.locator('.neo-dashboard-dock-rail-tab'), 'the retired rail tab must leave the DOM').toHaveCount(0);
        await expect(page.locator('.neo-tab-header-button', { hasText: 'Inspector' }).first(),
            'the pinned inspector must re-enter the rendered tab flow').toBeVisible({ timeout: 10000 });
    });
});
