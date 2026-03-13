import { test, expect } from '@playwright/test';

test.describe('TreeGrid Big Data E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/treeBigData/index.html');
        // Wait for the grid to be visible
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        // Wait for initial records to load (amountRows is 20000, so it will take a moment to generate)
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0, { timeout: 30000 });
    });

    test('Expand / Collapse node via clicks', async ({ page }) => {
        // Find the first folder node (isLeaf: false)
        // Since data is random, we just look for any row that has an expandable toggle
        const firstFolderToggle = page.locator('.neo-tree-toggle').nth(0);
        await expect(firstFolderToggle).toBeVisible();

        // Get initial visible row count
        const initialRowsCount = await page.locator('.neo-grid-row:visible').count();

        // Click the toggle icon to EXPAND
        await firstFolderToggle.click();

        // Wait for rows to be added.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(initialRowsCount);
        const expandedRowsCount = await page.locator('.neo-grid-row:visible').count();
        expect(expandedRowsCount).toBeGreaterThan(initialRowsCount);

        // Click the toggle icon to COLLAPSE
        await firstFolderToggle.click();

        // Wait for rows to be removed.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(initialRowsCount);
    });

    test('Bulk Expand All / Collapse All and mixed interactions (BUG REPRODUCTION)', async ({ page }) => {
        // Find the bulk action buttons
        const expandAllBtn = page.locator('.neo-button:has-text("Expand All")');
        const collapseAllBtn = page.locator('.neo-button:has-text("Collapse All")');

        await expect(expandAllBtn).toBeVisible();
        await expect(collapseAllBtn).toBeVisible();

        // 1. Initial State: Should only be root nodes
        const initialRowsCount = await page.locator('.neo-grid-row:visible').count();

        // 2. Expand All
        await expandAllBtn.click({ force: true });
        
        // Wait for the loading mask to disappear (ControlsContainer adds a 5ms timeout and sets isLoading)
        // Wait for a significant increase in rows
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(initialRowsCount, { timeout: 15000 });
        const fullyExpandedCount = await page.locator('.neo-grid-row:visible').count();
        expect(fullyExpandedCount).toBeGreaterThan(initialRowsCount);

        // 3. The Bug Reproduction: Collapse a single folder *after* Expand All
        // Find a toggle that is currently expanded
        const anExpandedToggle = page.locator('.neo-tree-toggle.is-expanded').nth(0);
        await expect(anExpandedToggle).toBeVisible();

        await anExpandedToggle.click({ force: true });

        // The bug: Rows are NOT removed.
        // We assert that the count SHOULD decrease. If the bug exists, this expect will fail (timeout),
        // which successfully reproduces the bug.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(fullyExpandedCount, { timeout: 5000 });

        // 4. Collapse All
        await collapseAllBtn.click({ force: true });
        
        // Wait for it to return to the initial state
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(initialRowsCount, { timeout: 15000 });
    });
    
    test('Filtering', async ({ page }) => {
        // Wait for initial render
        const initialRowsCount = await page.locator('.neo-grid-row:visible').count();
        expect(initialRowsCount).toBeGreaterThan(0);

        // Type into the firstname filter
        const firstnameInput = page.locator('.neo-textfield input[name="firstname"]');
        await firstnameInput.fill('Amanda'); // Using a specific name from the MainStore list
        
        // Wait for grid to update. Filtering usually reduces the count, but might expand parents.
        // We just wait for the loading mask cycle or a change in rows.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(initialRowsCount, { timeout: 10000 });
        
        const filteredCount = await page.locator('.neo-grid-row:visible').count();

        // Clear the filter
        await firstnameInput.fill('');
        
        // Should return to a different state than the filtered state
        // Note: We don't assert it equals initialRowsCount because parents expanded by the filter
        // will remain expanded after clearing it.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(filteredCount, { timeout: 10000 });
    });
});