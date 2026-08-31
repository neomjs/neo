import { test, expect } from '../../fixtures.mjs';

/**
 * Dock tab-overflow action — the composed-header runtime witness for Neo.tab.plugin.Overflow.
 *
 * At a narrow viewport the heavy `main-tabs` node overflows; the runtime {@link Neo.tab.plugin.Overflow}
 * plugin (injected by `LayoutAdapter.projectTabsNode`) contributes one stable control as the FIRST toolbar
 * action. Tab buttons remain the SortZone's explicit subset, so the action is never draggable; host/engine
 * actions follow it and close stays last. Widening hides the contribution through removeDom, narrowing restores
 * the SAME instance, and no floating body-rooted control exists in this mode.
 *
 * Asserted against the page's OWN DOM — deliberately NOT via the neuralLink bridge, whose `connectToApp`
 * appName-fallback can latch a long-lived stale resident and read the wrong app. The page DOM is the ground
 * truth for "did it render". Journey core contributed by @neo-gpt's fresh-port review probe.
 *
 * Run: NEO_E2E_PORT=8094 npx playwright test dashboard/DockTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('dock tab-overflow action control', () => {
    test.setTimeout(120000);
    test.use({ viewport: { width: 600, height: 800 } });

    test('the overflow action stays first, resize-stable, focus-independent, and activates hidden tabs', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', err => { pageErrors.push(err.message); console.error('BROWSER JS ERROR:', err) });
        await page.goto('/examples/dashboard/dock/');

        const mainToolbar = page.locator('.neo-tab-header-toolbar').filter({ hasText: 'Strategy' }).first(),
              control     = mainToolbar.getByRole('button', {name: 'More tabs', exact: true}),
              closeAction = mainToolbar.getByRole('button', {name: 'close', exact: true});

        await expect(control).toHaveCount(1, {timeout: 45000});
        await expect(closeAction).toBeVisible();
        await expect(control.locator('.fa-ellipsis')).toHaveCount(1);
        await expect(page.locator('body > .neo-tab-overflow-control'),
            'dock action mode creates no floating body-rooted control').toHaveCount(0);
        expect(await control.evaluate(node => node.parentElement?.classList.contains('neo-tab-header-toolbar')),
            'the control is a real toolbar item').toBe(true);
        await expect(control).not.toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(control).not.toHaveAttribute('aria-hidden');

        const actions = mainToolbar.locator('.neo-toolbar-action');
        expect(await actions.first().getAttribute('id'), 'Overflow is the first action').toBe(await control.getAttribute('id'));
        expect(await actions.last().getAttribute('id'), 'close remains the last action').toBe(await closeAction.getAttribute('id'));

        await expect.poll(async () => {
            const controlBox = await control.boundingBox(),
                  actionBox  = await closeAction.boundingBox();

            return Math.max(
                Math.abs((controlBox.x + controlBox.width) - actionBox.x),
                Math.abs(controlBox.y - actionBox.y)
            )
        }, {
            message: 'the settled overflow control ends immediately before the Dock action on its baseline',
            timeout: 10000
        }).toBeLessThanOrEqual(2);
        await expect(mainToolbar.locator('.neo-toolbar-action.neo-draggable')).toHaveCount(0);

        // Stable presence contract: all-fit removes the DOM, overflow restores the exact instance.
        const controlId = await control.getAttribute('id');

        await page.setViewportSize({width: 1600, height: 800});
        await expect(control).toHaveCount(0, {timeout: 10000});
        await page.setViewportSize({width: 600, height: 800});
        await expect(page.locator(`#${controlId}`), 'the same contributed instance returns').toBeVisible({timeout: 10000});

        // Clicking the control opens its dropdown menu of hidden tabs.
        await page.locator(`#${controlId}`).click();
        const menuItems = page.locator('.neo-menu-list:visible .neo-list-item').filter({ hasText: /\S/ });
        await expect(menuItems.first()).toBeVisible({ timeout: 10000 });

        // Partition: the visible headers + the hidden (menu) headers together are the full tab set — nothing
        // is lost or duplicated across the visible/hidden split.
        const normalize       = values => values.map(value => value.trim()).filter(Boolean),
              expectedHeaders = ['Agents', 'Alerts', 'History', 'Inspector', 'Logs', 'Metrics', 'Strategy', 'Swarm', 'Terminal', 'Timeline'].sort();

        await expect.poll(async () => {
            const visibleHeaders = normalize(await page.locator('.neo-tab-header-button:visible').allTextContents()),
                  hiddenHeaders  = normalize(await menuItems.allTextContents());

            return [...visibleHeaders, ...hiddenHeaders].sort()
        }, {
            message: 'visible headers and the Overflow menu settle into one exact partition',
            timeout: 10000
        }).toEqual(expectedHeaders);

        // Selection: picking a hidden tab activates it and surfaces it into the header (pressed + visible),
        // via the ordinary activeIndex path (active-never-hidden), so the picked tab is never left in the menu.
        const selectedText = (await menuItems.first().innerText()).trim(),
              selectedItem = menuItems.filter({hasText: selectedText});

        await expect(selectedItem, 'the selected semantic menu item remains unique while Overflow settles').toHaveCount(1);
        await selectedItem.click();
        await expect(page.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selectedText}))
            .toHaveCount(1, {timeout: 10000});

        // No unexpected browser errors across the journey — notably, a fixed-positioned align must NOT trip
        // `ResizeObserver.observe(null)` (offsetParent is null for `position: fixed`), which the DomAccess
        // null-guard prevents.
        expect(pageErrors, 'no unexpected page errors during the overflow journey').toEqual([])
    })
});
