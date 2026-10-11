import {expect, test}               from '../../fixtures.mjs';
import gridCellEditing, {driveGrid} from '../utils/gridCellEditing.mjs';

/**
 * @summary An edit in a locked body is the same logical session as one in the center: its draft survives the row pool
 * recycling the locked row, and survives its column moving between bodies while the editor is open.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled`, whose 400 rows make a
 * vertical scroll rebind pooled rows, with `c0` locked to the start and `c39` to the end. The fixture's
 * `gridDriver.mjs` locks and unlocks `c3` inside the App Worker, where a header gesture would have moved focus and
 * committed the edit first.
 *
 * Every arm types a whole value, so it holds whether activation leaves a caret or selects the old text, and ends with
 * Escape on the editor: a draft that survived, then an original value after Escape, prove nothing committed.
 */
const GRID                                         = '#grid-cell-editing-pooled',
      {EDITOR, INPUT, cell, editingIn, embodiment} = gridCellEditing(GRID);

let pageErrors;

/**
 * The internal record id behind a `c3` text, which names its record: `r3c3` is record 3.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, text) => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText(text, {exact: true})
    .getAttribute('data-record-id');

/**
 * The region whose body renders a cell. The fixture always has all three bodies — `c0` locks the start and `c39` the
 * end — so their DOM order names the region.
 * @returns {Promise<String|null>}
 */
const regionOf = (page, field, recordId) => page.evaluate(({grid, field, recordId}) => {
    const node   = document.querySelector(`${grid} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`),
          bodies = [...document.querySelectorAll(`${grid} .neo-grid-body`)];

    return node ? ['start', 'center', 'end'][bodies.indexOf(node.closest('.neo-grid-body'))] ?? null : null
}, {grid: GRID, field, recordId});

/**
 * How many `c3` cells each body renders, in DOM order: start, center, end.
 * @returns {Promise<Number[]>}
 */
const c3Census = page => page.evaluate(grid => [...document.querySelectorAll(`${grid} .neo-grid-body`)]
    .map(body => body.querySelectorAll('.neo-grid-cell[data-field="c3"]').length), GRID);

const scrollVertically = (page, top) => page.evaluate(({grid, top}) => {
    document.querySelector(`${grid} .neo-grid-view`).scrollTop = top
}, {grid: GRID, top});

/**
 * Edits a cell of record 3 and replaces its value with a draft.
 * @returns {Promise<String>} the record id
 */
const editWithDraft = async (page, field) => {
    const recordId = await recordIdOf(page, 'r3c3');

    await cell(page, field, recordId).dblclick();
    await expect.poll(() => editingIn(page, field, recordId)).toBe(true);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('draft');

    return recordId
};

/**
 * Escape discards the draft: the cell renders its record's value again.
 * @returns {Promise<void>}
 */
const escapeAndExpect = async (page, field, recordId, text) => {
    await page.locator(INPUT).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator(EDITOR)).toHaveCount(0);
    await expect(cell(page, field, recordId), 'nothing committed').toHaveText(text)
};

test.describe('Grid cell editing in the locked bodies', () => {
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

    for (const [field, region] of [['c0', 'start'], ['c39', 'end']]) {
        test(`a draft in the locked-${region} column survives the row pool rebinding its row`, async ({page}) => {
            const recordId = await editWithDraft(page, field);

            expect(await regionOf(page, field, recordId)).toBe(region);

            await scrollVertically(page, 4000);
            await expect(page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`), 'the row slots were rebound').toHaveCount(0);
            await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

            await scrollVertically(page, 0);
            await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its locked cell'}).toEqual({count: 1, field, recordId});
            await expect(page.locator(INPUT), 'the draft survived').toHaveValue('draft');

            await escapeAndExpect(page, field, recordId, `r3${field}`)
        })
    }

    for (const [action, region] of [['lockStart', 'start'], ['lockEnd', 'end']]) {
        test(`a draft survives its column moving to the ${region} body and back while the editor is open`, async ({page}) => {
            const recordId = await editWithDraft(page, 'c3');

            await driveGrid(page, action);
            await expect.poll(() => regionOf(page, 'c3', recordId), {message: `c3 renders in the ${region} body`}).toBe(region);
            await expect.poll(() => embodiment(page), {message: 'the editor followed its column'}).toEqual({count: 1, field: 'c3', recordId});
            await expect(page.locator(INPUT), 'the draft survived the move').toHaveValue('draft');

            await driveGrid(page, 'unlock');

            // Unlocked from the end, c3 lands after c38, beyond the mounted column window until scrolled to
            action === 'lockEnd' && await page.evaluate(grid => {
                const scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);
                scrollbar.scrollLeft = scrollbar.scrollWidth
            }, GRID);

            await expect.poll(() => regionOf(page, 'c3', recordId), {message: 'c3 renders in the center body again'}).toBe('center');
            await expect.poll(() => embodiment(page), {message: 'the editor followed it back'}).toEqual({count: 1, field: 'c3', recordId});
            await expect(page.locator(INPUT), 'the draft survived the way back').toHaveValue('draft');

            await escapeAndExpect(page, 'c3', recordId, 'r3c3')
        })
    }

    test('a lock change that meets an in-flight center-body render moves every cell of the column out of the center', async ({page}) => {
        const recordId = await editWithDraft(page, 'c3');

        // The lock change's renders defer behind the held flight and collapse into one run, which must stay forced
        await driveGrid(page, 'lockInFlight');
        await expect.poll(() => c3Census(page), {message: 'no c3 cell stays in the center body'}).toEqual([0, 0, expect.any(Number)]);
        expect((await c3Census(page))[2], 'the end body renders c3').toBeGreaterThan(0);
        await expect.poll(() => embodiment(page), {message: 'the editor followed its column'}).toEqual({count: 1, field: 'c3', recordId});

        await escapeAndExpect(page, 'c3', recordId, 'r3c3')
    });

    test('a held edit is in no cell until its last release embeds it again, with its draft', async ({page}) => {
        const recordId = await editWithDraft(page, 'c3');

        await driveGrid(page, 'hold');
        await driveGrid(page, 'hold');
        await expect.poll(() => embodiment(page), {message: 'no cell embeds a held editor'}).toEqual({count: 0, field: null, recordId: null});

        // One release of two keeps it out: the row's next render, which the pushed value makes visible, embeds nothing
        await driveGrid(page, 'release');
        await driveGrid(page, 'updateOther');
        await expect(cell(page, 'c4', recordId), 'the row repainted').toHaveText('pushed');
        expect(await embodiment(page), 'still held').toEqual({count: 0, field: null, recordId: null});

        await driveGrid(page, 'release');
        await expect.poll(() => embodiment(page), {message: 'the last release embeds it again'}).toEqual({count: 1, field: 'c3', recordId});
        await expect(page.locator(INPUT), 'the draft survived').toHaveValue('draft');

        await escapeAndExpect(page, 'c3', recordId, 'r3c3')
    })
});
