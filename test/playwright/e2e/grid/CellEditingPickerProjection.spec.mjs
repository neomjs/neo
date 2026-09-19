import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary A picker editor keeps its session across projection loss, and its picker never floats over a vanished field.
 *
 * The picker floats on the document body, outside the row, so pooling can take the editor's cell away while the picker
 * is open. Losing the projection is neutral for the session: the same editor, with its draft, returns with the cell. The
 * picker has no cell to return to, so it must go when its field does.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing-pickers`. `c2` edits a date, `c3` a free-text combo.
 */
const GRID   = '#grid-cell-editing-pickers',
      PICKER = '.neo-picker-container',
      {EDITOR, INPUT, cell, editingIn, embodiment} = gridCellEditing(GRID),
      // A combo renders a second input for its typeahead hint
      FIELD_INPUT = `${INPUT}:not(.neo-typeahead-input)`;

let pageErrors;

const scroll = (page, axis, offset) => page.evaluate(({axis, grid, offset}) => {
    if (axis === 'vertical') {
        document.querySelector(`${grid} .neo-grid-view`).scrollTop = offset
    } else {
        document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = offset
    }
}, {axis, grid: GRID, offset});

/**
 * Opens each editor's picker over a draft the record does not hold. A date draft is picked, and the picker opened again.
 * @type {Object<String, {field: String, original: String, draft: String, open: Function}>}
 */
const EDITORS = {
    date: {
        field   : 'c2',
        original: '2024-12-10',
        draft   : '2024-12-15',
        open    : async page => {
            await page.locator(`${EDITOR} .neo-field-trigger`).click();
            await page.locator(`${PICKER} [id$="__2024-12-15"]`).click();
            await expect(page.locator(FIELD_INPUT)).toHaveValue('2024-12-15');
            await page.locator(`${EDITOR} .neo-field-trigger`).click()
        }
    },
    combo: {
        field   : 'c3',
        original: 'r3c3',
        draft   : 'be',
        open    : async page => {
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.type('be')
        }
    }
};

test.describe('Grid cell editing: a picker editor across projection loss', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing-pickers/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="c3"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    for (const [name, {field, original, draft, open}] of Object.entries(EDITORS)) {
        for (const [axis, away] of [['vertical', 4000], ['horizontal', 1500]]) {
            test(`${name}, ${axis}: the open picker goes with its field, and the same editor returns with the draft`, async ({page}) => {
                const recordId = await page.locator(`${GRID} .neo-grid-cell[data-field="c0"]`).getByText('r3c0', {exact: true})
                    .getAttribute('data-record-id');

                await cell(page, field, recordId).dblclick();
                await expect.poll(() => editingIn(page, field, recordId)).toBe(true);
                await open(page);
                await expect(page.locator(PICKER), 'the picker is open over the draft').toBeVisible();

                const editorId = await page.locator(EDITOR).getAttribute('id');

                await scroll(page, axis, away);
                await expect.poll(() => embodiment(page), {message: 'the cell left the pool'}).toEqual({count: 0, field: null, recordId: null});
                await expect(page.locator(PICKER), 'no picker floats over the vanished field').toHaveCount(0);

                await scroll(page, axis, 0);
                await expect.poll(() => embodiment(page), {message: 'the editor is reprojected'}).toEqual({count: 1, field, recordId});
                expect(await page.locator(EDITOR).getAttribute('id'), 'the same editor returned').toBe(editorId);
                await expect(page.locator(FIELD_INPUT), 'with its draft').toHaveValue(draft);

                await page.locator(FIELD_INPUT).focus();
                await expect.poll(async () => {
                    if (await page.locator(EDITOR).count() === 0) {
                        return true
                    }

                    await page.keyboard.press('Escape');
                    return false
                }, {message: 'Escape ended the edit'}).toBe(true);
                await expect(cell(page, field, recordId), 'the scrolls wrote nothing').toHaveText(original)
            })
        }
    }
});
