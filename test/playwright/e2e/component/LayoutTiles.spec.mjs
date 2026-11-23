import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The titles of the accordion items that are open.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function openItems(page) {
    return page.$$eval('.help-center .neo-accordion-item.neo-expanded .neo-accordion-header-title', els => els.map(el => el.textContent))
}

/**
 * @summary The wizard step on screen, by its title.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function wizardStep(page) {
    return page.$$eval('.card-wizard-title', els => els.filter(el => el.offsetParent !== null).map(el => el.textContent))
}

/**
 * @summary The rows of the fragment example's DOM panel.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
function domRows(page) {
    return page.$$eval('.fragment-dom-row', els => els.map(el => el.textContent))
}

/**
 * @summary The three Containers & Layouts tiles: the accordion's `maxExpandedItems` from the inspector, the card
 * layout's wizard by button and keyboard, and the fragment whose fields are the form's own DOM children.
 */
test.describe('Layout tiles', () => {
    test.setTimeout(60000);

    test('the inspector\'s maxExpandedItems lets more answers stay open, and lowering it closes the first opened', async ({page}) => {
        // An item opens and closes by its arrow; a click on its title selects it
        const header = title => page.locator('.help-center .neo-accordion-item')
                  .filter({has: page.locator('.neo-accordion-header-title', {hasText: title})})
                  .locator('.neo-accordion-header-arrow'),
              field  = page.locator('.neo-workbench-inspector input').first();

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/container/accordion/index.html');
        await expect.poll(() => openItems(page)).toEqual(['Where is my order?']);

        // One answer at a time
        await header('How do I return an item?').click();
        await expect.poll(() => openItems(page)).toEqual(['How do I return an item?']);

        await field.fill('2');
        await field.press('Tab');
        await header('Which payments do you take?').click();
        await expect.poll(() => openItems(page)).toEqual(['How do I return an item?', 'Which payments do you take?']);

        await field.fill('1');
        await field.press('Tab');
        await expect.poll(() => openItems(page)).toEqual(['Which payments do you take?'])
    });

    test('the wizard moves forward and back by button and by keyboard, and its last step reads the first two', async ({page}) => {
        const back = page.getByRole('button', {name: 'Back'}),
              next = page.getByRole('button', {name: 'Next'});

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/layout/card/index.html');
        await expect.poll(() => wizardStep(page)).toEqual(['Name your workspace']);
        await expect(back).toBeDisabled();

        await next.click();
        await expect.poll(() => wizardStep(page)).toEqual(['Invite your team']);

        await back.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => wizardStep(page)).toEqual(['Name your workspace']);

        await next.focus();
        await page.keyboard.press('Enter');
        await next.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => wizardStep(page)).toEqual(['You are set']);
        await expect(page.locator('.card-wizard-summary')).toHaveText('Lighthouse Studio is ready, and an invite goes to ana@example.com.');
        await expect(next).toBeDisabled()
    });

    test('the wizard\'s summary shows a typed name as text, angle brackets included', async ({page}) => {
        const next    = page.getByRole('button', {name: 'Next'}),
              summary = page.locator('.card-wizard-summary');

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/layout/card/index.html');
        await expect.poll(() => wizardStep(page)).toEqual(['Name your workspace']);

        await page.getByRole('textbox', {name: 'Workspace'}).fill('Lighthouse <Studio>');
        await next.click();
        await expect.poll(() => wizardStep(page)).toEqual(['Invite your team']);
        await next.click();
        await expect.poll(() => wizardStep(page)).toEqual(['You are set']);

        await expect(summary).toHaveText('Lighthouse <Studio> is ready, and an invite goes to ana@example.com.');
        await expect(summary.locator('studio')).toHaveCount(0)
    });

    test('the fragment\'s fields are the form\'s own DOM children, hide at once, and move as one unit', async ({page}) => {
        const fragment = ['Street', 'City', 'Postcode', 'Country'].map(name => `<div> ${name}fragment`);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/container/fragment/index.html');
        await expect.poll(() => domRows(page)).toEqual(['<div> Name', '<div> Email', ...fragment, '<div> Phone']);

        await page.getByText('Hide the address', {exact: true}).click();
        await expect.poll(() => domRows(page)).toEqual(['<div> Name', '<div> Email', '<div> Phone']);

        await page.getByText('Hide the address', {exact: true}).click();
        await expect.poll(() => domRows(page)).toHaveLength(7);

        await page.getByRole('button', {name: 'Move the address to the top'}).click();
        await expect.poll(() => domRows(page)).toEqual([...fragment, '<div> Name', '<div> Email', '<div> Phone'])
    });

    test('the form layout opens in the requested theme, keeps >= 120 px inputs on desktop and phone, and updates labels live', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/layout/form/index.html?theme=neo-theme-neo-dark');

        await expect(page.locator('.neo-workbench-stage')).toBeVisible();
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-dark/);

        await expect.poll(() => page.$$eval('.neo-layout-form .neo-input-wrapper', els => els.map(el => el.getBoundingClientRect().width)))
            .toHaveLength(4);
        const desktopWidths = await page.$$eval('.neo-layout-form .neo-input-wrapper', els => els.map(el => el.getBoundingClientRect().width));
        desktopWidths.forEach(w => expect(w).toBeGreaterThanOrEqual(120));

        // Update the first label through the inspector and verify the rendered form label updates live
        const labelInput = page.locator('.neo-workbench-inspector input').nth(1);
        await labelInput.fill('Account owner full legal name');
        await labelInput.press('Tab');
        await expect(page.locator('.neo-layout-form .neo-textfield-label').first()).toHaveText('Account owner full legal name');

        // Narrow to phone width (390 × 844): zero horizontal overflow and every input stays >= 120 px wide
        await page.setViewportSize({width: 390, height: 844});
        await expect.poll(() => page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            allWide : [...document.querySelectorAll('.neo-layout-form .neo-input-wrapper')].every(el => el.getBoundingClientRect().width >= 120)
        }))).toEqual({
            overflow: 0,
            allWide : true
        })
    })
});
