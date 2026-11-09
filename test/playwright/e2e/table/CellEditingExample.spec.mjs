import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The Table control for cell editing: `examples/table/cellEditing` still mounts a focused editor on a
 * double-click, and Enter commits it.
 *
 * Grid editing moved to its own plugin, and Table keeps `table.plugin.CellEditing`. This arm guards only the contract
 * both share: mount, focus, explicit commit. It asserts nothing about focus-leave or timing, so Table's destructive
 * focus-leave and its own sleeps stay unpinned rather than becoming expected behaviour.
 */
test.describe('examples/table/cellEditing', () => {
    test('a double-click mounts a focused editor, and Enter commits the value', async ({page}) => {
        await page.goto('/examples/table/cellEditing/index.html');

        const row    = page.getByRole('row').filter({has: page.getByRole('cell', {name: 'rwaters', exact: true})}),
              editor = page.locator('.neo-table-editor');

        await row.getByRole('cell', {name: 'Rich', exact: true}).dblclick();

        await expect(editor.locator('input'), 'the editor mounts on the record value').toHaveValue('Rich');
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.neo-table-editor')), {
            message: 'focus is in the editor'
        }).toBe(true);

        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('Richard');
        await page.keyboard.press('Enter');

        await expect(row.getByRole('cell', {name: 'Richard', exact: true}), 'the record took the value').toBeVisible()
    });

    test('a cleared date commits no date, and the cell renders empty (#20660)', async ({page}) => {
        await page.goto('/examples/table/cellEditing/index.html');
        // allTextContents() does not wait, so the header list is read once the table has rendered
        await expect(page.getByRole('columnheader', {name: 'Random Date'})).toBeVisible();

        const row      = page.getByRole('row').filter({has: page.getByRole('cell', {name: 'rwaters', exact: true})}),
              headers  = await page.getByRole('columnheader').allTextContents(),
              dateCell = row.getByRole('cell').nth(headers.findIndex(text => text.trim() === 'Random Date')),
              input    = page.locator('.neo-table-editor input');

        await expect(dateCell, 'the record starts with a date').not.toHaveText('');
        await dateCell.dblclick();
        await expect(input, 'the date editor mounts').toBeVisible();

        await input.fill('');
        await page.keyboard.press('Enter');
        // An open editor leaves the cell without text, so only a closed one shows what the record holds
        await expect(page.locator('.neo-table-editor'), 'Enter committed').toHaveCount(0);

        await expect(dateCell, 'no date, not 1970-01-01').toHaveText('')
    })
});
