import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Which instance a grid column's renderer runs on, witnessed by what the rendered cells show.
 *
 * The public `examples/grid/cellEditing` boots and renders, which takes a renderer defined on an ancestor. Its
 * `country` column carries `renderer: 'up.countryRenderer'`, and that method reads a store off the example's
 * state provider. Run on the column, it throws inside the body's render, and the grid shows no rows at all — so
 * "the example renders" is the end-to-end witness for the scope an `up.` renderer resolves to.
 *
 * The shared fixtures fail this arm on any worker or page error, which is where that throw surfaces.
 */
const EXAMPLE = 'examples/grid/cellEditing/index.html';

test('the cellEditing example renders rows, including an ancestor-defined renderer\'s output', async ({page}) => {
    await page.goto(EXAMPLE);

    const cells = page.locator('.neo-grid-cell');

    await expect(cells.first(), 'the grid rendered at all').toBeVisible({timeout: 30000});

    // The renderer maps the record's country code through the provider's store: DE is the first row's value
    await expect(page.locator('.neo-grid-cell[data-field="country"]').first(), 'the ancestor\'s renderer produced a name')
        .toHaveText('Germany')
});

/**
 * Fixture: `apps/grid-component-columns`, grid `#grid-component-columns` — the component column types a profile grid
 * uses, two records. A component column's `cellRenderer()` builds the cell through `this`, so every arm reads a
 * value only the column's own configs can produce, per record, never a count.
 */
test.describe('component columns build their cells on the column', () => {
    const GRID = '#grid-component-columns';

    // Row ids, read off the plain `followers` column, so no arm locates its rows through the column it tests
    let one, two;

    /**
     * @param {import('@playwright/test').Page} page
     * @param {String} field
     * @param {String} recordId
     * @returns {import('@playwright/test').Locator}
     */
    const cell = (page, field, recordId) => page.locator(`${GRID} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`);

    /**
     * @param {import('@playwright/test').Page} page
     * @param {Number} followers
     * @returns {Promise<String>}
     */
    const recordIdOf = (page, followers) => page.locator(`${GRID} .neo-grid-cell[data-field="followers"]`)
        .getByText(`${followers} followers`, {exact: true}).getAttribute('data-record-id', {timeout: 30000});

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/grid-component-columns/index.html');

        one = await recordIdOf(page, 42);
        two = await recordIdOf(page, 7)
    });

    test('githubUser and githubOrgs link each row to its own account', async ({page}) => {
        await expect(cell(page, 'login', one).locator('a[href="https://github.com/octo-one"]')).toHaveText('octo-one');
        await expect(cell(page, 'login', two).locator('a[href="https://github.com/octo-two"]')).toHaveText('octo-two');
        await expect(cell(page, 'organizations', one).locator('a.neo-org-link[href="https://github.com/org-a"]')).toHaveCount(1);
        await expect(cell(page, 'organizations', two).locator('a.neo-org-link[href="https://github.com/org-b"]')).toHaveCount(1)
    });

    test('a component function renders its record', async ({page}) => {
        await expect(cell(page, 'name', one)).toHaveText('impact:Octo One');
        await expect(cell(page, 'name', two)).toHaveText('impact:Octo Two')
    });

    test('iconLink runs its formatters and keeps its cellCls', async ({page}) => {
        await expect(cell(page, 'topRepo', one).locator('a.neo-icon-link'), 'urlFormatter').toHaveAttribute('href', 'https://github.com/octo-one/engine');
        await expect(cell(page, 'topRepo', two).locator('a.neo-icon-link'), 'labelFormatter').toHaveText('7');
        await expect(cell(page, 'website', two).locator('a.neo-icon-link'), 'the dataField value is the url').toHaveAttribute('href', 'https://two.example');
        await expect(cell(page, 'website', one)).toHaveClass(/profile-column-website/)
    });

    test('countryFlag reads the location through its contentField', async ({page}) => {
        await expect(cell(page, 'countryCode', one)).toHaveText('Berlin');
        await expect(cell(page, 'countryCode', two)).toHaveText('Paris')
    });

    test('linkedin builds a profile url from a handle and keeps a full one', async ({page}) => {
        await expect(cell(page, 'linkedinUrl', one).locator('a.neo-icon-link')).toHaveAttribute('href', 'https://www.linkedin.com/in/octo-one/');
        await expect(cell(page, 'linkedinUrl', two).locator('a.neo-icon-link')).toHaveAttribute('href', 'https://www.linkedin.com/in/octo-two-profile/')
    });

    test('icon shows its cellIconCls only where the record says so', async ({page}) => {
        const notHireable = cell(page, 'isHireable', two).locator('.neo-icon.fa-circle-check');

        await expect(cell(page, 'isHireable', one).locator('.neo-icon.fa-circle-check')).toBeVisible();
        await expect(notHireable, 'rendered for the other record too, so hidden is not absent').toHaveCount(1);
        await expect(notHireable).toBeHidden()
    })
});
