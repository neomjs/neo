import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/countries`: 217 economies from a JSON file inside the example, largest population first.
 * Loading asks no outside service for data; growth is tinted by the sign it shows; a missing figure shows a dash; the
 * Country header sorts by name; the arrow keys move the selection.
 */
const GRID = '.neo-grid-container',
      PAGE = '/examples/grid/countries/index.html';

/**
 * @param {Object} page
 */
const ready = async page => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(PAGE);
    await expect(page.locator(`${GRID} .neo-grid-cell[data-field='country']`).first()).toHaveText('India', {timeout: 30000})
};

/**
 * Every rendered cell of the growth columns as `{text, cls}`
 * @param {Object} page
 * @returns {Promise<Object[]>}
 */
const growthCells = page => page.locator(`${GRID} .neo-grid-cell[data-field$='rowth']`).evaluateAll(nodes =>
    nodes.map(node => ({cls: node.className, text: node.textContent.trim()})));

test.describe('Country statistics example', () => {
    test('fills all 217 rows with every outside host blocked', async ({context, page}) => {
        // Worker requests escape page events, so the proof is a route: anything not served by this site fails
        await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());

        await ready(page);

        await expect(page.locator(`${GRID} [aria-rowcount]`).first()).toHaveAttribute('aria-rowcount', '219');
        await expect(page.locator(`${GRID} .neo-grid-cell[data-field='country'] img`).first()).toHaveAttribute('src', /\/in\.svg$/)
    });

    test('growth is green when the shown figure rose and red when it fell', async ({page}) => {
        await ready(page);

        const cells = await growthCells(page);

        expect(cells.some(({text}) => text.startsWith('+'))).toBe(true);
        expect(cells.some(({text}) => text.startsWith('-'))).toBe(true);

        cells.forEach(({cls, text}) => {
            expect(cls.includes('countries-up'),   text).toBe(text.startsWith('+'));
            expect(cls.includes('countries-down'), text).toBe(text.startsWith('-'))
        })
    });

    test('the Country header sorts by name and a missing figure shows a dash', async ({page}) => {
        await ready(page);

        await page.locator('.neo-grid-header-button', {hasText: 'Country'}).first().click();
        await expect(page.locator(`${GRID} .neo-grid-cell[data-field='country']`).first()).toHaveText('Afghanistan');

        const dashes = page.locator(`${GRID} .neo-grid-cell`, {hasText: /^–$/});

        await expect(dashes.first()).toBeVisible();
        expect(await dashes.evaluateAll(nodes => nodes.every(node => node.classList.contains('countries-missing')))).toBe(true)
    });

    test('the arrow keys move the selection', async ({page}) => {
        await ready(page);

        await page.locator(`${GRID} .neo-grid-cell[data-field='population']`).first().click();
        await expect(page.locator(`${GRID} .neo-grid-row.neo-selected .neo-grid-cell[data-field='population']`).first()).toHaveText('1,463,865,525');

        await page.keyboard.press('ArrowDown');
        await expect(page.locator(`${GRID} .neo-grid-row.neo-selected .neo-grid-cell[data-field='population']`).first()).toHaveText('1,406,585,000')
    });
});
