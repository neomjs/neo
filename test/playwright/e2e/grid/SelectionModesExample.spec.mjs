import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/container`: renders at least 15 visible rows and 8 visible columns at 1440×900,
 * shows an active selection and names the model on first paint, navigates by keyboard across all six selection models,
 * and restores on Reset.
 */
const URL = '/examples/grid/container/index.html';

test.describe('Grid selection modes example', () => {
    test('renders >= 15 visible rows and >= 8 visible columns at 1440x900 with initial selection and active model named', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const selectedCell = page.locator('.neo-grid-cell[aria-selected="true"]');
        await expect(selectedCell).toHaveCount(1, {timeout: 30000});
        await expect(selectedCell).toHaveAttribute('data-field', 'mon');
        await expect(page.locator('.neo-workbench-stage-desc')).toContainText('Active model: Cell');

        const geometry = await page.evaluate(() => {
            const view    = document.querySelector('.neo-grid-view').getBoundingClientRect(),
                  headers = [...document.querySelectorAll('.neo-grid-header-button')].filter(el => {
                      const b = el.getBoundingClientRect();
                      return b.width > 20 && b.left >= view.left - 2 && b.right <= view.right + 2
                  }),
                  rows    = [...document.querySelectorAll('.neo-grid-row')].filter(el => {
                      const b = el.getBoundingClientRect();
                      return b.height > 10 && b.top >= view.top - 2 && b.bottom <= view.bottom + 4
                  });

            return {
                visibleColumns: headers.length,
                visibleRows   : rows.length
            }
        });

        expect(geometry.visibleColumns).toBeGreaterThanOrEqual(8);
        expect(geometry.visibleRows).toBeGreaterThanOrEqual(15)
    });

    test('switches all six selection models, exercises their arrow keys, and resets cleanly', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const desc         = page.locator('.neo-workbench-stage-desc'),
              selectedCell = page.locator('.neo-grid-cell[aria-selected="true"]'),
              selectedRow  = page.locator('.neo-grid-row.neo-selected'),
              selectedCol  = page.locator('.neo-grid-cell.selected-column-cell'),
              chooseRadio  = label => page.locator('.neo-radiofield').filter({hasText: new RegExp(`^${label}$`)}).click();

        await expect(selectedCell).toHaveAttribute('data-field', 'mon', {timeout: 30000});

        // 1. CellModel: ArrowRight -> tue, ArrowDown -> row 2, ArrowLeft -> mon, ArrowUp -> row 1
        await selectedCell.click(); // toggles off, click again to focus + select
        await page.locator('.neo-grid-row').nth(1).locator('.neo-grid-cell[data-field="mon"]').click();
        await expect(selectedCell).toHaveAttribute('data-field', 'mon');
        await page.keyboard.press('ArrowRight');
        await expect(selectedCell).toHaveAttribute('data-field', 'tue');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.neo-grid-row').nth(2).locator('.neo-grid-cell[data-field="tue"]')).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('.neo-grid-row').nth(2).locator('.neo-grid-cell[data-field="mon"]')).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('ArrowUp');
        await expect(page.locator('.neo-grid-row').nth(1).locator('.neo-grid-cell[data-field="mon"]')).toHaveAttribute('aria-selected', 'true');

        // 2. ColumnModel: uses .neo-selected on column cells; ArrowRight -> tue, ArrowLeft -> mon
        const pureColCell = page.locator('.neo-grid-cell.neo-selected');
        await chooseRadio('Column');
        await expect(desc).toContainText('Active model: Column');
        await expect(pureColCell.first()).toHaveAttribute('data-field', 'mon');
        await page.keyboard.press('ArrowRight');
        await expect(pureColCell.first()).toHaveAttribute('data-field', 'tue');
        await page.keyboard.press('ArrowLeft');
        await expect(pureColCell.first()).toHaveAttribute('data-field', 'mon');

        // 3. RowModel: ArrowDown -> row 2, ArrowUp -> row 1
        await chooseRadio('Row');
        await expect(desc).toContainText('Active model: Row');
        await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.neo-grid-row').nth(2)).toHaveClass(/neo-selected/);
        await page.keyboard.press('ArrowUp');
        await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);

        // 4. CellColumnModel: ArrowRight moves both cell and column; ArrowDown moves cell within column
        await chooseRadio('Cell & Column');
        await expect(desc).toContainText('Active model: Cell & Column');
        await expect(selectedCell).toHaveAttribute('data-field', 'mon');
        await expect(selectedCol.first()).toHaveAttribute('data-field', 'mon');
        await page.keyboard.press('ArrowRight');
        await expect(selectedCell).toHaveAttribute('data-field', 'tue');
        await expect(selectedCol.first()).toHaveAttribute('data-field', 'tue');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.neo-grid-row').nth(2).locator('.neo-grid-cell[data-field="tue"]')).toHaveAttribute('aria-selected', 'true');
        await expect(selectedCol.first()).toHaveAttribute('data-field', 'tue');

        // 5. CellRowModel: ArrowDown moves both cell and row; ArrowRight moves cell along selected row
        await chooseRadio('Cell & Row');
        await expect(desc).toContainText('Active model: Cell & Row');
        await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.neo-grid-row').nth(2)).toHaveClass(/neo-selected/);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.neo-grid-row').nth(2).locator('.neo-grid-cell[data-field="tue"]')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('.neo-grid-row').nth(2)).toHaveClass(/neo-selected/);

        // 6. CellColumnRowModel: ArrowRight + ArrowDown move cell, row, and column crosshair together
        await chooseRadio('Cell & Column & Row');
        await expect(desc).toContainText('Active model: Cell & Column & Row');
        await expect(selectedRow).toHaveCount(1);
        await expect(selectedCol.first()).toHaveAttribute('data-field', 'mon');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.neo-grid-row').nth(2)).toHaveClass(/neo-selected/);
        await expect(selectedCol.first()).toHaveAttribute('data-field', 'tue');
        await expect(page.locator('.neo-grid-row').nth(2).locator('.neo-grid-cell[data-field="tue"]')).toHaveAttribute('aria-selected', 'true');

        // 7. Reset restores Cell model and initial mon cell on row 1
        await page.locator('.neo-button-reset').click();
        await expect(desc).toContainText('Active model: Cell');
        await expect(selectedRow).toHaveCount(0);
        await expect(page.locator('.neo-grid-row').nth(1).locator('.neo-grid-cell[data-field="mon"]')).toHaveAttribute('aria-selected', 'true')
    })
});
