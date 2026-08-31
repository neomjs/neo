import {test, expect} from '@playwright/test';

/**
 * What grid inline cell editing actually DOES under the View focus anchor (ticket-ref-ok: this is
 * the enforcement suite for the focus-anchor migration of table.plugin.CellEditing and its grid
 * flavor).
 *
 * **Why a component arm.** Every defect this suite pins shipped green: the plugin's key handlers
 * sat on a registry no keydown could reach, its guard read a key target that is never a cell, its
 * cell focus call was a DomAccess no-op, and its unmount path threw against pooled grid rows —
 * all invisible to source-text assertions, because each one is a runtime seam between the plugin,
 * the focus anchor, the selection model and the row pool. So this mounts a real grid in a real
 * browser, drives real clicks and real keydowns, and reads DOM focus and cell content back.
 */

const GRID_ID = 'cell-editing-probe-grid';

let gridId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    gridId = await page.evaluate(async id => {
        // ntype configs resolve only for classes the app worker has imported — preload the cell
        // selection model the same way the grid itself arrives (throwaway standalone instance)
        await Neo.worker.App.createNeoInstance({
            importPath: '../selection/grid/CellModel.mjs',
            ntype     : 'selection-grid-cellmodel',
            id        : 'cell-model-preload'
        });

        const grid = await Neo.worker.App.createNeoInstance({
            importPath: '../grid/Container.mjs',
            ntype     : 'grid-container',
            id,
            parentId  : 'component-test-viewport',
            height    : 300,
            width     : 600,

            cellEditing: true,

            body: {
                selectionModel: {ntype: 'selection-grid-cellmodel'}
            },

            columnDefaults: {
                editable: true,
                width   : 200
            },

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'}
            ],

            store: {
                keyProperty: 'id',

                model: {
                    fields: [
                        {name: 'id',        type: 'Int'},
                        {name: 'firstname', type: 'String'},
                        {name: 'lastname',  type: 'String'}
                    ]
                },

                data: [
                    {id: 1, firstname: 'Ada',   lastname: 'Lovelace'},
                    {id: 2, firstname: 'Grace', lastname: 'Hopper'},
                    {id: 3, firstname: 'Anita', lastname: 'Borg'}
                ]
            }
        });

        if (!grid.success) throw new Error(`grid: ${grid.error.message}`);

        return grid.id
    }, GRID_ID);

    expect(gridId, 'the grid must mount').toBeTruthy();

    // Rows render once the resize observation lands — wait for a real cell, not just the frame
    await page.waitForSelector('.neo-grid-cell[data-field=firstname]', {state: 'attached', timeout: 6000})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async id => { id && await Neo.worker.App.destroyNeoInstance(id) }, gridId)
});

/** DOM-level snapshot of everything the suite asserts on. */
const snap = page => page.evaluate(() => ({
    active     : document.activeElement?.id ?? document.activeElement?.tagName,
    editorCells: [...document.querySelectorAll('.neo-grid-editor')].map(el => el.parentElement?.id),
    firstCell  : document.querySelector('.neo-grid-cell[data-field=firstname]')?.textContent,
    viewId     : document.querySelector('.neo-grid-view')?.id
}));

const firstnameCell = (page, nth = 0) => page.locator('.neo-grid-cell[data-field=firstname]').nth(nth);

/**
 * Click a firstname cell, then place DOM focus on the anchor. Whether a cell CLICK focuses the
 * view is the selection model's affordance (richer models do it, the plain cell model does not) —
 * the plugin's contract starts at "the anchor holds focus and a cell is selected", so the harness
 * establishes exactly that state.
 */
const selectAndFocus = async (page, nth = 0) => {
    await firstnameCell(page, nth).click();
    await page.evaluate(() => document.querySelector('.neo-grid-view').focus())
};

test.describe('grid CellEditing — the View focus anchor drives every gesture', () => {
    test('Enter on a selected cell mounts a focused editor; Escape settles and refocuses the anchor', async ({page}) => {
        await selectAndFocus(page);

        let state = await snap(page);

        await page.keyboard.press('Enter');
        await page.waitForSelector('.neo-grid-editor', {state: 'attached', timeout: 4000});

        // The editor is mounted in a cell AND owns DOM focus — the plugin descends to the input
        await page.waitForSelector('.neo-grid-editor input:focus', {state: 'attached', timeout: 4000});

        state = await snap(page);

        expect(state.editorCells).toHaveLength(1);

        await page.keyboard.press('Escape');
        await page.waitForSelector('.neo-grid-editor', {state: 'detached', timeout: 4000});

        state = await snap(page);

        // Settled: no editor remains, and focus returned to the anchor for the next key gesture
        expect(state.editorCells).toHaveLength(0);
        expect(state.active).toBe(state.viewId)
    });

    test('moving the cell selection settles a mounted editor — and commits a dirty edit', async ({page}) => {
        await selectAndFocus(page);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.neo-grid-editor', {state: 'attached', timeout: 4000});

        await page.locator('.neo-grid-editor input').fill('Edited');

        // Clicking another row's cell moves the selection off the edited cell
        await firstnameCell(page, 1).click();
        await page.waitForSelector('.neo-grid-editor', {state: 'detached', timeout: 4000});

        const state = await snap(page);

        // No zombie editor lingers, and the dirty value committed into the record's cell
        expect(state.editorCells).toHaveLength(0);
        expect(state.firstCell).toBe('Edited')
    });

    test('the abandon-then-reedit cycle produces a mounted AND focused editor', async ({page}) => {
        await selectAndFocus(page);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.neo-grid-editor', {state: 'attached', timeout: 4000});

        // Abandon by selecting the second row, then immediately edit there
        await selectAndFocus(page, 1);
        await page.waitForSelector('.neo-grid-editor', {state: 'detached', timeout: 4000});
        await page.keyboard.press('Enter');

        // The second editor is not a zombie: it mounts AND its input receives real DOM focus
        await page.waitForSelector('.neo-grid-editor input:focus', {state: 'attached', timeout: 4000});

        expect((await snap(page)).editorCells).toHaveLength(1)
    });

    test('focus leaving the grid unmounts the editor — the focusLeave contract survives the migration', async ({page}) => {
        // A focusable sibling OUTSIDE the grid: real DOM focus must actually move for focusLeave
        await page.evaluate(async () => {
            await Neo.worker.App.createNeoInstance({
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                id        : 'outside-button',
                parentId  : 'component-test-viewport',
                text      : 'outside'
            })
        });
        await page.waitForSelector('#outside-button', {state: 'attached', timeout: 4000});

        await selectAndFocus(page);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.neo-grid-editor', {state: 'attached', timeout: 4000});

        await page.click('#outside-button');
        await page.waitForSelector('.neo-grid-editor', {state: 'detached', timeout: 4000});

        expect((await snap(page)).editorCells).toHaveLength(0)
    })
});
