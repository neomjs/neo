import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/basic/index.html',
    // `gantt/basic` draws 172.8 px a day from Mon 9 Nov; its task column is 220 px wide
    DAY_PX      = 172.8,
    TASK_WIDTH  = 220;

/**
 * @summary Runs `fn(gantt, arg)` in the App Worker against the page's Gantt and returns its result.
 * @param {import('@playwright/test').Page} page
 * @param {Function} fn Serialized into the worker, so it may use only its arguments
 * @param {*} [arg]
 * @returns {Promise<*>}
 */
async function inGantt(page, fn, arg) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(([source, value]) => {
        const gantt = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.gantt.Container');

        return (0, eval)(`(${source})`)(gantt, value)
    }, [fn.toString(), arg])
}

/**
 * @summary Moves the task column out of the locked region, so it scrolls before the timeline.
 * A smaller `bufferPx` than the column's width makes a window measured from the wrong origin miss bars.
 * @param {import('@playwright/test').Page} page
 */
async function unlockTaskColumn(page) {
    await inGantt(page, gantt => {
        gantt.bufferPx = 40;
        gantt.columns.items.find(column => column.dataField === 'title').locked = null
    });

    // The center body records the task column once the regions are rebuilt
    await expect.poll(() => inGantt(page, gantt => gantt.body.columnPositions.get(gantt.timelineDataField)?.x)).toBe(TASK_WIDTH)
}

/**
 * @summary Measures every rendered link against the bars it joins: it must leave its source bar's right edge
 * and reach its target bar's left edge, at the bars' mid height.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String>} `on bars`, or what missed
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
                off.push(`${path.dataset.dependencyId} dx=${Math.round(first.x - source.right)}`)
            }
        }

        return checked > 0 && off.length === 0 ? 'on bars' : `checked ${checked}, off: ${off.join(', ')}`
    })
}

/**
 * @summary Scrolls the center region so the timeline's visible left edge sits `axisPx` into the axis.
 * @param {import('@playwright/test').Page} page
 * @param {Number} axisPx
 */
async function scrollAxisTo(page, axisPx) {
    const scrollLeft = TASK_WIDTH + axisPx;

    await page.locator('.neo-grid-horizontal-scrollbar').evaluate((el, value) => {el.scrollLeft = value}, scrollLeft);
    // The scroll reaches the App Worker later: until then the DOM still shows the unscrolled window
    await expect.poll(() => inGantt(page, gantt => gantt.timelineColumn.scrollLeft)).toBe(scrollLeft)
}

test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-light`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible()
});

test('links stay on their bars with a column scrolling before the timeline', async ({page}) => {
    await unlockTaskColumn(page);

    await expect.poll(() => measureLinks(page)).toBe('on bars');

    // Past the task column, the timeline fills the region: the links move with their bars
    await scrollAxisTo(page, 100);
    await expect.poll(() => measureLinks(page)).toBe('on bars')
});

test('the bar and the day under the timeline\'s left edge render when the column before it is wider than the buffer', async ({page}) => {
    await unlockTaskColumn(page);

    // "Gather materials" fills Wed 11, day 2 of the axis; the left edge cuts it 0.4 days before its end
    await scrollAxisTo(page, Math.round(2.6 * DAY_PX));

    await expect(page.locator('.neo-timeline-bar[data-event-id="materials"]')).toBeVisible();
    await expect(page.locator('.neo-timeline-header-minor').getByText('Wed 11', {exact: true})).toBeVisible()
});

test('a responsive lock policy keeps the links on their bars both ways', async ({page}) => {
    await inGantt(page, gantt => {
        gantt.responsiveLockPolicy = {breakpoints: [
            {maxWidth: 1000,                    columns: {title: null}},
            {maxWidth: Number.MAX_SAFE_INTEGER, columns: {title: 'start'}}
        ]}
    });

    await page.setViewportSize({width: 900, height: 900});
    await expect.poll(() => inGantt(page, gantt => gantt.body.columnPositions.get(gantt.timelineDataField)?.x)).toBe(TASK_WIDTH);
    await expect.poll(() => measureLinks(page)).toBe('on bars');

    await page.setViewportSize({width: 1440, height: 900});
    await expect.poll(() => inGantt(page, gantt => gantt.body.columnPositions.get(gantt.timelineDataField)?.x)).toBe(0);
    await expect.poll(() => measureLinks(page)).toBe('on bars')
});
