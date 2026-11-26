import {expect, test} from '../../fixtures.mjs';

test.use({hasTouch: true, viewport: {width: 1280, height: 800}});

const EXAMPLE_URL = '/examples/grid/orderReviewDesk/index.html',
      GRID_ROW    = '.neo-grid-container .neo-grid-body:not(.neo-locked-start):not(.neo-locked-end) .neo-grid-row',
      OUTSIDE_HDR = '.order-desk-header';

/**
 * @summary Boots the Order Review Desk example with touch input enabled, installs an outside-touch
 * `defaultPrevented` observer on `.order-desk-header`, and connects Neural Link to the live App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>}
 */
async function bootOrderReviewDeskTouch(page, neuralLink) {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator(GRID_ROW).first()).toBeVisible({timeout: 30000});

    const app = await neuralLink.connectToApp('Neo.examples.grid.orderReviewDesk');

    await page.evaluate(headerSelector => {
        window.__outsideTouchLog = [];
        const header = document.querySelector(headerSelector);

        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            header.addEventListener(type, event => {
                window.__outsideTouchLog.push({
                    defaultPrevented: event.defaultPrevented,
                    touches         : event.touches.length,
                    type
                })
            })
        }
    }, OUTSIDE_HDR);

    const gridBox   = await page.locator('.neo-grid-view').boundingBox(),
          headerBox = await page.locator(OUTSIDE_HDR).boundingBox(),
          gx        = Math.round(gridBox.x + gridBox.width * 0.5),
          gy        = Math.round(gridBox.y + gridBox.height * 0.55),
          hx        = Math.round(headerBox.x + headerBox.width * 0.35),
          hy        = Math.round(headerBox.y + headerBox.height * 0.5);

    return {app, gx, gy, hx, hy, pageErrors}
}

/**
 * @summary Reads the live DOM `.neo-grid-view` `scrollTop`, `GridDragScroll` tracking state, and
 * captured outside-header touch records.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{activeDrag: Boolean, monitorDrag: Boolean, outsideLog: Object[], scrollTop: Number}>}
 */
async function readTouchProbeState(page) {
    return page.evaluate(() => {
        const view  = document.querySelector('.neo-grid-view'),
              addon = Neo.main?.addon?.GridDragScroll;

        return {
            activeDrag : Boolean(addon?.activeDrag),
            monitorDrag: Boolean(addon?.monitorDrag),
            outsideLog : [...(window.__outsideTouchLog || [])],
            scrollTop  : view ? view.scrollTop : 0
        }
    })
}

