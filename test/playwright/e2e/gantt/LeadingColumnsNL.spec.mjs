import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/basic/index.html',
    // `gantt/basic` draws 144 px a day from Mon 9 Nov; its task column is 220 px wide
    DAY_PX      = 144,
    // Links within the first week window (across all three phases and the milestone) of `gantt/basic`
    LINKS       = ['survey-design', 'design-materials', 'trench-spigots', 'spigots-paths', 'build-ready', 'paths-ready', 'ready-soil'],
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
 * @param {String[]} [ids=[]] Links that must be measured: a missing path or bar fails instead of being skipped
 * @returns {Promise<String>} `on bars`, or what missed
 */
function measureLinks(page, ids=[]) {
    return page.evaluate(ids => {
        const off     = [];
        let   checked = 0;

        ids = new Set(ids);

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
            ids.delete(path.dataset.dependencyId);

            if (Math.abs(first.x - source.right) > 2 || Math.abs(last.x - target.left) > 2 ||
                Math.abs(first.y - (source.top + source.height / 2)) >= 0.25 ||
                Math.abs(last.y  - (target.top + target.height / 2)) >= 0.25) {
                off.push(`${path.dataset.dependencyId} dx=${Math.round(first.x - source.right)}`)
            }
        }

        return checked > 0 && off.length === 0 && ids.size === 0 ? 'on bars' :
            `checked ${checked}, off: ${off.join(', ')}, unmeasured: ${[...ids].join(', ')}`
    }, ids)
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

test('links stay on their bars while the column before the timeline is being resized', async ({page}) => {
    await unlockTaskColumn(page);
    await expect.poll(() => measureLinks(page, LINKS)).toBe('on bars');

    // Pinned by id: a drag proxy clones the button
    const
        taskId = await page.evaluate(() => [...document.querySelectorAll('.neo-grid-header-button')].find(button => button.innerText.trim() === 'Task').id),
        task   = page.locator(`[id="${taskId}"]`),
        box    = await task.boundingBox(),
        x      = box.x + box.width - 3,
        y      = box.y + box.height / 2,
        handle = task.locator('.neo-resizable-right');

    await expect(async () => {
        await page.mouse.move(x - 30, y);
        await page.mouse.move(x, y, {steps: 4});
        await expect(handle).toHaveCount(1, {timeout: 250})
    }).toPass();

    const hb = await handle.boundingBox();

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 137, hb.y + hb.height / 2, {steps: 12});

    // The pointer is still down: the live resize has moved the timeline, and the links must have followed it
    await expect.poll(() => inGantt(page, gantt => gantt.body.columnPositions.get(gantt.timelineDataField)?.x)).toBeGreaterThan(TASK_WIDTH + 100);
    await expect.poll(() => measureLinks(page, LINKS)).toBe('on bars');

    await page.mouse.up();
    await expect.poll(() => measureLinks(page, LINKS)).toBe('on bars')
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

test('opens on three phases, twelve tasks, cross-phase links and one milestone with a clean console at desktop and phone sizes', async ({page}) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) {
            errors.push(msg.text())
        }
    });

    await expect(page.locator('.neo-gantt-bar-summary')).toHaveCount(3);
    await expect(page.locator('.neo-gantt-bar-milestone[data-event-id="water-ready"]')).toBeVisible();
    await expect(page.locator('.neo-timeline-bar-progress').first()).toBeVisible();

    const plan = await inGantt(page, gantt => ({
        dependencies: gantt.dependencyStore.getCount(),
        leaves      : gantt.store.items.filter(item => item.isLeaf !== false).length,
        milestones  : gantt.store.items.filter(item => item.milestone).length,
        phases      : gantt.store.items.filter(item => item.isLeaf === false).length
    }));
    expect(plan).toEqual({dependencies: 9, leaves: 12, milestones: 1, phases: 3});

    for (const [width, height] of [[1440, 900], [390, 844]]) {
        await page.setViewportSize({width, height});
        for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
            const overflow = await page.locator('.project-toolbar').evaluate(bar => bar.scrollWidth - bar.clientWidth);
            expect(overflow, `${width}x${height} ${theme} toolbar overflow`).toBeLessThanOrEqual(1)
        }
    }

    expect(errors).toEqual([])
});
