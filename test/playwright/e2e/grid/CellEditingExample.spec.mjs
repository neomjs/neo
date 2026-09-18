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
 * The internal record id behind a `githubId` — the example's key property, and the one column no arm edits.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, githubId) => page.locator(`${GRID} .neo-grid-cell[data-field="githubId"]`)
    .getByText(githubId, {exact: true}).getAttribute('data-record-id');

const focusIsOnView = page => page.evaluate(() => document.activeElement?.classList.contains('neo-grid-view') === true);

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

    // The component tier owns the three activation gestures on a text editor; this is the number editor, which exists
    // only here. `form.field.Number` extends `Text`, so it inherits `selectText()` — the arm proves the inheritance
    // reaches the plugin's call, not that the method exists
    test('number: activation selects the whole value, so typing replaces rather than appends', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'randomNumber', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomNumber', recordId)).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('90');

        // `selectionStart` is null on `input[type=number]` — the type has no selection API — so the contract is read
        // from the document's live selection, and then from the only thing that actually matters
        await expect.poll(() => page.evaluate(() => String(document.getSelection())),
            {message: 'activation selects the whole value'}).toBe('90');

        // Typing without a select-all of its own: appending to "90" would give 9025, replacing gives 25
        await page.keyboard.type('25');
        await expect(page.locator(INPUT)).toHaveValue('25');

        await page.keyboard.press('Enter');
        await expect(cell(page, 'randomNumber', recordId)).toHaveText('25')
    });

    test('country: the combo opens on the record\'s country', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);
        await expect(page.locator(COMBO_INPUT), 'the bound store resolved the record\'s code').toHaveValue('United States')
    });

    test('country: typing narrows only the editor\'s own list, so the next editor still finds its country', async ({page}) => {
        const recordId = await recordIdOf(page, 'tobiu'),
              nextId   = await recordIdOf(page, 'jsakalos');

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

        for (const [githubId, name] of [['tobiu', 'Germany'], ['rwaters', 'United States'], ['jsakalos', 'Slovakia']]) {
            await expect(cell(page, 'country', await recordIdOf(page, githubId))).toHaveText(name)
        }
    });

    test('country: a committed pick renders the chosen country, and every other Country cell keeps its name', async ({page}) => {
        const recordId = await recordIdOf(page, 'tobiu');

        await cell(page, 'country', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'country', recordId)).toBe(true);

        await retype(page, 'Slovak');
        await expect(page.locator(OPTIONS)).toHaveText(['Slovakia']);
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'country', recordId)).toHaveText('Slovakia');

        for (const [githubId, name] of [['rwaters', 'United States'], ['mrsunshine', 'Germany'], ['jsakalos', 'Slovakia']]) {
            await expect(cell(page, 'country', await recordIdOf(page, githubId))).toHaveText(name)
        }
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

    // A picker field floats its picker on the document body and owns it in the component tree, so focus moving between
    // editor and picker stays inside the edit, and only leaving both ends it.
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
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);
        await recordDefaults(page);

        await page.keyboard.press('Alt+ArrowDown');
        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => pickerHasFocus(page), {message: 'the date selector took focus'}).toBe(true);
        await expect(page.locator(EDITOR), 'the edit is still open').toHaveCount(1);
        expect(await page.evaluate(() => window.__prevented), 'the browser opens no picker of its own beside it')
            .toEqual({'Alt+ArrowDown': true});

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0);
        await expect.poll(() => editingIn(page, 'randomDate', recordId), {message: 'Escape closed the picker only'}).toBe(true)
    });

    // The Escape is the proof that no picker opened: it closes an open picker first and leaves the editor, and with
    // none it cancels the edit. Keys reach the App Worker in order, so it answers for the arrow before it
    test('date: plain ArrowDown stays the input\'s own — it steps the date and opens no picker', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);
        await recordDefaults(page);

        const before = await page.locator(INPUT).inputValue();

        await page.keyboard.press('ArrowDown');
        await expect(page.locator(INPUT), 'the browser stepped the focused segment').not.toHaveValue(before);
        expect(await page.evaluate(() => window.__prevented)).toEqual({'ArrowDown': false});

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR), 'Escape cancelled the edit: no picker was open').toHaveCount(0)
    });

    // Enter in a picker editor is the grid's commit, so the field must not open its picker for the edit the key ends.
    // A later gesture is the barrier for "no picker": events reach the App Worker in order, so once that gesture's
    // editor is up, whatever the Enter caused has landed.
    test('date: Enter commits, and shows no picker for the edit it ends', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters'),
              otherId  = await recordIdOf(page, 'tobiu');

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);

        await recordPickerInserts(page);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => focusIsOnView(page), {message: 'focus returned to the View'}).toBe(true);

        await cell(page, 'randomDate', otherId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', otherId)).toBe(true);
        expect(await pickerInserts(page), 'no picker node, not even for a moment').toBe(0)
    });

    test('date: Enter after a picker visit commits, shows no picker, and hands focus back to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 'rwaters');

        await cell(page, 'randomDate', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'randomDate', recordId)).toBe(true);

        await page.locator(`${EDITOR} .neo-field-trigger`).click();
        await page.locator(`${PICKER} [id$="__2024-12-12"]`).click();
        await expect(page.locator(INPUT)).toHaveValue('2024-12-12');

        await page.keyboard.press('Escape');
        await expect.poll(() => editingIn(page, 'randomDate', recordId), {message: 'back in the editor, picker closed'}).toBe(true);
        await expect(page.locator(PICKER)).toHaveCount(0);

        // The picker instance exists now, so a picker the key showed would mount at once
        await recordPickerInserts(page);
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => focusIsOnView(page), {message: 'focus stayed on the View'}).toBe(true);

        await cell(page, 'randomDate', recordId).dblclick();
        await expect(page.locator(INPUT), 'the picked day reached the record').toHaveValue('2024-12-12');
        expect(await pickerInserts(page), 'no picker node, not even for a moment').toBe(0)
    })
});
