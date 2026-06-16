import {test, expect} from '../fixtures.mjs';

/**
 * @summary Verifies the cleaned AgentOS cockpit boots and shows only the kept surface.
 *
 * After the cockpit cleanup the app must still boot end-to-end and render the header toolbar + the
 * FleetSettingsPanel (the Fleet Manager) — with the early-PoC widgets (Swarm View / Blackboard,
 * InterventionPanel) and the "Detach Swarm View" control gone. This is the AC "render-verified"
 * structural proof; the visual neo-theme conversion is judged separately.
 *
 * @see apps/agentos/view/Viewport.mjs
 */
test.describe('AgentOS cockpit — cleaned shell (boot + content)', () => {
    test.setTimeout(120000);

    test('boots and shows the header + FleetSettingsPanel, no PoC widgets', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        // boots end-to-end: the header toolbar + the Fleet Manager settings panel render
        await expect(page.locator('.agent-top-toolbar')).toBeVisible({timeout: 60000});
        await expect(page.locator('.agent-panel-settings')).toBeVisible({timeout: 60000});
        // the kept FleetSettingsPanel renders its define-agent form
        await expect(page.locator('.agent-definition-form')).toBeVisible();

        // the early-PoC surfaces are gone
        await expect(page.locator('.agent-panel-swarm')).toHaveCount(0);
        await expect(page.locator('.agent-detach-button')).toHaveCount(0)
    });
});
