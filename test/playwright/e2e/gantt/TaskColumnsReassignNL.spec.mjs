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
 * @summary Rendered widths of the task column's header and of its first cell.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Number[]>} `[header, cell]`, rounded
 */
function taskColumnWidths(page) {
    return page.evaluate(() => {
        const
            header = [...document.querySelectorAll('.neo-grid-header-button')].find(button => button.innerText.trim() === 'Task'),
            cell   = document.querySelector('.neo-grid-cell[data-field="title"]');

        return [header, cell].map(node => Math.round(node?.getBoundingClientRect().width ?? -1))
    })
}

// The suite's `workerErrors` fixture fails the test on any worker error, so a reassignment that throws fails here
test('reassigning the task columns at runtime rebuilds them at the new width without an error', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/examples/gantt/basic/index.html?theme=neo-theme-neo-light');
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
    await expect.poll(() => taskColumnWidths(page)).toEqual([220, 220]);

    await inGantt(page, gantt => {
        gantt.taskColumns = [{type: 'tree', dataField: 'title', text: 'Task', width: 160, locked: 'start'}]
    });

    await expect.poll(() => taskColumnWidths(page)).toEqual([160, 160]);
    await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible()
});
