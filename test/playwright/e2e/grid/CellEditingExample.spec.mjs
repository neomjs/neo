import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary `examples/grid/cellEditing` — the app a reader opens to try cell editing — completes the edit loop by real
 * pointer and keyboard: its text and number editors activate, commit, discard, and are refused where they must be.
 *
 * The sibling `CellEditingPooling` spec proves one session survives pooling, on a synthetic text-only fixture. This
 * one owns the public example: number and date editors beside the text one, a non-editable column, and the toolbar
 * switch that disables the plugin. The Country editor is a combo over a store the grid's renderer reads too: its arms
 * prove one edit session neither filters nor destroys that store for the next reader.
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
      {EDITOR, INPUT, cell, editingIn, recordLeaks} = gridCellEditing(GRID),
      // A combo renders a disabled typeahead-hint input beside the real one
      COMBO_INPUT                                   = `${INPUT}:not(.neo-typeahead-input)`;

let pageErrors;

/**
 * The internal record id behind a `orderId` — the example's key property, and the one column no arm edits.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, orderId) => page.locator(`${GRID} .neo-grid-cell[data-field="orderId"]`)
    .getByText(orderId, {exact: true}).getAttribute('data-record-id');

const focusIsOnView = page => page.evaluate(() => document.activeElement?.classList.contains('neo-grid-view') === true);

/**
 * The selected cells as `field/recordId`, the fields of the selected columns, and the record ids of the selected rows.
 * @returns {Promise<{cells: String[], columns: String[], rows: String[]}>}
 */
const selection = page => page.evaluate(grid => ({
    cells  : [...document.querySelectorAll(`${grid} .neo-grid-cell.neo-selected`)].map(node => `${node.dataset.field}/${node.dataset.recordId}`),
    columns: [...new Set([...document.querySelectorAll(`${grid} .neo-grid-cell.selected-column-cell`)].map(node => node.dataset.field))],
    rows   : [...new Set([...document.querySelectorAll(`${grid} .neo-grid-row.neo-selected`)].map(node => node.dataset.recordId))]
}), GRID);

/**
 * Picks one of the example's selection models by its radio label: "Cell & Row" selects a cell together with its row,
 * "Cell & Column" with its column, "Cell & Column & Row" with both. The round trip through the App Worker follows the
 * radio's change event there, so the model is in place once it resolves.
 * @returns {Promise<void>}
 */
const selectModel = async (page, label) => {
    await page.getByText(label, {exact: true}).click();
    await page.evaluate(() => Neo.worker.App.getConfigs({id: document.querySelector('.neo-grid-view').id, keys: ['id']}))
};

// A picker field's floating picker lives on the document body, outside the grid
const PICKER  = '.neo-picker-container',
      OPTIONS = `${PICKER} .neo-list-item[role="option"]`;

const pickerHasFocus = page => page.evaluate(picker => !!document.activeElement?.closest(picker), PICKER);

/**
 * Counts into `window.__pickerInserts` every picker node the DOM inserts from now on, including one removed again in
 * the same task, which no locator would see.
 * @returns {Promise<void>}
 */
const recordPickerInserts = page => page.evaluate(picker => {
    window.__pickerInserts = 0;

    new MutationObserver(records => records.forEach(({addedNodes}) => addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches(picker) || node.querySelector(picker))) {
            window.__pickerInserts++
        }
    }))).observe(document.body, {childList: true, subtree: true})
}, PICKER);

const pickerInserts = page => page.evaluate(() => window.__pickerInserts);

/**
 * Replaces the editor's whole text by keyboard, independently of what activation left selected.
 *
 * Activation selects the value itself, so the select-all here compensates for no caret — it keeps these arms
 * insensitive to the activation contract, which has arms of its own.
 * @returns {Promise<void>}
 */
const retype = async (page, text) => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text)
};

/**
 * Ends a picker editor's session by Escape, however many presses its open picker takes first.
 * @returns {Promise<void>}
 */
