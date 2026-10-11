import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary Tab and Shift+Tab inside a grid cell editor: commit, then edit the next or previous editable cell.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`. `#grid-cell-editing` holds six records and every kind
 * of neighbour a Tab can meet — `code` locked to the start, `name` (required) and `city` in the center, `note` locked
 * to the end, `id` and `score` not editable — so one walk crosses all three bodies, skips two columns and wraps into
 * the next record. `#grid-cell-editing-pooled` has 40 editable columns of 150px: a walk to the right leaves the
 * viewport, and the grid has to scroll the edit into sight.
 *
 * The main thread cancels Tab's default inside an editor, so a Tab that finds no next cell must END the edit: the
 * arms at the two ends of the store assert that, and that focus is left on the View rather than lost.
 */
const SMALL  = '#grid-cell-editing',
      POOLED = '#grid-cell-editing-pooled',
      small  = gridCellEditing(SMALL),
      pooled = gridCellEditing(POOLED);

let pageErrors;

const recordIdOf = (page, name) => page.locator(`${SMALL} .neo-grid-cell[data-field="name"]`).getByText(name, {exact: true})
    .getAttribute('data-record-id');

const focusIsOnView = (page, grid) => page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), grid);

/**
 * Replaces the editor's whole text by keyboard, wherever activation left the caret.
 * @returns {Promise<void>}
 */
const retype = async (page, text) => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text)
};

test.describe('Grid cell editing: Tab and Shift+Tab', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${POOLED} .neo-grid-cell[data-field="c39"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('Tab commits and edits the next editable cell: across the locked bodies, past non-editable columns, into the next record', async ({page}) => {
        const {cell, editingIn} = small,
              second            = await recordIdOf(page, 'Name 2'),
              third             = await recordIdOf(page, 'Name 3');

        await cell(page, 'code', second).dblclick();
        await expect.poll(() => editingIn(page, 'code', second)).toBe(true);
        await retype(page, 'C-2 tabbed');

        // locked start -> center, over the non-editable `id`
        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'name', second)).toBe(true);
        await expect(cell(page, 'code', second), 'the draft was committed on the way').toHaveText('C-2 tabbed');
        await expect(cell(page, 'name', second), 'the selection follows the edit').toHaveClass(/neo-selected/);

        // over the non-editable `score`
        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'city', second)).toBe(true);

        // center -> locked end
        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'note', second)).toBe(true);

        // the row's last editable cell -> the next record's first
        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'code', third)).toBe(true);
        await expect(page.locator(small.EDITOR), 'one editor at a time').toHaveCount(1)
    });

    test('Shift+Tab walks back, from a record\'s first editable cell into the previous record\'s last', async ({page}) => {
        const {cell, editingIn} = small,
              second            = await recordIdOf(page, 'Name 2'),
              third             = await recordIdOf(page, 'Name 3');

        await cell(page, 'name', third).dblclick();
        await expect.poll(() => editingIn(page, 'name', third)).toBe(true);

        await page.keyboard.press('Shift+Tab');
        await expect.poll(() => editingIn(page, 'code', third)).toBe(true);

        await page.keyboard.press('Shift+Tab');
        await expect.poll(() => editingIn(page, 'note', second)).toBe(true)
    });

    test('an invalid draft keeps its editor: Tab does not move on from an emptied required field', async ({page}) => {
        const {cell, editingIn} = small,
              second            = await recordIdOf(page, 'Name 2');

        await cell(page, 'name', second).dblclick();
        await expect.poll(() => editingIn(page, 'name', second)).toBe(true);

        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await expect(page.locator(small.INPUT)).toHaveValue('');

        await page.keyboard.press('Tab');

        // Ordered round trip: a character typed after the Tab lands in the same editor only if the Tab moved nothing
        await page.keyboard.type('N');
        await expect(page.locator(small.INPUT)).toHaveValue('N');
        expect(await editingIn(page, 'name', second), 'still editing the required cell').toBe(true);

        await page.keyboard.press('Escape');
        await expect(cell(page, 'name', second)).toHaveText('Name 2')
    });

    test('past the last editable cell Tab ends the edit on the View, and so does Shift+Tab before the first', async ({page}) => {
        const {cell, editingIn} = small,
              first             = await recordIdOf(page, 'Name 1'),
              last              = await recordIdOf(page, 'Name 6');

        await cell(page, 'note', last).dblclick();
        await expect.poll(() => editingIn(page, 'note', last)).toBe(true);
        await retype(page, 'Note 6 tabbed');

        await page.keyboard.press('Tab');
        await expect(page.locator(small.EDITOR)).toHaveCount(0);
        await expect(cell(page, 'note', last), 'the draft was committed').toHaveText('Note 6 tabbed');
        await expect.poll(() => focusIsOnView(page, SMALL), {message: 'focus stayed in the grid'}).toBe(true);

        await cell(page, 'code', first).dblclick();
        await expect.poll(() => editingIn(page, 'code', first)).toBe(true);

        await page.keyboard.press('Shift+Tab');
        await expect(page.locator(small.EDITOR)).toHaveCount(0);
        await expect.poll(() => focusIsOnView(page, SMALL), {message: 'focus stayed in the grid'}).toBe(true)
    });

    test('Tab scrolls the edit into sight when the next cell lies outside the mounted column window', async ({page}) => {
        const {cell, editingIn} = pooled,
              recordId          = await page.locator(`${POOLED} .neo-grid-cell[data-field="c3"]`).getByText('r3c3', {exact: true})
                  .getAttribute('data-record-id');

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);

        for (let column = 4; column <= 15; column++) {
            await page.keyboard.press('Tab');
            await expect.poll(() => editingIn(page, `c${column}`, recordId), {message: `editing c${column}`}).toBe(true)
        }

        // Start-locked, center, end-locked: the center body's box is what it shows between the two others
        const inSight = await page.evaluate(({editor, grid}) => {
            const e = document.querySelector(editor).closest('.neo-grid-cell').getBoundingClientRect(),
                  b = document.querySelectorAll(`${grid} .neo-grid-body`)[1].getBoundingClientRect();

            // 3px: the App Worker knows the container's width, not its borders
            return e.left >= b.left - 3 && e.right <= b.right + 3
        }, {editor: pooled.EDITOR, grid: POOLED});

        expect(inSight, 'the edited cell is inside what the center body shows').toBe(true)
    })
});
