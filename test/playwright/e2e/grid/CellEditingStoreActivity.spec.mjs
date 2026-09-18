import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary An open grid edit under store activity. The session is keyed by record id and `dataField`, so a store
 * update, sort, filter or removal moves or ends its projection without committing, cancelling or dropping the draft.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled`, whose 400 rows let a
 * sort or a filter take the edited record out of the row pool. The fixture's `storeDriver.mjs` runs one store
 * operation per call inside the App Worker, where no pointer or focus change is involved.
 *
 * Every arm edits record 3's `c3` and types a draft first, and waits on the DOM, never on time: a row leaving or
 * returning, a sibling cell's text.
 */
const GRID                                                      = '#grid-cell-editing-pooled',
      {EDITOR, INPUT, cell, editingIn, embodiment, recordLeaks} = gridCellEditing(GRID);

let calls = 0,
    pageErrors;

/**
 * The internal record id behind a `c3` text, which names its record: `r3c3` is record 3.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, text) => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText(text, {exact: true})
    .getAttribute('data-record-id');

/**
 * Runs one store operation in the App Worker. The counter makes each call a module URL of its own.
 * @returns {Promise<void>}
 */
const drive = async (page, action) => {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/grid-cell-editing/storeDriver.mjs?action=${action}&n=${++calls}`);

    expect(success, `the ${action} driver ran`).toBe(true)
};

/**
 * Edits record 3's `c3` and types a draft.
 * @returns {Promise<String>} the record id
 */
const editWithDraft = async page => {
    const recordId = await recordIdOf(page, 'r3c3');

    await cell(page, 'c3', recordId).dblclick();
    await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
    await page.keyboard.type('draft');

    return recordId
};

test.describe('Grid cell editing under store activity', () => {
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

    test('an update to another field repaints its cell and keeps the editor, the draft and focus', async ({page}) => {
        const recordId = await editWithDraft(page);

        await drive(page, 'updateOther');
        await expect(cell(page, 'c4', recordId), 'the pushed value rendered').toHaveText('pushed');
        await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'focus stayed in the editor'}).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('draft');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c3', recordId)).toHaveText('r3c3')
    });

    test('an update to the edited field keeps the draft, and Enter commits the draft over it', async ({page}) => {
        const recordId = await editWithDraft(page);

        await drive(page, 'updateEdited');
        await expect(cell(page, 'c4', recordId), 'the row repainted').toHaveText('pushed');
        await expect(page.locator(INPUT), 'the draft survived the pushed value').toHaveValue('draft');

        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c3', recordId), 'the draft was written').toHaveText('draft')
    });

    for (const [change, away, back] of [['sort', 'sortDesc', 'sortAsc'], ['filter', 'filterOut', 'clearFilter']]) {
        test(`a ${change} that takes the record out of the pool and back suspends the editor, then reprojects it with the draft`, async ({page}) => {
            const recordId = await editWithDraft(page);

            await recordLeaks(page, 'c3', recordId);

            await drive(page, away);
            await expect(page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`), 'the record left the row pool').toHaveCount(0);
            await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

            await drive(page, back);
            await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});
            await expect(page.locator(INPUT), 'the draft survived').toHaveValue('draft');

            expect(await page.evaluate(() => window.__leaks), 'no other cell ever showed the editor').toEqual([]);

            // Focus returning to a reprojected editor is interaction-contract scope; Escape needs it in the editor
            await page.locator(INPUT).focus();
            await page.keyboard.press('Escape');
            await expect(page.locator(EDITOR)).toHaveCount(0);
            await expect(cell(page, 'c3', recordId), `the ${change} wrote nothing`).toHaveText('r3c3')
        })
    }

    test('removing the edited record takes the editor with it, and the next double-click edits', async ({page}) => {
        const recordId = await editWithDraft(page),
              nextId   = await recordIdOf(page, 'r4c3');

        await drive(page, 'remove');
        await expect(page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`), 'the record left the grid').toHaveCount(0);
        await expect(page.locator(EDITOR), 'no editor is left behind').toHaveCount(0);

        await cell(page, 'c3', nextId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', nextId), {message: 'the next double-click edits'}).toBe(true)
    })
});
