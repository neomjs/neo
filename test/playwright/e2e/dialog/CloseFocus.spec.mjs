import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/dialog` keeps its promise on every close path: the dialog leaves with its modal mask, focus is
 * back on the button that opened it, and that button opens a dialog again.
 *
 * A unit spec cannot see this: the mask is a main-thread node, and where focus lands shows only in the live document.
 */

/**
 * Opens a dialog and waits until its show has landed: it holds focus, has grown out of its opener and stopped moving
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} opener
 * @param {'keyboard'|'pointer'} [modality='pointer']
 * @param {Boolean} [landed=true] false returns as soon as the dialog holds focus, while it may still be growing
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openFrom(page, opener, modality='pointer', landed=true) {
    const count = await page.locator('.neo-dialog').count();
    let   last  = null;

    if (modality === 'keyboard') {
        await opener.focus();
        await page.keyboard.press('Enter')
    } else {
        await opener.click()
    }

    const dialog = page.locator('.neo-dialog').nth(count);

    await expect(dialog.locator(':focus')).toHaveCount(1);

    if (!landed) {
        return dialog
    }

    await expect(page.locator('.neo-dialog-modal-mask')).toHaveCount(1);

    await expect.poll(async () => {
        const box  = await dialog.boundingBox(),
              key  = box && `${box.x},${box.y},${box.width},${box.height}`,
              done = key === last && box.width > 300;

        last = key;
        return done
    }, {intervals: [100]}).toBe(true);

    return dialog
}

/**
 * The dialog is gone, the page has no mask left, focus is on the opener, and the opener opens a dialog again
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} opener
 */
async function expectClosedOnto(page, opener) {
    await expect(page.locator('.neo-dialog')).toHaveCount(0);
    await expect(page.locator('.neo-dialog-modal-mask')).toHaveCount(0);
    await expect(opener).toBeFocused();

    await openFrom(page, opener)
}

test.describe('examples/dialog: a closed dialog takes its mask along and hands focus back', () => {
    let opener;

    test.beforeEach(async ({page}) => {
        await page.goto('/examples/dialog/index.html');
        opener = page.getByRole('button', {name: 'Edit selected contact', exact: true});
        await expect(page.locator('.neo-dialog input[name="name"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dialog')).toHaveCount(0);
        await expect(opener).toBeFocused()
    });

    test('Escape after a pointer open', async ({page}) => {
        await openFrom(page, opener);
        await page.keyboard.press('Escape');

        await expectClosedOnto(page, opener)
    });

    test('Escape after a keyboard open', async ({page}) => {
        await openFrom(page, opener, 'keyboard');
        await page.keyboard.press('Escape');

        await expectClosedOnto(page, opener)
    });

    test('the header\'s close button', async ({page}) => {
        const dialog = await openFrom(page, opener);

        await dialog.getByRole('button', {name: 'close'}).click();

        await expectClosedOnto(page, opener)
    });

    test('Escape while the dialog is still growing out of its button', async ({page}) => {
        await openFrom(page, opener, 'pointer', false);
        await page.keyboard.press('Escape');

        await expectClosedOnto(page, opener)
    });

    test('Cancel while the dialog is still growing out of its button waits until the show settles', async ({page}) => {
        const dialog = await openFrom(page, opener, 'pointer', false);

        await expect.poll(async () => (await dialog.boundingBox()).x).toBeGreaterThanOrEqual(0);
        expect(await dialog.evaluate(el => getComputedStyle(el).pointerEvents),
            'a dialog still growing out of its opener accepts no pointer hit').toBe('none');

        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();

        await expectClosedOnto(page, opener);
        expect(await page.locator('.neo-dialog').evaluate(el => getComputedStyle(el).pointerEvents),
            'a landed dialog accepts pointer hits again').toBe('auto')
    });

    test('Escape without the animation', async ({page}) => {
        await page.getByText('Animated', {exact: true}).click();

        await openFrom(page, opener);
        await page.keyboard.press('Escape');

        await expectClosedOnto(page, opener)
    });

    test('closing the second dialog leaves the mask below the first, and focus on the button that opened the second', async ({page}) => {
        const first  = await openFrom(page, opener),
              inner  = first.getByRole('button', {name: 'Edit another contact', exact: true}),
              mask   = page.locator('.neo-dialog-modal-mask'),
              second = await openFrom(page, inner);

        const parent = await first.boundingBox(),
              child  = await second.boundingBox();
        expect(child.x).toBeGreaterThan(parent.x);
        expect(child.y).toBeGreaterThan(parent.y);
        await expect(mask).toHaveCount(1);
        await page.keyboard.press('Escape');

        await expect(second).toHaveCount(0);
        await expect(inner).toBeFocused();
        // the mask sits right before the dialog it covers the page for
        await expect.poll(() => mask.evaluate(node => node.nextElementSibling?.classList.contains('neo-dialog'))).toBe(true);
        expect(await mask.evaluate(node => node.nextElementSibling.id)).toBe(await first.getAttribute('id'));

        await page.keyboard.press('Escape');

        await expectClosedOnto(page, opener)
    });

    test('nested dialogs stay offset and inside a phone viewport without animation', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.getByText('Animated', {exact: true}).click();

        const first  = await openFrom(page, opener),
              inner  = first.getByRole('button', {name: 'Edit another contact', exact: true}),
              second = await openFrom(page, inner),
              parent = await first.boundingBox(),
              child  = await second.boundingBox();

        expect(child.y).toBeGreaterThan(parent.y);
        expect(child.x).toBeGreaterThanOrEqual(0);
        expect(child.y).toBeGreaterThanOrEqual(0);
        expect(child.x + child.width).toBeLessThanOrEqual(390);
        expect(child.y + child.height).toBeLessThanOrEqual(844);

        await page.keyboard.press('Escape');
        await expect(second).toHaveCount(0);
        await expect(inner).toBeFocused();
        expect(await first.boundingBox()).toEqual(parent)
    });

    test('only Save writes the contact draft back to the list', async ({page}) => {
        const contacts = page.locator('.neo-dialog-contact-list');

        let editor = await openFrom(page, opener);
        await editor.locator('input[name="name"]').fill('Unsaved name');
        await editor.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(editor).toHaveCount(0);
        await expect(contacts.getByText('Avery Chen', {exact: true})).toBeVisible();

        editor = await openFrom(page, opener, 'keyboard');
        await editor.locator('input[name="name"]').fill('Another unsaved name');
        await page.keyboard.press('Escape');
        await expect(editor).toHaveCount(0);
        await expect(contacts.getByText('Avery Chen', {exact: true})).toBeVisible();

        editor = await openFrom(page, opener, 'keyboard');
        await editor.locator('input[name="name"]').fill('Avery Riley');
        await editor.locator('input[name="email"]').fill('avery.riley@example.com');
        await editor.locator('input[name="team"]').press('ArrowDown');
        await page.getByRole('option', {name: 'Engineering', exact: true}).click();
        await editor.getByRole('button', {name: 'Save', exact: true}).click();
        await expect(editor).toHaveCount(0);
        await expect(contacts.getByText('Avery Riley', {exact: true})).toBeVisible();
        await expect(opener).toBeFocused();

        editor = await openFrom(page, opener, 'keyboard');
        await expect(editor.locator('input[name="name"]')).toHaveValue('Avery Riley');
        await expect(editor.locator('input[name="email"]')).toHaveValue('avery.riley@example.com');
        await expect(editor.locator('input[name="team"]')).toHaveValue('Engineering')
    })
});
