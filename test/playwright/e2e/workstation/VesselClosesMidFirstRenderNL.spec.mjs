import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a vessel window that closes while its viewport's first render is in flight
 * leaves no worker error on the page.
 *
 * The morph scene of `WorkstationFiveBeatNL` retires its vessel mid-drag, about 100 ms after the vessel connects,
 * and its console guard caught `App Worker: initVnode error` on unrelated pull requests whenever that departure
 * landed inside the vessel viewport's first render. This arm makes the order certain: an init script, scoped to
 * the vessel by its opener, drops the VDom worker's reply that carries the vessel's first render, so the render
 * is still in flight when the vessel closes through its own `beforeunload`. The App worker then retires the
 * vessel's port, records the departure and rejects the pending render (`worker.Base#removePort`), which
 * `VdomLifecycle#initVnode` must settle without reporting it as an error.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_NL_PORT=<free port> \
 *      npx playwright test workstation/VesselClosesMidFirstRenderNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    ITEM    = 'commits', // a leaf pane of the Workstation's boot document
    asArray = value => Array.isArray(value) ? value : (value?.instances ?? value?.items ?? []);

test.describe('Workstation vessel — closing during its first render (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 900}});

    test('a vessel that closes before its viewport renders leaves no worker error on the page', async ({page, neuralLink, workerErrors}) => {
        const held = [];

        await page.context().exposeFunction('__neoVesselFirstRenderHeld', id => {held.push(id)});
        await page.context().addInitScript(() => {
            // Only a vessel has an opener; the Workstation window itself renders as usual
            if (!window.opener) return;

            const {get, set} = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
            let   holding    = true;

            Object.defineProperty(MessagePort.prototype, 'onmessage', {
                configurable: true,
                get() {
                    return get.call(this)
                },
                set(handler) {
                    set.call(this, handler && function(event) {
                        // The reply carrying the vessel's first render never reaches the main thread
                        if (holding && event.data?.action === 'reply' && event.data.data?.autoMount) {
                            holding = false;
                            globalThis.__neoVesselFirstRenderHeld(event.data.data.vnode?.id ?? null);
                            return
                        }

                        return handler.call(this, event)
                    })
                }
            })
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',              {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const
            app         = await neuralLink.connectToApp('Workstation'),
            workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
            dockModel   = (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
            nodeId      = Object.entries(dockModel.nodes || {}).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))?.[0];

        expect(workspaceId, 'the Workstation workspace is live').toBeTruthy();
        expect(nodeId, `${ITEM} sits in a tabs node`).toBeTruthy();

        // The user's path to a vessel: activate the tab, then its pop-out action (as `workstationPopOut#popOut`)
        let chrome, action;

        await expect.poll(async () => {
            chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);
            return chrome?.buttons?.[ITEM] ?? null
        }, {message: `${nodeId} projects ${ITEM} into live tab chrome`, timeout: 10000}).toBeTruthy();

        await page.locator(`#${chrome.buttons[ITEM]}`).click();

        await expect.poll(async () => {
            chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);
            action = chrome?.containerId && await app.callMethod(chrome.containerId, 'getAction', ['pop-out']);
            return Boolean(action?.id && await page.locator(`#${action.id}`).isVisible())
        }, {message: `pop-out is user-reachable for ${ITEM}`, timeout: 10000}).toBe(true);

        const popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await page.locator(`#${action.id}`).click();

        const popup = await popupPromise;

        await expect.poll(() => held.length, {message: 'the vessel\'s first render is held in flight', timeout: 30000}).toBe(1);

        const vesselId  = await popup.evaluate(() => Neo.worker.Manager.windowId),
              viewports = async () => asArray(await app.findInstances({ntype: 'viewport', windowId: vesselId}, ['id'])),
              viewport  = async () => (await viewports()).length;

        expect((await viewports()).map(({id}) => id), 'the held render is the vessel viewport\'s first').toEqual(held);

        await popup.close({runBeforeUnload: true});

        // Reaped in the task after the departure settled, so the rejected render was already reported or not
        await expect.poll(viewport, {message: 'the App worker reaps the departed vessel', timeout: 15000}).toBe(0);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));

        expect(workerErrors.lines, 'the departed vessel\'s first render reaches the page as no worker error').toEqual([])
    })
});
