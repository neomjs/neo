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

/**
 * @summary Reads the display envelope a window sits on — the stage, never the window itself.
 *
 * Deliberately separate from {@link readBrowserSurface}, which answers where this window is and how
 * big it is. Fusing the two is what lets a caller measure a real window against an imaginary stage:
 * Playwright reports `screen.avail*` at the emulated viewport size while CDP places windows at real
 * display coordinates, so the same object would carry one honest half and one fictional half.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} `{availHeight, availLeft, availTop, availWidth}`
 */
export function readDisplayEnvelope(page) {
    return page.evaluate(() => ({
        availHeight: globalThis.screen.availHeight,
        availLeft  : globalThis.screen.availLeft,
        availTop   : globalThis.screen.availTop,
        availWidth : globalThis.screen.availWidth
    }))
}

/**
 * @summary Plans two non-overlapping windows side by side inside a measured display envelope.
 *
 * Returns a verdict instead of throwing or skipping, because the callers want opposite reactions to
 * the same refusal: a film take should fail loudly on a display that cannot hold the arrangement,
 * an ordinary journey should skip and say why. The caller spends the verdict —
 * `test.skip(!plan.fits, plan.reason)` or `expect(plan.fits, plan.reason).toBe(true)` — so neither
 * semantic is imposed on the other. A refusal always names the measured display, since "it did not
 * fit" without the number sends the next reader to measure it again by hand.
 * @param {Object} envelope From {@link readDisplayEnvelope}.
 * @param {Object} [options]
 * @param {Number} [options.gap=24] Horizontal pixels between the two windows. **Supported domain:
 *     finite and non-negative.** The floors gate the envelope, not this, so a gap wide enough to
 *     consume the main window is still inside the domain and is refused with a reason naming it,
 *     rather than returned as a negative width. A NEGATIVE gap is OUTSIDE the domain and is not
 *     rejected: it pulls the target back across the main window, so the verdict would report `fits`
 *     for two rectangles that overlap. Measured at `-1` on a 1200×700 envelope, a one-pixel overlap.
 * @param {Number} [options.minHeight=700] Envelope height below which the arrangement is refused.
 * @param {Number} [options.minWidth=1200] Envelope width below which the arrangement is refused.
 * @returns {Object} `{fits, main, reason, target}`; `main`/`target` are null when `fits` is false.
 *     Within the supported gap domain, a `fits: true` verdict guarantees both rectangles are
 *     positive, non-overlapping, and inside the envelope they were planned against.
 */
export function planSideBySide(envelope, {gap=24, minHeight=700, minWidth=1200}={}) {
    const {availHeight, availLeft, availTop, availWidth} = envelope;

    if (availWidth < minWidth || availHeight < minHeight) {
        return {
            fits  : false,
            main  : null,
            reason: `the measured display is ${availWidth}×${availHeight}, below the ` +
                `${minWidth}×${minHeight} that two real windows need to sit side by side`,
            target: null
        }
    }

    const
        targetWidth  = Math.min(460, Math.floor(availWidth * .32)),
        mainWidth    = Math.min(1000, availWidth - targetWidth - gap - 60),
        mainHeight   = Math.min(760, availHeight - 80),
        targetHeight = Math.min(420, mainHeight - 120),
        main         = {
            height: mainHeight,
            left  : availLeft + 20,
            top   : availTop + 40,
            width : mainWidth
        };

    const target = {
        height: targetHeight,
        left  : main.left + main.width + gap,
        top   : main.top + 120,
        width : targetWidth
    };

    // The floors above gate the ENVELOPE; they say nothing about the arrangement the caller asked
    // for inside it. A gap wide enough eats the main window — `1200x700` with `gap: 800` yields a
    // main width of -44 — so the computed rectangles are checked rather than assumed. A verdict
    // that says `fits` has to hand back rectangles a window can actually occupy.
    const invalid = [
        ['main width',    main.width],
        ['main height',   main.height],
        ['target width',  target.width],
        ['target height', target.height]
    ].filter(([, value]) => value <= 0);

    if (invalid.length) {
        return {
            fits  : false,
            main  : null,
            reason: `a ${gap}px gap leaves no usable arrangement on a ${availWidth}×${availHeight} ` +
                `display: ${invalid.map(([name, value]) => `${name} ${value}`).join(', ')}`,
            target: null
        }
    }

    return {fits: true, main, reason: null, target}
}

/**
 * @summary Reports whether two window rects share any area.
 *
 * Separate from the planners because "are these already apart" is the question a caller asks BEFORE
 * deciding to move anything, and the cheapest correct answer to a placement request is often to
 * leave the windows where the product put them.
 * @param {Object} first `{height, left, top, width}`.
 * @param {Object} second `{height, left, top, width}`.
 * @returns {Boolean}
 */
