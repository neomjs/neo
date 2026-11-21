import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Dispatches a trusted Chromium touch long-press drag from `(startX, startY)` to `(endX, endY)`,
 * waiting on `.neo-is-dragging` rather than a fixed timer, and records `activeElement` + scroll offsets mid-drag.
 * @param {import('@playwright/test').Page} page
 * @param {{startX: Number, startY: Number, endX: Number, endY: Number}} coords
 * @returns {Promise<{midActiveEventId: String|null, midFocusPointer: Boolean, scrollBefore: Object, scrollMid: Object}>}
 */
async function driveTouchDrag(page, {startX, startY, endX, endY}) {
    await expect.poll(() => page.evaluate(() => Boolean(Neo.main?.addon?.DragDrop?.pointerSensor))).toBe(true);

    const cdp          = await page.context().newCDPSession(page),
          scrollBefore = await readScrollState(page);

    await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});

    await cdp.send('Input.dispatchTouchEvent', {
        type       : 'touchStart',
        touchPoints: [{x: Math.round(startX), y: Math.round(startY)}]
    });

    await expect(page.locator('.neo-scheduler')).toHaveClass(/neo-is-dragging/);

    const steps = 8;
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchMove',
            touchPoints: [{
                x: Math.round(startX + ((endX - startX) * i) / steps),
                y: Math.round(startY + ((endY - startY) * i) / steps)
            }]
        })
    }

    await expect(page.locator('.neo-dragproxy')).toBeVisible();

    const midState = await page.evaluate(() => ({
        midActiveEventId: document.activeElement?.getAttribute?.('data-event-id') || null,
        midFocusPointer : Boolean(document.activeElement?.classList?.contains('neo-focus-pointer'))
    }));
    const scrollMid = await readScrollState(page);

    await cdp.send('Input.dispatchTouchEvent', {
        type       : 'touchEnd',
        touchPoints: []
    });
    await cdp.detach();

    await expect(page.locator('.neo-scheduler')).not.toHaveClass(/neo-is-dragging/);

    return {...midState, scrollBefore, scrollMid}
}

/**
 * @summary Reads window and scheduler internal scroll offsets to falsify scroll-jump regressions on focus.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{scrollX: Number, scrollY: Number, trackScrolls: Array<{left: Number, top: Number}>}>}
 */
function readScrollState(page) {
    return page.evaluate(() => ({
        scrollX     : window.scrollX,
        scrollY     : window.scrollY,
        trackScrolls: [...document.querySelectorAll('.neo-scheduler *')]
            .filter(el => el.scrollWidth > el.clientWidth + 4 || el.scrollHeight > el.clientHeight + 4)
            .map(el => ({left: el.scrollLeft, top: el.scrollTop}))
    }))
}

