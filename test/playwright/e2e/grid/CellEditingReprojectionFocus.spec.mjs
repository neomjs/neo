import {expect, test}               from '../../fixtures.mjs';
import gridCellEditing, {driveGrid} from '../utils/gridCellEditing.mjs';

/**
 * @summary Where focus goes when a suspended grid edit comes back, and what a click on another cell does first.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled` — 400 rows, so a
 * vertical scroll rebinds the edited row's slot to another record and suspends the edit: the editor leaves the DOM
 * with its draft, and focus falls to the View. Scrolling back reprojects it. The editor takes focus back only when
 * focus is still where the suspension left it; a newer gesture that moved focus keeps it.
 *
 * `manager.Focus` settles a leave one gap (50 ms) after its focusout, so the arms that move focus away wait until the
 * View no longer holds it before they scroll back: reprojecting inside that gap would measure the gap, not the rule.
 */
const GRID                                         = '#grid-cell-editing-pooled',
      {EDITOR, INPUT, cell, editingIn, embodiment} = gridCellEditing(GRID);

let pageErrors;

/**
 * Reads one property of an App Worker instance, found by the id of its DOM node.
 * @returns {Promise<*>}
 */
const workerValue = (page, selector, key) => page.evaluate(async ({key, selector}) => {
    const {id} = document.querySelector(selector);

    return (await Neo.worker.App.getConfigs({id, keys: [key]}))[0]
}, {key, selector});

const viewContainsFocus = page => workerValue(page, `${GRID} .neo-grid-view`, 'containsFocus');

const scrollVertically = (page, top) => page.evaluate(({grid, top}) => {
    document.querySelector(`${grid} .neo-grid-view`).scrollTop = top
}, {grid: GRID, top});

const recordIdOf = (page, text) => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText(text, {exact: true})
    .getAttribute('data-record-id');

/**
 * Edits record 3's `c3` with a draft, then scrolls its row out of the pool: the edit is suspended.
 * @returns {Promise<String>} the record id
 */
const editAndSuspend = async page => {
    const recordId = await recordIdOf(page, 'r3c3');

    await cell(page, 'c3', recordId).dblclick();
    await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('draft');

    await scrollVertically(page, 4000);
    await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

    return recordId
};

/**
 * Scrolls the suspended row back and waits until the App Worker holds the editor mounted again: its mount is where a
 * reprojection restores focus, and the second read is a round trip ordered after anything that mount sent.
 */
const reproject = async (page, recordId) => {
    await scrollVertically(page, 0);
    await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});
    await expect(page.locator(INPUT), 'the draft survived').toHaveValue('draft');
    await expect.poll(() => workerValue(page, EDITOR, 'mounted'), {message: 'the App Worker mounted the editor'}).toBe(true);
    await workerValue(page, EDITOR, 'mounted')
};

