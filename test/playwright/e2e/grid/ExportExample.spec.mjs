import {readFile}     from 'node:fs/promises';
import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/export`: 300 invoices that leave the grid as CSV. After a filter and a sort, the preview
 * pane's lines are the grid's rows in the grid's order; "Export CSV" downloads the same text; the amount arrives as a
 * plain number by its `exportRenderer`; the formula-like customer arrives escaped; both buttons work from the keyboard.
 */
const GRID = '.neo-examples-grid-export .neo-grid-container',
      PANE = '.neo-examples-grid-export .export-pane-text',
      URL  = '/examples/grid/export/index.html';

/**
 * @param {Object} page
 */
const ready = async page => {
    await page.goto(URL);
    await expect(page.locator(`${GRID} .neo-grid-cell[data-field='invoice']`).first()).toHaveText('INV-1001', {timeout: 30000})
};

/**
 * The rendered rows top to bottom: a buffered grid positions its rows, so the DOM order is not the visual order,
 * and a filter leaves pooled rows in the DOM with `display: none`
 * @param {Object} page
 * @returns {Promise<String[]>} The invoice numbers
 */
const gridInvoices = page => page.evaluate(grid => [...document.querySelectorAll(`${grid} .neo-grid-row`)]
    .filter(row => row.checkVisibility())
    .map(row => ({cell: row.querySelector("[data-field='invoice']"), top: row.getBoundingClientRect().top}))
    .filter(({cell}) => cell)
    .sort((a, b) => a.top - b.top)
    .map(({cell}) => cell.textContent), GRID);

/**
 * @param {Object} page
 * @returns {Promise<String[]>} The pane's lines
 */
const paneLines = async page => (await page.locator(PANE).textContent()).split('\n');

test.describe('Grid export example', () => {
    test.setTimeout(90000);

    test('after a filter and a sort, the pane holds the grid rows in the grid order', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        await page.getByRole('textbox', {name: 'Filter customer'}).fill('Acme');
        await page.locator(`${GRID} .neo-grid-header-button`, {hasText: 'Amount'}).click();
        await page.locator('.neo-button', {hasText: 'Show CSV'}).click();

        await expect(page.locator(PANE)).toContainText('Acme Corp');

        await expect.poll(async () => {
            // The pane shows 19 rows, the grid renders more; both start at the first row of the sort
            const invoices = await gridInvoices(page),
                  lines    = (await paneLines(page)).slice(1),
                  count    = Math.min(invoices.length, lines.length);

            return count > 0 && lines.slice(0, count).map(line => line.split(',')[0]).join() === invoices.slice(0, count).join()
        }).toBe(true);

        const lines   = await paneLines(page),
              amounts = lines.slice(1).map(line => Number(line.split(',')[3]));

        expect(lines[0]).toBe('Invoice,Customer,Date,Amount,Status');
        expect(lines.slice(1).every(line => line.split(',')[1] === 'Acme Corp')).toBe(true);
        expect(amounts, 'ascending by amount').toEqual([...amounts].sort((a, b) => a - b))
    });

    test('the amount exports as a plain number and the formula-like customer is escaped', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        await expect(page.locator(`${GRID} .neo-grid-cell[data-field='amount']`).first()).toHaveText('$6,143.50');
        await page.locator('.neo-button', {hasText: 'Show CSV'}).click();

        const lines = await paneLines(page);

        expect(lines).toHaveLength(20);
        expect(lines[1]).toBe('INV-1001,Birchwood Ltd,2026-01-04,6143.50,Open');
        expect(lines[4]).toBe("INV-1004,'=SUM(B2:B9) Holdings,2026-01-10,2235.01,Open")
    });

    test('the semicolon choice changes the pane and the download', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        await page.locator('.neo-button', {hasText: 'Show CSV'}).click();
        await page.getByText('Semicolon', {exact: true}).click();

        await expect.poll(async () => (await paneLines(page))[0]).toBe('Invoice;Customer;Date;Amount;Status');

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.locator('.neo-button', {hasText: 'Export CSV'}).click()
        ]);

        const text = await readFile(await download.path(), 'utf8');

        expect(download.suggestedFilename()).toBe('invoices.csv');
        expect(text.split('\r\n')[0]).toBe('Invoice;Customer;Date;Amount;Status');
        expect(text.split('\r\n')).toHaveLength(301)
    });

    test('both buttons work from the keyboard on a phone', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await ready(page);

        await page.locator('.neo-button', {hasText: 'Show CSV'}).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(PANE)).toBeVisible();
        await expect(page.locator('.neo-button', {hasText: 'Hide CSV'})).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            (async () => {
                await page.locator('.neo-button', {hasText: 'Export CSV'}).focus();
                await page.keyboard.press('Enter')
            })()
        ]);

        expect((await readFile(await download.path(), 'utf8')).split('\r\n')[0]).toBe('Invoice,Customer,Date,Amount,Status')
    });
});
