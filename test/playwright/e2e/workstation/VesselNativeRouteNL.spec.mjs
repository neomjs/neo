import {expect, test}        from '../../fixtures.mjs';
import {readNativeLifecycle} from '../utils/dockNativeLifecycle.mjs';

/**
 * @summary A torn-out vessel carries the native control route the engine parks, moves and closes it by.
 *
 * `NativeVesselTransaction.parkVessel` refuses the whole park on `!admissions.targetFocus.granted`, and
 * `resolveAdmissions` grants that from the TARGET window's `nativeRoute`. So this record is the
 * precondition for every native vessel operation, and until this arm nothing observed it.
 *
 * ## Why main's `null` is asserted too, and is not padding
 *
 * A route is minted by an OPENER — `Main.windowOpen` plants a token in the popup's `sessionStorage`
 * (`Main.mjs:1288-1311`), and the popup consumes it once through `opener.Neo.Main`
 * (`Main.mjs:22-62`), caching the result at module scope for its lifetime. The main window has no
 * opener, so it can mint nothing for itself: **`nativeRoute: null` on main is correct behaviour.**
 *
 * That asymmetry reads exactly like a broken pop-out, and has: three separate probes generalised a
 * main-window `null` into "pop-outs have no route" and recorded it as a blocking unknown, while the
 * popup's own record held a full set of capabilities the whole time. The two reads together are what
 * make either one mean something, which is why they are one arm.
 *
 * ## Rig
 *
 * `viewport: null` and headed, for the reason `WorkstationNativePopupOverPopupNL` records: Playwright
 * emulates `window.screen` at the viewport size, so an emulated run reports chrome `0` and places real
 * windows off a screen the page believes is smaller. In the CI e2e tier this arm would be vacuous
 * rather than failing, so it is a headed maintainer instrument by construction.
 */
test.use({viewport: null});

const
    VESSEL_ITEM = 'commits',
    asArray     = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @summary Pops one pane out through the real header action — never `Main.windowOpen` directly, which
 * would assert that minting works while skipping the path that has to reach it.
 * @param {Object} data
 * @param {Object} data.app
 * @param {Object} data.page
 * @param {String} data.workspaceId
 * @param {String} data.itemId
 * @returns {Promise<{popup: Object, windowId: String}>}
 */
async function popOut({app, page, workspaceId, itemId}) {
    const
        {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
        nodeId      = Object.entries(dockModel.nodes)
            .find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0];

    expect(nodeId, `${itemId} sits in a tabs node`).toBeTruthy();

    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

        return chrome?.buttons?.[itemId] ?? null
    }, {message: `${nodeId} projects ${itemId} into live tab chrome`, timeout: 10000, intervals: [25, 50, 100]}).toBeTruthy();

    await page.locator(`#${chrome.buttons[itemId]}`).click();

    let action;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);
        action = chrome?.containerId && await app.callMethod(chrome.containerId, 'getAction', ['pop-out']);

        return Boolean(action?.id && await page.locator(`#${action.id}`).isVisible())
    }, {message: `pop-out is user-reachable for ${itemId}`, timeout: 10000}).toBe(true);

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await page.locator(`#${action.id}`).click();

    const popup = await popupPromise;

    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

    let windowId;

    await expect.poll(async () => {
        const lifecycle = await readNativeLifecycle(app, workspaceId);

        windowId = lifecycle.owners[itemId]?.windowId ?? null;

        return windowId
    }, {message: `${itemId} reaches vessel adoption`, timeout: 30000, intervals: [50, 100, 250]}).toBeTruthy();

    return {popup, windowId}
}

test.describe('Workstation — a torn-out vessel carries a native control route (#18824)', () => {
    test('the vessel has every capability and the main window has none', async ({page, neuralLink}) => {
        const popups = [];

        try {
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-workspace', {timeout: 30000});

            const stage = await page.evaluate(() => ({
                availHeight: globalThis.screen.availHeight,
                availWidth : globalThis.screen.availWidth
            }));

            test.skip(
                stage.availWidth < 760 || stage.availHeight < 560,
                `${stage.availWidth}x${stage.availHeight} display cannot hold a main window plus a vessel`
            );

            const
                app         = await neuralLink.connectToApp('Workstation'),
                workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
                managerId   = asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0]?.id;

            expect(workspaceId, 'one live Workspace').toBeTruthy();
            expect(managerId,   'manager.Window is live').toBeTruthy();

            const
                mainWindowId      = (await app.getComponent(workspaceId, ['windowId'])).windowId,
                {popup, windowId} = await popOut({app, page, workspaceId, itemId: VESSEL_ITEM});

            popups.push(popup);

            // The app worker's manager is the surface `resolveAdmissions` consults, so it is the one
            // asserted — not the popup's own resolver, which is a step earlier in the same chain.
            const vesselEntry = await app.callMethod(managerId, 'get', [windowId]);

            expect(vesselEntry?.nativeRoute, `${VESSEL_ITEM}'s vessel carries a route`).toBeTruthy();
            expect(vesselEntry.nativeRoute.capabilities, 'and the engine may move, resize, focus and close it')
                .toEqual({close: true, focus: true, position: true, resize: true});
            expect(vesselEntry.nativeRoute.targetWindowId, 'the route names the vessel it controls').toBe(windowId);

            // The control, and the reason the assertion above is not "some window has a route": main
            // has no opener, so a correct engine mints nothing for it. A run where BOTH are populated
            // is as wrong as one where both are null.
            const mainEntry = await app.callMethod(managerId, 'get', [mainWindowId]);

            expect(mainEntry, 'the main window is registered').toBeTruthy();
            expect(mainEntry.nativeRoute, 'and carries no route, because nothing opened it').toBeNull()
        } finally {
            for (const popup of popups) {
                await popup.close().catch(() => {})
            }
        }
    })
});
