import { test, expect } from '../../fixtures.mjs';

/**
 * Out-of-collection floating dock tab-overflow control.
 *
 * At a narrow viewport the heavy `main-tabs` node overflows; the runtime {@link Neo.dashboard.plugin.TabOverflow}
 * plugin creates a single overflow control (a `button.Base` with a `menu`) and mounts it as a `floating`
 * component to `document.body` — OUT of the header toolbar's item collection, so `owner.items` stays exactly
 * the real tabs (the collection invariant; a trailing toolbar item would be SortZone-draggable and corrupt
 * the committed dock tab order). The parentless `initVnode(true)` autoMount reaches the DOM via the merged
 * hidden-document render-queue drain.
 *
 * Asserted against the page's OWN DOM — deliberately NOT via the neuralLink bridge, whose `connectToApp`
 * appName-fallback can latch a long-lived stale resident and read the wrong app. The page DOM is the ground
 * truth for "did it render".
 *
 * Run: NEO_E2E_PORT=8094 npx playwright test dashboard/DockTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('#14771 dock tab-overflow floating control', () => {
    test.setTimeout(120000);
    test.use({ viewport: { width: 600, height: 800 } });

    test('the floating overflow control renders at document.body and its menu surfaces the hidden tabs', async ({ page }) => {
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await page.goto('/examples/dashboard/dock/');

        // At 600px the 7 main-tabs overflow → the plugin mounts the floating overflow control at
        // document.body. Poll (the mount settles a beat after the app boots + measures the header extents).
        const control = page.locator('.neo-dock-tab-overflow-control');
        await expect(control).toHaveCount(1, { timeout: 45000 });

        // Out-of-collection invariant: a FLOATING direct child of document.body, NOT a nested item of the
        // header toolbar — so `owner.items` stays exactly the real tabs.
        const parentIsBody = await page.evaluate(() =>
            document.querySelector('.neo-dock-tab-overflow-control')?.parentElement === document.body);
        expect(parentIsBody, 'the overflow control must be a direct floating child of document.body').toBe(true);

        // It carries the ellipsis affordance.
        await expect(control.locator('.fa-ellipsis')).toHaveCount(1);

        // Interaction journey: clicking the control opens its dropdown menu, which lists the hidden tabs
        // (button.Base builds the menu.List itself). At least one hidden-tab entry must be selectable.
        await control.click();
        const menuItem = page.locator('.neo-list-item, .neo-menu-item').filter({ hasText: /\S/ });
        await expect(menuItem.first()).toBeVisible({ timeout: 10000 });
    })
});
