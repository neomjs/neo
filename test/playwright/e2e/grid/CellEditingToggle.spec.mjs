import {expect, test}               from '../../fixtures.mjs';
import gridCellEditing, {driveGrid} from '../utils/gridCellEditing.mjs';

/**
 * @summary `cellEditing` toggled at runtime, as a user sees it: off refuses a double-click and cancels an open edit, and
 * on again opens one editor per double-click, however often editing was turned on.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled`, which is built with
 * `cellEditing: true`. The fixture's `gridDriver.mjs` sets the config inside the App Worker. The unit tier cannot mount
 * an editor, because a text field calls `Neo.main.DomEvents`, so only these arms see the editors themselves.
 *
 * A refused double-click has no event to wait for. The arms count editors with a MutationObserver instead, which replays
 * its records rather than sampling the DOM once they are delivered. An editor inserted and removed again before the
 * observer runs still counts; the counter has its own arm for that.
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
 * From now on, the most editors the grid held at once. The records are replayed in order, removals before additions
 * within one record, so an editor inserted and removed within one batch counts, and a moved editor counts once.
 * @returns {Promise<void>}
 */
const countEditors = page => page.evaluate(grid => {
    const root      = document.querySelector(grid),
          editorsIn = nodes => [...nodes].reduce((sum, node) => node.nodeType !== Node.ELEMENT_NODE ? sum :
              sum + (node.matches('.neo-grid-editor') ? 1 : 0) + node.querySelectorAll('.neo-grid-editor').length, 0);

    let current = root.querySelectorAll('.neo-grid-editor').length;

    window.__editorWatch?.disconnect();
    window.__maxEditors  = current;
    window.__editorWatch = new MutationObserver(records => records.forEach(({addedNodes, removedNodes}) => {
        current -= editorsIn(removedNodes);
        current += editorsIn(addedNodes);

        window.__maxEditors = Math.max(window.__maxEditors, current)
    }));

    window.__editorWatch.observe(root, {childList: true, subtree: true})
}, GRID);

const maxEditors = page => page.evaluate(() => window.__maxEditors);

/**
 * Reads one property of the grid in the App Worker.
 * @returns {Promise<*>}
 */
const gridValue = (page, key) => page.evaluate(async ({grid, key}) => {
    const {id} = document.querySelector(grid);

    return (await Neo.worker.App.getConfigs({id, keys: [key]}))[0]
}, {grid: GRID, key});

/**
 * Double-clicks a cell while editing is off: no editor may mount.
 * @returns {Promise<void>}
 */
const expectRefused = async (page, target, message) => {
    await countEditors(page);
    await target.dblclick();

    // wall-clock-under-test: a refused double-click fires nothing, so the arm waits out the time an editor takes to mount
    await page.waitForTimeout(500);

    expect(await maxEditors(page), message).toBe(0)
};

/**
 * Double-clicks a cell while editing is on: exactly one editor mounts, in that cell.
 * @returns {Promise<void>}
 */
const expectOneEditor = async (page, target, recordId, message) => {
    await countEditors(page);
    await target.dblclick();
    await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'the editor took focus in the cell'}).toBe(true);

    // wall-clock-under-test: a second plugin's editor would mount a render later, so the arm waits one out
    await page.waitForTimeout(300);

    expect(await maxEditors(page), message).toBe(1);
    expect(await embodiment(page)).toEqual({count: 1, field: 'c3', recordId})
};

test.describe('Grid cellEditing toggled at runtime', () => {
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

    test('the editor count keeps an editor that mounts and leaves before the observer runs', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3'),
              // Inserts an editor node into a cell and removes it again in the same task
              flash    = () => page.evaluate(grid => {
                  const node = document.createElement('div');

                  node.className = 'neo-grid-editor';
                  document.querySelector(`${grid} .neo-grid-cell`).append(node);
                  node.remove()
              }, GRID);

        await countEditors(page);
        await flash();
        expect(await maxEditors(page), 'a transient first editor').toBe(1);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);

        await countEditors(page);
        await flash();
        expect(await maxEditors(page), 'a transient second editor beside the open one').toBe(2);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0)
    });

    test('off refuses a double-click, on again opens exactly one editor, and the next off refuses again', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3'),
              target   = cell(page, 'c3', recordId);

        await driveGrid(page, 'editingOff');
        await expectRefused(page, target, 'editing off: no editor');

        await driveGrid(page, 'editingOn');
        await expectOneEditor(page, target, recordId, 'editing on again: one editor, not one per time it was turned on');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        // Another plugin added by the second enable would not hear this off
        await driveGrid(page, 'editingOff');
        await expectRefused(page, target, 'editing off again: still no editor');

        await driveGrid(page, 'editingOn');
        await expectOneEditor(page, target, recordId, 'and on once more: one editor');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0)
    });

    test('an edit open when editing goes off is cancelled, so its draft never reaches the record', async ({page}) => {
        const recordId = await recordIdOf(page, 'r3c3'),
              target   = cell(page, 'c3', recordId);

        await target.dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('draft');
        await expect(page.locator(INPUT)).toHaveValue('draft');

        await driveGrid(page, 'logCancels');
        await driveGrid(page, 'editingOff');

        await expect(page.locator(EDITOR), 'the editor left').toHaveCount(0);
        await expect.poll(() => gridValue(page, 'driverCancelLog'), {message: 'a cancel, for the disabled plugin'}).toEqual(['disabled']);

        // A commit would also remove the editor. The record's value tells the two apart
        await expect(target, 'the record kept its value').toHaveText('r3c3')
    })
});
