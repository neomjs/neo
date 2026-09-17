import {expect, test} from '../../fixtures.mjs';
import {popOut}       from '../utils/workstationPopOut.mjs';

/**
 * @summary A torn-out vessel carries the native control route the engine parks, moves and closes it by.
 *
 * `NativeVesselTransaction.parkVessel` refuses the whole park on `!admissions.targetFocus.granted`, and
 * `resolveAdmissions` grants that from the TARGET window's `nativeRoute`. So this record is the
 * precondition for every native vessel operation, and until this arm nothing observed it.
 *
 * ## Why main's `null` is asserted too, and is not padding
 *
 * A route is minted by an OPENER — `Main#windowOpen` plants a token in the popup's `sessionStorage`,
 * and the popup consumes it exactly once through `opener.Neo.Main`'s `consumeNativeWindowRoute`,
 * caching the result at module scope for its lifetime. The main window has no opener, so it can mint
 * nothing for itself: **`nativeRoute: null` on main is correct behaviour.**
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
