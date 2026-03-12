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

        // Click the toggle icon to EXPAND
        await toggleIcon.click();

        // Wait for rows to be added.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(9);
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // Click the toggle icon to COLLAPSE
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
