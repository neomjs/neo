import {expect} from '@playwright/test';

/**
 * @summary Shared film-stage placement helpers for headed capture runs (film mode only).
 *
 * One implementation of the display-staging contract, consumed by every workstation journey that
 * can be filmed: the `NEO_FILM_DISPLAY_BOUNDS="left,top,width,height"` enforced-determinism path
 * (the take-night rule — pin the take to the intended capture display), the natural-landing
 * fallback with the size pinned, and exact CDP placement for popup vessels. CDP
 * `Browser.setWindowBounds` is the instance-addressed placement verb — never AppleScript: two
 * same-bundle Chrome processes make script addressing flip-flop. CDP moves the native window
 * outside Neo's event path, so each helper republishes the browser-observed landing through the
 * product's ordinary WindowPosition authority before any journey gesture runs.
 */

/**
 * @summary Resolves the `NEO_FILM_DISPLAY_BOUNDS` contract — the ONE parse both staging paths share.
 *
 * `"left,top,width,height"` (four finite numbers) yields the enforced target; anything else is
 * warned about and ignored so the receipt names what actually ran. Returning `null` selects the
 * natural-landing path.
 * @returns {Object|null} `{left, top, width, height}` or `null` when unset/malformed.
 */
export function resolveFilmDisplayBounds() {
    const
        raw    = process.env.NEO_FILM_DISPLAY_BOUNDS,
        parsed = raw?.split(',').map(Number),
        valid  = parsed?.length === 4 && parsed.every(Number.isFinite);

    if (raw && !valid) {
        console.log(`[film-stage] NEO_FILM_DISPLAY_BOUNDS invalid, ignoring: "${raw}"`)
    }

    return valid ? {left: parsed[0], top: parsed[1], width: parsed[2], height: parsed[3]} : null
}

/**
 * @summary Reads the browser, emulation, and app-root geometry as distinct film-stage surfaces.
 * @param {Object} page Playwright page.
 * @returns {Promise<Object>} Fixed-emulation state plus browser inner/outer, DPR, and root geometry.
 */
export async function readBrowserSurface(page) {
    const
        emulatedViewport = page.viewportSize(),
        browser          = await page.evaluate(() => {
            const
                root     = document.querySelector('body > .neo-viewport'),
                rootRect = root?.getBoundingClientRect(),
                pickRect = rect => rect && ({
                    bottom: rect.bottom,
                    height: rect.height,
                    left  : rect.left,
                    right : rect.right,
                    top   : rect.top,
                    width : rect.width,
                    x     : rect.x,
                    y     : rect.y
                });

            return {
                devicePixelRatio: globalThis.devicePixelRatio,
                inner           : {
                    height: globalThis.innerHeight,
                    width : globalThis.innerWidth,
                    x     : globalThis.screenX,
                    y     : globalThis.screenY
                },
                outer: {
                    height: globalThis.outerHeight,
                    width : globalThis.outerWidth
                },
                root: pickRect(rootRect)
            }
        });

    return {...browser, emulatedViewport}
}

/**
 * Film mode only: pins the main window to a deterministic stage via CDP `Browser.setWindowBounds`.
 *
 * The stage rule, two paths with different guarantees:
 * - DEFAULT = the window's natural landing position with the size pinned. Natural landing is
 *   HOST- AND CURSOR-CONDITIONAL, not enforced: identical across runs on one host, but cascade
 *   drift has been observed and the OS can seat the window on either display.
 * - `NEO_FILM_DISPLAY_BOUNDS="left,top,width,height"` = the ENFORCED determinism path, and the
 *   take-night rule: set it explicitly to the intended capture display. After either a same- or
 *   cross-display CDP move, the adapter observes the browser's landed geometry and republishes it
 *   through WindowPosition before any journey gesture runs.
 * Every landing logs the CDP bounds, browser observation, and App-Worker manager parity; a
 * malformed override is warned about and ignored — the receipt must name what actually ran.
 * @param {Object} page Playwright page.
 * @returns {Promise<Object>} the verified native bounds plus observed Neo-window identity and geometry
 */
