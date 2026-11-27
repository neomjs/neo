import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/nestedRecordFields`: renders >= 20 partner records with nested `user.*` and `address.*`
 * columns, opens a full-width form dialog (>= 180px fields at 1440×900, usable at 390×844), commits changes on Save
 * with `.neo-is-modified` cell markers, supports keyboard open/close (`Enter`, `Space`, `Escape`), switches both
 * themes, and restores initial data on Reset.
 */
const URL = '/examples/grid/nestedRecordFields/index.html';

test.describe('Grid edit-in-a-dialog example', () => {
    test('renders >= 20 rows and >= 2 nested columns, sizes all dialog fields >= 180px at 1440x900, saves nested edits, and resets', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const firstRow = page.locator('.neo-grid-row').first();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara', {timeout: 30000});
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.country"]')).toHaveText('Nigeria');

        const ariaRowCount = Number(await page.getByRole('grid').getAttribute('aria-rowcount'));
        expect(ariaRowCount).toBeGreaterThanOrEqual(21); // 1 header row + >= 20 data rows (28 records)

        const nestedHeaders = await page.locator('.neo-grid-cell[data-field*="."]').evaluateAll(els =>
            [...new Set(els.map(el => el.getAttribute('data-field')))]
        );
        expect(nestedHeaders.length).toBeGreaterThanOrEqual(2);

        // Open dialog from row 0 Edit button and wait for the dialog's focus on its first field
        await firstRow.locator('.neo-button', {hasText: 'Edit'}).click();

        const dialog = page.locator('.neo-dialog');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});

        // Every form field (including CountryField) is >= 180px wide at 1440x900
        await expect.poll(async () => {
            const widths = await dialog.locator('.neo-textfield, .neo-checkboxfield').evaluateAll(els =>
                els.map(el => Math.round(el.getBoundingClientRect().width))
            );
            return widths.length === 7 ? Math.min(...widths) : 0
        }).toBeGreaterThanOrEqual(180);

        // Also assert the Country input wrapper itself is >= 180px wide (guarding against the ~30px collapse)
        await expect.poll(async () =>
            dialog.locator('.neo-countryfield .neo-input-wrapper').evaluate(
                el => Math.round(el.getBoundingClientRect().width)
            )
        ).toBeGreaterThanOrEqual(180);

        // Change nested address.city and nested user.lastname, then Save
        const cityInput     = dialog.locator('.neo-textfield').filter({hasText: 'City'}).locator('input.neo-textfield-input'),
              lastnameInput = dialog.locator('.neo-textfield').filter({hasText: 'Last Name'}).locator('input.neo-textfield-input');

        await cityInput.fill('Abuja');
        await lastnameInput.fill('Okafor-Nwosu');
        await dialog.locator('.neo-button', {hasText: 'Save'}).click();

        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveText('Abuja');
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveClass(/neo-is-modified/);
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.lastname"]')).toHaveText('Okafor-Nwosu');
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.lastname"]')).toHaveClass(/neo-is-modified/);
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).not.toHaveClass(/neo-is-modified/);

        // Reset restores unmodified store records
        await page.locator('.neo-button', {hasText: 'Reset'}).click();
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveText('Lagos');
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).not.toHaveClass(/neo-is-modified/)
    });

    test('opens and closes by keyboard, discards on Escape, saves on Enter, and works at 390x844 in both themes', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(URL);

        const firstRow = page.locator('.neo-grid-row').first(),
              editBtn  = firstRow.locator('.neo-button', {hasText: 'Edit'}),
              dialog   = page.locator('.neo-dialog');

        await expect(editBtn).toBeVisible({timeout: 30000});

        // Open by keyboard (focus Edit -> Enter) and wait for the dialog's focus on its first field
        await editBtn.focus();
        await page.keyboard.press('Enter');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});

        // Usable field widths at 390x844 (every field fits inside viewport and Country input wrapper >= 160px)
        await expect.poll(async () =>
            dialog.locator('.neo-countryfield .neo-input-wrapper').evaluate(
                el => Math.round(el.getBoundingClientRect().width)
            )
        ).toBeGreaterThanOrEqual(160);

        // Type into focused First Name field, then press Escape -> discards draft and restores focus to Edit button
        await page.keyboard.type('DraftIgnored');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara');
        await expect(editBtn).toBeFocused();

        // Re-open with Space on focused Edit button, switch theme first to verify light theme too
        await page.locator('.neo-button', {hasText: 'Light Theme'}).click();
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-light/);

        await editBtn.focus();
        await page.keyboard.press('Space');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveClass(/neo-theme-light/);

        const firstnameInput = dialog.locator('.neo-textfield').filter({hasText: 'First Name'}).locator('input.neo-textfield-input');
        await expect(firstnameInput).toBeFocused({timeout: 5000});
        await firstnameInput.fill('chioma');
        await page.keyboard.press('Enter');

        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('chioma');
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveClass(/neo-is-modified/)
    });

    test('Escape while the dialog still opens hands focus back to the Edit button (#21753)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const editBtn = page.locator('.neo-grid-row').first().locator('.neo-button', {hasText: 'Edit'}),
              dialog  = page.locator('.neo-dialog');

        await expect(editBtn).toBeVisible({timeout: 30000});

        // The first field takes focus as the dialog mounts, before its open animation ends: Escape at once
        await editBtn.focus();
        await page.keyboard.press('Enter');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});

        // Records, for each focus the button takes, whether the modal is still in the DOM in front of it
        await editBtn.evaluate(el => {
            window.editFocusDialogInDom = [];
            el.addEventListener('focusin', () => window.editFocusDialogInDom.push(!!document.querySelector('.neo-dialog')))
        });
        await page.keyboard.press('Escape');

        await expect(dialog).toBeHidden();
        await expect(editBtn).toBeFocused();
        expect(await page.evaluate(() => window.editFocusDialogInDom)).toEqual([false])
    });

    test('an open dialog stays inside the viewport with its draft and focus when the window narrows (#22319)', async ({page}) => {
        await page.setViewportSize({width: 1200, height: 850});
        await page.goto(URL);

        const firstRow  = page.locator('.neo-grid-row').first(),
              editBtn   = firstRow.locator('.neo-button', {hasText: 'Edit'}),
              dialog    = page.locator('.neo-dialog'),
              firstname = dialog.locator('.neo-textfield').filter({hasText: 'First Name'}).locator('input.neo-textfield-input');

        await expect(editBtn).toBeVisible({timeout: 30000});
        await editBtn.click();
        await expect(firstname).toBeFocused({timeout: 10000});
        await firstname.fill('Draft');

        // Narrow only once the open animation has written the dialog's centred position: the first field takes focus
        // as the dialog mounts, and a resize before the end would let the animation centre it in the narrow window
        await expect(dialog).not.toHaveClass(/neo-animating/);
        await page.setViewportSize({width: 390, height: 844});

        // The whole dialog box lies inside the narrowed viewport
        await expect.poll(() => dialog.evaluate(el => {
            const {bottom, left, right, top} = el.getBoundingClientRect();
            return left >= 0 && top >= 0 && right <= window.innerWidth && bottom <= window.innerHeight
        }), {timeout: 10000}).toBe(true);

        await expect(firstname).toBeFocused();
        await expect(firstname).toHaveValue('Draft');

        // Escape still discards the draft and hands focus back to the row's Edit button
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara');
        await expect(editBtn).toBeFocused()
    })
});
