import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e for "release a tab into a NEW target drop zone" — the cross-zone gesture beyond the
 * within-container reorder. Dragging a tab header OUT of its tabs node and dropping it over a DIFFERENT
 * zone relocates the item in the committed dockZone.v1 document.
 *
 * The gesture rides the existing tab-header drag lifecycle: `Neo.dashboard.dock.interaction.TabSortZone` fires a
 * `dockCrossZoneDrop` on its tab.Container on drop; the owner routes the release point + dragged item
 * through the `dockPreview.v1` producer → `previewToOperation` → `applyDockZoneOperation` pipeline.
 * An interior drop resolves to `tab-into` (an `addTab` that downgrades to `moveItem` for an in-tree item);
 * the edge/split placements the same pipeline emits are unit-pinned in `DockPreviewProducer.spec` (the
 * `produce → previewToOperation → applyOperation` deterministic pipeline test).
 *
 * Run: npx playwright test dashboard/DockCrossZoneDragNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dock cross-zone drag journey (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    const tabsNodeHolding = (doc, itemId) =>
        Object.entries(doc?.nodes || {}).find(([, n]) => n.type === 'tabs' && (n.items || []).includes(itemId))?.[0];

    test('dragging a tab header into another zone relocates the item in the committed dock model', async ({ page, neuralLink }) => {
        await page.goto('/examples/dashboard/dock/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await page.waitForTimeout(2500); // settle worker boot + first render

        const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
        const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
        const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
        expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

        const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel;

        const before     = await readModel();
        const sourceNode = tabsNodeHolding(before, 'strategy');
        expect(sourceNode, 'strategy must start in main-tabs').toBe('main-tabs');
        expect(tabsNodeHolding(before, 'terminal'), 'terminal must start in terminal-tabs').toBe('terminal-tabs');

        // drag the Strategy header (main-tabs) and drop it over the Terminal zone (a DIFFERENT tabs node)
        const strategyTab = page.locator('.neo-tab-header-button', { hasText: 'Strategy' }).first();
        const terminalTab = page.locator('.neo-tab-header-button', { hasText: 'Terminal' }).first();
        await expect(strategyTab, 'the Strategy tab header must render').toBeVisible({ timeout: 10000 });
        await expect(terminalTab, 'the Terminal tab header must render').toBeVisible({ timeout: 10000 });

        const from = await strategyTab.boundingBox();
        const to   = await terminalTab.boundingBox();

        // native cross-zone drag: Strategy header → onto the Terminal STRIP TOP (the {steps} cadence arms
        // the drag sensor). Aiming 3px under the strip's top edge — inside the geometric edge band of the
        // strip-shallow zone rect — pins the carve-out at its hardest point: a center-of-button drop stays
        // green even without the carve-out (interior), the top-band drop is the aim that regressed.
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height + 20, { steps: 20 }); // break out of the toolbar
        await page.mouse.move(to.x + to.width / 2, to.y + 3, { steps: 40 });                      // strip-top aim — the falsifying drop point
        await page.mouse.up();
        await page.waitForTimeout(1000);

        const after      = await readModel();
        const targetNode = tabsNodeHolding(after, 'strategy');
        console.log('[cross-zone] strategy:', sourceNode, '->', targetNode, '| terminal-tabs items:', JSON.stringify(after?.nodes?.['terminal-tabs']?.items));

        // worker truth: the drop relocated strategy OUT of main-tabs INTO terminal-tabs through the producer pipeline
        expect(targetNode, 'the cross-zone drop must move strategy to the Terminal zone — the producer contract')
            .toBe('terminal-tabs');
    });
});
