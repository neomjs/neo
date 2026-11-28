import {test, expect}              from '../../fixtures.mjs';
import {contrastRatio, parseColor} from '../../../../buildScripts/util/check-theme-palette.mjs';

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

/**
 * @summary Theme Neo binds an ordinary bar's two pointer states to different paint: the hovered border steps off the
 * resting one, and keyboard focus draws its own outline. A binding that resolves both borders to one grade passes
 * every contrast check against the fill and still loses the cue.
 */
for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
    test(`an ordinary bar's border answers the pointer, and keyboard focus draws its outline (${theme})`, async ({page}) => {
        await page.goto(`/examples/timeline/basic/index.html?theme=${theme}`);

        const
            bar      = page.locator('.neo-timeline-bar').first(),
            border   = () => bar.evaluate(node => getComputedStyle(node).borderTopColor),
            contrast = (a, b) => contrastRatio(parseColor(a).rgba.slice(0, 3), parseColor(b).rgba.slice(0, 3)),
            onBar    = () => page.evaluate(() => !!document.activeElement?.classList.contains('neo-timeline-bar'));

        await expect.poll(() => bar.evaluate((node, cls) => !!node.closest(`.${cls}`), theme)).toBe(true);
        await page.mouse.move(1, 1);

        const rest = await border();

        await bar.hover();
        await expect.poll(async () => contrast(await border(), rest), {message: 'the hovered border steps off the resting one'}).toBeGreaterThanOrEqual(1.2);
        await page.mouse.move(1, 1);

        for (let i = 0; i < 60 && !await onBar(); i++) {
            await page.keyboard.press('Tab')
        }

        expect(await onBar(), 'Tab reaches a bar').toBe(true);
        expect(await page.evaluate(() => {
            const node = document.activeElement, style = getComputedStyle(node);
            return {visible: node.matches(':focus-visible'), outline: `${style.outlineStyle} ${style.outlineWidth}`}
        })).toEqual({visible: true, outline: 'solid 2px'})
    })
}