const escapeEdit = page => expect.poll(async () => {
    if (await page.locator(EDITOR).count() === 0) {
        return true
    }

    await page.keyboard.press('Escape');
    return false
}, {message: 'Escape ended the edit'}).toBe(true);

test.describe('Grid cell editing on the public example', () => {
    test.use({viewport: {width: 1900, height: 1000}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/examples/grid/cellEditing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="orderId"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('text: a double-click edits, Enter commits and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);
        await expect(page.locator(INPUT), 'the editor opens on the record value').toHaveValue('Monitor arm');

        await retype(page, 'Dual monitor arm');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'item', recordId)).toHaveText('Dual monitor arm');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    for (const key of ['Enter', 'F2']) {
        test(`${key} on the selected cell starts the edit`, async ({page}) => {
            const recordId = await recordIdOf(page, 'SO-1002');

            await cell(page, 'item', recordId).click();
            await expect(cell(page, 'item', recordId)).toHaveClass(/neo-selected/);

            await page.keyboard.press(key);
            await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true)
        })
    }

    test('number: the spin button and ArrowUp step inside the session, Enter commits', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'quantity', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recordId)).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('8');

        // A pointer on the editor's own trigger stays inside the session
        await page.locator(`${EDITOR} .neo-spin-button.neo-up`).click();
        await expect(page.locator(INPUT)).toHaveValue('9');
        await expect.poll(() => editingIn(page, 'quantity', recordId), {message: 'the trigger click kept the session'}).toBe(true);

        await page.keyboard.press('ArrowUp');
        await expect(page.locator(INPUT)).toHaveValue('10');

        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'quantity', recordId)).toHaveText('10');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    test('number: a quantity above 50 is refused, the editor says why, and the record keeps its quantity', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'quantity', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recordId)).toBe(true);

        await retype(page, '60');
        await page.keyboard.press('Enter');

        await expect(page.locator(`${EDITOR} .neo-textfield-error`), 'the refusal is shown').toHaveText('At most 50');
        await expect(page.locator(INPUT), 'the editor stays open on the draft').toHaveValue('60');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'quantity', recordId), 'nothing was written').toHaveText('8')
    });

    test('the calculated line total follows a committed quantity', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        // 8 monitor arms at $74.50
        await expect(cell(page, 'total', recordId)).toHaveText('$596.00');

        await cell(page, 'quantity', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recordId)).toBe(true);
        await retype(page, '10');
        await page.keyboard.press('Enter');

        await expect(cell(page, 'total', recordId)).toHaveText('$745.00')
    });

    // The component tier owns the three activation gestures on a text editor; this is the number editor, which exists
    // only here. `form.field.Number` extends `Text`, so it inherits `selectText()` — the arm proves the inheritance
    // reaches the plugin's call, not that the method exists
    test('number: activation selects the whole value, so typing replaces rather than appends', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'quantity', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recordId)).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('8');

        // `selectionStart` is null on `input[type=number]` — the type has no selection API — so the contract is read
        // from the document's live selection, and then from the only thing that actually matters
        await expect.poll(() => page.evaluate(() => String(document.getSelection())),
            {message: 'activation selects the whole value'}).toBe('8');

        // Typing without a select-all of its own: appending to "8" would give 825, replacing gives 25
        await page.keyboard.type('25');
        await expect(page.locator(INPUT)).toHaveValue('25');

        await page.keyboard.press('Enter');
        await expect(cell(page, 'quantity', recordId)).toHaveText('25')
    });

    test('country: the combo opens on the record\'s country', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);
        await expect(page.locator(COMBO_INPUT), 'the bound store resolved the record\'s code').toHaveValue('United States')
    });

    test('country: typing narrows only the editor\'s own list, so the next editor still finds its country', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001'),
              nextId   = await recordIdOf(page, 'SO-1005');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);

        // Germany alone matches: the same filter on the grid's store would hide Slovakia from every other reader
        await retype(page, 'Germ');
        await expect(page.locator(OPTIONS)).toHaveText(['Germany']);
        await escapeEdit(page);

        await cell(page, 'country', nextId).dblclick();
        await expect.poll(() => editingIn(page, 'country', nextId)).toBe(true);
        await expect(page.locator(COMBO_INPUT), 'the grid\'s store still holds Slovakia').toHaveValue('Slovakia');
        await escapeEdit(page);

        for (const [orderId, name] of [['SO-1001', 'Germany'], ['SO-1002', 'United States'], ['SO-1005', 'Slovakia']]) {
            await expect(cell(page, 'country', await recordIdOf(page, orderId))).toHaveText(name)
        }
    });

    test('country: a committed pick renders the chosen country, and every other Country cell keeps its name', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);

        await retype(page, 'Slovak');
        await expect(page.locator(OPTIONS)).toHaveText(['Slovakia']);
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'country', recordId)).toHaveText('Slovakia');

        for (const [orderId, name] of [['SO-1002', 'United States'], ['SO-1009', 'Germany'], ['SO-1005', 'Slovakia']]) {
            await expect(cell(page, 'country', await recordIdOf(page, orderId))).toHaveText(name)
        }
    });

    test('country: Enter on text that matches no country keeps the editor and says why, and the record keeps its country', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);

        await retype(page, 'Zzzzz');
        await page.keyboard.press('Enter');

        await expect(page.locator(`${EDITOR} .neo-textfield-error`), 'the refusal is shown').toHaveText('No match: Zzzzz');
        await expect(page.locator(COMBO_INPUT), 'the editor stays open on the draft').toHaveValue('Zzzzz');

        await escapeEdit(page);
        await expect(cell(page, 'country', recordId), 'nothing was written').toHaveText('Germany')
    });

    test('country: leaving text that matches no country returns to the record\'s country, and the commit writes nothing', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001'),
              otherId  = await recordIdOf(page, 'SO-1002');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);

        await retype(page, 'Zzzzz');
        await cell(page, 'item', otherId).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'country', recordId), 'the record keeps its country').toHaveText('Germany')
    });

    test('Escape discards the draft', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);

        await retype(page, 'Draft');
        await expect(page.locator(INPUT)).toHaveValue('Draft');
        await page.keyboard.press('Escape');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'item', recordId)).toHaveText('Monitor arm');
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    test('a commit into the sorted column moves no row, and the next sort puts it where it belongs', async ({page}) => {
        /**
         * The rendered Item cells from top to bottom, as the user sees them: pooled rows are placed by position, so DOM
         * order says nothing. Items repeat across the 40 orders, so each cell carries its record id.
         * @returns {Promise<{id: String, text: String}[]>}
         */
        const rows = () => page.evaluate(grid => [...document.querySelectorAll(`${grid} .neo-grid-cell[data-field="item"]`)]
            .map(node => ({id: node.dataset.recordId, text: node.textContent, top: node.getBoundingClientRect().top}))
            .sort((a, b) => a.top - b.top)
            .map(({id, text}) => ({id, text})), GRID);

        const texts  = async () => (await rows()).map(row => row.text),
              header = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: /^Item$/});

        await header.click();
        await expect.poll(async () => {
            const shown = await texts();
            return shown.length > 3 && shown.join('|') === [...shown].sort().join('|')
        }, {message: 'the header click sorts ascending'}).toBe(true);

        // The first row's new value belongs at the other end of the 40 orders
        const before   = await rows(),
              recordId = before[0].id;

        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);
        await retype(page, 'Zzz');

        await page.keyboard.press('Tab');
        await expect.poll(() => editingIn(page, 'quantity', recordId), {message: 'Tab goes on in the same row'}).toBe(true);
        expect(await texts(), 'the committed row kept its place').toEqual(['Zzz', ...before.slice(1).map(row => row.text)]);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        // Descending, then ascending again: the sorter applies when it changes, and Zzz sorts after all 40
        await header.click();
        await header.click();
        await expect.poll(async () => (await texts())[0], {message: 'the next ascending sort moved the row away'})
            .toBe(before[1].text);
        expect((await rows()).slice(0, 5).map(row => row.id), 'Zzz left the top').not.toContain(recordId)
    });

    test('a click on another cell commits the draft and selects that cell', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002'),
              otherId  = await recordIdOf(page, 'SO-1001');

        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);

        await retype(page, 'Dual monitor arm');
        await cell(page, 'item', otherId).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'item', recordId)).toHaveText('Dual monitor arm');
        await expect(cell(page, 'item', otherId)).toHaveClass(/neo-selected/)
    });

    test('a non-editable column refuses the double-click, Enter and F2', async ({page}) => {
        const recordId  = await recordIdOf(page, 'SO-1002'),
              controlId = await recordIdOf(page, 'SO-1001');

        await recordLeaks(page, 'item', controlId);

        await cell(page, 'orderId', recordId).dblclick();

        // The double-click toggled the selection twice; a third click leaves the cell selected for the keys
        await cell(page, 'orderId', recordId).click();
        await expect(cell(page, 'orderId', recordId)).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await page.keyboard.press('F2');

        // Positive control, and the ordering proof: the same gesture edits an editable cell
        await cell(page, 'item', controlId).dblclick();
        await expect.poll(() => editingIn(page, 'item', controlId)).toBe(true);

        expect(await page.evaluate(() => window.__leaks), 'orderId never showed an editor').toEqual([])
    });

    test('the toolbar switch disables the plugin, and enables it again', async ({page}) => {
        const recordId  = await recordIdOf(page, 'SO-1002'),
              controlId = await recordIdOf(page, 'SO-1001'),
              field     = page.locator('.neo-checkboxfield', {hasText: 'Disable CellEditing'}),
              // The native input is visually hidden behind the field's icon; the label is what a pointer reaches
              toggle    = field.locator('.neo-checkbox-value-label');

        await recordLeaks(page, 'item', controlId);

        await toggle.click();
        await expect(field.locator('input')).toBeChecked();

        await cell(page, 'item', recordId).dblclick();
        await cell(page, 'item', recordId).click();
        await expect(cell(page, 'item', recordId)).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await page.keyboard.press('F2');

        await toggle.click();
        await expect(field.locator('input')).not.toBeChecked();

        await cell(page, 'item', controlId).dblclick();
        await expect.poll(() => editingIn(page, 'item', controlId), {message: 're-enabled, the same gesture edits'}).toBe(true);

        expect(await page.evaluate(() => window.__leaks), 'no editor while the plugin was disabled').toEqual([])
    });

    // A picker field floats its picker on the document body and owns it in the component tree, so focus moving between
    // editor and picker stays inside the edit, and only leaving both ends it.
    test('date: the trigger opens the picker inside the session, and a picked day commits on the next click elsewhere', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002'),
              otherId  = await recordIdOf(page, 'SO-1001'),
              before   = await cell(page, 'delivery', recordId).textContent();

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => pickerHasFocus(page), {message: 'the date selector took focus'}).toBe(true);
        await expect(page.locator(EDITOR), 'focus entering the picker kept the session').toHaveCount(1);

        await page.locator(`${PICKER} [id$="__2026-12-14"]`).click();
        await expect(page.locator(INPUT)).toHaveValue('2026-12-14');

        await cell(page, 'item', otherId).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect(cell(page, 'delivery', recordId), 'the cell renders another date').not.toHaveText(before);

        // The cell text is locale-formatted; the editor reads the record back in ISO form
        await cell(page, 'delivery', recordId).dblclick();
        await expect(page.locator(INPUT), 'the picked day reached the record').toHaveValue('2026-12-14')
    });

    test('date: Escape closes the picker first, the next Escape cancels and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002'),
              before   = await cell(page, 'delivery', recordId).textContent();

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await expect.poll(() => pickerHasFocus(page)).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect.poll(() => editingIn(page, 'delivery', recordId), {message: 'the first Escape only closed the picker'}).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'delivery', recordId)).toHaveText(before);

        // Focus visiting the picker never left the editor, so it still hands focus back to where the edit took it from
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true)
    });

    // Enter is the grid's commit and the plain arrows are the date input's own, so the picker has a key of its own.
    // `window` hears a keydown last, after the engine's listener: that is where a cancelled default shows
    const recordDefaults = page => page.evaluate(() => {
        window.__prevented = {};
        window.addEventListener('keydown', event => {
            if (event.key !== 'Alt') {
                window.__prevented[`${event.altKey ? 'Alt+' : ''}${event.key}`] = event.defaultPrevented
            }
        })
    });

    test('date: Alt+ArrowDown opens the picker inside the session and hands it focus', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);
        await recordDefaults(page);

        await page.keyboard.press('Alt+ArrowDown');
        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => pickerHasFocus(page), {message: 'the date selector took focus'}).toBe(true);
        await expect(page.locator(EDITOR), 'the edit is still open').toHaveCount(1);
        expect(await page.evaluate(() => window.__prevented), 'the browser opens no picker of its own beside it')
            .toEqual({'Alt+ArrowDown': true});

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect.poll(() => editingIn(page, 'delivery', recordId), {message: 'Escape closed the picker only'}).toBe(true)
    });

    /**
     * Whether the App Worker holds a picker for a field. The worker handles messages in order and creates a picker
     * inside the key handler that shows it, so this answers for every key sent before it. An unknown id's reply never
     * settles, so a second request to the field itself decides the race.
     * @returns {Promise<Boolean>}
     */
    const pickerExists = (page, fieldId) => page.evaluate(id => Promise.race([
        Neo.worker.App.getConfigs({id: `${id}__picker`, keys: ['id']}).then(reply => reply !== false),
        Neo.worker.App.getConfigs({id, keys: ['id']}).then(() => false)
    ]), fieldId);

    test('date: plain ArrowDown stays the input\'s own — its native default is kept, and it opens no picker', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);
        await recordDefaults(page);

        const fieldId = await page.locator(EDITOR).getAttribute('id');

        // What the browser does with the key is its own business, and differs by platform; that it may is ours
        await page.keyboard.press('ArrowDown');
        expect(await pickerExists(page, fieldId), 'a fresh editor has no picker, and the arrow built none').toBe(false);
        expect(await page.evaluate(() => window.__prevented)).toEqual({'ArrowDown': false});

        // The instrument can see one
        await page.keyboard.press('Alt+ArrowDown');
        expect(await pickerExists(page, fieldId)).toBe(true)
    });

    // Enter in a picker editor is the grid's commit, so the field must not open its picker for the edit the key ends.
    // A later gesture is the barrier for "no picker": events reach the App Worker in order, so once that gesture's
    // editor is up, whatever the Enter caused has landed.
    test('date: Enter commits, and shows no picker for the edit it ends', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002'),
              otherId  = await recordIdOf(page, 'SO-1001');

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);

        await recordPickerInserts(page);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true);

        await cell(page, 'delivery', otherId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', otherId)).toBe(true);
        expect(await pickerInserts(page), 'no picker node, not even for a moment').toBe(0)
    });

    test('date: a cleared editor commits no date, and the cell renders empty (#20660)', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);

        await page.locator(INPUT).fill('');
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await expect(cell(page, 'delivery', recordId), 'no date, not 1970-01-01').toHaveText('')
    });

    test('date: Enter after a picker visit commits, shows no picker, and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1002');

        await cell(page, 'delivery', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'delivery', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await page.locator(`${PICKER} [id$="__2026-12-14"]`).click();
        await expect(page.locator(INPUT)).toHaveValue('2026-12-14');

        await page.keyboard.press('Escape');
        await expect.poll(() => editingIn(page, 'delivery', recordId), {message: 'back in the editor, picker closed'}).toBe(true);
        await expect(page.locator(PICKER)).toHaveCount(0);

        // The picker instance exists now, so a picker the key showed would mount at once
        await recordPickerInserts(page);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => focusIsOnView(page), {message: 'focus stayed on the View'}).toBe(true);

        await cell(page, 'delivery', recordId).dblclick();
        await expect(page.locator(INPUT), 'the picked day reached the record').toHaveValue('2026-12-14');
        expect(await pickerInserts(page), 'no picker node, not even for a moment').toBe(0)
    });

    test('Cell & Row: Tab into the next record selects its cell and its row', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001');

        await selectModel(page, 'Cell & Row');

        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);

        // item → quantity → delivery → country → the next record's item
        for (const field of ['quantity', 'delivery', 'country']) {
            await page.keyboard.press('Tab');
            await expect.poll(() => editingIn(page, field, recordId), {message: `Tab reached ${field}`}).toBe(true)
        }

        await page.keyboard.press('Tab');
        await expect.poll(async () => {
            const [selected] = (await selection(page)).cells;

            return !!selected?.startsWith('item/') && selected !== `item/${recordId}`
        }, {message: 'Tab selected the next record\'s item'}).toBe(true);

        const {cells, rows} = await selection(page),
              [, nextId]    = cells[0].split('/');

        expect(nextId, 'Tab left the first record').not.toBe(recordId);
        expect(cells, 'one selected cell, the edited one').toEqual([`item/${nextId}`]);
        expect(rows, 'and its row is the selected row').toEqual([nextId]);
        expect(await editingIn(page, 'item', nextId)).toBe(true)
    });

    test('Cell & Row: a double-click edit ended by Escape keeps its row, and Enter edits it again', async ({page}) => {
        const recordId = await recordIdOf(page, 'SO-1001');

        await selectModel(page, 'Cell & Row');

        // The double-click's two clicks select the cell and its row, and deselect both again
        await cell(page, 'item', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(async () => (await selection(page)).rows, {message: 'the edited row is the anchor'}).toEqual([recordId]);

        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'item', recordId), {message: 'Enter edits the row in the column of the last edit'})
            .toBe(true)
    });

    for (const model of ['Cell & Column', 'Cell & Column & Row']) {
        test(`${model}: the selected column follows the edit through Tab, and the arrows keep cell and column together`, async ({page}) => {
            const recordId = await recordIdOf(page, 'SO-1001');

            await selectModel(page, model);

            await cell(page, 'item', recordId).click();
            await expect.poll(async () => (await selection(page)).columns, {message: 'a click selects the cell\'s column'})
                .toEqual(['item']);

            await page.keyboard.press('Enter');
            await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);

            await page.keyboard.press('Tab');
            await expect.poll(() => editingIn(page, 'quantity', recordId), {message: 'Tab edits the next cell'}).toBe(true);
            await expect.poll(async () => (await selection(page)).columns, {message: 'and its column is the selected one'})
                .toEqual(['quantity']);

            await page.keyboard.press('Escape');
            await expect(page.locator(EDITOR)).toHaveCount(0);

            await page.keyboard.press('ArrowRight');
            await expect.poll(() => selection(page), {message: 'ArrowRight moves the cell and the column together'})
                .toMatchObject({cells: [`unitPrice/${recordId}`], columns: ['unitPrice']})
        });

        test(`${model}: a double-click edit ended by Enter leaves its column selected`, async ({page}) => {
            const recordId = await recordIdOf(page, 'SO-1001');

            await selectModel(page, model);

            // The double-click's two clicks select the cell and its column, and deselect both again
            await cell(page, 'item', recordId).dblclick();
            await expect.poll(() => editingIn(page, 'item', recordId)).toBe(true);
            await expect.poll(async () => (await selection(page)).columns, {message: 'the edit selected its column'})
                .toEqual(['item']);

            await page.keyboard.press('Enter');
            await expect(page.locator(EDITOR)).toHaveCount(0);
            await expect.poll(() => selection(page), {message: 'the commit leaves cell and column selected'})
                .toMatchObject({cells: [`item/${recordId}`], columns: ['item']})
        })
    }
});