/**
 * @summary Clears the outside-header touch log between phases.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function clearOutsideTouchLog(page) {
    await page.evaluate(() => {
        window.__outsideTouchLog = []
    })
}

const pt = (id, x, y, force = 1) => ({id, x, y, radiusX: 5, radiusY: 5, force});

test.describe('GridDragScroll touch cancellation and multi-contact interruption (Neural Link)', () => {
    test('touchcancel during monitoring or active drag releases listeners without momentum and leaves outside touches unconsumed', async ({page, neuralLink}) => {
        const {gx, gy, hx, hy, pageErrors} = await bootOrderReviewDeskTouch(page, neuralLink),
              cdp                          = await page.context().newCDPSession(page),
              send                         = (type, touchPoints = []) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});

        try {
            // Phase 1: Cancel during the monitoring interval, then touch and move outside the grid
            await send('touchStart', [pt(13, gx, gy)]);
            await expect.poll(async () => (await readTouchProbeState(page)).monitorDrag).toBe(true);

            await send('touchCancel');
            await expect.poll(async () => (await readTouchProbeState(page)).monitorDrag).toBe(false);

            await page.waitForTimeout(130);
            await clearOutsideTouchLog(page);

            await send('touchStart', [pt(31, hx, hy)]);
            await send('touchMove',  [pt(31, hx, hy - 30)]);
            await send('touchMove',  [pt(31, hx, hy - 70)]);
            await send('touchEnd',   [pt(31, hx, hy - 70, 0)]);

            const afterMonitorCancel = await readTouchProbeState(page);
            expect(afterMonitorCancel.scrollTop).toBe(0);
            expect(afterMonitorCancel.activeDrag).toBe(false);
            expect(afterMonitorCancel.monitorDrag).toBe(false);

            const outsideMoves1 = afterMonitorCancel.outsideLog.filter(entry => entry.type === 'touchmove');
            expect(outsideMoves1.length).toBeGreaterThanOrEqual(2);
            expect(outsideMoves1.every(entry => entry.defaultPrevented === false)).toBe(true);

            // Phase 2: Engage an active touch drag, cancel mid-drag, then touch and move outside the grid
            await send('touchStart', [pt(14, gx, gy)]);
            await page.waitForTimeout(130);
            await send('touchMove',  [pt(14, gx, gy - 35)]);
            await page.waitForTimeout(20);
            await send('touchMove',  [pt(14, gx, gy - 95)]);

            await expect.poll(async () => (await readTouchProbeState(page)).scrollTop).toBeGreaterThan(40);
            const settledBeforeCancel = (await readTouchProbeState(page)).scrollTop;

            await send('touchCancel');
            await page.waitForTimeout(80);

            const afterActiveCancel = await readTouchProbeState(page);
            expect(afterActiveCancel.activeDrag, 'active drag state cleared without momentum').toBe(false);
            expect(afterActiveCancel.scrollTop, 'no momentum tail advances scrollTop after touchCancel').toBe(settledBeforeCancel);

            await clearOutsideTouchLog(page);
            await send('touchStart', [pt(32, hx, hy)]);
            await send('touchMove',  [pt(32, hx, hy + 45)]);
            await send('touchMove',  [pt(32, hx, hy + 95)]);
            await send('touchEnd',   [pt(32, hx, hy + 95, 0)]);

            const afterOutsideTouch = await readTouchProbeState(page);
            expect(afterOutsideTouch.scrollTop, 'outside touch never scrolls the abandoned grid').toBe(settledBeforeCancel);

            const outsideMoves2 = afterOutsideTouch.outsideLog.filter(entry => entry.type === 'touchmove');
            expect(outsideMoves2.length).toBeGreaterThanOrEqual(2);
            expect(outsideMoves2.every(entry => entry.defaultPrevented === false)).toBe(true);
            expect(pageErrors).toEqual([])
        } finally {
            await send('touchCancel').catch(() => {});
            await cdp.detach()
        }
    });

    test('staggered second contact and partial lift neither fling nor throw, and a fresh single-finger drag still works', async ({page, neuralLink}) => {
        const {app, gx, gy, hx, hy, pageErrors} = await bootOrderReviewDeskTouch(page, neuralLink),
              cdp                               = await page.context().newCDPSession(page),
              send                              = (type, touchPoints = []) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});

        try {
            // 1. Engage contact 13 on the grid
            await send('touchStart', [pt(13, gx, gy)]);
            await page.waitForTimeout(130);
            await send('touchMove',  [pt(13, gx, gy - 30)]);
            await page.waitForTimeout(20);
            await send('touchMove',  [pt(13, gx, gy - 80)]);

            await expect.poll(async () => (await readTouchProbeState(page)).scrollTop).toBeGreaterThan(30);
            const scrollAtSecondContact = (await readTouchProbeState(page)).scrollTop;

            // 2. Add contact 27 while 13 is dragging, wait past arming delay, move both, then lift only 13
            await send('touchStart', [pt(13, gx, gy - 80), pt(27, gx + 90, gy)]);
            await page.waitForTimeout(130);
            await send('touchMove',  [pt(13, gx, gy - 120), pt(27, gx + 90, gy - 40)]);
            await page.waitForTimeout(16);
            await send('touchMove',  [pt(13, gx, gy - 160), pt(27, gx + 90, gy - 80)]);

            const scrollBeforePartialLift = (await readTouchProbeState(page)).scrollTop;
            expect(scrollBeforePartialLift).toBeGreaterThan(scrollAtSecondContact);

            // Lift only contact 13 while 27 stays pressed
            await send('touchEnd', [pt(13, gx, gy - 160, 0)]);
            await page.waitForTimeout(60);

            const afterPartialLift = await readTouchProbeState(page);
            expect(afterPartialLift.activeDrag, 'no inertia runs while contact 27 remains down').toBe(false);
            expect(afterPartialLift.monitorDrag).toBe(false);
            expect(afterPartialLift.scrollTop).toBe(scrollBeforePartialLift);

            // Continue moving and releasing contact 27 — GridDragScroll has released its listeners, so no error or addon fling occurs
            await send('touchMove', [pt(27, gx + 90, gy - 130)]);
            await send('touchEnd',  [pt(27, gx + 90, gy - 130, 0)]);
            await page.waitForTimeout(60);

            const after27Release = await readTouchProbeState(page);
            expect(after27Release.activeDrag).toBe(false);
            expect(after27Release.monitorDrag).toBe(false);

            // Verify an outside contact is unconsumed and does not move the grid
            await clearOutsideTouchLog(page);
            await send('touchStart', [pt(33, hx, hy)]);
            await send('touchMove',  [pt(33, hx, hy + 50)]);
            await send('touchMove',  [pt(33, hx, hy + 100)]);
            await send('touchEnd',   [pt(33, hx, hy + 100, 0)]);

            const afterOutside = await readTouchProbeState(page);
            expect(afterOutside.scrollTop).toBe(after27Release.scrollTop);
            const outsideMoves = afterOutside.outsideLog.filter(entry => entry.type === 'touchmove');
            expect(outsideMoves.length).toBeGreaterThanOrEqual(2);
            expect(outsideMoves.every(entry => entry.defaultPrevented === false)).toBe(true);

            // 3. Reverse partial-lift ordering: 21 drags -> 28 joins -> 28 lifts first -> 21 moves and releases
            await send('touchStart', [pt(21, gx, gy)]);
            await page.waitForTimeout(130);
            await send('touchMove',  [pt(21, gx, gy - 35)]);
            await page.waitForTimeout(16);
            await send('touchMove',  [pt(21, gx, gy - 75)]);
            await expect.poll(async () => (await readTouchProbeState(page)).scrollTop).toBeGreaterThan(after27Release.scrollTop);

            await send('touchStart', [pt(21, gx, gy - 75), pt(28, gx + 80, gy)]);
            await send('touchMove',  [pt(21, gx, gy - 115), pt(28, gx + 80, gy - 40)]);
            const scrollBeforeReverseLift = (await readTouchProbeState(page)).scrollTop;

            await send('touchEnd',   [pt(28, gx + 80, gy - 40, 0)]);
            await page.waitForTimeout(60);
            const after28PartialLift = await readTouchProbeState(page);
            expect(after28PartialLift.activeDrag).toBe(false);
            expect(after28PartialLift.scrollTop).toBe(scrollBeforeReverseLift);

            await send('touchMove',  [pt(21, gx, gy - 150)]);
            await send('touchEnd',   [pt(21, gx, gy - 150, 0)]);
            await page.waitForTimeout(60);

            const afterReverseLift = await readTouchProbeState(page);
            expect(afterReverseLift.activeDrag).toBe(false);
            expect(afterReverseLift.monitorDrag).toBe(false);

            // 4. Subsequent fresh single-finger drag and ordinary release still scroll the grid and sync App Worker state
            await send('touchStart', [pt(41, gx, gy)]);
            await page.waitForTimeout(130);
            await send('touchMove',  [pt(41, gx, gy - 40)]);
            await page.waitForTimeout(25);
            await send('touchMove',  [pt(41, gx, gy - 110)]);
            await page.waitForTimeout(25);
            await send('touchMove',  [pt(41, gx, gy - 180)]);
            await send('touchEnd',   [pt(41, gx, gy - 180, 0)]);

            await expect.poll(async () => {
                const state = await readTouchProbeState(page);
                return !state.activeDrag && state.scrollTop > afterReverseLift.scrollTop + 80
            }, {timeout: 5000}).toBe(true);

            const finalDom = await readTouchProbeState(page),
                  [grid]   = await app.queryComponent({ntype: 'grid-container'}, ['id']);

            expect(grid?.id).toBeTruthy();
            expect(finalDom.scrollTop).toBeGreaterThan(afterReverseLift.scrollTop + 80);
            expect(pageErrors).toEqual([])
        } finally {
            await send('touchCancel').catch(() => {});
            await cdp.detach()
        }
    });
});
