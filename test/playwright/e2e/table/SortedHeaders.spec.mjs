import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/table/container`: only the sorted column announces its direction, and the announcement moves
 * with the sort.
 *
 * WAI-ARIA allows `aria-sort` on a columnheader only. In a table that is the native `<th>`, while the header button
 * inside it keeps `role=button`, so the attribute has to reach the cell rather than the button.
 */
test.describe('examples/table/container', () => {
    test('only the sorted header announces its direction, through aria-sort (#19913)', async ({page}) => {
        await page.goto('/examples/table/container/index.html');

        const header = name => page.getByRole('columnheader', {name, exact: true}),
              sorted = page.locator('[aria-sort]');

        await expect(header('Firstname')).toBeVisible();
        await expect(sorted).toHaveCount(0);

        await header('Firstname').click();

        await expect(header('Firstname')).toHaveAttribute('aria-sort', 'ascending');
        await expect(sorted).toHaveCount(1);

        await header('Lastname').click();

        await expect(header('Lastname')).toHaveAttribute('aria-sort', 'ascending');
        await expect(header('Firstname')).not.toHaveAttribute('aria-sort');
        await expect(sorted).toHaveCount(1)
    })
});