export function rectsOverlap(first, second) {
    return first.left < second.left + second.width
        && first.left + first.width > second.left
        && first.top  < second.top  + second.height
        && first.top  + first.height > second.top
}

/**
 * @summary Plans a target window beside an already-placed source, inside a measured envelope.
 *
 * Distinct from {@link planSideBySide}, which arranges BOTH windows from the envelope alone. Here
 * the source is already somewhere the product or the operator put it, and only the target may move.
 * Four slots are tried in order — right, left, below, above — and the first fitting entirely inside
 * the envelope wins, so a target never lands half off the display.
 *
 * Returns a verdict for the same reason the other planner does: whether an impossible stage is a
 * failure or a skip belongs to the caller. Note the source's `width` must be its OUTER width; a
 * viewport width omits the window chrome and plans the target on top of its own source.
 * @param {Object} source Already-placed source rect, `{height, left, top, width}`, outer.
 * @param {Object} target Target size, `{height, width}`.
 * @param {Object} envelope From {@link readDisplayEnvelope}.
 * @param {Object} [options]
 * @param {Number} [options.gap=40] Pixels between source and target.
 * @returns {Object} `{bounds, fits, reason}`; `bounds` is null when `fits` is false.
 */
export function planBeside(source, target, envelope, {gap=40}={}) {
    const
        {availHeight, availLeft, availTop, availWidth} = envelope,
        point                                          = [
            {left: source.left + source.width + gap, top: source.top},
            {left: source.left - target.width  - gap, top: source.top},
            {left: source.left, top: source.top + source.height + gap},
            {left: source.left, top: source.top - target.height  - gap}
        ].find(candidate => candidate.left >= availLeft
            && candidate.top >= availTop
            && candidate.left + target.width  <= availLeft + availWidth
            && candidate.top  + target.height <= availTop  + availHeight);

    if (!point) {
        return {
            bounds: null,
            fits  : false,
            reason: `no slot beside the source fits on a ${availWidth}×${availHeight} display: ` +
                `a ${source.width}×${source.height} source at ${source.left},${source.top} leaves ` +
                `nowhere for a ${target.width}×${target.height} target with a ${gap}px gap`
        }
    }

    return {
        bounds: {height: target.height, left: point.left, top: point.top, width: target.width},
        fits  : true,
        reason: null
    }
}

/**
 * @summary Puts a target window beside an already-placed source, and proves it landed apart.
 *
 * The product's own placement gets first refusal: headed browsers honour the app's request once the
 * popup connects, so this polls the observable rects first and moves NOTHING when the two windows
 * already miss each other. Only a genuinely overlapping stage reaches CDP.
 *
 * Returns a verdict rather than throwing, so an impossible display is never discovered halfway
 * through a gesture — the caller decides whether that is a failure or a skip. A `moved: false`
 * verdict means the windows were already apart and nothing was touched.
 * @param {import('@playwright/test').Page} sourcePage Already-placed source window.
 * @param {import('@playwright/test').Page} targetPage Window to move.
 * @param {Object} [options]
 * @param {Number} [options.gap=40] Pixels between source and target.
 * @param {Number} [options.settleAttempts=20] Polls of the product's own placement before CDP.
 * @returns {Promise<Object>} `{bounds, fits, moved, reason}`.
 */
export async function placeBesideSource(sourcePage, targetPage, {gap=40, settleAttempts=20}={}) {
    await targetPage.waitForURL(url => url.protocol !== 'about:', {timeout: 30000});

    const outerRect = async page => {
        const surface = await readBrowserSurface(page);

        return {
            height: surface.outer.height,
            left  : surface.inner.x,
            top   : surface.inner.y,
            width : surface.outer.width
        }
    };

    for (let attempt = 0; attempt < settleAttempts; attempt++) {
        const [source, target] = await Promise.all([outerRect(sourcePage), outerRect(targetPage)]);

        if (!rectsOverlap(source, target)) {
            return {bounds: target, fits: true, moved: false, reason: null}
        }

        await targetPage.waitForTimeout(25)
    }

    const
        [source, target] = await Promise.all([outerRect(sourcePage), outerRect(targetPage)]),
        envelope         = await readDisplayEnvelope(sourcePage),
        plan             = planBeside(source, target, envelope, {gap});

    if (!plan.fits) {
        return {...plan, moved: false}
    }

    await placeNativeWindow(targetPage, plan.bounds);

    // The landing poll inside placeNativeWindow proves the window reached its REQUESTED origin. It
    // cannot prove the arrangement, which is what the caller actually asked for, so the goal itself
    // is the last assertion rather than an inference from the request.
    await expect.poll(async () => {
        const [nowSource, nowTarget] = await Promise.all([
            outerRect(sourcePage), outerRect(targetPage)
        ]);

        return rectsOverlap(nowSource, nowTarget)
    }, {
        message  : 'the staged windows must end up physically non-overlapping',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(false);

    return {...plan, moved: true}
}
