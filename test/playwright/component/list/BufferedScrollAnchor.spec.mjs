import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/list/BufferedScrollAnchor.spec.mjs
 * @summary A buffered list must stay where the user stopped scrolling, including after a mounted-range
 * rebuild.
 *
 * ## The defect this pins
 *
 * Crossing a mounted-range boundary makes `createItems()` rebuild the bounded pool with a new top-spacer
 * height (`topHeight = range[0] * itemHeight`). The browser's **scroll anchoring** treats that resize as
 * content shifting under the viewport and compensates by moving `scrollTop` to keep the visible rows
 * still. The compensated position crosses the *next* boundary, which rebuilds again — a self-sustaining
 * scroll that runs away from the user at roughly 3,600px/s.
 *
 * Measured before the fix: six 30px wheel deltas (180px total, one delta past the 160px boundary) left
 * the seat at **3,780px after 1.5s and still climbing**, with `mountedRange` advancing in lockstep. Four
 * and five deltas — 120px and 150px, both below the boundary — drifted **zero**. The trigger is the
 * boundary crossing, not the gesture size or rate.
 *
 * ## Why the assertions are delayed, and why that is the whole point
 *
 * At the instant the gesture ends the position is **correct**: 180 is 180. The runaway needs ~100ms to
 * become visible. Coverage that samples one animation frame after the last wheel therefore passes
 * honestly while measuring the wrong moment — which is exactly how this defect survived a suite that
 * asserted exact scroll sums and went 20/20 across four repeats.
 *
 * **A settle window is load-bearing here, not test hygiene.** Removing it does not make these arms
 * flaky; it makes them blind.
 *
 * ## Geometry
 *
 * The harness pins `itemHeight: 40`, `height: 400`, `bufferRowRange: 3` (shipped default) → 10 visible
 * rows, a 16-row pool, and the first boundary at an exact pixel:
 *
 *     firstVisible = floor(scrollTop / 40) · visibleEnd = firstVisible + 10
 *     range [0,16] survives while visibleEnd <= 16 - 3  ⇒  scrollTop <= 159
 */

const
    LIST_ID     = 'buffered-list-under-test',
    // Long enough that a runaway is unmissable (it advances ~3,600px/s) and short enough to stay cheap.
    SETTLE_MS   = 600,
    WHEEL_DELTA = 30;

/**
 * @param {Object} page
 * @returns {Promise<Number>}
 */
const domScrollTop = page => page.evaluate(id => document.getElementById(id)?.scrollTop ?? -1, LIST_ID);

/**
 * Drives `count` wheel deltas, then lets the page settle long enough for a runaway to express itself.
 * @param {Object} page
 * @param {Number} count
 * @returns {Promise<{settled: Number, immediate: Number}>}
 */
async function wheelThenSettle(page, count) {
    for (let i = 0; i < count; i++) {
        await page.mouse.wheel(0, WHEEL_DELTA);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))))
    }

    const immediate = await domScrollTop(page);

    await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), SETTLE_MS);

    return {immediate, settled: await domScrollTop(page)}
}

test.describe('Neo.list.Buffered — the scroll seat survives a mounted-range rebuild', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/buffered-list/index.html');
        await page.waitForSelector(`#${LIST_ID}`, {state: 'attached'});
        await page.locator(`#${LIST_ID}`).hover();
        await expect.poll(() => domScrollTop(page)).toBe(0)
    });

    test('a gesture that CROSSES the boundary stays put after settling', async ({page}) => {
        // 6 x 30 = 180px: one delta past the 160px boundary, so the pool rebuilds.
        const {immediate, settled} = await wheelThenSettle(page, 6);

        // The immediate reading is correct even when the defect is present — asserted here so a failure
        // report distinguishes "never scrolled correctly" from "scrolled correctly, then ran away".
        expect(immediate, 'the gesture itself must land on its exact sum').toBe(180);

        expect(settled, `the seat must not move after the input stops (settled ${SETTLE_MS}ms)`).toBe(180)
    });

    test('CONTROL: a gesture that stays BELOW the boundary was never affected', async ({page}) => {
        // 4 x 30 = 120px, short of 160px, so no rebuild occurs. This arm passed both before and after
        // the fix; it is here to prove the regression above is specific to the boundary crossing rather
        // than to scrolling in general — without it, a fix that simply froze scrolling would look green.
        const {immediate, settled} = await wheelThenSettle(page, 4);

        expect(immediate, 'a below-boundary gesture lands on its sum').toBe(120);
        expect(settled, 'and stays there — this arm never reproduced the defect').toBe(120)
    })
});
