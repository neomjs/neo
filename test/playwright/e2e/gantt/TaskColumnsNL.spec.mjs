import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/taskColumns/index.html',
    THEMES      = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    COLUMNS     = ['#', 'Task', 'Owner', 'Start', 'Finish', 'Days', 'Done'],
    // Widths of the six columns that scroll with the chart on a phone
    LOOSE_WIDTH = 44 + 144 + 68 + 68 + 66 + 112;

/**
 * @summary Runs `fn(gantt)` in the App Worker against the page's Gantt and returns its result.
 * @param {import('@playwright/test').Page} page
 * @param {Function} fn Serialized into the worker, so it may use only its argument
 * @returns {Promise<*>}
 */
async function inGantt(page, fn) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(source => {
        const gantt = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.gantt.Container');

        return (0, eval)(`(${source})`)(gantt)
    }, fn.toString())
}

/**
 * @summary The header labels of the columns locked at the start, left to right.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function lockedHeaders(page) {
    return page.evaluate(() => [...document.querySelectorAll('.neo-grid-header-button.neo-locked-start')]
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
        .map(button => button.innerText.trim()))
}

/**
 * @summary Vertical distance between a task's row in the table and its bar in the chart.
 * @param {import('@playwright/test').Page} page
 * @param {String} id    The task id
 * @param {String} title The task title, as the tree column shows it
 * @returns {Promise<Number|null>} null when the row or the bar is not rendered
 */
function rowToBar(page, id, title) {
    return page.evaluate(([id, title]) => {
        const
            cell = [...document.querySelectorAll('.neo-grid-tree-cell')].find(node => node.innerText.trim() === title),
            bar  = document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`);

        if (!cell || !bar) return null;

        const a = cell.getBoundingClientRect(), b = bar.getBoundingClientRect();

        return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2))
    }, [id, title])
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
 * @summary Scrolls a phone-width Gantt past its six loose columns. The timeline starts past them, so the grid
 * mounts its column, and with it the bars, only once it scrolls into view.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function scrollToTimeline(page) {
    await page.locator('.neo-grid-horizontal-scrollbar').evaluate((el, value) => {el.scrollLeft = value}, LOOSE_WIDTH);
    await expect.poll(() => inGantt(page, gantt => gantt.timelineColumn.scrollLeft)).toBe(LOOSE_WIDTH)
}

test('seven columns stand beside a chart that keeps at least half of 1440 px', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();

    await expect.poll(() => lockedHeaders(page)).toEqual(COLUMNS);
    expect(await inGantt(page, gantt => gantt.timelineColumn.effectiveViewportWidth)).toBeGreaterThanOrEqual(720);

    // The renderers: an owner badge with initials, the first and last day of five, and a progress bar beside its number
    const shortlist = page.locator('.neo-grid-row').filter({has: page.locator('.neo-grid-tree-cell', {hasText: 'Shortlist the headliners'})});
    await expect(shortlist.locator('.tc-badge')).toHaveText('ML');
    await expect(shortlist.locator('[data-field="startDate"]')).toHaveText('26 Apr');
    await expect(shortlist.locator('[data-field="endDate"]')).toHaveText('30 Apr');
    await expect(shortlist.locator('.tc-done-value')).toHaveText('100%');
    expect(await measureLinks(page)).toBe('on bars')
});

test('collapsing a phase folds its rows in the table and in the chart together', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();

    await page.locator('.neo-grid-tree-cell').filter({hasText: /^\s*Site\s*$/}).locator('.neo-tree-toggle').click();

    // The phase's six tasks leave both sides; its own row and bar stay
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toHaveCount(0);
    await expect(page.locator('.neo-grid-tree-cell', {hasText: 'Survey the meadow'})).toHaveCount(0);

    // Each row that stays, before and after the folded phase, still meets its own bar
    for (const [id, title] of [['site', 'Site'], ['production', 'Production'], ['stages', 'Spec the stages'], ['kit', 'Hire sound and lights']]) {
        await expect.poll(() => rowToBar(page, id, title)).toBeLessThanOrEqual(1)
    }
    expect(await measureLinks(page)).toBe('on bars')
});

test('at 390 × 844 only the task tree stays locked, and the links stay on their bars', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect(page.locator('.neo-grid-tree-cell', {hasText: 'Survey the meadow'})).toBeVisible();

    await expect.poll(() => lockedHeaders(page)).toEqual(['Task']);

    // The other six scroll with the chart: past them, the timeline starts at the region's left edge
    await scrollToTimeline(page);
    await expect.poll(() => measureLinks(page)).toBe('on bars')
});

test('opens cleanly at 1440 × 900 and 390 × 844 in every theme', async ({page}) => {
    const errors = [];

    // The browser asks the test server for a favicon on its own, and the server has none
    page.on('console', message => {
        const {url} = message.location();
        message.type() === 'error' && !url.endsWith('/favicon.ico') && errors.push(`${message.text()} ${url}`)
    });
    page.on('response', response => response.status() >= 400 && !response.url().endsWith('/favicon.ico') && errors.push(`${response.status()} ${response.url()}`));
    page.on('pageerror', error => errors.push(error.message));

    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        await page.setViewportSize(viewport);

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await expect(page.locator('.tc-badge').first()).toBeVisible();

            viewport.width < 1440 && await scrollToTimeline(page);
            await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeAttached()
        }
    }

    expect(errors).toEqual([])
});

test('opens in the dark theme on a system that prefers dark, unless ?theme= names another', async ({page}) => {
    const theme = () => page.locator('.task-columns-viewport').evaluate(node => [...node.classList].find(cls => cls.startsWith('neo-theme-')));

    await page.emulateMedia({colorScheme: 'light'});
    await page.goto(EXAMPLE_URL);
    await expect.poll(theme, 'a light system gets the first configured theme').toBe('neo-theme-neo-light');

    await page.emulateMedia({colorScheme: 'dark'});
    await page.goto(EXAMPLE_URL);
    await expect.poll(theme, 'a dark system gets the dark theme').toBe('neo-theme-neo-dark');

    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-light`);
    await expect.poll(theme, '?theme= wins over the system').toBe('neo-theme-light')
});
