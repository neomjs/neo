import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary Tab while a grid edit is suspended: the draft commits, the next cell is edited, focus never leaves the grid.
 *
 * A session is suspended when pooling takes its cell out of the DOM — the row out of the row pool, or the column out
 * of the mounted window. No editor is on the key path then and focus sits on `grid.View`, so the main thread cannot
 * recognise the Tab as an editor's: the plugin registers the View's node for as long as a session is open
 * (`Neo.main.DomEvents#registerPreventDefaultKeys`), and gives it back when the session ends.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled` — 400 rows, 40
 * columns of 150px, `c5` required. The last arm is the other half of the contract: with no session the View's Tab is
 * the browser's own, and moves on. A registration that outlived its session would be a keyboard trap.
 */
const GRID                                         = '#grid-cell-editing-pooled',
      {EDITOR, INPUT, cell, editingIn, embodiment} = gridCellEditing(GRID);

let pageErrors;

const recordIdOf = (page, text) => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText(text, {exact: true})
    .getAttribute('data-record-id');

const scrollVertically = (page, top) => page.evaluate(({grid, top}) => {
    document.querySelector(`${grid} .neo-grid-view`).scrollTop = top
}, {grid: GRID, top});

const scrollHorizontally = (page, left) => page.evaluate(({grid, left}) => {
    document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = left
}, {grid: GRID, left});

const focusIsOnView = page => page.evaluate(grid => document.activeElement === document.querySelector(`${grid} .neo-grid-view`), GRID);

/**
 * Edits `field` of the record and waits until a scroll has suspended the session: no editor in the DOM, focus on
 * the View.
 * @returns {Promise<void>}
 */
const suspend = async (page, field, recordId, scroll) => {
    await cell(page, field, recordId).dblclick();
    await expect.poll(() => editingIn(page, field, recordId)).toBe(true);

    await scroll();

    await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'})
        .toEqual({count: 0, field: null, recordId: null});
    await expect.poll(() => focusIsOnView(page), {message: 'focus fell to the View'}).toBe(true);

    // From here on, every element that takes focus is on the trail
    await page.evaluate(() => {
        window.__focusTrail = [];
        document.addEventListener('focusin', event => window.__focusTrail.push(event.target.tagName), true)
    })
};

/**
 * The App Worker handles the Tab either way, and the editor it embodies focuses itself — so where focus ENDS says
 * nothing about the key's default. An uncancelled Tab first moves focus on, to a scrollbar or out of the grid, and
 * the editor pulls it back: a bounce every ancestor sees as the grid losing focus. Cancelled, the only element that
 * ever takes focus is the editor's input.
 * @returns {Promise<String[]>}
 */
const focusTrail = page => page.evaluate(() => window.__focusTrail);

/**
 * One round trip main thread → App Worker → main thread. Both directions deliver in order, so whatever the worker
 * sent while handling the gestures before this — a programmatic focus on the View — has landed when it resolves.
 * @returns {Promise<void>}
 */
const workerSettled = page => page.evaluate(grid => Neo.worker.App.getConfigs({
    id  : document.querySelector(`${grid} .neo-grid-view`).id,
    keys: ['id']
}), GRID);

test.describe('Grid cell editing: Tab while the edit is suspended', () => {
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

    test('with the edited row scrolled out of the pool, Tab commits the draft and edits the next cell', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await suspend(page, 'c3', recordId, async () => {
            await page.keyboard.type('tabbed away');
            await scrollVertically(page, 4000)
        });

        await page.keyboard.press('Tab');

        await expect.poll(() => editingIn(page, 'c4', recordId), {message: 'the grid scrolled back and edits c4'}).toBe(true);
        await expect(cell(page, 'c3', recordId), 'the suspended draft was committed').toHaveText('tabbed away');
        expect(await focusTrail(page), 'focus went straight into the new editor').toEqual(['INPUT'])
    });

    test('with the edited column scrolled out of the mounted window, Shift+Tab commits and edits the previous cell', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await suspend(page, 'c3', recordId, async () => {
            await page.keyboard.type('tabbed back');
            await scrollHorizontally(page, 3000)
        });

        await page.keyboard.press('Shift+Tab');

        await expect.poll(() => editingIn(page, 'c2', recordId), {message: 'the grid scrolled back and edits c2'}).toBe(true);
        await expect(cell(page, 'c3', recordId), 'the suspended draft was committed').toHaveText('tabbed back');
        expect(await focusTrail(page), 'focus went straight into the new editor').toEqual(['INPUT'])
    });

    test('an invalid suspended draft blocks the move: its cell is scrolled back into sight and takes focus', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        await suspend(page, 'c5', recordId, async () => {
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.press('Backspace');
            await expect(page.locator(INPUT)).toHaveValue('');
            await scrollVertically(page, 4000)
        });

        await page.keyboard.press('Tab');

        await expect.poll(() => editingIn(page, 'c5', recordId), {message: 'back in the required cell, not in c6'}).toBe(true);
        await expect(page.locator(INPUT)).toHaveValue('');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c5', recordId)).toHaveText('r3c5')
    });

    test('with no session the View\'s Tab is the browser\'s own: before any edit, and after one ended', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3');

        // A cell click makes the App Worker focus the View, and a focus call still in flight would land after the Tab
        // and pull focus back
        await cell(page, 'c3', recordId).click();
        await workerSettled(page);
        await expect.poll(() => focusIsOnView(page)).toBe(true);

        // The browser's traversal moves on — to the grid's own scrollbar first, then out. A Tab the main thread
        // cancelled would leave focus where it is
        await page.keyboard.press('Tab');
        await expect.poll(() => focusIsOnView(page), {message: 'no edit was ever open: Tab moved on'}).toBe(false);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await workerSettled(page);
        await expect.poll(() => focusIsOnView(page), {message: 'the edit ended on the View'}).toBe(true);

        await page.keyboard.press('Tab');
        await expect.poll(() => focusIsOnView(page), {message: 'the ended session gave the Tab back'}).toBe(false);
        await expect(page.locator(EDITOR), 'and it started no edit').toHaveCount(0)
    })
});
