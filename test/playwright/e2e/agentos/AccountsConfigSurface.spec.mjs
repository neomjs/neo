import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies the agent-scoped Accounts configuration surface mounts end-to-end: the
 * selector strip derives from the roster store, the configuration card renders the scoped agent's
 * registry-derived configuration (harness chips, MCP-server rows, tri-state operational rows),
 * and the add-form's harness radios carry the shared registry's entries.
 *
 * The run also captures the surface screenshot the FM design gate reviews view-PRs against
 * (`screenshots/accounts-14807.png` — regenerated on every run, referenced from PR bodies).
 *
 * @see apps/agentos/view/Accounts.mjs
 * @see apps/agentos/view/AgentConfigCard.mjs
 */
test.describe('AgentOS Accounts — agent-scoped configuration surface', () => {
    test.setTimeout(120000);

    test('mounts the selector strip + config card + registry-derived form; captures the design-gate screenshot', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
        await expect(page.locator('.agent-panel-accounts')).toBeVisible({timeout: 30000});

        // the selector strip derives one button per roster agent (the seed roster has one)
        await expect(page.locator('.agent-selector')).toBeVisible();
        expect(await page.locator('.agent-selector-button').count()).toBeGreaterThan(0);

        // the config card renders the scoped agent: harness chips from the ONE shared registry
        await expect(page.locator('.agent-config-card')).toBeVisible();
        expect(await page.locator('.agent-config-chip').count()).toBe(5);
        await expect(page.locator('.agent-config-chip.is-selected')).toHaveCount(1);

        // MCP-server rows in catalog order, operational rows tri-state honest
        expect(await page.locator('.agent-config-toggle').count()).toBeGreaterThan(3);
        await expect(page.locator('.agent-config-row.is-unknown').first()).toContainText('Not read back yet');

        // the add-form's harness radios derive from the same registry (5 registered entries)
        expect(await page.locator('.agent-harness-picker .neo-radiofield').count()).toBe(5);

        await page.locator('.agent-panel-accounts').screenshot({
            path: 'test/playwright/e2e/agentos/screenshots/accounts-14807.png'
        })
    });
});
