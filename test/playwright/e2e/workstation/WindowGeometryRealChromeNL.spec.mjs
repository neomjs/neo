import {expect, test}        from '../../fixtures.mjs';
import {callWorkstationTour} from '../utils/workstationTour.mjs';

/**
 * @summary `Neo.manager.Window`'s published rects against the real window frame.
 *
 * Every emulated-viewport rig has `outerHeight === innerHeight` (no chrome), so `innerRect` and
 * `outerRect` coincide there and no witness can tell a frame origin from a viewport origin. This arm
 * runs with `viewport: null` — the real display, real window chrome — moves the main window to a known
 * frame position through CDP BEFORE the app boots, and reads the manager's rects through the Neural
 * Link: `outerRect` must be the frame CDP placed, `innerRect` the frame shifted by the chrome the
 * window itself reports. A rig without chrome (headless) cannot see this class and says so.
 */

test.use({viewport: null});

const
    FRAME_LEFT = 200,
    FRAME_TOP  = 120,
    asArray    = value => Array.isArray(value) ? value : value ? [value] : [];

test.describe('manager.Window — published rects on real window chrome', () => {
    test('a restored vessel starts at the saved frame offset before its workspace mounts', async ({page, neuralLink}, testInfo) => {
        test.setTimeout(180000);
        const mainCdp    = await page.context().newCDPSession(page),
              mainNative = (await mainCdp.send('Browser.getWindowForTarget')).windowId;
        let popup, reborn;

        try {
            await page.goto('about:blank');
            await mainCdp.send('Browser.setWindowBounds', {windowId: mainNative,
                bounds: {left: FRAME_LEFT, top: FRAME_TOP, width: 900, height: 600, windowState: 'normal'}});
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-dock-host', {timeout: 30000});
            const chrome = await page.evaluate(() => window.outerHeight - window.innerHeight);
            test.skip(chrome === 0, 'native initial-position evidence requires real window chrome');
            const app        = await neuralLink.connectToApp('Workstation'),
                  mainWindow = await page.evaluate(() => Neo.worker.Manager.windowId),
                  candidates = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id', 'windowId']))
                      .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id})),
                  workspaceId = candidates.find(record => record.windowId === mainWindow)?.id,
                  cue = value => callWorkstationTour(app, workspaceId, 'executeCue', [value]);
            expect(workspaceId).toBeTruthy();
            const paneId    = await app.callMethod(workspaceId, 'getPaneIdentity', ['metrics']),
                  documents = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
                  tabs      = Object.entries(documents['workstation-main'].nodes)
                      .find(([, node]) => node.type === 'tabs' && node.items.includes('metrics'))[0],
                  header = await app.callMethod(workspaceId, 'getTabChromeIdentity', [tabs]);
            await page.locator(`#${header.buttons.metrics}`).click();
            const popOut       = await app.callMethod(header.containerId, 'getAction', ['pop-out']),
                  popupPromise = page.waitForEvent('popup');
            await page.locator(`#${popOut.id}`).click();
            popup = await popupPromise;
            await expect(popup.locator(`#${paneId}`)).toBeVisible({timeout: 30000});
            const popupCdp    = await page.context().newCDPSession(popup),
                  popupNative = (await popupCdp.send('Browser.getWindowForTarget')).windowId;
            await popupCdp.send('Browser.setWindowBounds', {windowId: popupNative,
                bounds: {left: 420, top: 180, windowState: 'normal'}});
            await popup.evaluate(() => Neo.main.addon.WindowPosition.publishGeometry());
            const observedPopup = (await popupCdp.send('Browser.getWindowBounds', {windowId: popupNative})).bounds,
                  observedMain  = (await mainCdp.send('Browser.getWindowBounds', {windowId: mainNative})).bounds,
                  topology      = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces'),
                  vesselKey     = Object.entries(topology).find(([key, document]) => key !== 'workstation-main' && document.items?.metrics)[0],
                  expectedHint  = {dx: observedPopup.left - observedMain.left, dy: observedPopup.top - observedMain.top};
            await expect.poll(async () => (await app.callMethod(workspaceId, 'getPlacementHints'))[vesselKey])
                .toMatchObject(expectedHint);
            expect(await cue({type: 'perspective-capture', name: 'native-frame-offset', captureScope: 'topology'}))
                .toMatchObject({applied: true, stored: true, errors: []});
            await popup.close({runBeforeUnload: true});
            await expect(page.locator(`#${paneId}`)).toBeVisible({timeout: 30000});
            await mainCdp.send('Browser.setWindowBounds', {windowId: mainNative,
                bounds: {left: FRAME_LEFT + 60, top: FRAME_TOP + 20, windowState: 'normal'}});
            await page.evaluate(() => Neo.main.addon.WindowPosition.publishGeometry());
            const movedMain = (await mainCdp.send('Browser.getWindowBounds', {windowId: mainNative})).bounds,
                  managerId = asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0].id;
            await expect.poll(async () => (await app.callMethod(managerId, 'toJSON')).windows
                .find(window => window.id === mainWindow)?.outerRect)
                .toMatchObject({x: movedMain.left, y: movedMain.top});
            expect(await cue({type: 'perspective-restore', name: 'native-frame-offset'})).toMatchObject({applied: true, errors: []});

            // Sample the native birth before awaiting the cue's workspace-mount receipt.
            const firstBounds = page.waitForEvent('popup').then(async child => {
                reborn = child;
                const cdp        = await page.context().newCDPSession(child),
                      {windowId} = await cdp.send('Browser.getWindowForTarget');
                return (await cdp.send('Browser.getWindowBounds', {windowId})).bounds
            }), opening = cue({type: 'workspace-open', workspaceKey: vesselKey}),
                  born = await firstBounds, expected = {left: movedMain.left + expectedHint.dx, top: movedMain.top + expectedHint.dy};
            await testInfo.attach('native-restored-window-birth', {body: JSON.stringify({
                chrome, observedMain, observedPopup, expectedHint, movedMain, expected, born
            }, null, 2), contentType: 'application/json'});
            expect(Math.abs(born.left - expected.left), 'birth uses current main frame plus saved horizontal offset').toBeLessThanOrEqual(2);
            expect(Math.abs(born.top - expected.top), 'birth uses frame origin, without adding native chrome').toBeLessThanOrEqual(2);
            expect(await opening).toEqual({applied: true, errors: [], workspaceKey: vesselKey});
            await expect(reborn.locator(`#${paneId}`)).toBeVisible({timeout: 30000});
            const owners = await app.callMethod(workspaceId, 'getDockTopologyWorkspaces');
            expect(Object.entries(owners).filter(([, document]) => document.items?.metrics).map(([key]) => key)).toEqual([vesselKey]);
            expect(await page.locator(`#${paneId}`).count()).toBe(0)
        } finally {
            for (const child of [popup, reborn]) if (child && !child.isClosed()) await child.close({runBeforeUnload: true})
        }
    });

    test('outerRect is the frame CDP placed; innerRect is that frame shifted by the reported chrome', async ({page, neuralLink}) => {
        test.setTimeout(90000);

        const
            cdp        = await page.context().newCDPSession(page),
            {windowId} = await cdp.send('Browser.getWindowForTarget');

        // Place the frame before boot: the manager takes the main window's geometry at connect time.
        await page.goto('about:blank');
        await cdp.send('Browser.setWindowBounds', {windowId, bounds: {left: FRAME_LEFT, top: FRAME_TOP, width: 1100, height: 760, windowState: 'normal'}});

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});

        const
            bounds = (await cdp.send('Browser.getWindowBounds', {windowId})).bounds,
            report = await page.evaluate(() => ({
                chromeSide: (window.outerWidth - window.innerWidth) / 2,
                chromeTop : window.outerHeight - window.innerHeight,
                screenLeft: window.screenLeft,
                screenTop : window.screenTop
            }));

        // The rig itself: the frame is where CDP put it, and `screenTop` reports that frame.
        expect(bounds.top,  'CDP placed the frame').toBe(FRAME_TOP);
        expect(report.screenTop, 'screenTop reports the frame origin').toBe(FRAME_TOP);

        test.skip(report.chromeTop === 0, 'this rig renders no window chrome, so frame and viewport coincide — the class is invisible here');

        const
            app       = await neuralLink.connectToApp('Workstation'),
            managerId = asArray(await app.findInstances({className: 'Neo.manager.Window'}, ['id']))[0]?.id;

        expect(managerId, 'manager.Window is live').toBeTruthy();

        const
            state = await app.callMethod(managerId, 'toJSON'),
            main  = state.windows.find(win => win.appName === 'Workstation') ?? state.windows[0];

        expect(main, 'the main window is registered').toBeTruthy();

        // The manager's frame is CDP's frame; its viewport is the frame plus the chrome the window reports.
        expect(main.outerRect.y).toBe(bounds.top);
        expect(main.outerRect.x).toBe(bounds.left);
        expect(main.innerRect.y).toBe(bounds.top  + report.chromeTop  - report.chromeSide);
        expect(main.innerRect.x).toBe(bounds.left + report.chromeSide);
        expect(main.chrome.top).toBe(report.chromeTop - report.chromeSide)
    });
});
