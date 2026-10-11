import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary Non-text editors commit through a nested field and into a tree grid, each in its field's own type.
 *
 * The plugin's session and projection never read the editor type, so what these arms can find is the value's own
 * round trip: a `NumberField` into an `Int`, a `DateField` into a `Date`, and a `ComboBox` whose committed value (`id`)
 * is not what the cell shows (`name`). Each arm commits, reads the cell, then opens the editor again: the editor reads
 * the record back, so the second open proves the record holds the value, not just that the cell was repainted.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing-record-shapes`. The grids render internal record ids, so
 * every arm resolves its record from a cell's text.
 */
const NESTED  = '#grid-cell-editing-nested',
      TREE    = '#grid-cell-editing-tree',
      PICKER  = '.neo-picker-container',
      OPTIONS = `${PICKER} .neo-list-item[role="option"]`,
      nested  = gridCellEditing(NESTED),
      tree    = gridCellEditing(TREE),
      // A combo renders a second input for its typeahead hint
      comboInput = grid => `${grid.INPUT}:not(.neo-typeahead-input)`;

let pageErrors;

const recordIdOf = (page, grid, field, text) => page.locator(`${grid} .neo-grid-cell[data-field="${field}"]`)
    .getByText(text, {exact: true}).first().evaluate(node => node.closest('.neo-grid-cell').dataset.recordId);

const retype = async (page, text) => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text)
};

/**
 * Picks a day from an open date editor's picker, the way a user does: a native date input takes typed digits per
 * segment and in locale order, so typed text is not a stable input.
 * @returns {Promise<void>}
 */
const pickDay = async (page, grid, day) => {
    await page.locator(`${grid.EDITOR} .neo-field-trigger`).click();
    await expect(page.locator(PICKER)).toBeVisible();
    await page.locator(`${PICKER} [id$="__${day}"]`).click();
    await expect(page.locator(grid.INPUT), 'the picked day is the draft').toHaveValue(day)
};

/**
 * Opens the editor on one cell by double-click and waits until it holds focus there.
 * @returns {Promise<void>}
 */
const edit = async (page, grid, field, recordId) => {
    await grid.cell(page, field, recordId).dblclick();
    await expect.poll(() => grid.editingIn(page, field, recordId), {message: `the editor is in ${field}`}).toBe(true)
};

test.describe('Grid cell editing: non-text editors over nested and tree records', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing-record-shapes/index.html');
        await page.waitForSelector(`${NESTED} .neo-grid-cell[data-field="user.team"]`, {state: 'visible', timeout: 30000});
        await page.waitForSelector(`${TREE} .neo-grid-cell[data-field="modified"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('a number commits into a nested Int field, and the editor reads it back', async ({page}) => {
        const recordId = await recordIdOf(page, NESTED, 'user.firstname', 'First 3'),
              age      = nested.cell(page, 'user.age', recordId);

        await edit(page, nested, 'user.age', recordId);
        await expect(page.locator(nested.INPUT), 'the editor opens on the nested number').toHaveValue('22');

        await retype(page, '42');
        await page.keyboard.press('Enter');

        await expect(age, 'the commit reached the nested field').toHaveText('42');
        await expect(age, 'and marks it modified').toHaveClass(/neo-is-modified/);
        await expect(nested.cell(page, 'user.firstname', recordId), 'a sibling in the same object is untouched').not.toHaveClass(/neo-is-modified/);

        await edit(page, nested, 'user.age', recordId);
        await expect(page.locator(nested.INPUT), 'the record holds the number').toHaveValue('42')
    });

    test('a picked date commits into a nested Date field, and the editor reads it back', async ({page}) => {
        const recordId = await recordIdOf(page, NESTED, 'user.firstname', 'First 3'),
              otherId  = await recordIdOf(page, NESTED, 'user.firstname', 'First 1'),
              joined   = nested.cell(page, 'user.joined', recordId);

        await expect(joined).toHaveText('2024-12-12');

        await edit(page, nested, 'user.joined', recordId);
        await expect(page.locator(nested.INPUT), 'the editor opens on the nested date').toHaveValue('2024-12-12');

        await pickDay(page, nested, '2024-12-15');
        await nested.cell(page, 'user.firstname', otherId).click();

        await expect(joined, 'the commit reached the nested field as a date').toHaveText('2024-12-15');
        await expect(joined).toHaveClass(/neo-is-modified/);

        await edit(page, nested, 'user.joined', recordId);
        await expect(page.locator(nested.INPUT), 'the record holds the date').toHaveValue('2024-12-15')
    });

    test('a picked combo value commits into a nested field, and the cell shows its name', async ({page}) => {
        const recordId = await recordIdOf(page, NESTED, 'user.firstname', 'First 1'),
              team     = nested.cell(page, 'user.team', recordId);

        await expect(team).toHaveText('Core');

        await edit(page, nested, 'user.team', recordId);
        await expect(page.locator(comboInput(nested)), 'the editor opens on the record\'s team').toHaveValue('Core');

        await retype(page, 'Gri');
        await expect(page.locator(OPTIONS), 'typing narrows the list to one team').toHaveText(['Grid']);
        await page.keyboard.press('Enter');

        await expect.poll(async () => (await nested.embodiment(page)).count, {message: 'the pick ended the edit'}).toBe(0);
        await expect(team, 'the cell shows the picked team by name').toHaveText('Grid');
        await expect(team).toHaveClass(/neo-is-modified/);

        await edit(page, nested, 'user.team', recordId);
        await expect(page.locator(comboInput(nested)), 'the record holds the picked id').toHaveValue('Grid')
    });

    test('a number commits into a tree node\'s Int field', async ({page}) => {
        const recordId = await recordIdOf(page, TREE, 'name', 'Row.mjs'),
              lines    = tree.cell(page, 'lines', recordId);

        await edit(page, tree, 'lines', recordId);
        await expect(page.locator(tree.INPUT)).toHaveValue('2000');

        await retype(page, '2100');
        await page.keyboard.press('Enter');

        await expect(lines).toHaveText('2100');

        await edit(page, tree, 'lines', recordId);
        await expect(page.locator(tree.INPUT), 'the node holds the number').toHaveValue('2100')
    });

    test('a picked date commits into a tree node\'s Date field', async ({page}) => {
        const recordId = await recordIdOf(page, TREE, 'name', 'README.md'),
              otherId  = await recordIdOf(page, TREE, 'name', 'Row.mjs'),
              modified = tree.cell(page, 'modified', recordId);

        await expect(modified).toHaveText('2024-12-04');

        await edit(page, tree, 'modified', recordId);
        await pickDay(page, tree, '2024-12-09');
        await tree.cell(page, 'size', otherId).click();

        await expect(modified).toHaveText('2024-12-09');

        await edit(page, tree, 'modified', recordId);
        await expect(page.locator(tree.INPUT), 'the node holds the date').toHaveValue('2024-12-09')
    });

    test('a picked combo value commits into a tree node', async ({page}) => {
        const recordId = await recordIdOf(page, TREE, 'name', 'README.md'),
              type     = tree.cell(page, 'type', recordId);

        await expect(type).toHaveText('file');

        await edit(page, tree, 'type', recordId);
        await retype(page, 'fol');
        await expect(page.locator(OPTIONS)).toHaveText(['folder']);
        await page.keyboard.press('Enter');

        await expect.poll(async () => (await tree.embodiment(page)).count, {message: 'the pick ended the edit'}).toBe(0);
        await expect(type).toHaveText('folder');
        await expect(tree.cell(page, 'name', recordId).locator('.neo-tree-content'), 'the tree cell beside it is untouched').toHaveText('README.md')
    })
});
