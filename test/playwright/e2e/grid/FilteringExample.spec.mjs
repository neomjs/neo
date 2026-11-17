import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/filtering`: 10,000 orders filtered from the grid's header row. Typing into the customer
 * filter narrows the rows and the count, and the reset button restores both.
 */
const GRID = '.neo-grid-container',
      URL  = '/examples/grid/filtering/index.html',
      ALL  = '10,000 of 10,000 orders';

/**
 * @param {Object} page
 * @returns {Promise<Number>} The orders the filters keep, read from the count line
 */
const kept = async page => Number((await page.locator('.grid-filtering-count').innerText()).split(' of ')[0].replace(/,/g, ''));

test.describe('Grid header filters example', () => {
    test('typing into the customer filter narrows rows and count, and reset restores both', async ({page}) => {
        await page.goto(URL);
        await expect(page.locator('.grid-filtering-count')).toHaveText(ALL, {timeout: 30000});

        const input = page.locator(`${GRID} .neo-grid-header-button`, {hasText: 'Customer'}).locator('input');

        await input.fill('Atlas');
        await expect.poll(() => kept(page)).toBeLessThan(10000);
        expect(await kept(page)).toBeGreaterThan(0);

        const customers = await page.locator(`${GRID} .neo-grid-cell[data-field='customer']`).allInnerTexts();

        expect(customers.length).toBeGreaterThan(0);
        customers.forEach(text => expect(text).toContain('Atlas'));

        await page.getByRole('button', {name: 'Reset filters'}).click();
        await expect(page.locator('.grid-filtering-count')).toHaveText(ALL);
        await expect(input).toHaveValue('')
    });
});
