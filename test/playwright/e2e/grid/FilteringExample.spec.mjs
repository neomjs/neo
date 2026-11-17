import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/filtering`: 10,000 orders filtered from the grid's header row. Each typed filter narrows the
 * count to the orders the store's formula keeps, and the reset button restores every field and the count.
 *
 * The expected counts follow from `examples/grid/filtering/MainStore.mjs`: 2,000 orders per category, 2,016 amounts
 * of at least 4,000, 7,500 paid orders, 27 orders on 1 March 2026.
 */
const GRID  = '.neo-grid-container',
      URL   = '/examples/grid/filtering/index.html',
      COUNT = '.grid-filtering-count',
      ALL   = '10,000 of 10,000 orders';

/**
 * @param {Object} page
 * @param {String} text The column's header text
 * @returns {Object} The header button, which holds the column's filter field
 */
const header = (page, text) => page.locator(`${GRID} .neo-grid-header-button`, {hasText: text});

/**
 * @param {Object} page
 * @returns {Promise<Number>} The orders the filters keep, read from the count line
 */
const kept = async page => Number((await page.locator(COUNT).innerText()).split(' of ')[0].replace(/,/g, ''));

test.describe('Grid header filters example', () => {
    test.beforeEach(async ({page}) => {
        await page.goto(URL);
        await expect(page.locator(COUNT)).toHaveText(ALL, {timeout: 30000})
    });

    test('typing into the customer filter narrows rows and count', async ({page}) => {
        await header(page, 'Customer').locator('input').fill('Atlas');
        await expect.poll(() => kept(page)).toBeLessThan(10000);
        expect(await kept(page)).toBeGreaterThan(0);

        const customers = await page.locator(`${GRID} .neo-grid-cell[data-field='customer']`).allInnerTexts();

        expect(customers.length).toBeGreaterThan(0);
        customers.forEach(text => expect(text).toContain('Atlas'))
    });

    test('the amount filter shows its operator and keeps the orders at or above a typed amount', async ({page}) => {
        const amount = header(page, 'Amount'),
              input  = amount.locator('input');

        await expect(amount.locator('.neo-button')).toHaveText('>=');
        await input.fill('4000');
        await expect(page.locator(COUNT)).toHaveText('2,016 of 10,000 orders');

        // Leaving the field clamps its value to the field's range, which must hold 4,000
        await input.blur();
        await expect(input).toHaveValue('4000');
        await expect(page.locator(COUNT)).toHaveText('2,016 of 10,000 orders')
    });

    test('the amount and date filters fit their headers, each operator toggle as tall as its field', async ({page}) => {
        for (const text of ['Amount', 'Date']) {
            const button    = header(page, text),
                  container = button.locator('.neo-filter-numbercontainer'),
                  box       = await button.boundingBox(),
                  row       = await container.boundingBox(),
                  toggle    = await container.locator(':scope > .neo-button').boundingBox(),
                  field     = await container.locator(':scope > .neo-textfield').boundingBox();

            // The neo themes give a standalone button 48px; the toggle takes its field's row instead
            expect(toggle.height, `${text} toggle height`).toBeCloseTo(field.height, 0);
            expect(toggle.y, `${text} toggle top`).toBeCloseTo(field.y, 0);
            expect(row.y, `${text} filter top`).toBeGreaterThanOrEqual(box.y);
            expect(row.y + row.height, `${text} filter bottom`).toBeLessThanOrEqual(box.y + box.height)
        }
    });

    test('the category filter keeps one category', async ({page}) => {
        // The first input is the ComboBox's disabled typeahead hint
        await header(page, 'Category').locator('input[id$="__input"]').click();
        await page.getByRole('option', {name: 'Lighting', exact: true}).click();
        await expect(page.locator(COUNT)).toHaveText('2,000 of 10,000 orders')
    });

    test('the date filter keeps the orders of one day', async ({page}) => {
        await header(page, 'Date').locator('input').fill('2026-03-01');
        await expect(page.locator(COUNT)).toHaveText('27 of 10,000 orders')
    });

    test.describe('west of UTC', () => {
        test.use({timezoneId: 'America/Los_Angeles'});

        test('a typed day stays in its field and keeps that day\'s orders', async ({page}) => {
            const input = header(page, 'Date').locator('input');

            await input.fill('2026-03-01');
            await expect(page.locator(COUNT)).toHaveText('27 of 10,000 orders');
            await expect(page.locator(`${GRID} .neo-grid-cell[data-field='date']`).first()).toHaveText('Mar 1, 2026');
            // The header projects the Store's filter back into its field: a UTC midnight would read Feb 28 here
            expect(await input.inputValue()).toBe('2026-03-01')
        })
    });

    test('the status radios keep the paid orders, the open ones, or all', async ({page}) => {
        // The native radio is 0px wide (keyboard focus stays on it); its label takes the click
        const labels = header(page, 'Status').locator('.neo-checkbox-label');

        await labels.nth(0).click();
        await expect(page.locator(COUNT)).toHaveText('7,500 of 10,000 orders');
        await labels.nth(1).click();
        await expect(page.locator(COUNT)).toHaveText('2,500 of 10,000 orders');
        await labels.nth(2).click();
        await expect(page.locator(COUNT)).toHaveText(ALL)
    });

    test('filters combine, and reset clears every field and restores the count', async ({page}) => {
        const amount   = header(page, 'Amount').locator('input'),
              category = header(page, 'Category').locator('input[id$="__input"]'),
              customer = header(page, 'Customer').locator('input'),
              date     = header(page, 'Date').locator('input'),
              status   = header(page, 'Status');

        await category.click();
        await page.getByRole('option', {name: 'Lighting', exact: true}).click();
        await expect(page.locator(COUNT)).toHaveText('2,000 of 10,000 orders');

        await customer.fill('Atlas');
        await expect(page.locator(COUNT)).toHaveText('62 of 10,000 orders');
        await amount.fill('4000');
        await expect(page.locator(COUNT)).toHaveText('11 of 10,000 orders');
        // Every customer has open orders, so keeping the paid ones narrows again
        await status.locator('.neo-checkbox-label').nth(0).click();
        await expect(page.locator(COUNT)).toHaveText('7 of 10,000 orders');
        await date.fill('2026-08-12');
        await expect(page.locator(COUNT)).toHaveText('1 of 10,000 orders');

        await page.getByRole('button', {name: 'Reset filters'}).click();
        await expect(page.locator(COUNT)).toHaveText(ALL);
        await expect(category).toHaveValue('');
        await expect(customer).toHaveValue('');
        await expect(amount).toHaveValue('');
        await expect(date).toHaveValue('');
        await expect(status.locator('input[type="radio"]').nth(2)).toBeChecked()
    });
});
