import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A dialog opens on its first field: the window controls of its header come first in the DOM, so taking
 * the first focusable item would put focus on maximize.
 */
test('examples/dialog opens its dialog on the first field', async ({page}) => {
    await page.goto('/examples/dialog/index.html');

    const dialog = page.locator('.neo-dialog');

    await expect(dialog.locator('input[name="name"]')).toBeFocused();
    await expect(dialog.getByRole('button', {name: 'maximize'})).not.toBeFocused()
});

test('examples/board opens its card editor on the title, the first field of a form it rebuilt', async ({page}) => {
    await page.goto('/examples/board/basic/index.html');

    const menuButton = page.locator('.neo-board-card-menu-button').first();

    await expect(menuButton).toBeVisible();
    await menuButton.click();

    await expect(page.locator('.neo-board-card-editor input[name="title"]')).toBeFocused()
});
