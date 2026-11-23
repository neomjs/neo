import {test, expect} from '@playwright/test';

/**
 * @summary The operations desk's panes are views of one record set: a row picked in one grid shows in the Inspector
 * and in the other grid, a state switched in the Inspector repaints Swarm and recounts Metrics, and the selection
 * survives a perspective switch.
 *
 * Driven on `examples/dashboard/desk` on the real pointer path. The bridge is off (`useAiClient: false`), so a run
 * registers no Neural Link session on a developer's live bridge.
 *
 * Run: npx playwright test component/dashboard/DeskSelection -c test/playwright/playwright.config.component.mjs
 */

test.use({viewport: {height: 900, width: 1440}});

test.beforeEach(async ({page}) => {
    await page.route('**/examples/dashboard/desk/neo-config.json', async route => {
        const response = await route.fetch({maxRetries: 2});

        await route.fulfill({json: {...await response.json(), useAiClient: false}, response})
    });

    await page.goto('examples/dashboard/desk/index.html');
    await expect(inspectorTitle(page), 'the desk opens on its selected agent').toHaveText(/Cedar/, {timeout: 30000})
});

/**
 * @param {Object} page
 * @returns {Object} The Inspector's name and role
 */
function inspectorTitle(page) {
    return page.locator('.neo-example-desk-inspector-title')
}

/**
 * @param {Object} page
 * @param {String} paneId
 * @param {String} agent
 * @returns {Object} The agent's row in one of the two agent grids
 */
function row(page, paneId, agent) {
    return page.locator(`.neo-example-desk-pane-${paneId} .neo-grid-row`, {hasText: agent}).first()
}

/**
 * @param {Object} page
 * @param {String} title
 * @returns {Object} The header button of a pane's tab
 */
function tab(page, title) {
    return page.locator('.neo-tab-header-button', {hasText: title}).first()
}

test.describe('examples/dashboard/desk — one selection across panes', () => {
    test('a row picked in Swarm shows in the Inspector and is selected in Agents', async ({page}) => {
        await tab(page, 'Swarm').click();
        await row(page, 'swarm', 'Flint').click();

        await expect(inspectorTitle(page)).toHaveText(/Flint/);

        await tab(page, 'Agents').click();

        await expect(row(page, 'agents', 'Flint'), 'the other grid follows the same selection').toHaveClass(/neo-selected/);
        await expect(row(page, 'agents', 'Cedar'), 'and drops the previous one').not.toHaveClass(/neo-selected/)
    });

    test('a state switched in the Inspector repaints Swarm and recounts Metrics', async ({page}) => {
        const blocked = page.locator('.neo-example-desk-metric-blocked .neo-example-desk-metric-value');

        await tab(page, 'Metrics').click();
        await expect(blocked).toHaveText('2');

        await page.locator('.neo-example-desk-state-button-blocked').click();

        await expect(blocked, 'Cedar counts as blocked').toHaveText('3');

        await tab(page, 'Swarm').click();

        await expect(row(page, 'swarm', 'Cedar')).toContainText('blocked')
    });

    test('the selection survives a perspective switch', async ({page}) => {
        await tab(page, 'Swarm').click();
        await row(page, 'swarm', 'Juniper').click();
        await expect(inspectorTitle(page)).toHaveText(/Juniper/);

        await page.locator('.neo-dashboard-dock-perspective-toolbar .neo-button', {hasText: 'Review'}).click();

        await expect(inspectorTitle(page), 'the Inspector keeps the agent').toHaveText(/Juniper/);
        await expect(row(page, 'swarm', 'Juniper'), 'and Swarm keeps its row').toHaveClass(/neo-selected/)
    })
});
