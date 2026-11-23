import {expect} from '../../fixtures.mjs';

/**
 * @summary What a user sees during a tear-out, asserted as rects at four moments: the proxy at gesture
 * start, the popup's size, the content inside the popup, and the panes left behind.
 *
 * Rects, not pixels: the colors app draws random data, so a pixel snapshot breaks on every run while
 * a rect only moves when the layout does.
 * @module test/playwright/e2e/utils/tearOutGeometry
 */

/**
 * @summary Lists every edge of `expected` that `actual` misses by more than `tolerance`.
 * @param {Object|null} actual A measured `{x, y, width, height}`.
 * @param {Object} expected Any subset of `{x, y, width, height}`.
 * @param {Number} [tolerance=1] Allowed difference in CSS pixels.
 * @returns {String[]} One line per missed edge; empty when the rects agree.
 */
export function rectMismatch(actual, expected, tolerance=1) {
    if (!actual) return ['nothing was measured'];

    return Object.keys(expected)
        .filter(key => !(Math.abs(actual[key] - expected[key]) <= tolerance))
        .map(key => `${key}: expected ${Math.round(expected[key] * 10) / 10} ±${tolerance} px, measured ${Math.round(actual[key] * 10) / 10}`)
}

/**
 * @summary Asserts that every edge the expectation names lies within `tolerance` of the measurement.
 * @param {Object|null} actual
 * @param {Object} expected
 * @param {String} message What the user would see if this failed.
 * @param {Number} [tolerance=1]
 */
export function expectRect(actual, expected, message, tolerance=1) {
    expect(rectMismatch(actual, expected, tolerance), message).toEqual([])
}

/**
 * @summary Moment 1: at gesture start the proxy is its source, moved by the pointer's travel.
 * @param {Object} arming
 * @param {Object} arming.pointerDelta The pointer's travel since the press, `{x, y}`.
 * @param {Object} arming.proxyRect The proxy, measured after that travel.
 * @param {Object} arming.sourceRect The dragged element, measured before the press.
 * @param {Boolean} [arming.windowDragging=false] Whether the gesture had already left its window.
 */
export function expectProxyOverSource({pointerDelta, proxyRect, sourceRect, windowDragging=false}) {
    expect(windowDragging, 'at gesture start the drag is still inside its window, not a torn-out window').toBe(false);
    expectRect(proxyRect, {
        height: sourceRect.height,
        width : sourceRect.width,
        x     : sourceRect.x + pointerDelta.x,
        y     : sourceRect.y + pointerDelta.y
    }, 'at gesture start the proxy is its source, moved with the pointer')
}

/**
 * @summary Moment 2: a torn-out window opens at its pane's size.
 * @param {Object|null} frame The window's measured `{width, height}`.
 * @param {Object} paneRect The pane, measured when the drag armed.
 * @param {String} label Which window, for the failure message.
 */
export function expectFrameAtPaneSize(frame, paneRect, label) {
    expectRect(frame, {height: paneRect.height, width: paneRect.width}, `${label} opens at its pane's size`)
}

/**
 * @summary Reads a window's frame and content sizes.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{innerHeight: Number, innerWidth: Number, outerHeight: Number, outerWidth: Number}>}
 */
export function readWindowSize(page) {
    return page.evaluate(() => ({innerHeight, innerWidth, outerHeight, outerWidth}))
}

/**
 * @summary Moment 3: the content fills its window, or the box it lives in, up to an even gutter of at
 * most `maxGutter`, and no visible chart text leaves its svg.
 * @param {import('@playwright/test').Page} page
 * @param {String} selector The content's root element.
 * @param {String} label Which window, for the failure message.
 * @param {Object} [options={}]
 * @param {Number} [options.maxGutter=16] The widest frame a window or box may keep around its content.
 * @param {String|null} [options.within=null] The box the content fills; the window when null.
 */
