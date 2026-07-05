import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the FIRST end-to-end proof that the dock ENGINE reorders a pane on a real drag gesture —
 * not the JSON model in isolation (that is unit-tested), but a rendered tab header dragged in the live
 * example, asserted against the committed dockZone.v1 document in the App Worker.
 *
 * Scope (this slice): WITHIN-container reorder. Dragging the "Strategy" tab header past its sibling
 * "Swarm" inside `main-tabs` reorders the committed model from ['strategy','swarm'] to
 * ['swarm','strategy']. The gesture rides the EXISTING tab-header SortZone (no parallel drag system);
 * the DockLayoutAdapter projects `dragResortable: true` and its `moveTo` listener commits the result
 * through applyDockZoneOperation + onDockZoneDocumentChange. Cross-zone drag (an item leaving its tabs
 * node) rides the dashboard SortZone in a follow-up slice.
 *
 * Paradigm (whitebox-e2e protocol): Playwright drives the native mouse gesture; the Neural Link fixture
 * reads the holder's committed document (dockModel) before and after. Two product-level truths are
 * asserted: (1) the tab headers are actually draggable in the DOM, (2) the drag mutates worker truth.
 *
 * Run: npx playwright test DockDragDropNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dock drag-and-drop journey (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('dragging a tab header past its sibling reorders the item in the committed dock model', async ({ page, neuralLink }) => {
        await page.goto('/examples/dashboard/dock/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForTimeout(2500); // settle worker boot + first render

        const app = await neuralLink.connectToApp('Neo.examples.dashboard.dock');

        // resolve the dock holder + a reader over its committed document (worker truth)
        const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
        const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
        expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

        const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel;

        const before = await readModel();
        expect(before?.nodes?.['main-tabs']?.items, 'the example must seed main-tabs as [strategy, swarm]')
            .toEqual(['strategy', 'swarm']);

        // product truth #1: the dock projects draggable tab headers (not just a static model). Both panes of
        // main-tabs plus the two single-tab side zones = four draggable tab headers.
        const draggableTabHeaders = await page.evaluate(() =>
            document.querySelectorAll('.neo-tab-header-button.neo-draggable').length);
        expect(draggableTabHeaders, 'the dock tab headers must be draggable (dragResortable projected)')
            .toBeGreaterThanOrEqual(2);

        // both headers live in main-tabs' toolbar
        const strategyTab = page.locator('.neo-tab-header-button', { hasText: 'Strategy' }).first();
        const swarmTab    = page.locator('.neo-tab-header-button', { hasText: 'Swarm' }).first();
        await expect(strategyTab, 'the Strategy tab header must render').toBeVisible({ timeout: 10000 });
        await expect(swarmTab,    'the Swarm tab header must render').toBeVisible({ timeout: 10000 });

        const strategyBox = await strategyTab.boundingBox();
        const swarmBox    = await swarmTab.boundingBox();

        // native drag: Strategy header -> just past Swarm's right edge (the {steps} cadence arms Neo's drag sensor)
        await page.mouse.move(strategyBox.x + strategyBox.width / 2, strategyBox.y + strategyBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(swarmBox.x + swarmBox.width / 2, swarmBox.y + swarmBox.height / 2, { steps: 30 });
        await page.mouse.move(swarmBox.x + swarmBox.width + 12, swarmBox.y + swarmBox.height / 2, { steps: 30 });
        await page.mouse.up();
        await page.waitForTimeout(1000);

        const after = await readModel();
        console.log('[dock-dnd] main-tabs:', JSON.stringify(before?.nodes?.['main-tabs']?.items), '->', JSON.stringify(after?.nodes?.['main-tabs']?.items));

        // product truth #2: the drag mutated the COMMITTED dock model in the App Worker
        expect(after?.nodes?.['main-tabs']?.items, 'the tab-drag must reorder the committed dock model — the whole point of the engine')
            .toEqual(['swarm', 'strategy']);
    });
});
