import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Where the pointer goes decides when a tooltip hides, under a real pointer: a target left for empty space
 * hides its tooltip at once, a hoverable tooltip reached across the gap to its target stays until the pointer leaves
 * it, neighbouring targets never show two tooltips, and a target left while its tooltip is on its way leaves none.
 * The real App Worker, DOM, hit testing and `relatedTarget` run here. The bounds sit well inside the delays this
 * replaced: a 400ms hide and a 200ms show.
 */
const TOOLTIP = '.neo-tooltip',
      OFFSET  = '#tooltip-departure-offset',
      OWN_1   = '#tooltip-departure-own-1',
      OWN_2   = '#tooltip-departure-own-2',
      PLAIN   = '#tooltip-departure-plain',
      SHARED  = '#tooltip-departure-shared-1';

/**
 * Hovers a target and waits for its tooltip, and for the hit area the tooltip measures across the gap once aligned
 * @param {import('@playwright/test').Page} page
 * @param {String} selector
 * @param {String} text
 */
async function hoverUntilShown(page, selector, text) {
    await page.locator(selector).hover();
    await expect(page.locator(TOOLTIP)).toHaveText(text);
    await expect.poll(() => page.locator(TOOLTIP).evaluate(node => node.style.getPropertyValue('--tooltip-bridge-height')),
        'the bridge across the gap is measured').not.toBe('')
}

/**
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<{x: Number, y: Number}>} The center of a box in page coordinates
 */
async function centerOf(locator) {
    const {height, width, x, y} = await locator.boundingBox();
    return {x: x + width / 2, y: y + height / 2}
}

test.describe('Neo.tooltip.Base: where the pointer goes decides when a tooltip hides', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/tooltip-departure/index.html');
        await page.waitForSelector(SHARED, {state: 'visible'})
    });

    test('a target left for empty space hides its tooltip at once', async ({page}) => {
        await hoverUntilShown(page, SHARED, 'Edit item');

        await page.mouse.move(5, 5);
        await expect(page.locator(TOOLTIP), 'inside the 400ms the tooltip lingered before').toHaveCount(0, {timeout: 300})
    });

    test('a hoverable tooltip reached across the gap stays, and leaving it for empty space hides it at once', async ({page}) => {
        await hoverUntilShown(page, SHARED, 'Edit item');

        const from = await centerOf(page.locator(SHARED)),
              to   = await centerOf(page.locator(TOOLTIP));

        // Small steps, so the pointer crosses the gap between the target and the tooltip
        await page.mouse.move(to.x, to.y, {steps: 20});
        await page.waitForTimeout(600);
        await expect(page.locator(TOOLTIP), 'still up after crossing from the target').toHaveCount(1);

        expect(Math.abs(to.y - from.y), 'control: the tooltip sits apart from its target').toBeGreaterThan(20);

        await page.mouse.move(5, 5);
        await expect(page.locator(TOOLTIP)).toHaveCount(0, {timeout: 300})
    });

    test('a pointer parked just past the tooltip, on the side away from its target, dismisses it', async ({page}) => {
        await hoverUntilShown(page, SHARED, 'Edit item');

        const target = await page.locator(SHARED).boundingBox(),
              tip    = await page.locator(TOOLTIP).boundingBox(),
              to     = await centerOf(page.locator(TOOLTIP));

        expect(tip.y, 'control: the tooltip sits below its target').toBeGreaterThan(target.y + target.height);

        await page.mouse.move(to.x, to.y, {steps: 20});
        await expect(page.locator(TOOLTIP), 'control: reached across the gap').toHaveCount(1);

        await page.mouse.move(to.x, tip.y + tip.height + 5, {steps: 4});
        await expect(page.locator(TOOLTIP), '5px past its far edge is outside it').toHaveCount(0, {timeout: 300})
    });

    test('an aligned offset widens the gap, and the hit area still spans it', async ({page}) => {
        await hoverUntilShown(page, OFFSET, 'Offset item');

        const target = await page.locator(OFFSET).boundingBox(),
              tip    = await page.locator(TOOLTIP).boundingBox(),
              to     = await centerOf(page.locator(TOOLTIP));

        expect(tip.y - (target.y + target.height), 'control: the 12px offset widens the 10px gap').toBeGreaterThan(18);

        await page.mouse.move(to.x, to.y, {steps: 30});
        await page.waitForTimeout(600);
        await expect(page.locator(TOOLTIP), 'still up after crossing the wider gap').toHaveCount(1)
    });

    test('a shared tooltip a target turns off stay-on-hover dismisses when the pointer moves onto it', async ({page}) => {
        // The hoverable target first, which adds the tooltip's own enter and leave listeners
        await hoverUntilShown(page, SHARED, 'Edit item');
        await page.locator(PLAIN).hover();
        await expect(page.locator(TOOLTIP)).toHaveText('Plain item');

        const to = await centerOf(page.locator(TOOLTIP));

        await page.mouse.move(to.x, to.y, {steps: 8});
        await expect(page.locator(TOOLTIP), 'onto a tooltip that does not stay on hover').toHaveCount(0, {timeout: 300})
    });

    test('moving to a neighbouring target with its own tooltip never shows two tooltips', async ({page}) => {
        await hoverUntilShown(page, OWN_1, 'Own tooltip one');

        let most = 0;

        // Count the tooltips on every frame from the move on
        await page.evaluate(() => {
            window.mostTooltips = 0;
            const count = () => {
                window.mostTooltips = Math.max(window.mostTooltips, document.querySelectorAll('.neo-tooltip').length);
                window.countingTooltips && requestAnimationFrame(count)
            };
            window.countingTooltips = true;
            requestAnimationFrame(count)
        });

        await page.locator(OWN_2).hover();
        await expect(page.locator(TOOLTIP)).toHaveText('Own tooltip two');
        await page.waitForTimeout(500);

        most = await page.evaluate(() => {window.countingTooltips = false; return window.mostTooltips});

        expect(most, 'one tooltip at a time').toBe(1);
        await expect(page.locator(TOOLTIP)).toHaveCount(1)
    });

    test('a target left while its tooltip is on its way leaves no tooltip', async ({page}) => {
        await page.locator(SHARED).hover();
        await page.waitForTimeout(230);
        await page.mouse.move(5, 5);

        await page.waitForTimeout(600);
        await expect(page.locator(TOOLTIP), 'past its show delay, then left').toHaveCount(0);

        await page.locator(SHARED).hover();
        await page.waitForTimeout(60);
        await page.mouse.move(5, 5);

        await page.waitForTimeout(600);
        await expect(page.locator(TOOLTIP), 'inside its show delay, then left').toHaveCount(0)
    })
});
