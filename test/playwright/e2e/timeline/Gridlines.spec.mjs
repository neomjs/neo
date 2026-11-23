import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The timeline draws one body gridline per tick of its header, in the scheduler and the Gantt, at a desktop
 * and a phone width and after a zoom.
 */

const examples = ['scheduler/basic', 'scheduler/liveUpdates', 'scheduler/nonWorkingTime', 'scheduler/zoom', 'gantt/basic', 'gantt/workingTime'];

/**
 * @summary The gridline step the first track resolves, and the width of the header's second minor tick.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{step: Number, tick: Number}>}
 */
function measure(page) {
    return page.evaluate(() => {
        const track = document.querySelector('.neo-timeline-track'),
              tick  = document.querySelectorAll('.neo-timeline-header-minor > *')[1];

        return {
            step: parseFloat(getComputedStyle(track).getPropertyValue('--neo-timeline-gridline-step')),
            tick: tick.getBoundingClientRect().width
        }
    })
}

for (const example of examples) {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
        test(`${example} draws a gridline on every tick at ${width} × ${height}`, async ({page}) => {
            await page.setViewportSize({width, height});
            await page.goto(`/examples/${example}/index.html?theme=neo-theme-neo-dark`);
            await expect(page.locator('.neo-timeline-track').first()).toBeAttached();
            await expect(page.locator('.neo-timeline-header-minor > *').nth(1)).toBeAttached();

            await expect.poll(async () => {
                const {step, tick} = await measure(page);
                return Math.abs(step - tick) < 1
            }).toBe(true)
        })
    }
}

test('a zoom moves the gridlines with the ticks', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/examples/scheduler/basic/index.html?theme=neo-theme-neo-dark');
    await expect(page.locator('.neo-timeline-track').first()).toBeAttached();

    const before = await measure(page);

    await page.locator('.studio-zoom').filter({hasText: 'Hour'}).click();

    await expect.poll(async () => {
        const {step, tick} = await measure(page);
        return step !== before.step && Math.abs(step - tick) < 1
    }).toBe(true)
});
