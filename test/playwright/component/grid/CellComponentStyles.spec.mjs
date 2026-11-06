import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The grid cell components render with their own styles. The App Worker loads a class's CSS from the path of
 * its `className`, so a component whose class moves without its SCSS renders unstyled and throws nothing.
 *
 * Fixture: `apps/grid-component-columns`, grid `#grid-component-columns`. Each arm reads a computed value that only the
 * component's own SCSS sets, or for `IconLink` also its theme file.
 */
test.describe('grid cell components load their own styles', () => {
    const GRID = '#grid-component-columns';

    /**
     * @param {import('@playwright/test').Page} page
     * @param {String} field
     * @param {String} selector
     * @returns {import('@playwright/test').Locator}
     */
    const inCell = (page, field, selector) => page.locator(`${GRID} .neo-grid-cell[data-field="${field}"] ${selector}`).first();

    /**
     * @param {import('@playwright/test').Locator} locator
     * @param {String} property
     * @returns {Promise<String>}
     */
    const style = (locator, property) => locator.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name).trim(), property);

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/grid-component-columns/index.html');

        await expect(inCell(page, 'login', '.neo-github-user'), 'the grid rendered its cells').toBeVisible({timeout: 30000})
    });

    test('CountryFlag', async ({page}) => {
        await expect.poll(() => style(inCell(page, 'countryCode', 'div.neo-country-flag'), 'display'), {timeout: 10000}).toBe('flex');
        await expect.poll(() => style(inCell(page, 'countryCode', 'img.neo-country-flag'), 'width')).toBe('20px')
    });

    test('GitHubOrgs', async ({page}) => {
        await expect.poll(() => style(inCell(page, 'organizations', '.neo-github-orgs'), 'column-gap'), {timeout: 10000}).toBe('4px')
    });

    test('GitHubUser', async ({page}) => {
        await expect.poll(() => style(inCell(page, 'login', '.neo-github-user'), 'column-gap'), {timeout: 10000}).toBe('10px')
    });

    test('IconLink, from its own SCSS and its theme file', async ({page}) => {
        await expect.poll(() => style(inCell(page, 'topRepo', '.neo-icon-link .neo-link-label'), 'margin-left'), {timeout: 10000}).not.toBe('0px');
        await expect.poll(() => style(inCell(page, 'topRepo', '.neo-icon-link'), '--icon-link-color')).not.toBe('')
    })
});
