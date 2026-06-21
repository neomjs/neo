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

    // S1 of the EvidencePane relocation: the first-widget work-area, formerly a separate child app,
    // now renders inline in the cockpit dashboard.Container as a hosted composite.
    test('hosts the relocated first-widget panel: intake + evidence pane + the booted grid (S1)', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        // the relocated work-area mounts in the cockpit
        await expect(page.locator('.agent-os-first-widget-panel')).toBeVisible({timeout: 60000});
        // its subtree renders in the new host: the bounded intake, the evidence pane, the live-grid stage
        await expect(page.locator('.agent-os-request-intake')).toBeVisible();
        await expect(page.locator('.agent-os-evidence-pane')).toBeVisible();
        await expect(page.locator('.agent-os-widget-stage')).toBeVisible();
        // the controller booted the first grid through the add → insert seam INTO the stage — i.e. the
        // insert-observer projection fires App-Worker-locally in the relocated host, not just the childapp
        await expect(page.locator('.agent-os-first-widget-grid')).toBeVisible()
    });
});
