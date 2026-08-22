import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The Fleet cockpit consumes the shipped auto-hide rail contract as a real product
 * surface: its authored `detail` item starts on the right edge rail, a native rail-button click
 * opens the runtime-only reveal without changing the worker-owned dock document, and the real pin
 * affordance commits `setItemPinned(true)` so the same item returns to the normal tab flow while
 * the rail's shared overlay retires to hidden state for the remaining auto-hidden Fleet items.
 *
 * This is the product-composition complement to `dashboard/DockAutoHideRevealNL`: the dashboard
 * sibling owns the generic interaction grammar; this journey proves the Fleet document, resolver,
 * holder commit loop, and DOM reconciliation actually compose it without a Fleet-only path.
 *
 * Run: NEO_E2E_PORT=49217 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetCockpitAutoHideRailNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — auto-hide rail product cycle', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 1000}});

    test('detail rail → runtime-only reveal → pin restores the normal pane', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              holders  = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = (Array.isArray(holders) ? holders[0] : holders)?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        const readModel = async () => (await app.getComponent(holderId, ['dockModel'])).dockModel,
              before    = await readModel();

        expect(before.items.detail.autoHidden, 'the authored Fleet document starts detail on the rail').toBe(true);
        expect(before.nodes['secondary-rail'].items).toContain('detail');

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Agent detail'}).first();

        await expect(railTab, 'the Fleet document must project a real labelled detail rail button').toBeVisible({timeout: 15000});
        await railTab.click();

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();

        await expect(overlay, 'the native rail click must open the runtime reveal').toBeVisible({timeout: 15000});
        await expect(overlay.locator('.neo-dashboard-dock-reveal-title')).toHaveText('Agent detail');

        // Reveal is runtime-only: the worker-owned serializable document remains byte-identical.
        expect(JSON.stringify(await readModel()), 'opening the reveal must not persist hover/open state').toBe(JSON.stringify(before));

        await overlay.locator('.neo-dashboard-dock-reveal-pin').click();

        await expect.poll(async () => {
            const item = (await readModel()).items.detail;

            return {autoHidden: item.autoHidden, pinned: item.pinned}
        }, {timeout: 15000}).toEqual({autoHidden: false, pinned: true});

        await expect(railTab, 'the pinned detail must retire from the edge rail').toHaveCount(0);
        await expect(page.locator('.neo-dashboard-dock-rail-tab'),
            'the other four authored Fleet rail items must survive the detail pin').toHaveCount(4);
        await expect(page.locator('.neo-tab-header-button', {hasText: 'Agent detail'}).first(),
            'the pinned detail must re-enter the normal rendered tab flow').toBeVisible({timeout: 15000});
        await expect(page.locator('.neo-dashboard-dock-reveal-overlay'),
            'the multi-item rail keeps exactly one shared reveal overlay').toHaveCount(1);
        await expect(overlay,
            'the shared runtime overlay must retire to hidden state after the committed pin').toBeHidden();

        expect(pageErrors, 'the Fleet auto-hide product cycle must be error-free').toEqual([])
    })
});
