import {test, expect} from '@playwright/test';

/**
 * The grid header's text keeps its own size in a narrow window. `grid/header/Button.scss` counters
 * the narrow-window text size of `button/Base.scss` under the same `(max-width: 600px)` query, and
 * that counter-rule pointed at the default button label size (1rem) instead of the header's own
 * variable: a pane torn out into a 458 px popup grew its header text from 13 px to 16 px while the
 * same pane docked in a wide window did not. The fixture (`apps/grid-focus`) mounts two grids; the
 * short one is measured at a wide and at a narrow viewport, and the narrow arm first proves the
 * query is live, so a green here is a green on the rule and not on an unexercised branch.
 */
const FIXTURE = 'test/playwright/component/apps/grid-focus/index.html';

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{fontSize: String, variable: String}>}
 */
const readHeaderText = page => page.locator('#grid-focus-short .neo-grid-header-button .neo-button-text').first().evaluate(node => ({
    fontSize: getComputedStyle(node).fontSize,
    variable: getComputedStyle(node.closest('.neo-grid-header-button')).getPropertyValue('--grid-header-button-font-size').trim()
}));

test.describe('grid header text size in a narrow window', () => {
    test('the header text keeps its own font-size below 600 px of window width', async ({page}) => {
        await page.setViewportSize({height: 700, width: 1100});
        await page.goto(FIXTURE);
        await page.waitForSelector('#grid-focus-short .neo-grid-header-button .neo-button-text', {state: 'visible'});

        const wide = await readHeaderText(page);

        expect(wide.variable, 'the theme defines the header font-size variable').toMatch(/px$/);
        expect(wide.fontSize, 'wide window: the header text uses its variable').toBe(wide.variable);

        await page.setViewportSize({height: 700, width: 500});

        expect(await page.evaluate(() => matchMedia('(max-width: 600px)').matches), 'the narrow arm crosses the query').toBe(true);

        const narrow = await readHeaderText(page);

        expect(narrow.fontSize, `narrow window: the header text stays at its variable (wide ${wide.fontSize})`).toBe(wide.fontSize)
    })
});