export async function pinToCaptureDisplay(page) {
    const session    = await page.context().newCDPSession(page),
          {windowId} = await session.send('Browser.getWindowForTarget'),
          current    = (await session.send('Browser.getWindowBounds', {windowId})).bounds,
          before     = await readBrowserSurface(page),
          explicit   = resolveFilmDisplayBounds(),
          valid      = Boolean(explicit),
          target     = explicit
              ?? {left: current.left, top: current.top, width: current.width, height: current.height},
          {bounds}   = await session.send('Browser.setWindowBounds', {
              bounds: {...target, windowState: 'normal'}, windowId
          }).then(() => session.send('Browser.getWindowBounds', {windowId}));

    expect(before.emulatedViewport,
        'film mode must disable Playwright viewport emulation before native staging').toBeNull();

    let after;

    await expect.poll(async () => {
        after = await readBrowserSurface(page);

        return {
            positioned: Math.max(
                Math.abs(after.inner.x - bounds.left),
                Math.abs(after.inner.y - bounds.top)
            ) <= 80,
            sized: Math.max(
                Math.abs(after.outer.width  - bounds.width),
                Math.abs(after.outer.height - bounds.height)
            ) <= 2
        }
    }, {
        message  : 'the browser surface must adopt the requested native-window landing',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toEqual({positioned: true, sized: true});

    expect(after.emulatedViewport,
        'film mode must remain outside Playwright viewport emulation after native staging').toBeNull();

    const
        beforeInsets = {
            height: before.outer.height - before.inner.height,
            width : before.outer.width  - before.inner.width
        },
        afterInsets = {
            height: after.outer.height - after.inner.height,
            width : after.outer.width  - after.inner.width
        };

    expect(Math.max(
        Math.abs(afterInsets.width  - beforeInsets.width),
        Math.abs(afterInsets.height - beforeInsets.height)
    ), 'browser chrome insets must stay stable across the native resize').toBeLessThanOrEqual(2);
    expect(after.root, 'the film stage must expose the app viewport root').toBeTruthy();
    expect(Math.max(Math.abs(after.root.x), Math.abs(after.root.y)),
        'the app viewport root must begin at the browser content origin').toBeLessThanOrEqual(1);
    expect(Math.max(
        Math.abs(after.root.width  - after.inner.width),
        Math.abs(after.root.height - after.inner.height)
    ), 'the app viewport root must fill the live browser content area').toBeLessThanOrEqual(1);

    await expect.poll(() => page.evaluate(() =>
        Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
    ), {
        message  : 'the app must install its ordinary window-geometry publisher',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(true);

    const neoWindowId = await page.evaluate(() => {
        globalThis.Neo.main.addon.WindowPosition.publishGeometry();

        return globalThis.Neo.worker.Manager.windowId
    });

    console.log(`[film-stage] window pinned via Browser.setWindowBounds: ${JSON.stringify(bounds)}` +
        `; browser surface adopted: ${JSON.stringify(after)}` +
        `; chrome insets stable: ${JSON.stringify({after: afterInsets, before: beforeInsets})}` +
        (valid ? ' (explicit NEO_FILM_DISPLAY_BOUNDS target)' : ' (natural landing, size pinned)'));

    return {after, before, bounds, chromeInsets: {after: afterInsets, before: beforeInsets}, neoWindowId}
}

/**
 * @summary Places one exact headed Chrome target through CDP, then republishes the browser-observed
 * landing through the product's ordinary WindowPosition authority. CDP is setup only; it never
 * stands in for a native titlebar gesture.
 * @param {import('@playwright/test').Page} page Exact main or popup page.
 * @param {Object} requested Requested outer-window `{left, top, width, height}`.
 * @returns {Promise<Object>} Browser and CDP observations plus the Neo window id.
 */
export async function placeNativeWindow(page, requested) {
    const
        session    = await page.context().newCDPSession(page),
        {windowId} = await session.send('Browser.getWindowForTarget');

    try {
        await session.send('Browser.setWindowBounds', {
            bounds: {...requested, windowState: 'normal'},
            windowId
        });

        const {bounds} = await session.send('Browser.getWindowBounds', {windowId});
        let browser;

        await expect.poll(async () => {
            browser = await readBrowserSurface(page);

            return {
                positioned: Math.max(
                    Math.abs(browser.inner.x - bounds.left),
                    Math.abs(browser.inner.y - bounds.top)
                ) <= 80,
                sized: Math.max(
                    Math.abs(browser.outer.width  - bounds.width),
                    Math.abs(browser.outer.height - bounds.height)
                ) <= 2
            }
        }, {
            message  : 'the exact headed Chrome target must adopt its native staging bounds',
            timeout  : 5000,
            intervals: [25, 50, 100]
        }).toEqual({positioned: true, sized: true});

        await expect.poll(() => page.evaluate(() =>
            Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
        ), {
            message  : 'the staged window must retain the product geometry publisher',
            timeout  : 5000,
            intervals: [25, 50, 100]
        }).toBe(true);

        const neoWindowId = await page.evaluate(() => {
            globalThis.Neo.main.addon.WindowPosition.publishGeometry();

            return globalThis.Neo.worker.Manager.windowId
        });

        return {bounds, browser, neoWindowId}
    } finally {
        await session.detach()
    }
}
