import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/container`: renders at least 15 visible rows and 8 visible columns at 1440×900,
 * shows an active selection and names the model on first paint, navigates by keyboard across all six selection models,
 * restores on Reset, and maintains the three-grade opaque accent ladder across hover, companion selection, and active cells.
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
    });

    test('maintains three-grade opaque accent ladder across hover, companion selection, and active cells in all six models (#22500)', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const app         = await neuralLink.connectToApp('Neo.examples.grid.container'),
              desc        = page.locator('.neo-workbench-stage-desc'),
              chooseRadio = label => page.locator('.neo-radiofield').filter({hasText: new RegExp(`^${label}$`)}).click(),
              cellAt      = (rowIdx, field) => page.locator('.neo-grid-row').nth(rowIdx).locator(`.neo-grid-cell[data-field="${field}"]`),
              bgOf        = (rowIdx, field) => cellAt(rowIdx, field).evaluate(el => getComputedStyle(el).backgroundColor),
              isOpaque    = color => Boolean(color) && color !== 'transparent' && !/^rgba\(/.test(color) && !/\/\s*0?\.\d/.test(color);

        await expect(cellAt(1, 'mon')).toHaveAttribute('aria-selected', 'true', {timeout: 30000});

        const [viewportInfo] = [].concat(await app.queryComponent({className: 'Neo.examples.grid.container.MainContainer'}, ['id']) ?? []);
        expect(viewportInfo?.id).toBeTruthy();

        for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
            await app.setProperties(viewportInfo.id, {theme});
            await expect.poll(() => page.evaluate(
                t => document.querySelector('.neo-examples-grid-container')?.classList.contains(t) || document.body.classList.contains(t),
                theme
            )).toBe(true);

            await page.locator('.neo-button-reset').click();
            await expect(cellAt(1, 'mon')).toHaveAttribute('aria-selected', 'true');

            // Move pointer off the grid body first to read clean resting and active-cell fills
            await desc.hover();
            const restBg   = await bgOf(4, 'wed'),
                  activeBg = await bgOf(1, 'mon');

            expect(isOpaque(restBg)).toBe(true);
            expect(isOpaque(activeBg)).toBe(true);
            expect(activeBg).not.toBe(restBg);

            // 1. CellModel: hovering the row holding the selected cell paints Tier-1 hover on sibling cells only
            await cellAt(1, 'tue').hover();
            await expect.poll(() => bgOf(1, 'tue')).not.toBe(restBg);
            const hoverBg = await bgOf(1, 'tue');

            expect(isOpaque(hoverBg)).toBe(true);
            expect(hoverBg).not.toBe(activeBg);
            expect(await bgOf(1, 'mon')).toBe(activeBg);

            // 2. CellRowModel: companion selected-row cells (Tier 2) must differ from both hovered rows (Tier 1) and active cell (Tier 3)
            await chooseRadio('Cell & Row');
            await expect(desc).toContainText('Active model: Cell & Row');
            await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);
            await cellAt(3, 'tue').hover();
            await expect.poll(() => bgOf(3, 'tue')).toBe(hoverBg);
            const companionBg = await bgOf(1, 'tue');

            expect(isOpaque(companionBg)).toBe(true);
            expect(companionBg).not.toBe(hoverBg);
            expect(companionBg).not.toBe(activeBg);
            expect(new Set([restBg, hoverBg, companionBg, activeBg]).size).toBe(4);
            expect(await bgOf(1, 'mon')).toBe(activeBg);

            // 3. ColumnModel: hovering a row paints Tier-1 hover outside the selected column while keeping mon at Tier-3
            await chooseRadio('Column');
            await expect(desc).toContainText('Active model: Column');
            await cellAt(3, 'tue').hover();
            await expect.poll(() => bgOf(3, 'tue')).toBe(hoverBg);
            expect(await bgOf(3, 'mon')).toBe(activeBg);

            // 4. RowModel: selected row paints Tier-2 (background-selected) and ignores hover; unselected row paints Tier-1 hover
            await chooseRadio('Row');
            await expect(desc).toContainText('Active model: Row');
            await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);
            await cellAt(1, 'tue').hover();
            expect(await bgOf(1, 'tue')).toBe(companionBg);
            await cellAt(3, 'tue').hover();
            await expect.poll(() => bgOf(3, 'tue')).toBe(hoverBg);

            // 5. CellColumnModel: hovering an unselected row preserves .selected-column-cell Tier-2 companion fill
            await chooseRadio('Cell & Column');
            await expect(desc).toContainText('Active model: Cell & Column');
            await expect(cellAt(3, 'mon')).toHaveClass(/selected-column-cell/);
            await desc.hover();
            expect(await bgOf(3, 'mon')).toBe(companionBg);
            expect(await bgOf(1, 'mon')).toBe(activeBg);

            await cellAt(3, 'tue').hover();
            await expect.poll(() => bgOf(3, 'tue')).toBe(hoverBg);
            expect(await bgOf(3, 'mon')).toBe(companionBg);

            // 6. CellColumnRowModel: crosshair preserves both companion row and companion column under row hover
            await chooseRadio('Cell & Column & Row');
            await expect(desc).toContainText('Active model: Cell & Column & Row');
            await expect(page.locator('.neo-grid-row').nth(1)).toHaveClass(/neo-selected/);
            await expect(cellAt(3, 'mon')).toHaveClass(/selected-column-cell/);
            await cellAt(3, 'tue').hover();
            await expect.poll(() => bgOf(3, 'tue')).toBe(hoverBg);
            expect(await bgOf(3, 'mon')).toBe(companionBg);
            expect(await bgOf(1, 'tue')).toBe(companionBg);
            expect(await bgOf(1, 'mon')).toBe(activeBg)
        }
    })
});
