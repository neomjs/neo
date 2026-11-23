import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/popover` opens its popover against the button that owns it: on the side its align value names,
 * and on the opposite side when that one has no room.
 *
 * A unit spec cannot see this: CSS anchor positioning places the popover in the browser, from the anchor name the
 * plugin gives the button and the align class it gives the popover.
 * Keyboard activation keeps the pointer off the button so the hover open cannot race the native click toggle.
 */

const GAP = 8;

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{button: Object, popover: Object}>} Both rects, once the popover is open
 */
async function rects(page, label='') {
    const popover = page.locator('.neo-popover');

    await expect.poll(() => popover.evaluate(node => node.matches(':popover-open')), {message: `${label} opens`}).toBe(true);

    return {
        button : await page.getByRole('button', {name: 'Click Me'}).boundingBox(),
        popover: await popover.boundingBox()
    }
}

/**
 * Opens the example at a viewport size and waits until its button is on the page
 * @param {import('@playwright/test').Page} page
 * @param {Number} width
 * @param {Number} height
 */
async function open(page, width, height) {
    await page.setViewportSize({width, height});
    await page.goto('/examples/popover/index.html');
    await expect(page.getByRole('button', {name: 'Click Me'})).toBeVisible()
}

/**
 * Picks an align value in the inspector, waits for the popover to close, and opens it from the keyboard.
 * @param {import('@playwright/test').Page} page
 * @param {String} align
 */
async function openWith(page, align) {
    await page.getByText(align, {exact: true}).click();
    await expect(page.locator('.neo-popover')).toHaveClass(new RegExp(`\\b${align}\\b`));
    await expect.poll(() => page.locator('.neo-popover').evaluate(node => node.matches(':popover-open'))).toBe(false);
    await page.getByRole('button', {name: 'Click Me'}).press('Space')
}

const centerX = box => box.x + box.width  / 2,
      centerY = box => box.y + box.height / 2,
      near    = (actual, expected) => Math.abs(actual - expected) <= 2;

test.describe('examples/popover: the popover opens against its button', () => {
    test('keyboard activation opens it centred above the button', async ({page}) => {
        await open(page, 1440, 900);
        await page.getByRole('button', {name: 'Click Me'}).press('Space');

        const {button, popover} = await rects(page);

        expect(near(popover.y + popover.height, button.y - GAP)).toBe(true);
        expect(near(centerX(popover), centerX(button))).toBe(true)
    });

    test('each align value opens it on its own side', async ({page}) => {
        await open(page, 1600, 900);

        const sides = {
            'bc-tc': ({button, popover}) => near(popover.y + popover.height, button.y - GAP) && near(centerX(popover), centerX(button)),
            'tc-bc': ({button, popover}) => near(popover.y, button.y + button.height + GAP) && near(centerX(popover), centerX(button)),
            'tl-tr': ({button, popover}) => near(popover.x, button.x + button.width + GAP) && near(popover.y, button.y),
            'tr-tl': ({button, popover}) => near(popover.x + popover.width, button.x - GAP) && near(popover.y, button.y),
            'cl-cr': ({button, popover}) => near(popover.x, button.x + button.width + GAP) && near(centerY(popover), centerY(button)),
            'cr-cl': ({button, popover}) => near(popover.x + popover.width, button.x - GAP) && near(centerY(popover), centerY(button))
        };

        for (const [align, onItsSide] of Object.entries(sides)) {
            await openWith(page, align);

            const measured = await rects(page, align);

            // the left sides have room at this width, so a pass is no flip
            expect(measured.button.x, align).toBeGreaterThan(measured.popover.width + GAP);
            expect(onItsSide(measured), `${align}: ${JSON.stringify(measured)}`).toBe(true)
        }
    });

    test('a side without room hands the popover to the opposite side', async ({page}) => {
        await open(page, 1024, 768);
        await openWith(page, 'cr-cl');

        const {button, popover} = await rects(page);

        // the precondition: the left side cannot hold it
        expect(button.x).toBeLessThan(popover.width + GAP);
        expect(near(popover.x, button.x + button.width + GAP)).toBe(true);
        expect(near(centerY(popover), centerY(button))).toBe(true)
    })
});
