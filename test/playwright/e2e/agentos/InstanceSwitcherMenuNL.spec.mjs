import {test, expect} from '../../fixtures.mjs';

const remoteProfile = {
    profileId        : 'fleet-profile:v1:https://switcher-test.example/fleet',
    canonicalEndpoint: 'https://switcher-test.example/fleet',
    custodian        : 'session-only',
    label            : 'zz keyboard target',
    contractVersion  : 1,
    generation       : 1,
    bearerEnvVar     : ''
};

/**
 * @summary Whitebox proof that the InstanceSwitcher delegates interaction to button.Base +
 * menu.List: focus enters the floating list, arrows move between Store records, Enter activates,
 * Escape closes, and a focus-leave click dismisses. The intent payload itself is covered in the
 * focused unit spec so this journey never needs a production test hook.
 *
 * Run: npx playwright test agentos/InstanceSwitcherMenuNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS instance switcher — framework menu behavior', () => {
    test.setTimeout(90000);

    test('keyboard activation, Escape and outside focus-leave dismissal use the framework paths', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');

        const
            trigger    = page.locator('.fm-instance-switcher.fm-instance-trigger'),
            menu       = page.locator('.fm-instance-menu'),
            app        = await neuralLink.connectToApp('AgentOS'),
            stores     = await app.findInstances({className: 'AgentOS.store.FleetInstances'}, ['id']),
            storeId    = (Array.isArray(stores) ? stores[0] : stores)?.id,
            viewports  = await app.findInstances({className: 'AgentOS.view.Viewport'}, ['id']),
            viewportId = (Array.isArray(viewports) ? viewports[0] : viewports)?.id;

        await expect(trigger).toBeVisible({timeout: 60000});
        expect(storeId, 'the provider-owned FleetInstances Store must exist').toBeTruthy();
        expect(viewportId, 'the Agent OS Viewport must exist').toBeTruthy();

        await app.callMethod(storeId, 'add', [[remoteProfile]]);

        try {
            await expect(trigger).toHaveAttribute('aria-label', /^Instance: .+ — (connected|not connected|degraded|switching)$/);

            await trigger.click();
            await expect(menu).toBeVisible();
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');

            const rows = menu.locator('.fm-instance-row');
            await expect(rows).toHaveCount(2);
            await expect(rows.filter({has: page.locator('[aria-hidden="true"]')})).toHaveCount(2);
            await expect(menu.locator('.fm-instance-row.is-bound[aria-checked="true"]')).toHaveCount(1);
            await expect(rows.first()).toBeFocused();

            await page.keyboard.press('ArrowDown');
            await expect(rows.nth(1)).toBeFocused();

            await page.keyboard.press('Enter');
            await expect(menu).toBeHidden();
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');

            await trigger.click();
            await expect(menu).toBeVisible();
            await expect(menu.locator('.fm-instance-row').first()).toBeFocused();

            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');

            await trigger.click();
            await expect(menu).toBeVisible();
            await expect(menu.locator('.fm-instance-row').first()).toBeFocused();

            // A real outside control moves focus out of the floating menu, which is the menu.List
            // dismissal contract (an inert decorative node cannot produce a focus-leave event).
            await page.locator('.neo-tab-header-button').first().click();
            await expect(menu).toBeHidden();
            await expect(trigger).toHaveAttribute('aria-expanded', 'false');

            // The menu is a body-level floating component, so each open must synchronize the
            // current viewport skin instead of retaining its creation-time theme class.
            for (const tag of ['dark', 'light']) {
                await app.setProperties(viewportId, {theme: `neo-theme-neo-${tag}`});
                await expect(page.locator('.agent-os-viewport').first()).toHaveClass(new RegExp(`neo-theme-neo-${tag}`));
                await trigger.click();
                await expect(menu).toBeVisible();
                await expect(menu).toHaveClass(new RegExp(`neo-theme-neo-${tag}`));
                await page.keyboard.press('Escape');
                await expect(menu).toBeHidden()
            }
        } finally {
            await app.callMethod(storeId, 'remove', [remoteProfile.profileId]);
            await app.setProperties(viewportId, {theme: 'neo-theme-neo-dark'})
        }
    })
});
