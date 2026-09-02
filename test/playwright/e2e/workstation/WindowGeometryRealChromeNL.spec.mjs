import {expect, test} from '../../fixtures.mjs';

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
