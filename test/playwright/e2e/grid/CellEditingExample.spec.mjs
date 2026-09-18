import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary `examples/grid/cellEditing` — the app a reader opens to try cell editing — completes the edit loop by real
 * pointer and keyboard: its text and number editors activate, commit, discard, and are refused where they must be.
 *
 * The sibling `CellEditingPooling` spec proves one session survives pooling, on a synthetic text-only fixture. This
 * one owns the public example: number and date editors beside the text one, a non-editable column, and the toolbar
 * switch that disables the plugin. The country editor has no arm yet: it filters the store its column renders from.
 *
 * Two planes, as in the sibling. The DOM shows where the editor is embodied and where focus is. A commit destroys the
 * editor, so the text a cell shows afterwards is its Row rendering the record again: a draft that never reached the
 * record cannot appear there.
 *
 * An arm proving that NO editor appears cannot wait for one. It records every editor the DOM ever shows outside a
 * control cell, then edits that control cell with a later gesture: events reach the App Worker in order, so once the
 * control's editor is up, the refused gestures before it have been handled.
 *
 * The viewport is wide on purpose: at 1400px the configuration panel covers the last column.
 */
const GRID                                          = '.neo-grid-container',
      {EDITOR, INPUT, cell, editingIn, recordLeaks} = gridCellEditing(GRID);

let pageErrors;

/**
 * The internal record id behind a `githubId` — the example's key property, and the one column no arm edits.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, githubId) => page.locator(`${GRID} .neo-grid-cell[data-field="githubId"]`)
    .getByText(githubId, {exact: true}).getAttribute('data-record-id');

const focusIsOnView = page => page.evaluate(() => document.activeElement?.classList.contains('neo-grid-view') === true);

// A picker field's floating picker lives on the document body, outside the grid
const PICKER = '.neo-picker-container';

const pickerHasFocus = page => page.evaluate(picker => !!document.activeElement?.closest(picker), PICKER);

/**
 * Replaces the editor's whole text by keyboard, wherever activation left the caret.
 * @returns {Promise<void>}
 */
const retype = async (page, text) => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text)
};

