import { test, expect } from '../../fixtures.mjs';

/**
 * Out-of-collection floating dock tab-overflow control — the retained minimal generic runtime witness for
 * Neo.tab.plugin.Overflow (the dense composed workstation journey lives in the dense-workstation scene).
 *
 * At a narrow viewport the heavy `main-tabs` node overflows; the runtime {@link Neo.tab.plugin.Overflow}
 * plugin (injected by `DockLayoutAdapter.projectTabsNode` into the projected header toolbar) creates a single
 * overflow control (a `button.Base` with a `menu`) and mounts it as a `floating` component to `document.body`
 * — OUT of the header toolbar's item collection, so `owner.items` stays exactly the real tabs (the collection
 * invariant; a trailing toolbar item would be SortZone-draggable and corrupt the committed dock tab order).
 * The parentless `initVnode(true)` autoMount reaches the DOM via the merged hidden-document render-queue drain.
 *
 * Asserted against the page's OWN DOM — deliberately NOT via the neuralLink bridge, whose `connectToApp`
 * appName-fallback can latch a long-lived stale resident and read the wrong app. The page DOM is the ground
 * truth for "did it render". Journey core contributed by @neo-gpt's fresh-port review probe.
 *
 * Run: NEO_E2E_PORT=8094 npx playwright test dashboard/DockTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('dock tab-overflow floating control', () => {
    test.setTimeout(120000);
    test.use({ viewport: { width: 600, height: 800 } });

    test('the floating overflow control renders at document.body, aligns to its owner toolbar, and its menu surfaces + activates the hidden tabs', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', err => { pageErrors.push(err.message); console.error('BROWSER JS ERROR:', err) });
        await page.goto('/examples/dashboard/dock/');

        const control = page.locator('.neo-tab-overflow-control');
        await expect(control).toHaveCount(1, { timeout: 45000 });

        // Out-of-collection invariant: a FLOATING direct child of document.body, NOT a nested header-toolbar
        // item — so `owner.items` stays exactly the real tabs (a toolbar item would be SortZone-draggable).
        const parentIsBody = await page.evaluate(() =>
            document.querySelector('.neo-tab-overflow-control')?.parentElement === document.body);
        expect(parentIsBody, 'the overflow control must be a direct floating child of document.body').toBe(true);

        // It carries the ellipsis affordance.
        await expect(control.locator('.fa-ellipsis')).toHaveCount(1);

        // Owner-EXACT geometry: the control's right edge aligns (within 2px) immediately before the
        // persistent Dock close-action rail, and its top aligns to that action inside the toolbar
        // carrying 'Strategy' — NOT a stale pre-settle position. This requires the
        // `.neo-button.neo-floating { position: fixed }` cascade fix; without it the control is pinned
        // to its offsetParent instead
        // of the viewport and lands at the wrong coordinates.
        const mainToolbar = page.locator('.neo-tab-header-toolbar').filter({ hasText: 'Strategy' }).first(),
              closeAction = mainToolbar.getByRole('button', {name: 'close', exact: true});

        await expect(closeAction).toBeVisible();

        const controlBox = await control.boundingBox(),
              actionBox  = await closeAction.boundingBox();

        expect(Math.abs((controlBox.x + controlBox.width) - actionBox.x),
            'control right edge aligns immediately before the Dock action rail').toBeLessThanOrEqual(2);
        expect(Math.abs(controlBox.y - actionBox.y),
            'control top aligns to the adjacent Dock action').toBeLessThanOrEqual(2);
        await expect(mainToolbar.locator('.neo-toolbar-action.neo-draggable')).toHaveCount(0);

        // Clicking the control opens its dropdown menu of hidden tabs.
        await control.click();
        const menuItems = page.locator('.neo-menu-list:visible .neo-list-item').filter({ hasText: /\S/ });
        await expect(menuItems.first()).toBeVisible({ timeout: 10000 });

        // Partition: the visible headers + the hidden (menu) headers together are the full tab set — nothing
        // is lost or duplicated across the visible/hidden split.
        const normalize      = values => values.map(value => value.trim()).filter(Boolean),
              visibleHeaders = normalize(await page.locator('.neo-tab-header-button:visible').allTextContents()),
              hiddenHeaders  = normalize(await menuItems.allTextContents());
        expect([...visibleHeaders, ...hiddenHeaders].sort()).toEqual(
            ['Agents', 'Alerts', 'History', 'Inspector', 'Logs', 'Metrics', 'Strategy', 'Swarm', 'Terminal', 'Timeline'].sort());

        // Selection: picking a hidden tab activates it and surfaces it into the header (pressed + visible),
        // via the ordinary activeIndex path (active-never-hidden), so the picked tab is never left in the menu.
        const selectedText = (await menuItems.first().innerText()).trim();
        await menuItems.first().click();
        await expect(page.locator('.neo-tab-header-button.pressed:visible').filter({ hasText: selectedText })).toHaveCount(1);

        // No unexpected browser errors across the journey — notably, a fixed-positioned align must NOT trip
        // `ResizeObserver.observe(null)` (offsetParent is null for `position: fixed`), which the DomAccess
        // null-guard prevents.
        expect(pageErrors, 'no unexpected page errors during the overflow journey').toEqual([])
    })
});
