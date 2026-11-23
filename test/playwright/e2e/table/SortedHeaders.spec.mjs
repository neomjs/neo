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

        await expect(header('Specification')).toBeVisible();
        await expect(sorted).toHaveCount(0);

        await header('Specification').click();

        await expect(header('Specification')).toHaveAttribute('aria-sort', 'ascending');
        await expect(sorted).toHaveCount(1);

        await header('Area').click();

        await expect(header('Area')).toHaveAttribute('aria-sort', 'ascending');
        await expect(header('Specification')).not.toHaveAttribute('aria-sort');
        await expect(sorted).toHaveCount(1)
    });

    test('columns size to their content, notes wrap, sticky header holds on scroll, and Reset restores (#21185)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/table/container/index.html');

        const header = name => page.getByRole('columnheader', {name, exact: true});

        await expect(page.locator('.neo-workbench-stage-desc')).toContainText('Neo.table.Container');
        await expect(page.locator('.neo-workbench-stage-desc')).toContainText('virtualization');
        await expect(page.locator('tbody tr')).toHaveCount(14);

        const [areaBox, specBox, notesBox, notesCellBox] = await Promise.all([
            header('Area').boundingBox(),
            header('Specification').boundingBox(),
            header('Notes').boundingBox(),
            page.locator('tbody tr:first-child td.neo-table-spec-notes').boundingBox()
        ]);

        expect(areaBox.width).toBeLessThan(specBox.width);
        expect(specBox.width).toBeLessThan(notesBox.width);
        expect(notesCellBox.height).toBeGreaterThan(40);

        const headerTopBefore = (await header('Specification').boundingBox()).y;

        await page.locator('#myTableStoreContainer').evaluate(el => {
            el.scrollTop = 180;
        });

        const headerTopAfter = (await header('Specification').boundingBox()).y;
        expect(Math.abs(headerTopAfter - headerTopBefore)).toBeLessThan(2);

        await header('Specification').click();
        await expect(header('Specification')).toHaveAttribute('aria-sort', 'ascending');
        await page.locator('.neo-checkboxfield').filter({hasText: 'Fit width'}).click();
        await expect(page.locator('#myTableStoreContainer')).toHaveClass(/neo-table-fit-width/);

        await page.locator('.neo-button-reset').click();
        await expect(page.locator('#myTableStoreContainer')).not.toHaveClass(/neo-table-fit-width/);
        await expect(header('Specification')).not.toHaveAttribute('aria-sort');
        await expect(page.locator('tbody tr:first-child td').first()).toHaveText('Dedicated compute')
    })
});
