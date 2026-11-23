import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A dock tab press reconciles in place: every tabs node keeps its container, and focus stays on
 * the pressed tab.
 *
 * `setActiveItem` writes one node field, and its `activation` change class sends the commit down the
 * reconciler's stable path. A staged transaction instead builds new wrapper containers around the tabs
 * nodes and re-parents the tabs nodes into them, destroying the old wrappers, whose focus revert then takes
 * focus from the pressed tab. So a tabs node's `parentId` names the path a press took.
 */
test.describe('Workstation — a tab press reconciles in place', () => {
    test.setTimeout(120000);
    // wide enough that two tabs nodes show an inactive tab outside their overflow menus
    test.use({contextOptions: {screen: {height: 1080, width: 1920}}, viewport: {height: 1080, width: 1920}});

    test('presses in two tabs nodes keep every tabs node in its container and focus on the pressed tab', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [];

        expect(workspaces, 'the page owns exactly one current Workspace').toHaveLength(1);

        const
            wsId    = workspaces[0].id,
            readDoc = () => app.callMethod(wsId, 'getWorkspaceDocument', ['workstation-main']),
            multi   = Object.entries((await readDoc()).nodes)
                .filter(([, node]) => node.type === 'tabs' && node.items?.length > 1)
                .map(([nodeId]) => nodeId),
            settle   = async () => {
                const {refreshPromise} = await app.getComponent(wsId, ['refreshPromise']);

                refreshPromise && await app.callMethod(wsId, 'refreshPromise.then')
            },
            placement = async () => Object.fromEntries(await Promise.all(multi.map(async nodeId => {
                const
                    {containerId} = await app.callMethod(wsId, 'getTabChromeIdentity', [nodeId]),
                    {parentId}    = await app.getComponent(containerId, ['parentId']);

                return [nodeId, {containerId, parentId}]
            }))),
            // an inactive tab whose header button shows in the strip, not in the overflow menu
            visibleInactiveTab = async nodeId => {
                const
                    node   = (await readDoc()).nodes[nodeId],
                    chrome = await app.callMethod(wsId, 'getTabChromeIdentity', [nodeId]);

                for (const itemId of node.items.filter(id => id !== node.activeItemId)) {
                    const button = chrome.buttons[itemId];

                    if (button && await page.locator(`#${button}`).isVisible()) return {button, itemId}
                }

                return null
            };

        await settle();

        const
            before    = await placement(),
            pressable = [];

        for (const nodeId of multi) await visibleInactiveTab(nodeId) && pressable.push(nodeId);

        expect(pressable.length, 'two tabs nodes show an inactive tab to press').toBeGreaterThan(1);

        for (const nodeId of pressable.slice(0, 2)) {
            const {button, itemId} = await visibleInactiveTab(nodeId);

            await page.locator(`#${button}`).click();
            await expect.poll(async () => (await readDoc()).nodes[nodeId].activeItemId, {message: `${nodeId} commits the press`}).toBe(itemId);
            await settle();

            expect(await placement(), `after the ${nodeId} press, no tabs node moved to a new container`).toEqual(before);
            await expect.poll(() => page.evaluate(() => document.activeElement?.id), {message: 'focus stays on the pressed tab'}).toBe(button)
        }
    })
});
