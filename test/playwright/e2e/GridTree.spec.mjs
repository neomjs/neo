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

        // DIAGNOSTICS: Check grid record state BEFORE click
        const gridStateBefore = await page.evaluate(async () => {
            const gridContainer = Neo.getComponent('neo-grid-container-1');
            const store = gridContainer.store;
            const gridNode = store.get('child-1-2');
            return {
                isLeaf: gridNode.isLeaf,
                collapsed: gridNode.collapsed,
                childCount: gridNode.childCount
            };
        });
        console.log('BEFORE:', gridStateBefore);

        // Click the toggle icon to EXPAND the 'component' node
        await toggleIcon.click();

        // Wait for rows to be added.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // DIAGNOSTICS: Check grid record state AFTER click
        const gridStateAfter = await page.evaluate(async () => {
            const gridContainer = Neo.getComponent('neo-grid-container-1');
            const store = gridContainer.store;
            const gridNode = store.get('child-1-2');
            return {
                isLeaf: gridNode.isLeaf,
                collapsed: gridNode.collapsed,
                childCount: gridNode.childCount
            };
        });
        console.log('AFTER:', gridStateAfter);

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
});
