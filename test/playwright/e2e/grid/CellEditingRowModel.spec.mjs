import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary Cell editing under `RowModel`, the grid's default selection model, which selects rows and no cells.
 *
 * With no selected cell to name the target, the keyboard edits the selected row's record: in the column of the grid's
 * last edit, or the record's first editable column. The edit keeps its row selected, so wherever it ends the arrow
 * keys go on from the edited record and not from the top of the store.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled` (400 records, 40
 * editable columns of 150px, `c0` locked to the start and `c39` to the end). The fixture keeps its cell-selecting
 * model for every other witness; `gridDriver.mjs` swaps in `RowModel` per arm.
 */
const GRID                                  = '#grid-cell-editing-pooled',
      {EDITOR, cell, editingIn, embodiment} = gridCellEditing(GRID);

let calls = 0,
    pageErrors;

const recordIdOf = (page, text) => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText(text, {exact: true})
    .getAttribute('data-record-id');

/**
 * Runs one driver action in the App Worker. The counter makes each call a module URL of its own.
 * @returns {Promise<void>}
 */
const drive = async (page, action) => {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/grid-cell-editing/gridDriver.mjs?action=${action}&n=${++calls}`);

    expect(success, `the ${action} driver ran`).toBe(true)
};

/**
 * The record ids of the selected rows. Every body renders the row, so one selected record shows up once per body.
 * @returns {Promise<String[]>}
 */
const selectedRecords = page => page.evaluate(grid => [...new Set(
    [...document.querySelectorAll(`${grid} .neo-grid-row.neo-selected`)].map(row => row.dataset.recordId)
)], GRID);

const scrollHorizontally = (page, left) => page.evaluate(({grid, left}) => {
    document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = left
}, {grid: GRID, left});

/**
 * One round trip main thread → App Worker → main thread: whatever the worker owed the keys before it has landed.
 * @returns {Promise<void>}
 */
const workerSettled = page => page.evaluate(grid => Neo.worker.App.getConfigs({
    id  : document.querySelector(`${grid} .neo-grid-view`).id,
    keys: ['id']
}), GRID);

/**
 * Selects the record's row by a click on its `c3` cell.
 * @returns {Promise<void>}
 */
const selectRow = async (page, recordId) => {
    await cell(page, 'c3', recordId).click();
    await expect.poll(() => selectedRecords(page), {message: 'the click selected the row'}).toEqual([recordId])
};

test.describe('Grid cell editing under a row-selecting model', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="c39"]`, {state: 'visible', timeout: 30000});
        await drive(page, 'rowModel')
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    for (const key of ['Enter', 'F2']) {
        test(`${key} on a selected row edits the record's first editable cell`, async ({page}) => {
            const recordId = await recordIdOf(page, 'r3c3');

            await selectRow(page, recordId);
            await page.keyboard.press(key);

            await expect.poll(() => editingIn(page, 'c0', recordId), {message: 'the editor is in c0, focused'}).toBe(true);
            expect(await selectedRecords(page), 'the row stays selected').toEqual([recordId])
        })
    }

    test('with no row selected, Enter and F2 start nothing, and the next selected row edits', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        // A second click deselects the row and leaves focus on the View
        await selectRow(page, recordId);
        await cell(page, 'c3', recordId).click();
        await expect.poll(() => selectedRecords(page), {message: 'the second click deselected the row'}).toEqual([]);

        await page.keyboard.press('Enter');
        await page.keyboard.press('F2');
        await workerSettled(page);
        await expect(page.locator(EDITOR), 'no editor without a selected row').toHaveCount(0);

        await selectRow(page, recordId);
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'c0', recordId), {message: 'the keys still reach the plugin'}).toBe(true)
    });

    test('the keyboard goes on in the column of the last edit', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3'),
              nextId   = await recordIdOf(page, 'r4c3');

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => selectedRecords(page), {message: 'ArrowDown went on from the edited record'}).toEqual([nextId]);

        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'c3', nextId), {message: 'Enter edits c3 again, one record down'}).toBe(true)
    });

    for (const key of ['Enter', 'Escape']) {
        test(`an edit started by double-click and ended by ${key} leaves its row selected`, async ({page}) => {
            const recordId = await recordIdOf(page, 'r3c3');

            // The double-click's two clicks select the row and deselect it again
            await cell(page, 'c3', recordId).dblclick();
            await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
            await expect.poll(() => selectedRecords(page), {message: 'the edit selected its row'}).toEqual([recordId]);

            await page.keyboard.press(key);
            await expect(page.locator(EDITOR)).toHaveCount(0);
            await workerSettled(page);
            expect(await selectedRecords(page), `the row is still selected after ${key}`).toEqual([recordId])
        })
    }

    test('Tab into the next record selects its row, and Shift+Tab before the first cell ends on a selected row', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3'),
              nextId   = await recordIdOf(page, 'r4c3'),
              firstId  = await recordIdOf(page, 'r1c3');

        await cell(page, 'c39', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c39', recordId)).toBe(true);

        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'c0', nextId), {message: 'Tab wrapped into the next record'}).toBe(true);
        await expect.poll(() => selectedRecords(page), {message: 'the row selection followed the edit'}).toEqual([nextId]);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await cell(page, 'c0', firstId).dblclick();
        await expect.poll(() => editingIn(page, 'c0', firstId)).toBe(true);

        await page.keyboard.press('Shift+Tab');
        await expect(page.locator(EDITOR), 'before the first cell the edit ends').toHaveCount(0);
        await workerSettled(page);
        expect(await selectedRecords(page), 'on its own row').toEqual([firstId])
    });

    test('a last-edit column outside the mounted window is scrolled into sight and edited', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await scrollHorizontally(page, 4000);
        await expect(cell(page, 'c30', recordId)).toBeVisible();

        await cell(page, 'c30', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c30', recordId)).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await scrollHorizontally(page, 0);
        await expect(cell(page, 'c30', recordId), 'c30 left the mounted column window').toHaveCount(0);

        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'c30', recordId), {message: 'c30 came back into sight with the editor'}).toBe(true);
        await expect.poll(() => embodiment(page)).toEqual({count: 1, field: 'c30', recordId})
    })
});
