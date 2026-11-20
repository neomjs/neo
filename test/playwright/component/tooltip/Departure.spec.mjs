import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Where the pointer goes decides when a tooltip hides, under a real pointer: a target left for empty space
 * hides its tooltip at once, a hoverable tooltip reached across the gap to its target stays until the pointer leaves
 * it, neighbouring targets never show two tooltips, and a target left while its tooltip is on its way leaves none.
 * The real App Worker, DOM, hit testing and `relatedTarget` run here. The bounds sit well inside the delays this
 * replaced: a 400ms hide and a 200ms show.
 */
const TOOLTIP   = '.neo-tooltip',
      DATA_PILL = '#tooltip-departure-data-pill',
      DATA_ICON = '#tooltip-departure-data-icon',
      DATA_TEXT = '#tooltip-departure-data-label',
      OFFSET    = '#tooltip-departure-offset',
      OWN_1     = '#tooltip-departure-own-1',
      OWN_2     = '#tooltip-departure-own-2',
      PLAIN     = '#tooltip-departure-plain',
      SHARED    = '#tooltip-departure-shared-1';

/**
 * Hovers a target and waits for its tooltip, and for the gap Main writes on it once aligned, which its hit area spans
 * @param {import('@playwright/test').Page} page
 * @param {String} selector
 * @param {String} text
 */
async function hoverUntilShown(page, selector, text) {
    await page.locator(selector).hover();
    await expect(page.locator(TOOLTIP)).toHaveText(text);
    await expect.poll(() => page.locator(TOOLTIP).evaluate(node => node.style.getPropertyValue('--neo-align-gap-height')),
        'the gap to the target is written').not.toBe('')
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

    test('a constraint that shrinks under a shown tooltip flips it above its target, and the hit area moves into the new gap', async ({page}) => {
        // A box the tooltip aligns within, which Main observes. Shrinking it realigns the mounted tooltip in Main
        // alone, as a window resize does, while the target stays under the pointer: a resize re-centers this page.
        await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), {id: 'tooltip-departure-frame'})));
        await page.locator('#tooltip-departure-frame').evaluate(frame => Object.assign(frame.style, {
            height: '100vh', left: 0, pointerEvents: 'none', position: 'fixed', top: 0, visibility: 'hidden', width: '100vw'
        }));
        await page.workers().find(worker => worker.url().includes('/worker/App.mjs')).evaluate(() => {
            const tooltip = Neo.getComponent('tooltip-departure-own-1')._tooltip;

            tooltip.align = {...tooltip.align, constrainTo: 'tooltip-departure-frame'}
        });

        await hoverUntilShown(page, OWN_1, 'Own tooltip one');
        await expect(page.locator(TOOLTIP), 'control: aligned below its target first').toHaveClass(/neo-aligned-bottom/);

        const below = await page.locator(OWN_1).boundingBox(),
              first = await page.locator(TOOLTIP).boundingBox(),
              left  = Math.floor(Math.min(below.x, first.x) - 2);

        // No room beside the target or below it, so the only side left is above
        await page.locator('#tooltip-departure-frame').evaluate((frame, {height, left, width}) => Object.assign(frame.style, {
            height: `${height}px`, left: `${left}px`, width: `${width}px`
        }), {
            height: Math.ceil(below.y + below.height + 20),
            left,
            width : Math.ceil(Math.max(below.x + below.width, first.x + first.width) + 2 - left)
        });
        await expect(page.locator(TOOLTIP), 'control: the realign flipped it above its target').toHaveClass(/neo-aligned-top/);

        const target = await page.locator(OWN_1).boundingBox(),
              tip    = await page.locator(TOOLTIP).boundingBox(),
              x      = target.x + target.width / 2;

        // Parked in the new gap for longer than the retarget window, the pointer is on the hit area
        await page.mouse.move(x, target.y + target.height / 2);
        await page.mouse.move(x, (tip.y + tip.height + target.y) / 2, {steps: 6});
        await page.waitForTimeout(200);
        await expect(page.locator(TOOLTIP), 'still up in the new gap').toHaveCount(1);

        // Across the tooltip to 5px past its new far edge, where the hit area lay before the flip
        await page.mouse.move(x, tip.y + tip.height / 2, {steps: 4});
        await page.mouse.move(x, tip.y - 5, {steps: 4});
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

    test('on a bordered tooltip, every row of the gap is its hit area, and a pause on the row next to the target keeps it up', async ({page}) => {
        // A border as the shipped neo-theme-light and neo-theme-dark draw one, wider so an offset by it is plain
        await page.addStyleTag({content: '.neo-tooltip {border: 4px solid currentColor !important}'});
        await hoverUntilShown(page, SHARED, 'Edit item');

        const target = await page.locator(SHARED).boundingBox(),
              tip    = await page.locator(TOOLTIP).boundingBox(),
              x      = target.x + target.width / 2,
              top    = Math.ceil(target.y + target.height),
              misses = await page.evaluate(({bottom, top, x}) => {
                  let rows = [];

                  for (let y = top; y < bottom; y++) {
                      document.elementFromPoint(x, y + 0.5)?.closest('.neo-tooltip') || rows.push(y)
                  }

                  return rows
              }, {bottom: Math.floor(tip.y), top, x});

        expect(Math.floor(tip.y) - top, 'control: a gap of several rows').toBeGreaterThan(5);
        expect(misses, 'rows of the gap that hit the page instead').toEqual([]);

        // Longer than the 40ms retarget window, on the row a pointer from the target enters first
        await page.mouse.move(x, top - 4);
        await page.mouse.move(x, top + 0.5, {steps: 2});
        await page.waitForTimeout(150);
        await expect(page.locator(TOOLTIP), 'still up on the gap\'s first row').toHaveCount(1);

        await page.mouse.move(x, tip.y + tip.height / 2, {steps: 4});
        await page.waitForTimeout(150);
        await expect(page.locator(TOOLTIP), 'and inside the tooltip').toHaveCount(1)
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
    });

    test('a [data-neo-tooltip] element with child nodes keeps its text across internal moves and hides when moving to the top (#21605)', async ({page}) => {
        await hoverUntilShown(page, DATA_TEXT, 'Multi-window live example');

        const iconBox = await centerOf(page.locator(DATA_ICON)),
              pillBox = await page.locator(DATA_PILL).boundingBox();

        // Cross from child <span> to child <i> and onto the pill's own left padding: text and visibility hold
        await page.mouse.move(iconBox.x, iconBox.y, {steps: 4});
        await page.mouse.move(pillBox.x + 3, pillBox.y + pillBox.height / 2, {steps: 4});
        await page.waitForTimeout(150);
        await expect(page.locator(TOOLTIP)).toHaveText('Multi-window live example');

        // Move pointer to top of viewport: tooltip dismisses within 300ms instead of staying stuck
        await page.mouse.move(5, 5, {steps: 6});
        await expect(page.locator(TOOLTIP), 'leaving [data-neo-tooltip] for the top hides it promptly').toHaveCount(0, {timeout: 300})
    })
});