test.describe('Grid cell editing: focus on reprojection, and a click on another cell', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="c39"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('a reprojected editor takes focus back when focus stayed where the suspension left it', async ({page}) => {
        const recordId = await editAndSuspend(page);

        await expect.poll(() => viewContainsFocus(page), {message: 'the suspension left focus on the View'}).toBe(true);

        await reproject(page, recordId);
        await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'focus is back in the editor'}).toBe(true);

        await page.keyboard.type('!');
        await expect(page.locator(INPUT), 'typing continues the draft').toHaveValue('draft!');

        await page.keyboard.press('Escape');
        await expect(cell(page, 'c3', recordId), 'Escape discarded the draft').toHaveText('r3c3')
    });

    test('an editor a lock change held out takes focus back in the column\'s new body', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('draft');

        await driveGrid(page, 'lockEnd');
        await expect.poll(() => page.evaluate(({editor, grid}) => {
            const body = document.querySelector(editor)?.closest('.neo-grid-body');

            return body ? [...document.querySelectorAll(`${grid} .neo-grid-body`)].indexOf(body) : -1
        }, {editor: EDITOR, grid: GRID}), {message: 'the end body embodies the editor'}).toBe(2);
        await expect.poll(() => workerValue(page, EDITOR, 'mounted'), {message: 'the App Worker mounted the editor'}).toBe(true);

        await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'focus is back in the editor'}).toBe(true);
        await page.keyboard.type('!');
        await expect(page.locator(INPUT), 'typing continues the draft').toHaveValue('draft!');

        await page.keyboard.press('Escape');
        await expect(cell(page, 'c3', recordId), 'Escape discarded the draft').toHaveText('r3c3')
    });

    for (const [where, target] of [
        ['a plain element outside the app', '#grid-cell-editing-outside'],
        ['the other grid',                  '#grid-cell-editing .neo-grid-cell[data-field="score"]']
    ]) {
        test(`a reprojected editor leaves focus where a newer gesture moved it: ${where}`, async ({page}) => {
            const recordId = await editAndSuspend(page);

            await page.locator(target).first().click();
            await expect.poll(() => viewContainsFocus(page), {message: 'the View no longer holds focus'}).toBe(false);

            const focused = await page.evaluate(() => document.activeElement.id);

            await reproject(page, recordId);

            expect(await page.evaluate(() => document.activeElement.id), 'focus stayed where the gesture moved it').toBe(focused);

            // The edit is still open: its editor takes focus when asked, and Escape discards the draft
            await page.locator(INPUT).focus();
            await page.keyboard.press('Escape');
            await expect(cell(page, 'c3', recordId), 'Escape discarded the draft').toHaveText('r3c3')
        })
    }

    test('a reprojected editor leaves focus on the View when a click selected another of its cells meanwhile', async ({page}) => {
        const recordId = await editAndSuspend(page),
              other    = page.locator(`${GRID} .neo-grid-cell[data-field="c4"]`).first();

        // A click inside the View moves the selection, and DOM focus stays on the View all the while
        await other.click();
        await expect(other, 'the clicked cell is selected').toHaveClass(/neo-selected/);
        await expect.poll(() => viewContainsFocus(page), {message: 'focus is still on the View'}).toBe(true);

        await reproject(page, recordId);

        expect(await page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), GRID),
            'focus stayed on the View, for the selection the click made').toBe(true);

        await page.locator(INPUT).focus();
        await page.keyboard.press('Escape');
        await expect(cell(page, 'c3', recordId), 'Escape discarded the draft').toHaveText('r3c3')
    });

    test('under the grid\'s default RowModel, a reprojected editor leaves focus on the View when a click selected another row', async ({page}) => {
        await driveGrid(page, 'rowModel');

        const recordId = await editAndSuspend(page),
              other    = page.locator(`${GRID} .neo-grid-cell[data-field="c4"]`).nth(4),
              otherId  = await other.getAttribute('data-record-id');

        await other.click();
        await expect(page.locator(`${GRID} .neo-grid-row.neo-selected[data-record-id="${otherId}"]`).first(), 'the click selects the row')
            .toBeVisible();
        await expect.poll(() => viewContainsFocus(page), {message: 'focus is still on the View'}).toBe(true);

        await reproject(page, recordId);

        expect(await page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), GRID),
            'focus stayed on the View, for the row the click selected').toBe(true)
    });

    test('a reprojected editor leaves focus on the View when a click selected a cell and a second click deselected it', async ({page}) => {
        const recordId = await editAndSuspend(page),
              other    = page.locator(`${GRID} .neo-grid-cell[data-field="c4"]`).nth(4);

        // Two gestures that return the selection to the state the suspension left: a value comparison cannot see them
        await other.click();
        await expect(other, 'the first click selects the cell').toHaveClass(/neo-selected/);
        await other.click();
        await expect(other, 'the second click deselects it').not.toHaveClass(/neo-selected/);
        await expect.poll(() => viewContainsFocus(page), {message: 'focus is still on the View'}).toBe(true);

        await reproject(page, recordId);

        expect(await page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), GRID),
            'focus stayed on the View, for the gestures the clicks made').toBe(true)
    });

    test('a reprojected editor leaves focus on the View when focus went out and came back to another of its cells', async ({page}) => {
        const recordId = await editAndSuspend(page),
              other    = page.locator(`${GRID} .neo-grid-cell[data-field="c4"]`).first();

        await page.locator('#grid-cell-editing-outside').click();
        await expect.poll(() => viewContainsFocus(page), {message: 'the View no longer holds focus'}).toBe(false);

        await other.click();
        await expect(other, 'the clicked cell is selected').toHaveClass(/neo-selected/);
        await expect.poll(() => viewContainsFocus(page), {message: 'the View holds focus again'}).toBe(true);

        await reproject(page, recordId);

        expect(await page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), GRID),
            'focus stayed on the View, for the selection the click made').toBe(true)
    });

    for (const [change, away, back] of [['sort', 'sortDesc', 'sortAsc'], ['filter', 'filterOut', 'clearFilter']]) {
        test(`an editor a ${change} took out of the pool takes focus back, because the selection never moved`, async ({page}) => {
            const recordId = await recordIdOf(page, 'r3c3');

            await cell(page, 'c3', recordId).dblclick();
            await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.type('draft');

            // The App Worker runs the store op: no pointer and no focus change, so the only leave is the editor's own
            await driveGrid(page, away);
            await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

            await driveGrid(page, back);
            await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});

            await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'focus is back in the editor'}).toBe(true);
            await page.keyboard.type('!');
            await expect(page.locator(INPUT), 'typing continues the draft').toHaveValue('draft!');

            await page.keyboard.press('Escape');
            await expect(cell(page, 'c3', recordId), 'Escape discarded the draft').toHaveText('r3c3')
        })
    }

    test('a click on another cell while editing commits the draft first, then selects the clicked cell', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('draft');

        await driveGrid(page, 'logEvents');
        await cell(page, 'c4', recordId).click();

        await expect(cell(page, 'c3', recordId), 'the draft was written').toHaveText('draft');
        await expect(cell(page, 'c4', recordId), 'the clicked cell is selected').toHaveClass(/neo-selected/);
        await expect.poll(() => workerValue(page, GRID, 'driverEventLog'), {message: 'the commit, then the selection'})
            .toEqual(['commit:c3', 'select'])
    })
});
