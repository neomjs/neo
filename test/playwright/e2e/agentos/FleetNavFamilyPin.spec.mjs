import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The persisted side-by-side receipt for the shell's ONE tab family: the keeper rail,
 * the south content strip, and the right dock-rail band pinned per skin. The three regions are
 * pixel-stable (static roster, no timestamps), so the committed baselines ARE the reviewable
 * keeper/rail/south evidence — and any future drift in the family fails here instead of waiting
 * for a reader. The skin switch is driven through the App Worker (the drill-journey idiom) and
 * gated on the applied theme class, so a "light" pin can never hold dark pixels.
 *
 * Run: npx playwright test agentos/FleetNavFamilyPin -c test/playwright/playwright.config.e2e.mjs
 */
test.describe('AgentOS shell — the nav tab family, pinned per skin', () => {
    test.setTimeout(90000);

    test('keeper rail, south strip and dock-rail band render the one chrome-tier family in both skins', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const
            app        = await neuralLink.connectToApp('AgentOS'),
            viewports  = await app.findInstances({className: 'AgentOS.view.Viewport'}, ['id']),
            viewportId = (Array.isArray(viewports) ? viewports[0] : viewports)?.id;

        expect(viewportId, 'the shell viewport must exist in the App Worker').toBeTruthy();

        const
            keeper = page.locator('.agent-shell > .neo-tab-header-toolbar'),
            south  = page.locator('.fm-fleet-cockpit .neo-tab-header-toolbar.neo-dock-top').nth(1),
            rail   = page.locator('.neo-dashboard-dock-edge-rail-right').first();

        try {
            for (const tag of ['dark', 'light']) {
                await app.setProperties(viewportId, {theme: `neo-theme-neo-${tag}`});
                await expect(page.locator('.agent-os-viewport').first(), `[${tag}] the skin is applied before any pin`)
                    .toHaveClass(new RegExp(`neo-theme-neo-${tag}`));
                await page.evaluate(() => document.fonts.ready);

                for (const [name, region] of [['keeper', keeper], ['south', south], ['rail', rail]]) {
                    await expect(region, `[${tag}] the ${name} region is rendered`).toBeVisible();
                    await expect(region).toHaveScreenshot(`nav-family-${tag}-${name}.png`)
                }
            }
        } finally {
            await app.setProperties(viewportId, {theme: 'neo-theme-neo-dark'})
        }
    });
});
