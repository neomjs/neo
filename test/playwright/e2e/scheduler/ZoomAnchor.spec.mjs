import {expect, test} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/bigData/index.html',
    SCROLLBAR   = '.neo-scheduler .neo-grid-horizontal-scrollbar',
    WEEK_PX     = 20000;

/**
 * @summary Reads the date at the visible timeline's left edge. The edge comes from the DOM: the region's scroll
 * position less where the timeline header starts in the region's content (a "Team · Site" column scrolls before the
 * timeline). The App Worker converts that pixel into a date on the scheduler's axis, and reports whether it has seen
 * the same scroll.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{edge: Number|null, pxPerMinute: Number, scrollLeft: Number, seen: Boolean}>}
 */
async function readEdge(page) {
    const dom = await page.evaluate(selector => {
        const
            region = document.querySelector(selector),
            header = document.querySelector('.neo-scheduler .neo-timeline-header');

        return {
            scrollLeft  : region.scrollLeft,
            timelineLeft: header.getBoundingClientRect().left - region.getBoundingClientRect().left + region.scrollLeft
        }
    }, SCROLLBAR);

    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(({scrollLeft, timelineLeft}) => {
        const
            scheduler                  = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.scheduler.Container'),
            {timeAxis, timelineColumn} = scheduler,
            offset                     = scrollLeft - timelineLeft;

        return {
            edge       : offset > 0 ? +timeAxis.offsetToDate(offset) : null,
            pxPerMinute: timeAxis.pxPerMinute,
            scrollLeft,
            seen       : timelineColumn.scrollLeft === scrollLeft
        }
    }, dom)
}

/**
 * @summary Clicks a zoom level and waits until the axis has its scale and the region has stopped scrolling.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 * @param {Number} pxPerMinute
 * @returns {Promise<Object>} The settled {@link readEdge} reading
 */
async function zoom(page, name, pxPerMinute) {
    const before = await readEdge(page),
          moves  = before.scrollLeft > 0 && before.pxPerMinute !== pxPerMinute;

    await page.getByRole('button', {name, exact: true}).click();
    await expect.poll(async () => (await readEdge(page)).pxPerMinute).toBe(pxPerMinute);

    let last = null;

    // Settled: two reads in a row agree, and the worker has seen the DOM's scroll position. A scrolled region also has
    // to leave its old position, which looks settled until the zoom's scroll lands
    await expect.poll(async () => {
        const
            reading = await readEdge(page),
            settled = reading.seen && last?.scrollLeft === reading.scrollLeft && (!moves || reading.scrollLeft !== before.scrollLeft);

        last = reading;
        return settled
    }).toBe(true);

    return last
}

test('a zoom keeps the date at the timeline\'s left edge, both ways', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.neo-scheduler .neo-timeline-bar').first()).toBeVisible();

    await zoom(page, 'Week', 0.15);
    await page.locator(SCROLLBAR).evaluate((el, value) => {el.scrollLeft = value}, WEEK_PX);
    await expect.poll(async () => (await readEdge(page)).seen && (await readEdge(page)).scrollLeft === WEEK_PX).toBe(true);

    const week = await readEdge(page);
    expect(week.edge).not.toBeNull();

    // One pixel of the coarser scale: the region scrolls in whole pixels
    const tolerance = 60_000 / 0.15;

    const day = await zoom(page, 'Day', 0.5);
    expect(day.scrollLeft, 'the region scrolled with the scale').toBeGreaterThan(WEEK_PX);
    expect(Math.abs(day.edge - week.edge), `left edge ${new Date(week.edge).toISOString()} → ${new Date(day.edge).toISOString()}`).toBeLessThanOrEqual(tolerance);

    const back = await zoom(page, 'Week', 0.15);
    expect(Math.abs(back.edge - week.edge), `back at Week: ${new Date(back.edge).toISOString()}`).toBeLessThanOrEqual(tolerance)
});

test('a zoom scrolls nothing while the timeline\'s start is in view', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.neo-scheduler .neo-timeline-bar').first()).toBeVisible();

    for (const [name, pxPerMinute] of [['Day', 0.5], ['Week', 0.15]]) {
        const reading = await zoom(page, name, pxPerMinute);
        expect(reading.scrollLeft, `${name}: the plan still opens on its first day`).toBe(0)
    }
});
