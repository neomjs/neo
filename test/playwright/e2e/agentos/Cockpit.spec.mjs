import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies the AgentOS harness shell boots to the left-rail keeper-view nav with the Fleet
 * cockpit as the default surface, and that the keeper views are reachable via the rail.
 *
 * The app boots to the header chrome + the left-rail nav (Home / Fleet / Control / Accounts / Chat)
 * with Fleet active — the CARD cockpit (fleet grid + health bar + activity stream), NOT the old
 * FleetSettingsPanel grid-table as the default. The Control keeper-view (FleetSettingsPanel's
 * start/stop/restart lifecycle surface) and the Accounts keeper-view are reachable via the rail.
 *
 * @see apps/agentos/view/Viewport.mjs
 */
test.describe('AgentOS harness shell — left-rail keeper-view nav', () => {
    test.setTimeout(120000);

    test('boots to the Fleet cockpit default; Control + Accounts reachable via the rail', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        // boots end-to-end: the header chrome + the left-rail keeper-view shell
        await expect(page.locator('.agent-top-toolbar')).toBeVisible({timeout: 60000});
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // Fleet is the default keeper-view: the CARD cockpit (fleet grid + health bar + activity stream)
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        expect(await page.locator('.fm-agent-card').count()).toBeGreaterThan(0);
        await expect(page.locator('.fm-health-bar')).toBeVisible();
        await expect(page.locator('.fm-activity-stream')).toBeVisible();

        // the old FleetSettingsPanel grid-table is NOT the boot/default surface
        await expect(page.locator('.agent-panel-settings')).toHaveCount(0);

        // Control keeper-view reachable via the rail → the FleetSettingsPanel lifecycle surface renders
        await page.locator('.agent-shell').getByText('Control', {exact: true}).click();
        await expect(page.locator('.agent-panel-settings')).toBeVisible({timeout: 30000});

        // Accounts keeper-view reachable via the rail → the agent-identity form renders
        await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
        await expect(page.locator('.agent-definition-form')).toBeVisible({timeout: 30000})
    });
});
