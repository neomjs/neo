import {expect, test} from '../../fixtures.mjs';

test('button Reset restores the rendered badge and checked inspector radio', async ({page}) => {
    await page.goto('/examples/button/base/index.html');
    const badge = page.locator('.neo-example-container .neo-button-badge');
    await page.getByText('bottom-left', {exact: true}).click();
    await expect(badge).toHaveClass(/neo-bottom-left/);
    await page.getByRole('button', {name: 'Reset', exact: true}).click();
    await expect(badge).toHaveClass(/neo-top-right/);
    await expect(page.getByRole('radio', {name: 'top-right', exact: true})).toBeChecked();
    await expect(page.getByRole('radio', {name: 'badgePosition bottom-left'})).not.toBeChecked();
});

test('field Reset restores the rendered label and its inspector textbox', async ({page}) => {
    await page.goto('/examples/form/field/text/index.html');
    const input = page.getByRole('textbox', {name: 'labelText', exact: true}),
          label = page.locator('.neo-example-container label');
    await input.fill('A different label');
    await input.press('Tab');
    await expect(label).toHaveText('A different label');
    await page.getByRole('button', {name: 'Reset', exact: true}).click();
    await expect(label).toHaveText('Label');
    await expect(input).toHaveValue('Label');
});

test('list Reset restores the rendered width and its inspector spinbutton', async ({page}) => {
    await page.goto('/examples/list/base/index.html');
    const input = page.getByRole('spinbutton', {name: 'width', exact: true}),
          list  = page.locator('.neo-example-container ul');
    await input.fill('180');
    await input.press('Tab');
    await expect(list).toHaveCSS('width', '180px');
    await page.getByRole('button', {name: 'Reset', exact: true}).click();
    await expect(list).toHaveCSS('width', '100px');
    await expect(input).toHaveValue('100');
});
