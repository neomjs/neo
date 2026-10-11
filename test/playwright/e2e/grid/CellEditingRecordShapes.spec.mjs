import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary Cell editing over records that are not flat: a field inside a nested object, and a tree.
 *
 * A dotted `dataField` reaches its value through the record's path: the commit, the cell lookup and the modified
 * marker each take the dotted name. A `tree` column's cell holds a component, so the editor takes the component's
 * place and the component has to come back, showing what the edit wrote.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing-record-shapes`. The grids render internal record ids, so
 * every arm resolves its record from a cell's text.
 */
const NESTED = '#grid-cell-editing-nested',
      TREE   = '#grid-cell-editing-tree',
      nested = gridCellEditing(NESTED),
      tree   = gridCellEditing(TREE);

let pageErrors;

const recordIdOf = (page, grid, field, text) => page.locator(`${grid} .neo-grid-cell[data-field="${field}"]`)
    .getByText(text, {exact: true}).first().evaluate(node => node.closest('.neo-grid-cell').dataset.recordId);

const replaceText = async (page, text) => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text)
};

/**
 * The tree's names as a user reads them, top to bottom. An open editor reads as its draft.
 * @returns {Promise<String[]>}
 */
const treeNames = page => page.evaluate(grid => [...document.querySelectorAll(`${grid} .neo-grid-cell[data-field="name"]`)]
    .filter(node => node.offsetParent)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map(node => node.querySelector('input')?.value ?? node.textContent.trim()), TREE);

test.describe('Grid cell editing over nested and tree records', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing-record-shapes/index.html');
        await page.waitForSelector(`${NESTED} .neo-grid-cell[data-field="country"]`, {state: 'visible', timeout: 30000});
        await page.waitForSelector(`${TREE} .neo-grid-cell[data-field="size"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    test('a nested field commits on Enter, and is marked modified exactly while it differs from its original', async ({page}) => {
        const recordId  = await recordIdOf(page, NESTED, 'user.firstname', 'First 3'),
              firstname = nested.cell(page, 'user.firstname', recordId);

        await firstname.dblclick();
        await expect.poll(() => nested.editingIn(page, 'user.firstname', recordId), {message: 'the editor is in the nested cell'}).toBe(true);
        await expect(page.locator(nested.INPUT), 'the editor opens on the nested value').toHaveValue('First 3');

        await replaceText(page, 'Edited');
        await page.keyboard.press('Enter');

        await expect(firstname, 'the commit reached the nested field').toHaveText('Edited');
        await expect(firstname, 'the nested cell is marked modified').toHaveClass(/neo-is-modified/);
        await expect(nested.cell(page, 'user.lastname', recordId), 'its sibling inside the same object is untouched').toHaveText('Last 3');
        await expect(nested.cell(page, 'user.lastname', recordId)).not.toHaveClass(/neo-is-modified/);

        await firstname.dblclick();
        await expect.poll(() => nested.editingIn(page, 'user.firstname', recordId)).toBe(true);
        await replaceText(page, 'First 3');
        await page.keyboard.press('Enter');

        await expect(firstname).toHaveText('First 3');
        await expect(firstname, 'the original value clears the marker').not.toHaveClass(/neo-is-modified/)
    });

    test('Tab commits a nested field into the next one, and Escape there keeps its value', async ({page}) => {
        const recordId = await recordIdOf(page, NESTED, 'user.firstname', 'First 2');

        await nested.cell(page, 'user.firstname', recordId).dblclick();
        await expect.poll(() => nested.editingIn(page, 'user.firstname', recordId)).toBe(true);
        await replaceText(page, 'Tabbed');
        await page.keyboard.press('Tab');

        await expect.poll(() => nested.editingIn(page, 'user.lastname', recordId), {message: 'Tab moved the editor to the next nested field'}).toBe(true);
        await expect(nested.cell(page, 'user.firstname', recordId), 'Tab committed the field it left').toHaveText('Tabbed');
        await expect(page.locator(nested.INPUT)).toHaveValue('Last 2');

        await replaceText(page, 'Dropped');
        await page.keyboard.press('Escape');

        await expect.poll(async () => (await nested.embodiment(page)).count, {message: 'Escape ended the edit'}).toBe(0);
        await expect(nested.cell(page, 'user.lastname', recordId), 'Escape kept the nested value').toHaveText('Last 2')
    });

    test('renaming a node puts the new name inside its tree component', async ({page}) => {
        const recordId = await recordIdOf(page, TREE, 'name', 'README.md'),
              name     = tree.cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => tree.editingIn(page, 'name', recordId), {message: 'the editor took the tree component\'s place'}).toBe(true);
        await expect(page.locator(tree.INPUT)).toHaveValue('README.md');
        await expect(name.locator('.neo-grid-tree-cell'), 'the component is out of the cell while it is edited').toHaveCount(0);

        await replaceText(page, 'CHANGELOG.md');
        await page.keyboard.press('Enter');

        await expect(name.locator('.neo-grid-tree-cell .neo-tree-content'), 'the component is back, with the new name').toHaveText('CHANGELOG.md');
        await expect(name.locator('.neo-grid-tree-cell .neo-tree-toggle'), 'and with its toggle').toHaveCount(1);
        expect((await tree.embodiment(page)).count, 'no editor is left').toBe(0)
    });

    test('a folder\'s label selects and edits like any cell, and the node stays as it was', async ({page}) => {
        const recordId = await recordIdOf(page, TREE, 'name', 'grid'),
              name     = tree.cell(page, 'name', recordId),
              before   = await treeNames(page);

        expect(before, 'the fixture boots with grid expanded').toEqual(['src', 'component', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);

        // One click on the label: a widened toggle would take the children away here
        await name.locator('.neo-tree-content').click();
        await expect(name, 'the click selected the cell').toHaveClass(/neo-selected/);
        expect(await treeNames(page), 'a click on the label toggles nothing').toEqual(before);

        await name.locator('.neo-tree-content').dblclick();
        await expect.poll(() => tree.editingIn(page, 'name', recordId), {message: 'the double-click edits the folder\'s name'}).toBe(true);
        await replaceText(page, 'grids');
        expect(await treeNames(page), 'the children are still there, under the draft').toEqual(['src', 'component', 'grids', 'Container.mjs', 'Row.mjs', 'README.md']);

        await page.keyboard.press('Escape');
        await expect(name.locator('.neo-grid-tree-cell .neo-tree-content'), 'Escape gives the component back, unrenamed').toHaveText('grid');
        expect(await treeNames(page)).toEqual(before)
    });

    test('collapsing the parent by its toggle commits the child\'s draft', async ({page}) => {
        const childId  = await recordIdOf(page, TREE, 'name', 'Container.mjs'),
              parentId = await recordIdOf(page, TREE, 'name', 'grid'),
              toggle   = tree.cell(page, 'name', parentId).locator('.neo-tree-toggle');

        await tree.cell(page, 'size', childId).dblclick();
        await expect.poll(() => tree.editingIn(page, 'size', childId)).toBe(true);
        await replaceText(page, '46 KB');

        await toggle.click();
        await expect.poll(() => treeNames(page), {message: 'the toggle collapsed the folder'}).toEqual(['src', 'component', 'grid', 'README.md']);
        expect((await tree.embodiment(page)).count, 'the edit ended with its row').toBe(0);

        await toggle.click();
        await expect.poll(() => treeNames(page), {message: 'the toggle expanded it again'})
            .toEqual(['src', 'component', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);
        await expect(tree.cell(page, 'size', childId), 'the draft was committed, as any click-away commits').toHaveText('46 KB')
    })
});
