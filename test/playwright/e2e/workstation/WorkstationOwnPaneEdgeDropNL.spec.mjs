import {test, expect} from '../../fixtures.mjs';

const NODE    = 'heavy-tabs',
      asArray = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @summary A tab dropped on an edge band of its own pane splits the pane, as the hover previewed.
 *
 * The release used to re-derive its preview with the drag's own tabs node left out, so the edge the hover showed
 * was gone at the drop: nothing landed, and the dock reported the abandoned gesture, which fails this tier through
 * the `workerErrors` fixture. The drag runs under a 4× CPU throttle, the operator's manual test on a loaded machine.
 */
test.describe('Workstation — a tab dropped on its own pane\'s edge', () => {
    test.setTimeout(120000);

    test('the lower band of its own pane splits the pane and docks the tab below the others', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);

        const app               = await neuralLink.connectToApp('Workstation'),
              workspaceId       = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
              model             = async () => (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
              [itemId, ...rest] = (await model()).nodes[NODE].items,
              chrome            = await app.callMethod(workspaceId, 'getTabChromeIdentity', [NODE]),
              tab               = await page.locator(`#${chrome.buttons[itemId]}`).boundingBox(),
              pane              = await page.locator(`#${chrome.containerId}`).boundingBox(),
              cdp               = await page.context().newCDPSession(page);

        expect(rest.length, `${NODE} keeps tabs beside the dragged one`).toBeGreaterThan(0);
        await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});

        try {
            // Below the indicator cross, inside the pane's own bottom band and above the root's 24px strip
            const target = {x: pane.x + pane.width / 2, y: pane.y + pane.height - Math.max(32, 0.12 * Math.min(pane.width, pane.height))};

            await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
            await page.mouse.down();
            await page.mouse.move(tab.x + tab.width / 2 + 12, tab.y + tab.height / 2 + 12, {steps: 4});
            await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
            await page.mouse.move(target.x, target.y, {steps: 15});
            await expect(page.locator('.neo-dock-preview-affordance').first(), 'the hover previews the own pane split').toBeVisible({timeout: 10000});
            await page.mouse.up();

            await expect.poll(async () => {
                const {nodes} = await model(),
                      split   = Object.values(nodes).find(node => node.type === 'split' && node.children?.includes(NODE));

                return split && {
                    below      : nodes[split.children[1]]?.items,
                    orientation: split.orientation,
                    stays      : nodes[NODE].items
                }
            }, {message: 'the pane splits with the tab alone below the others', timeout: 15000})
                .toEqual({below: [itemId], orientation: 'vertical', stays: rest})
        } finally {
            await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1})
        }
    })
});
