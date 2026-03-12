import { test, expect } from '@playwright/test';

test.describe('Tree Grid E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/tree/index.html');
        // Wait for the grid to be visible
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
    });

    test('Expand / Collapse node', async ({ page }) => {
        // Find the 'component' row
        const componentRow = page.locator('.neo-grid-row:has-text("component")');
        await expect(componentRow).toBeVisible();

        // The tree toggle icon inside this row
        const toggleIcon = componentRow.locator('.neo-tree-toggle');

        // Ensure it has the collapsed class initially
        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        // Check initial row count
        const initialRows = page.locator('.neo-grid-row:visible');
        await expect(initialRows).toHaveCount(7);

        // Click the toggle icon to EXPAND the 'component' node
        await toggleIcon.click();

        // Wait for rows to be added.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // BUG CHECK: Verify the 'grid' folder icon did NOT vanish (become is-leaf).
        // Since 'grid' is the first row, let's locate it explicitly.
        const gridRow = page.locator('.neo-grid-row:has-text("grid")');
        const gridToggleIcon = gridRow.locator('.neo-tree-toggle');
        // 'grid' was expanded initially and should remain expanded, NOT a leaf.
        await expect(gridToggleIcon).not.toHaveClass(/is-leaf/);
        await expect(gridToggleIcon).toHaveClass(/is-expanded/);

        // Click the toggle icon to COLLAPSE the 'component' node
        await toggleIcon.click();

        // Wait for rows to be removed.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(7);
        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        // EXPAND AGAIN
        await toggleIcon.click();
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);
        await expect(toggleIcon).toHaveClass(/is-expanded/);
    });

    test('Sorting TreeStore hierarchically', async ({ page }) => {
        // Wait for grid
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(7);

        // Ensure grid folder is expanded and its children are visible
        const gridRow = page.locator('.neo-grid-row:has-text("grid")');
        const gridToggleIcon = gridRow.locator('.neo-tree-toggle');
        await expect(gridToggleIcon).toHaveClass(/is-expanded/);

        // First click on 'Name' header -> Sort ASC
        const nameHeader = page.locator('.neo-grid-header-button:has-text("Name")');
        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-asc/);

        // Verify top-level sort order: package.json (p), README.md (r), src (s)
        let rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('package.json');
        await expect(rows.nth(1)).toContainText('README.md');
        await expect(rows.nth(2)).toContainText('src');

        // Inside src, order should be component (c), grid (g)
        await expect(rows.nth(3)).toContainText('component'); // collapsed
        await expect(rows.nth(4)).toContainText('grid'); // expanded

        // Inside grid, order should be Container.mjs (c), Row.mjs (r)
        await expect(rows.nth(5)).toContainText('Container.mjs');
        await expect(rows.nth(6)).toContainText('Row.mjs');

        // Second click on 'Name' header -> Sort DESC
        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-desc/);

        // Verify top-level sort order DESC: src (s), README.md (r), package.json (p)
        rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('src');
        await expect(rows.nth(1)).toContainText('grid'); // expanded
        await expect(rows.nth(2)).toContainText('Row.mjs');
        await expect(rows.nth(3)).toContainText('Container.mjs');
        await expect(rows.nth(4)).toContainText('component'); // collapsed
        await expect(rows.nth(5)).toContainText('README.md');
        await expect(rows.nth(6)).toContainText('package.json');
    });

    test('Deep state interactions: multiple expand, collapse, and sort sequences', async ({ page }) => {
        // Initial state: src (expanded), grid (expanded), component (collapsed) -> 7 rows
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(7);

        // 1. Expand "component"
        let componentRow = page.locator('.neo-grid-row:has-text("component")');
        await componentRow.locator('.neo-tree-toggle').click();
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);

        // 2. Collapse "src"
        let srcRow = page.locator('.neo-grid-row:has-text("src")');
        await srcRow.locator('.neo-tree-toggle').click();
        
        // Everything inside "src" should be hidden. Only roots remain: src, package.json, README.md
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(3);

        // 3. Expand "src"
        await srcRow.locator('.neo-tree-toggle').click();
        // It should remember the previously expanded children ("grid" and "component")
        // Therefore, it should expand to the full 9 rows again.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);

        // 4. Collapse "grid"
        let gridRow = page.locator('.neo-grid-row:has-text("grid")');
        await gridRow.locator('.neo-tree-toggle').click();
        // Hide 2 files inside grid -> 7 rows left
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(7);

        // 5. Collapse "src" again
        await srcRow.locator('.neo-tree-toggle').click();
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(3);

        // 6. Sort by Name (ASC) while "src" is collapsed
        const nameHeader = page.locator('.neo-grid-header-button:has-text("Name")');
        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-asc/);

        // Verify root order: package.json, README.md, src
        let rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('package.json');
        await expect(rows.nth(1)).toContainText('README.md');
        await expect(rows.nth(2)).toContainText('src');

        // 7. Expand "src" (while sorted)
        // Note: srcRow locator might be stale since the row was recycled/reordered
        srcRow = page.locator('.neo-grid-row:has-text("src")');
        await srcRow.locator('.neo-tree-toggle').click();

        // "src" is expanded, it remembers "component" is expanded (2 files) and "grid" is collapsed (0 files)
        // Total rows: 3 roots + 2 folders + 2 files = 7 rows
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(7);

        // Verify hierarchical order within "src" (ASC)
        // Inside src, order should be component (c), grid (g)
        // Since component is expanded, its children should be under it: Base.mjs (b), Button.mjs (b)
        rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(2)).toContainText('src');
        await expect(rows.nth(3)).toContainText('component'); // expanded
        await expect(rows.nth(4)).toContainText('Base.mjs');
        await expect(rows.nth(5)).toContainText('Button.mjs');
        await expect(rows.nth(6)).toContainText('grid'); // collapsed

        // 8. Expand "grid" (while sorted)
        gridRow = page.locator('.neo-grid-row:has-text("grid")');
        await gridRow.locator('.neo-tree-toggle').click();

        // Total rows: 9
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);

        // Verify full sorted order
        rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('package.json');
        await expect(rows.nth(1)).toContainText('README.md');
        await expect(rows.nth(2)).toContainText('src');
        await expect(rows.nth(3)).toContainText('component'); // expanded
        await expect(rows.nth(4)).toContainText('Base.mjs');
        await expect(rows.nth(5)).toContainText('Button.mjs');
        await expect(rows.nth(6)).toContainText('grid'); // expanded
        await expect(rows.nth(7)).toContainText('Container.mjs');
        await expect(rows.nth(8)).toContainText('Row.mjs');

        // 9. Sort by Name (DESC)
        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-desc/);

        // Verify full sorted order (DESC)
        rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('src');
        await expect(rows.nth(1)).toContainText('grid'); // expanded
        await expect(rows.nth(2)).toContainText('Row.mjs');
        await expect(rows.nth(3)).toContainText('Container.mjs');
        await expect(rows.nth(4)).toContainText('component'); // expanded
        await expect(rows.nth(5)).toContainText('Button.mjs');
        await expect(rows.nth(6)).toContainText('Base.mjs');
        await expect(rows.nth(7)).toContainText('README.md');
        await expect(rows.nth(8)).toContainText('package.json');
    });
});
