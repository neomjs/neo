import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A plain grid mounting `Neo.timeline.Column` draws every interval at the height its row gives it.
 * The scheduler and the Gantt chart wrap the column in containers of their own; this example has none, so it is the
 * case that shows whether the column sizes its cells itself.
 */
for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk']) {
    test(`every interval bar takes its row's height in a plain grid (${theme})`, async ({page}) => {
        await page.goto(`/examples/timeline/basic/index.html?theme=${theme}`);

        const bars = page.locator('.neo-timeline-bar');

        await expect(bars).toHaveCount(12);
        await expect.poll(() => bars.first().evaluate((node, cls) => !!node.closest(`.${cls}`), theme)).toBe(true);

        const header = page.locator('.neo-grid-header-wrapper').filter({has: page.locator('.neo-timeline-header')});

        await expect.poll(() => header.evaluate(wrapper => {
            const resource = wrapper.querySelector('.neo-grid-header-button.neo-locked-start').getBoundingClientRect(),
                  timeline = wrapper.querySelector('.neo-timeline-header').getBoundingClientRect();

            return Math.abs(resource.top - timeline.top) < 1 && Math.abs(resource.bottom - timeline.bottom) < 1
        }), {message: 'Resource and time axis fill the same header row'}).toBe(true);

        const heights = await bars.evaluateAll(nodes => nodes.map(node => ({
            bar: node.getBoundingClientRect().height,
            row: node.closest('.neo-grid-row').getBoundingClientRect().height
        })));

        // A bar asks for 84 % of its track, and the track fills its row
        heights.forEach(({bar, row}) => expect(bar).toBeGreaterThan(row / 2))
    })
}
