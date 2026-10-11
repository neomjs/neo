import {test, expect} from '../../fixtures.mjs';

/**
 * E2e: the dock's DEFAULT tear-out route, end to end, on `examples/dashboard/tearOut`.
 *
 * `Neo.dashboard.dock.Workspace#openTearOutVessel` reopens the host's own page with `?tearout=<itemId>`;
 * the app boots an empty viewport there, and the workspace moves the live pane in. Nothing else drives
 * this route: the Workstation overrides the opener, and the unit and component fixtures stub it.
 * The witness is the pane's DOM id, which is its component id: one id in two windows is one instance.
 * Brain-free on purpose (no Neural Link fixture), so hosted CI selects it.
 *
 * Run: npm run test-e2e -- e2e/dashboard/DockTearOutDefaultRoute --workers=1
 */
const paneIdOf = (page, label) => page.evaluate(text => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
        if (node.textContent.trim() === text && !node.parentElement.closest('.neo-tab-header-toolbar')) {
            return node.parentElement.closest('[id]')?.id || null
        }
    }

    return null
}, label);

test.describe('examples/dashboard/tearOut — the default tear-out route', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1200, height: 800}});

    test('a popped-out pane renders as itself in its own window, and comes home when the window closes', async ({page, context}) => {
        await page.goto('/examples/dashboard/tearOut/index.html');

        const metricsTab = page.locator('.neo-tab-header-button', {hasText: 'Metrics'});

        await expect(metricsTab).toBeVisible();

        const paneId = await paneIdOf(page, 'Metrics');

        expect(paneId, 'the Metrics pane renders in the main window').toBeTruthy();

        // The header's middle actions are gated on focus.
        await metricsTab.click();

        const popOut = page.locator('.neo-toolbar-action:has(.fa-window-restore)').filter({visible: true});

        await expect(popOut).toHaveCount(1);

        const [vessel] = await Promise.all([context.waitForEvent('page'), popOut.click()]);

        await vessel.waitForURL(/[?&]tearout=metrics\b/);

        // The window's viewport has decided to stay an empty target: it mounts no workspace of its own.
        await expect(vessel.locator('.tear-out-target')).toHaveCount(1);
        await expect(vessel.locator('.neo-dock-workspace')).toHaveCount(0);
        await expect.poll(() => paneIdOf(vessel, 'Metrics'), {message: 'the same pane instance renders in the new window'}).toBe(paneId);
        await expect(metricsTab).toHaveCount(0);

        // A user's close runs the page's unload path, which is how the App Worker learns the window is gone.
        await vessel.close({runBeforeUnload: true});

        await expect(metricsTab).toBeVisible();
        await expect.poll(() => paneIdOf(page, 'Metrics'), {message: 'the same pane instance is home again'}).toBe(paneId)
    })
});
