import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E for closing Demo B's click pop-out by hand.
 *
 * The popup's disconnect reattaches the item, and the App worker reaps the departed window's tree one
 * task later. The worker's one CounterPane must come home as the same instance, mounted in the main
 * window, with the item back in exactly one tabs node of the main document.
 *
 * Run: npx playwright test dashboard/DemoBPopOutCloseNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dashboard Demo B — a hand-closed pop-out', () => {
    test.setTimeout(120000);

    /**
     * @param {Object} app Neural Link app wrapper.
     * @returns {Promise<Object[]>} Every live CounterPane, as `{id, mounted, windowId}`.
     */
    async function getCounters(app) {
        const found = await app.findInstances({
            className: 'Neo.examples.dashboard.crossWindow.CounterPane'
        }, ['id', 'mounted', 'windowId']);

        return (Array.isArray(found) ? found : found ? [found] : []).map(counter => ({...counter.properties, id: counter.id}))
    }

    test('the same CounterPane comes home after its popup closes', async ({page, neuralLink}) => {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
              workspaces = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              [baseline] = await getCounters(app),
              where      = async () => (await getCounters(app))
                  .map(counter => `${counter.id}@${counter.windowId === baseline.windowId ? 'main' : 'popup'}:${counter.mounted}`)
                  .join(',');

        expect(baseline?.id, 'the worker must own one CounterPane before the pop-out').toBeTruthy();

        const popupPromise = page.waitForEvent('popup', {timeout: 30000});

        expect(await app.callMethod(wsId, 'popOutPane', ['workbench'])).toEqual({detached: true, errors: []});

        const popup = await popupPromise;

        await expect.poll(where, {message: 'the popup hosts the live pane', timeout: 30000}).toBe(`${baseline.id}@popup:true`);

        await popup.close();

        await expect.poll(where, {message: 'the same pane comes home', timeout: 30000}).toBe(`${baseline.id}@main:true`);

        const {detachedPanes, dockModel} = await app.getComponent(wsId, ['detachedPanes', 'dockModel']);

        expect(detachedPanes).toEqual({});
        expect(Object.values(dockModel.nodes).filter(node => node.items?.includes('workbench'))).toHaveLength(1);
        expect(await page.locator('.agentos-dockdemo-counter-pane').count()).toBe(1)
    })
});