test.describe('Grid cell editing on the public example', () => {
    test.use({viewport: {width: 1900, height: 1000}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/examples/grid/cellEditing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="githubId"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('text: a double-click edits, Enter commits and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'firstname', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'firstname', recordId)).toBe(true);
        await expect(page.locator(INPUT), 'the editor opens on the record value').toHaveValue('Rich');

        await retype(page, 'Richard');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'firstname', recordId)).toHaveText('Richard');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    for (const key of ['Enter', 'F2']) {
        test(`${key} on the selected cell starts the edit`, async ({page}) => {
            const recordId = await recordIdOf(page, 'rwaters');

            await cell(page, 'firstname', recordId).click();
            await expect(cell(page, 'firstname', recordId)).toHaveClass(/neo-selected/);

            await page.keyboard.press(key);
            await expect.poll(() => editingIn(page, 'firstname', recordId)).toBe(true)
        })
    }

    test('number: the spin button and ArrowUp step by 5 inside the session, Enter commits', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'randomNumber', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomNumber', recordId)).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('90');

        // A pointer on the editor's own trigger stays inside the session
        await page.locator(`${EDITOR} .neo-spin-button.neo-up`).click();
        await expect(page.locator(INPUT)).toHaveValue('95');
        await expect.poll(() => editingIn(page, 'randomNumber', recordId), {message: 'the trigger click kept the session'}).toBe(true);

        await page.keyboard.press('ArrowUp');
        await expect(page.locator(INPUT)).toHaveValue('100');

        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'randomNumber', recordId)).toHaveText('100');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    test('Escape discards the draft', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'firstname', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'firstname', recordId)).toBe(true);

        await retype(page, 'Draft');
        await expect(page.locator(INPUT)).toHaveValue('Draft');
        await page.keyboard.press('Escape');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'firstname', recordId)).toHaveText('Rich');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    test('a click on another cell commits the draft and selects that cell', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters'),
              otherId  = await recordIdOf(page, 'tobiu');

        await cell(page, 'firstname', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'firstname', recordId)).toBe(true);

        await retype(page, 'Richard');
        await cell(page, 'firstname', otherId).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'firstname', recordId)).toHaveText('Richard');
        await expect(cell(page, 'firstname', otherId)).toHaveClass(/neo-selected/)
    });

    test('a non-editable column refuses the double-click, Enter and F2', async ({page}) => {
        const recordId  = await recordIdOf(page, 'rwaters'),
              controlId = await recordIdOf(page, 'tobiu');

        await recordLeaks(page, 'firstname', controlId);

        await cell(page, 'githubId', recordId).dblclick();

        // The double-click toggled the selection twice; a third click leaves the cell selected for the keys
        await cell(page, 'githubId', recordId).click();
        await expect(cell(page, 'githubId', recordId)).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await page.keyboard.press('F2');

        // Positive control, and the ordering proof: the same gesture edits an editable cell
        await cell(page, 'firstname', controlId).dblclick();
        await expect.poll(() => editingIn(page, 'firstname', controlId)).toBe(true);

        expect(await page.evaluate(() => window.__leaks), 'githubId never showed an editor').toEqual([])
    });

    test('the toolbar switch disables the plugin, and enables it again', async ({page}) => {
        const recordId  = await recordIdOf(page, 'rwaters'),
              controlId = await recordIdOf(page, 'tobiu'),
              field     = page.locator('.neo-checkboxfield', {hasText: 'Disable CellEditing'}),
              // The native input is visually hidden behind the field's icon; the label is what a pointer reaches
              toggle    = field.locator('.neo-checkbox-value-label');

        await recordLeaks(page, 'firstname', controlId);

        await toggle.click();
        await expect(field.locator('input')).toBeChecked();

        await cell(page, 'firstname', recordId).dblclick();
        await cell(page, 'firstname', recordId).click();
        await expect(cell(page, 'firstname', recordId)).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await page.keyboard.press('F2');

        await toggle.click();
        await expect(field.locator('input')).not.toBeChecked();

        await cell(page, 'firstname', controlId).dblclick();
        await expect.poll(() => editingIn(page, 'firstname', controlId), {message: 're-enabled, the same gesture edits'}).toBe(true);

        expect(await page.evaluate(() => window.__leaks), 'no editor while the plugin was disabled').toEqual([])
    });

    // A picker field floats its picker on the document body. Editor and picker are one island: focus moving between
    // them stays inside the edit, and only leaving both ends it.
    test('date: the trigger opens the picker inside the session, and a picked day commits on the next click elsewhere', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters'),
              otherId  = await recordIdOf(page, 'tobiu'),
              before   = await cell(page, 'randomDate', recordId).textContent();

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => pickerHasFocus(page), {message: 'the date selector took focus'}).toBe(true);
        await expect(page.locator(EDITOR), 'focus entering the picker kept the session').toHaveCount(1);

        await page.locator(`${PICKER} [id$="__2024-12-12"]`).click();
        await expect(page.locator(INPUT)).toHaveValue('2024-12-12');

        await cell(page, 'firstname', otherId).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect(cell(page, 'randomDate', recordId), 'the cell renders another date').not.toHaveText(before);

        // The cell text is locale-formatted; the editor reads the record back in ISO form
        await cell(page, 'randomDate', recordId).dblclick();
        await expect(page.locator(INPUT), 'the picked day reached the record').toHaveValue('2024-12-12')
    });

    test('date: Escape closes the picker first, the next Escape cancels and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters'),
              before   = await cell(page, 'randomDate', recordId).textContent();

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await expect.poll(() => pickerHasFocus(page)).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect.poll(() => editingIn(page, 'randomDate', recordId), {message: 'the first Escape only closed the picker'}).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'randomDate', recordId)).toHaveText(before);

        // The editor last took focus from its picker, which is gone: the edit's first origin is what gets it back
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    })
});