test.describe('Scheduler touch & mouse drag bar focus', () => {
    test.use({hasTouch: true, viewport: {width: 1440, height: 900}});

    test('long-press touch drag and mouse drag move focus onto the dragged bar without leaving prior bar focused', async ({page, neuralLink}) => {
        await page.goto('/examples/scheduler/basic/index.html');

        const bar1 = page.locator('.neo-timeline-bar[data-event-id="ev-1"]'),
              bar2 = page.locator('.neo-timeline-bar[data-event-id="ev-2"]'),
              bar3 = page.locator('.neo-timeline-bar[data-event-id="ev-3"]');

        await expect(bar1).toBeVisible();
        await expect(bar2).toBeVisible();
        await expect(bar3).toBeVisible();

        expect(await page.evaluate(() => Neo.config.hasTouchEvents)).toBe(true);

        const app         = await neuralLink.connectToApp('SchedulerBasic'),
              [scheduler] = await app.findInstances({className: 'Neo.scheduler.Container'}, ['id']);

        // 1. Focus ev-1 first, then long-press touch drag ev-2 horizontally on the same row.
        await bar1.focus();
        await expect(bar1).toBeFocused();

        const box2      = await bar2.boundingBox(),
              touchSame = await driveTouchDrag(page, {
                  startX: box2.x + box2.width / 2,
                  startY: box2.y + box2.height / 2,
                  endX  : box2.x + box2.width / 2 + 60,
                  endY  : box2.y + box2.height / 2
              });

        expect(touchSame.midActiveEventId).toBe('ev-2');
        expect(touchSame.midFocusPointer).toBe(true);
        expect(touchSame.scrollMid).toEqual(touchSame.scrollBefore);
        await expect(bar2).toBeFocused();
        await expect(bar1).not.toBeFocused();

        // Post-drop keyboard nudging acts on ev-2, never ev-1.
        const ev1BeforeKey = (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).startDate,
              ev2AfterDrop = (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-2'])).startDate;

        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-2'])).startDate)
            .not.toBe(ev2AfterDrop);
        expect((await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).startDate).toBe(ev1BeforeKey);

        // 2. Cross-row touch drag: focus ev-1, then long-press drag ev-3 into row r-3 ("Rehearsal room").
        await bar1.focus();
        await expect(bar1).toBeFocused();

        const box3     = await bar3.boundingBox(),
              row3     = page.locator('.neo-grid-row').filter({hasText: 'Rehearsal room'}),
              row3Box  = await row3.boundingBox(),
              touchRow = await driveTouchDrag(page, {
                  startX: box3.x + box3.width / 2,
                  startY: box3.y + box3.height / 2,
                  endX  : box3.x + box3.width / 2 + 45,
                  endY  : row3Box.y + row3Box.height / 2
              });

        expect(touchRow.midActiveEventId).toBe('ev-3');
        await expect.poll(async () => (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-3'])).resourceId)
            .toBe('r-3');
        await expect(page.locator('.neo-timeline-bar[data-event-id="ev-3"]')).toBeFocused();
        await expect(bar1).not.toBeFocused();

        // 3. Mouse drag control: focus ev-2, then mouse-drag ev-1 into row r-2 ("Mixing suite").
        await bar2.focus();
        await expect(bar2).toBeFocused();

        const box1    = await bar1.boundingBox(),
              row2    = page.locator('.neo-grid-row').filter({hasText: 'Mixing suite'}),
              row2Box = await row2.boundingBox(),
              mx      = box1.x + box1.width / 2,
              my      = box1.y + box1.height / 2;

        await page.mouse.move(mx, my);
        await page.mouse.down();
        await page.mouse.move(mx + 45, row2Box.y + row2Box.height / 2, {steps: 10});
        await expect(page.locator('.neo-scheduler')).toHaveClass(/neo-is-dragging/);
        expect(await page.evaluate(() => document.activeElement?.getAttribute?.('data-event-id'))).toBe('ev-1');
        await page.mouse.up();

        await expect.poll(async () => (await app.callMethod(scheduler.id, 'resolveEventRecord', ['ev-1'])).resourceId)
            .toBe('r-2');
        await expect(page.locator('.neo-timeline-bar[data-event-id="ev-1"]')).toBeFocused();
        await expect(bar2).not.toBeFocused()
    });
});

test.describe('Scheduler touch drag on 390x844 phone', () => {
    test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

    test('scrolled 390x844 phone viewport does not jump scroll offsets when long-press touch drag focuses a bar', async ({page, neuralLink}) => {
        await page.goto('/examples/scheduler/basic/index.html');

        const bar1 = page.locator('.neo-timeline-bar[data-event-id="ev-1"]'),
              bar2 = page.locator('.neo-timeline-bar[data-event-id="ev-2"]');

        await expect(bar1).toBeVisible();
        await expect(bar2).toBeVisible();

        expect(await page.evaluate(() => Neo.config.hasTouchEvents)).toBe(true);
        const app = await neuralLink.connectToApp('SchedulerBasic');

        const beforeScrollX = (await bar2.boundingBox()).x;

        await page.evaluate(() => {
            const scrollbar = document.querySelector('.neo-scheduler .neo-grid-horizontal-scrollbar');
            if (scrollbar) {
                scrollbar.scrollLeft = 20
            }
        });

        await expect.poll(async () => {
            const [sm]   = await app.findInstances({className: 'Neo.grid.ScrollManager'}, ['scrollLeft']),
                  bodies = await app.findInstances({className: 'Neo.grid.Body'}, ['isScrolling']);

            return sm?.properties?.scrollLeft === 20 &&
                bodies.length > 0 &&
                bodies.every(b => b.properties?.isScrolling === false)
        }).toBe(true);

        await expect.poll(async () => (await bar2.boundingBox())?.x).toBeLessThan(beforeScrollX - 10);
        await expect(page.locator('.neo-scheduler .neo-grid-body').first()).not.toHaveClass(/neo-is-scrolling/);

        await bar1.evaluate(el => el.focus({preventScroll: true}));
        await expect(bar1).toBeFocused();

        const hitPoint = await bar2.evaluate(el => {
            const rect   = el.getBoundingClientRect(),
                  locked = document.querySelector('.neo-scheduler .neo-grid-header-button.neo-locked-start')?.getBoundingClientRect(),
                  minX   = Math.max(rect.left + 10, (locked?.right || 0) + 10),
                  maxX   = Math.min(rect.right - 10, window.innerWidth - 10);
            return {x: (minX + maxX) / 2, y: rect.top + rect.height / 2}
        });

        await expect.poll(() => page.evaluate(({x, y}) =>
            document.elementFromPoint(x, y)?.closest('.neo-timeline-bar')?.getAttribute('data-event-id') || null, hitPoint)
        ).toBe('ev-2');

        const mobileRes = await driveTouchDrag(page, {
            startX: hitPoint.x,
            startY: hitPoint.y,
            endX  : hitPoint.x + 30,
            endY  : hitPoint.y
        });

        expect(mobileRes.midActiveEventId).toBe('ev-2');
        expect(mobileRes.scrollMid).toEqual(mobileRes.scrollBefore);
        await expect(bar2).toBeFocused()
    });
});
