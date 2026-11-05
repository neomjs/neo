import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Browser witness for `Neo.grid.Row#applyRendererOutput` with a `Neo.functional.component.Base` cell component.
 *
 * `Neo.functional.component.Base` extends `Neo.component.Abstract` rather than `Neo.component.Base`. When a grid column
 * renderer returns a functional component instance (such as `Neo.functional.button.Base` inside `Neo.grid.column.Component`),
 * `Neo.grid.Row#applyRendererOutput` must register it in `row.components` and emit `createVdomReference()` so the cell
 * mounts the functional component into the DOM and reuses it in place across record updates.
 *
 * Fixture: `test/playwright/component/apps/grid-component-columns`, grid `#grid-component-columns`.
 */
test.describe('Grid functional component cells', () => {
    const GRID = '#grid-component-columns';

    const cell = (page, field, recordId) =>
        page.locator(`${GRID} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`);

    const recordIdOf = (page, followers) =>
        page.locator(`${GRID} .neo-grid-cell[data-field="followers"]`)
            .getByText(`${followers} followers`, {exact: true})
            .getAttribute('data-record-id', {timeout: 30000});

    test('renders a Neo.functional.button.Base cell per row and updates it in place across snapshot changes', async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-component-columns/index.html');

        const one       = await recordIdOf(page, 42),
              two       = await recordIdOf(page, 7),
              actionOne = cell(page, 'action', one).locator('button.neo-button'),
              actionTwo = cell(page, 'action', two).locator('button.neo-button');

        await expect(actionOne).toHaveText('action:Octo One');
        await expect(actionTwo).toHaveText('action:Octo Two');

        await actionOne.evaluate(node => {
            node.dataset.snapshotWitness = 'retained'
        });

        for (const [name, followers] of [['Updated One', 84], ['Octo One', 42]]) {
            await page.getByRole('button', {name: 'Toggle snapshot', exact: true}).click();
            await expect(cell(page, 'followers', one)).toHaveText(`${followers} followers`);
            await expect(actionOne).toHaveText(`action:${name}`);
            await expect(actionOne).toHaveAttribute('data-snapshot-witness', 'retained');
            await expect(actionTwo).toHaveText('action:Octo Two')
        }
    })
});
