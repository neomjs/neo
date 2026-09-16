import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The public `examples/grid/cellEditing` boots and renders, which takes a renderer defined on an ancestor.
 *
 * Its `country` column carries `renderer: 'up.countryRenderer'`, and that method reads a store off the example's
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
