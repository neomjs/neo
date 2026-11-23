import {test, expect} from '../../fixtures.mjs';

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
 * @summary The body's two horizontal regions below the header: the locked columns and the chart.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{table: Object, chart: Object}>} Screenshot clips
 */
async function regions(page) {
    const {innerWidth, right, top} = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.neo-grid-header-button.neo-locked-start')];

        return {
            innerWidth: window.innerWidth,
            right     : Math.max(...buttons.map(button => button.getBoundingClientRect().right)),
            top       : buttons[0].getBoundingClientRect().bottom
        }
    });

    const y = Math.ceil(top) + 1, height = 870 - y;

    return {
        table: {x: 0, y, width: Math.floor(right) - 1, height},
        chart: {x: Math.ceil(right) + 1, y, width: innerWidth - 10 - Math.ceil(right), height}
    }
}

/**
 * @summary Whether any link paints inside `clip`: its pixels with the dependency layer shown and hidden.
 * The layer ignores pointer events, so a hit test reports what lies under it either way; only pixels tell.
 * @param {import('@playwright/test').Page} page
 * @param {Object} clip
 * @returns {Promise<Boolean>}
 */
async function linksPaintIn(page, clip) {
    const nextFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    // Two equal frames first: anything still moving would read as a link
    await expect.poll(async () => (await page.screenshot({clip})).equals(await page.screenshot({clip}))).toBe(true);

    const shown = await page.screenshot({clip});

    await page.evaluate(() => document.querySelectorAll('.neo-gantt-dependency-layer').forEach(layer => {layer.style.visibility = 'hidden'}));
    await nextFrames();

    const hidden = await page.screenshot({clip});

    await page.evaluate(() => document.querySelectorAll('.neo-gantt-dependency-layer').forEach(layer => {layer.style.visibility = ''}));

    return !shown.equals(hidden)
}

// The scroll lands as the first link mounts, before the grid registers its scroll sync, which loads on demand
test('gantt/zoom scrolled as its first link mounts draws its links in the chart', async ({page}) => {
    await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
            const scrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');

            if (scrollbar && document.querySelector('path[data-dependency-id]')) {
                observer.disconnect();
                scrollbar.scrollLeft = 200
            }
        });

        observer.observe(document, {childList: true, subtree: true})
    });

    // At 800 px the 1,210 px Month axis exceeds the 580 px chart region, so 200 px scrolls the opening links out
    await page.setViewportSize({width: 800, height: 900});
    await page.goto('/examples/gantt/zoom/index.html?theme=neo-theme-neo-dark');
    await expect(page.locator('path[data-dependency-id]').first()).toBeAttached();
    await expect.poll(() => inGantt(page, gantt => gantt.timelineColumn.scrollLeft)).toBe(200);

    const {chart} = await regions(page);

    await expect.poll(() => linksPaintIn(page, chart)).toBe(true)
});

// Scrolled so links whose bars left the chart cross the locked task column
for (const [example, scroll] of [['zoom', 2400], ['basic', 300]]) {
    test(`gantt/${example} scrolled ${scroll} px draws its links in the chart, never over the locked columns`, async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`/examples/gantt/${example}/index.html?theme=neo-theme-neo-dark`);
        await expect(page.locator('path[data-dependency-id]').first()).toBeAttached();

        if (example === 'zoom') {
            await page.getByRole('button', {name: 'Week', exact: true}).click();
            await expect.poll(() => inGantt(page, gantt => gantt.timeAxis.tickUnit)).toBe('day')
        }

        await page.locator('.neo-grid-horizontal-scrollbar').evaluate((el, value) => {el.scrollLeft = value}, scroll);
        await expect.poll(() => inGantt(page, gantt => gantt.timelineColumn.scrollLeft)).toBe(scroll);

        const {table, chart} = await regions(page);

        // The layer redraws after the scroll: links in the chart first, so an empty layer never passes the table check
        await expect.poll(() => linksPaintIn(page, chart)).toBe(true);
        expect(await linksPaintIn(page, table)).toBe(false)
    })
}