export async function expectContentFillsWindow(page, selector, label, {maxGutter=16, within=null}={}) {
    const fit = await page.evaluate(([contentSelector, boxSelector]) => {
        const rectOf = element => {
                  const {height, width, x, y} = element.getBoundingClientRect();
                  return {height, width, x, y}
              },
              content = document.querySelector(contentSelector),
              box     = boxSelector ? document.querySelector(boxSelector) : null;

        return {
            box    : box ? rectOf(box) : {height: innerHeight, width: innerWidth, x: 0, y: 0},
            content: content && rectOf(content)
        }
    }, [selector, within]);

    const gutter = Math.min(Math.max((fit.content?.x ?? fit.box.x) - fit.box.x, 0), maxGutter);

    expectRect(fit.content, {
        height: fit.box.height - 2 * gutter,
        width : fit.box.width  - 2 * gutter,
        x     : fit.box.x + gutter,
        y     : fit.box.y + gutter
    }, `${label}: the content fills ${within ? 'its box' : 'its window'}`);

    await expectChartTextInside(page, label)
}

/**
 * @summary No visible text of any chart in the window leaves its svg, where the svg would clip it.
 * @param {import('@playwright/test').Page} page
 * @param {String} label Which window, for the failure message.
 */
export async function expectChartTextInside(page, label) {
    const overflow = await page.evaluate(() => {
        const visible = {opacityProperty: true, visibilityProperty: true},
              found   = [];

        for (const svg of document.querySelectorAll('svg')) {
            const box = svg.getBoundingClientRect();

            if (!box.width || !box.height || !svg.checkVisibility(visible)) continue;

            for (const text of svg.querySelectorAll('text')) {
                const words = text.textContent.trim(),
                      t     = text.getBoundingClientRect();

                if (!words || !t.width || !text.checkVisibility(visible)) continue;

                if (t.left < box.left - 1 || t.top < box.top - 1 || t.right > box.right + 1 || t.bottom > box.bottom + 1) {
                    found.push(`"${words.slice(0, 40)}" at ${Math.round(t.left)},${Math.round(t.top)} ${Math.round(t.width)}×${Math.round(t.height)}, its svg at ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}×${Math.round(box.height)}`)
                }
            }
        }

        return found
    });

    expect(overflow, `${label}: no chart text leaves its svg`).toEqual([])
}

/**
 * @summary Reads the bounding box of every visible element a selector matches, and whether a finite
 * animation or transition is still running in the window.
 * @param {import('@playwright/test').Page} page
 * @param {String} selector
 * @returns {Promise<{count: Number, moving: Boolean, union: Object|null}>}
 */
export function readUnion(page, selector) {
    return page.evaluate(paneSelector => {
        const moving = document.getAnimations()
                  .some(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)),
              rects  = [...document.querySelectorAll(paneSelector)]
                  .filter(element => element.checkVisibility())
                  .map(element => element.getBoundingClientRect())
                  .filter(rect => rect.width && rect.height);

        if (!rects.length) return {count: 0, moving, union: null};

        const left   = Math.min(...rects.map(rect => rect.left)),
              top    = Math.min(...rects.map(rect => rect.top)),
              right  = Math.max(...rects.map(rect => rect.right)),
              bottom = Math.max(...rects.map(rect => rect.bottom));

        return {count: rects.length, moving, union: {height: bottom - top, width: right - left, x: left, y: top}}
    }, selector)
}

/**
 * @summary Moment 4: after a pane leaves or returns, the panes in the window cover the area the
 * panes covered before. Compares the settled layout: no finite animation runs and two reads 250 ms
 * apart agree, so neither a reflow's tail nor a frame from before the reflow decides the verdict.
 * @param {import('@playwright/test').Page} page
 * @param {String} selector The window's panes.
 * @param {Object} before {@link readUnion}'s result before the gesture.
 * @param {String} label Which terminal, for the failure message.
 */
export async function expectPanesRefill(page, selector, before, label) {
    let previous = null,
        settled  = null;

    await expect.poll(async () => {
        const current = await readUnion(page, selector),
              stable  = !current.moving && previous !== null && !previous.moving && rectMismatch(current.union, previous.union ?? {}).length === 0;

        previous = current;
        stable && (settled = current.union);

        return stable
    }, {intervals: [250], message: `${label}: the window's layout settles`, timeout: 5000}).toBe(true);

    expectRect(settled, before.union, `${label}: the panes refill the area the panes covered before`)
}
