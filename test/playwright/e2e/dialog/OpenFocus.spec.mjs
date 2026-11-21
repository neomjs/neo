import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A dialog opens on its first field: the window controls of its header come first in the DOM, so taking
 * the first focusable item would put focus on maximize.
 */
test('examples/dialog opens its dialog on the first field', async ({page}) => {
    await page.goto('/examples/dialog/index.html');

    const opener = page.getByRole('button', {name: 'Create Dialog', exact: true});

    await expect(opener).toBeVisible();
    await opener.click();

    const dialog = page.locator('.neo-dialog');

    // The combo box's first input is its disabled type-ahead hint
    await expect(dialog.locator('input:not([disabled])').first()).toBeFocused();
    await expect(dialog.getByRole('button', {name: 'maximize'})).not.toBeFocused()
});
