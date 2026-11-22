import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/zoom/index.html',
    THEMES      = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    // [button, minor unit, major unit, one major header label]
    LEVELS      = [
        ['Day',   'hour', 'day',   'Mon 1 Mar'],
        ['Month', 'week', 'month', 'March 2027'],
        ['Week',  'day',  'week',  'Week of 1 Mar']
    ];

/**
 * @summary Reads the Gantt's live axis units and scale from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{tickUnit: String, majorTickUnit: String, pxPerMinute: Number}>}
 */
async function readAxis(page) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(() => {
        const gantt = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.gantt.Container');

        return {tickUnit: gantt.timeAxis.tickUnit, majorTickUnit: gantt.majorTickUnit, pxPerMinute: gantt.timeAxis.pxPerMinute}
    })
}

/**
 * @summary Measures every rendered finish-to-start link against the bars it joins:
 * it must leave its source bar's right edge and reach its target bar's left edge, at the bars' mid height.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{checked: Number, off: String[]}>} How many links had both bars rendered, and the ids of any that missed.
 */
function measureLinks(page) {
    return page.evaluate(() => {
        const off     = [];
        let   checked = 0;

        for (const path of document.querySelectorAll('path[data-dependency-id]')) {
            const
                source = document.querySelector(`.neo-timeline-bar[data-event-id="${path.dataset.fromId}"]`)?.getBoundingClientRect(),
                target = document.querySelector(`.neo-timeline-bar[data-event-id="${path.dataset.toId}"]`)?.getBoundingClientRect(),
                matrix = path.getScreenCTM();

            if (!source || !target || !matrix || !path.getTotalLength()) continue;

            const
                first = path.getPointAtLength(0).matrixTransform(matrix),
                last  = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);

            checked++;

            if (Math.abs(first.x - source.right) > 2 || Math.abs(last.x - target.left) > 2 ||
                Math.abs(first.y - (source.top + source.height / 2)) >= 0.25 ||
                Math.abs(last.y  - (target.top + target.height / 2)) >= 0.25) {
                off.push(path.dataset.dependencyId)
            }
        }

        return {checked, off}
    })
}

test('each zoom level draws its own header units and keeps every link on its bars', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Month', exact: true})).toHaveAttribute('aria-pressed', 'true');
    expect(await readAxis(page)).toMatchObject({tickUnit: 'week', majorTickUnit: 'month'});

    for (const [name, tickUnit, majorTickUnit, label] of LEVELS) {
        const button = page.getByRole('button', {name, exact: true});

        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');

        for (const [other] of LEVELS.filter(level => level[0] !== name)) {
            await expect(page.getByRole('button', {name: other, exact: true})).toHaveAttribute('aria-pressed', 'false')
        }

        await expect.poll(() => readAxis(page)).toMatchObject({tickUnit, majorTickUnit});
        await expect(page.locator('.neo-timeline-header-major').getByText(label, {exact: true}).first()).toBeVisible();

        // The first link of the plan is on screen at every level; at the widest level every rendered link is
        await expect.poll(async () => {
            const {checked, off} = await measureLinks(page);
            return checked > 0 && off.length === 0 ? 'on bars' : `checked ${checked}, off: ${off.join(', ')}`
        }).toBe('on bars');
        expect((await measureLinks(page)).off).toEqual([])
    }
});

/**
 * @summary Reads the minor tick under the timeline's visible left edge: its unit, its text, and where its text starts
 * relative to that edge, negative when the start is cut off.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{offset: Number, text: String, unit: String}|null>}
 */
function readMinorTickAtEdge(page) {
    return page.evaluate(() => {
        const
            header = document.querySelector('.neo-timeline-header'),
            edge   = header.closest('.neo-grid-header-toolbar').getBoundingClientRect().left,
            tick   = [...header.querySelectorAll('.neo-timeline-tick-minor')].find(el => {
                const box = el.getBoundingClientRect();
                return box.left < edge - 10 && box.right > edge + 10
            }),
            range  = document.createRange();

        if (!tick) return null;

        range.selectNodeContents(tick);

        return {offset: Math.round(range.getBoundingClientRect().left - edge), text: tick.textContent.trim(), unit: tick.dataset.unit}
    })
}

test('a day whose start is scrolled out keeps its name in the minor row, an hour does not (#21726)', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();

    const
        scrollbar = page.locator('.neo-grid-horizontal-scrollbar'),
        tickWidth = () => page.locator('.neo-timeline-header .neo-timeline-tick-minor').first().evaluate(el => el.getBoundingClientRect().width);

    // Switch to the week level so days sit in the minor row: one and a half days in, Tuesday has lost its start
    await page.getByRole('button', {name: 'Week', exact: true}).click();
    await expect(page.locator('.neo-timeline-header .neo-timeline-tick-minor[data-unit="day"]').first()).toBeVisible();
    await scrollbar.evaluate((el, left) => {el.scrollLeft = left}, Math.round(await tickWidth() * 1.5));
    await expect.poll(async () => (await readMinorTickAtEdge(page))?.unit).toBe('day');
    await expect.poll(async () => (await readMinorTickAtEdge(page)).offset, 'the day keeps its name at the edge').toBeGreaterThanOrEqual(-1);
    expect((await readMinorTickAtEdge(page)).text).not.toBe('');

    // The day level puts hours there: half an hour past the edge, the hour's label leaves with its tick
    await page.getByRole('button', {name: 'Day', exact: true}).click();
    await expect.poll(() => readAxis(page)).toMatchObject({tickUnit: 'hour'});

    // The zoom brings its left-edge date back with a scroll of its own: let it land first
    let last = -1;
    await expect.poll(async () => {
        const left = await scrollbar.evaluate(el => el.scrollLeft), settled = left === last;
        last = left;
        return settled
    }, {intervals: [250]}).toBe(true);
    await scrollbar.evaluate((el, by) => {el.scrollLeft += by}, Math.round(await tickWidth() / 2));
    await expect.poll(async () => (await readMinorTickAtEdge(page))?.unit).toBe('hour');
    expect((await readMinorTickAtEdge(page)).offset, 'an hour is not pinned').toBeLessThan(-10)
});

test('the month level opens fitting all ten weeks into a 1440 px window, while the week level scrolls', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();

    const scrollbar = page.locator('.neo-grid-horizontal-scrollbar');

    // Opens on Month: all ten weeks fit into 1440 px with nothing to scroll
    await expect.poll(() => readAxis(page)).toMatchObject({tickUnit: 'week', majorTickUnit: 'month'});
    await expect.poll(() => scrollbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('.neo-timeline-header-major').getByText('May 2027', {exact: true})).toBeVisible();
    expect((await measureLinks(page)).off).toEqual([]);

    // At the week level the plan is wider than the window; switching back to Month fits again
    await page.getByRole('button', {name: 'Week', exact: true}).click();
    await expect.poll(() => readAxis(page)).toMatchObject({tickUnit: 'day', majorTickUnit: 'week'});
    await expect.poll(() => scrollbar.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);

    await page.getByRole('button', {name: 'Month', exact: true}).click();
    await expect.poll(() => readAxis(page)).toMatchObject({tickUnit: 'week'});
    await expect.poll(() => scrollbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await measureLinks(page)).off).toEqual([])
});

test('opens cleanly at 1440 × 900 and 390 × 844 in every theme', async ({page}) => {
    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        await page.setViewportSize(viewport);

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
            await expect(page.getByRole('button', {name: 'Month', exact: true})).toBeVisible()
        }
    }
});
