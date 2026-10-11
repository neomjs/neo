import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/table/nestedRecordFields` renders both of its `up.` renderers: the Country names and the Edit
 * buttons.
 *
 * Both renderers are defined on the Viewport and reach the table through `'up.name'`, so they run on the Viewport.
 * `editRenderer` has to reach the table body through its `tableContainer` argument — the Viewport has no `body`.
 */
test.describe('examples/table/nestedRecordFields', () => {
    test('every row renders its country name and an Edit button', async ({page}) => {
        await page.goto('/examples/table/nestedRecordFields/index.html');

        for (const [githubId, country] of [['tobiu', 'Germany'], ['rwaters', 'United States'], ['mrsunshine', 'Germany'], ['camtnbikerrwc', 'United States']]) {
            const row = page.getByRole('row').filter({has: page.getByRole('cell', {name: githubId, exact: true})});

            await expect(row.getByRole('cell').nth(3), `${githubId}: country`).toHaveText(country);
            await expect(row.getByRole('button', {name: 'Edit'}), `${githubId}: Edit button`).toBeVisible()
        }
    })
});
