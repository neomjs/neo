import {expect, test} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/zoom/index.html',
    MONDAY_8    = Date.parse('2026-12-07T08:00:00Z'),
    THEMES      = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    // [button, minor unit, major unit, pixels per minute]
    LEVELS      = [
        ['Hours', 'hour', 'day',  1.5],
        ['Week',  'day',  'week', 0.15],
        ['Days',  'hour', 'day',  0.5]
    ];

/**
 * @summary Collects page errors and console errors for the current page. The dev server has no favicon, and the
 * browser's request for one is no error of the example.
 * @param {import('@playwright/test').Page} page
 * @returns {String[]}
 */
function trackErrors(page) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico') && errors.push(msg.text()));

    return errors
}

/**
 * @summary Reads the scheduler's axis units and scale, and the date at the visible timeline's left edge. The edge
 * comes from the DOM: the region's scroll position less where the timeline header starts in the region's content.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{edge: Number, majorTickUnit: String, pxPerMinute: Number, scrollLeft: Number, seen: Boolean, tickUnit: String}>}
 */
async function readPlan(page) {
    const dom = await page.evaluate(() => {
        const
            region = document.querySelector('.neo-scheduler .neo-grid-horizontal-scrollbar'),
            header = document.querySelector('.neo-scheduler .neo-timeline-header');

        return {
            scrollLeft  : region.scrollLeft,
            timelineLeft: header.getBoundingClientRect().left - region.getBoundingClientRect().left + region.scrollLeft
        }
    });

    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(({scrollLeft, timelineLeft}) => {
        const
            scheduler                  = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.scheduler.Container'),
            {timeAxis, timelineColumn} = scheduler;

        return {
            edge         : +timeAxis.offsetToDate(Math.max(0, scrollLeft - timelineLeft)),
            majorTickUnit: scheduler.majorTickUnit,
            pxPerMinute  : timeAxis.pxPerMinute,
            scrollLeft,
            seen         : timelineColumn.scrollLeft === scrollLeft,
            tickUnit     : timeAxis.tickUnit
        }
    }, dom)
}

/**
 * @summary Waits until the region has stopped scrolling at the given scale and the worker has seen where it stopped.
 * @param {import('@playwright/test').Page} page
 * @param {Number} pxPerMinute
 * @returns {Promise<Object>} The settled {@link readPlan} reading
 */
async function settle(page, pxPerMinute) {
    let last = null;

    await expect.poll(async () => {
        const reading = await readPlan(page), settled = reading.pxPerMinute === pxPerMinute && reading.seen && last?.scrollLeft === reading.scrollLeft;
        last = reading;
        return settled
    }).toBe(true);

    return last
}

test('each level draws its own header units, and the control shows the active one', async ({page}) => {
    const errors = trackErrors(page);

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();
    await expect(page.getByRole('button', {name: 'Days', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', {name: 'Zoom'})).toBeVisible();

    for (const [name, tickUnit, majorTickUnit, pxPerMinute] of LEVELS) {
        await page.getByRole('button', {name, exact: true}).click();

        for (const [other] of LEVELS) {
            await expect(page.getByRole('button', {name: other, exact: true})).toHaveAttribute('aria-pressed', String(other === name))
        }

        await expect.poll(() => readPlan(page)).toMatchObject({majorTickUnit, pxPerMinute, tickUnit});
        // Every level names Monday 7 December above the plan: the day at Hours and Days, the week at Week
        await expect(page.locator('.neo-timeline-tick-major', {hasText: 'Dec 7'}).first()).toBeVisible()
    }

    expect(errors).toEqual([])
});

test('the plan opens at Days on Monday 08:00, and every zoom keeps 08:00 at the left edge', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

    const opened = await settle(page, 0.5);
    // The region scrolls in whole pixels: one pixel of the current scale is the tolerance
    expect(Math.abs(opened.edge - MONDAY_8)).toBeLessThanOrEqual(60_000 / 0.5);

    for (const [name, , , pxPerMinute] of LEVELS) {
        await page.getByRole('button', {name, exact: true}).click();

        const reading = await settle(page, pxPerMinute);
        expect(Math.abs(reading.edge - MONDAY_8), `${name}: left edge ${new Date(reading.edge).toISOString()}`).toBeLessThanOrEqual(60_000 / 0.15)
    }
});

test('opens cleanly at 1440 × 900 and 390 × 844 in every theme', async ({page}) => {
    const errors = trackErrors(page);

    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        await page.setViewportSize(viewport);

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();
            await expect(page.getByRole('button', {name: 'Week', exact: true})).toBeVisible()
        }
    }

    expect(errors).toEqual([])
});
