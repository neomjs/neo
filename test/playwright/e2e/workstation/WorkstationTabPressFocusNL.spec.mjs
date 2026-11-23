import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A tab pressed in a second tabs node keeps its focus, and with it its node's focus-gated header actions.
 *
 * The press commits a dock refresh that rebuilds the shell. The destroyed containers still report the focus the press
 * moved through them, and their departure used to hand it back to the tab pressed before, about 100 ms later.
 *
 * Run with NEO_AGENTOS_RUNTIME_ROOT set to a Brain checkout:
 * npx playwright test workstation/WorkstationTabPressFocusNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — a tab press keeps its focus', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 1000, width: 1600}});

    test('a tab pressed in a second tabs node keeps its focus and its node\'s actions', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const app              = await neuralLink.connectToApp('Workstation'),
              workspaces       = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId             = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              {refreshPromise} = await app.getComponent(wsId, ['refreshPromise']);

        refreshPromise && await app.callMethod(wsId, 'refreshPromise.then');

        const topology = (await app.getDockTopology(wsId)).document,
              presses  = [];

        for (const [nodeId, node] of Object.entries(topology.nodes)) {
            if (node.type !== 'tabs' || presses.length === 2) continue;

            const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', [nodeId]),
                  itemId = node.items?.find((item, index) => index > 0 && chrome?.buttons?.[item]);

            itemId && presses.push({buttonId: chrome.buttons[itemId], headerId: chrome.headerId})
        }

        expect(presses, 'two tabs nodes, each with a second tab to press').toHaveLength(2);

        const [first, second] = presses,
              activeId        = () => page.evaluate(() => document.activeElement?.id);

        await page.locator(`#${first.buttonId}`).click();
        await expect.poll(activeId).toBe(first.buttonId);

        await page.locator(`#${second.buttonId}`).click();
        await page.waitForTimeout(500);

        expect(await activeId(), 'focus stays on the tab pressed last').toBe(second.buttonId);
        expect(await page.locator(`#${second.headerId} > .neo-toolbar-action`).count(), 'its node offers its focus-gated actions')
            .toBeGreaterThan(0)
    })
});
