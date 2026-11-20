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
    await expect(page.getByRole('button', {name: 'Week', exact: true})).toHaveAttribute('aria-pressed', 'true');
    expect(await readAxis(page)).toMatchObject({tickUnit: 'day', majorTickUnit: 'week'});

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

test('the month level fits all ten weeks into a 1440 px window', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();

    const scrollbar = page.locator('.neo-grid-horizontal-scrollbar');

    // At the week level the plan is wider than the window; at the month level it fits, with nothing to scroll
    expect(await scrollbar.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);

    await page.getByRole('button', {name: 'Month', exact: true}).click();
    await expect.poll(() => readAxis(page)).toMatchObject({tickUnit: 'week'});
    await expect.poll(() => scrollbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('.neo-timeline-header-major').getByText('May 2027', {exact: true})).toBeVisible();
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
