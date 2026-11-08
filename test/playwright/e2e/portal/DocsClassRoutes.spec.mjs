import {expect, test} from '../../fixtures.mjs';

const DOCS = '/docs/index.html';

/**
 * @summary The content tab header a route opens: the header carries its route as an anchor href.
 * @param {Object} page
 * @param {String} route e.g. `/viewClass/Neo.form.field.TextArea`
 * @returns {Object} The header locator
 */
const tabHeader = (page, route) => page.locator(`.neo-tab-header-button[href="#${route}"]`);

/**
 * The Docs app opens class and source tabs as routes, so the URL names the active tab and a reload or deep link
 * reopens it, even though a route fired on load arrives before the class index has loaded.
 */
test.describe('Docs app class and source routes', () => {
    test('a class tree click moves the URL to the class route, and a reload restores the active tab', async ({page}) => {
        const route = '/viewClass/Neo.form.field.TextArea';

        await page.goto(DOCS);
        await page.locator('input[placeholder="Filter Navigation"]').fill('TextArea');
        await page.locator('.neo-docs-navigation-tab-container .neo-list-item-leaf', {hasText: 'TextArea'}).first().click();

        await expect(page).toHaveURL(new RegExp(`#${route}$`));
        await expect(tabHeader(page, route)).toHaveClass(/pressed/);

        await page.reload();
        await expect(tabHeader(page, route), 'the reload reopens the class tab').toHaveClass(/pressed/)
    });

    test('a class or source deep link opens its tab on a fresh load', async ({page}) => {
        for (const route of ['/viewClass/Neo.component.DateSelector', '/viewSource/Neo.component.DateSelector']) {
            await page.goto('about:blank');
            await page.goto(`${DOCS}#${route}`);
            await expect(tabHeader(page, route), route).toHaveClass(/pressed/)
        }
    });

    test('activating an open tab moves the URL back to its route', async ({page}) => {
        const first  = '/viewClass/Neo.component.DateSelector',
              second = '/viewClass/Neo.form.field.TextArea';

        await page.goto(`${DOCS}#${first}`);
        await expect(tabHeader(page, first)).toHaveClass(/pressed/);
        await page.evaluate(route => {location.hash = route}, second);
        await expect(tabHeader(page, second)).toHaveClass(/pressed/);

        await tabHeader(page, first).click();
        await expect(page).toHaveURL(new RegExp(`#${first}$`));
        await expect(tabHeader(page, first)).toHaveClass(/pressed/)
    });
});
