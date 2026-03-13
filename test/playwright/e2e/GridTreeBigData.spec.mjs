import { test, expect } from '@playwright/test';

/**
 * @summary Validates the core interactions of the Big Data TreeGrid example.
 *
 * This suite specifically tests the `TreeStore` and `grid.Container` integration under
 * "virtual scroll" conditions. Because the DOM only renders a subset of the data (the projection),
 * we cannot rely on simple `.neo-grid-row` counts to verify structural changes (like expanding
 * a deeply nested folder), as the virtual viewport may remain fully populated (e.g., exactly 29 rows).
 *
 * To ensure reliability, these tests track dynamic `data-record-id` changes and
 * structural shifts rather than relying on absolute row counts.
 */
test.describe('TreeGrid Big Data E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/treeBigData/index.html');
        // Wait for the grid to be visible
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        // Wait for initial records to load
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0, { timeout: 30000 });
    });

    test('Expand / Collapse node via clicks', async ({ page }) => {
        // Find the first folder node (isLeaf: false)
        const firstFolderRow = page.locator('.neo-grid-row:has(.neo-tree-toggle)').first();
        const toggleIcon = firstFolderRow.locator('.neo-tree-toggle');
        await expect(toggleIcon).toBeVisible();

        // Get the text of the row immediately below it (its sibling initially)
        const nextRowBeforeExpand = firstFolderRow.locator('+ .neo-grid-row');
        const siblingText = await nextRowBeforeExpand.textContent();

        // Click the toggle icon to EXPAND
        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // Wait for the row immediately below it to CHANGE (it should now be its child, not its sibling)
        await expect(firstFolderRow.locator('+ .neo-grid-row')).not.toHaveText(siblingText);

        // Click the toggle icon to COLLAPSE
        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        // Wait for the row immediately below it to revert back to the sibling
        await expect(firstFolderRow.locator('+ .neo-grid-row')).toHaveText(siblingText);
    });

    test('Selection happy path: initial render and after single expand', async ({ page }) => {
        // 1. Initial State Selection
        // Wait for initial render
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0);

        // Click the first row to select it
        const firstRow = page.locator('.neo-grid-row:visible').first();

        await firstRow.locator('.neo-grid-cell').nth(2).click({ force: true });

        // Verify it gets the selection class
        await expect(firstRow).toHaveClass(/neo-selected/);

        // 2. Selection after single expand
        const firstFolderRow = page.locator('.neo-grid-row:has(.neo-tree-toggle)').first();
        const toggleIcon = firstFolderRow.locator('.neo-tree-toggle');
        await expect(toggleIcon).toBeVisible();

        // Click to expand
        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // Find the newly revealed child row (it will be immediately after the expanded folder)
        const childRow = firstFolderRow.locator('+ .neo-grid-row');
        await expect(childRow).toBeVisible();

        // Click the child row to select it
        await childRow.locator('.neo-grid-cell').nth(2).click();

        // Verify the child row gets the selection class
        await expect(childRow).toHaveClass(/neo-selected/);

        // In single-select mode, the first row should no longer be selected
        await expect(firstRow).not.toHaveClass(/neo-selected/);
    });

    /**
     * @summary Verifies that manual collapse logic functions correctly after bulk projection operations.
     *
     * This explicitly guards against regressions where `TreeStore.#rebuildKeysAndCount()`
     * failed to rebuild the internal map, causing subsequent `splice` operations to silently fail.
     */
    test('Bulk Expand All / Collapse All and mixed interactions (BUG REPRODUCTION)', async ({ page }) => {
        // Open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // Find the bulk action buttons
        const expandAllBtn = page.locator('.neo-button:has-text("Expand All")');
        const collapseAllBtn = page.locator('.neo-button:has-text("Collapse All")');

        await expect(expandAllBtn).toBeVisible();
        await expect(collapseAllBtn).toBeVisible();

        // 1. Expand All
        await expandAllBtn.click({ force: true });

        // Wait for the first toggle to become expanded
        await expect(page.locator('.neo-tree-toggle').first()).toHaveClass(/is-expanded/, { timeout: 15000 });

        // Close the settings panel to make sure grid rows are clickable without obstruction
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // 3. The Bug Reproduction: Collapse a single folder *after* Expand All
        const firstExpandedFolderDynamic = page.locator('.neo-grid-row:has(.neo-tree-toggle.is-expanded)').first();
        await expect(firstExpandedFolderDynamic).toBeVisible();

        const recordId = await firstExpandedFolderDynamic.getAttribute('data-record-id');
        const targetRow = page.locator(`.neo-grid-row[data-record-id="${recordId}"]`);

        // Get the text of the row immediately following it (its child)
        const nextRow = targetRow.locator('+ .neo-grid-row');
        const childRowRecordId = await nextRow.getAttribute('data-record-id');

        // Click the toggle to collapse
        const toggle = targetRow.locator('.neo-tree-toggle');
        await toggle.click({ force: true });

        // Wait for the toggle to become collapsed
        await expect(toggle).toHaveClass(/is-collapsed/);

        // The bug: Rows are NOT removed.
        // If the bug exists, the next row will still be the child row!
        // We assert that the next row's record ID SHOULD CHANGE.
        await expect(targetRow.locator('+ .neo-grid-row')).not.toHaveAttribute('data-record-id', childRowRecordId, { timeout: 5000 });

        // Re-open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // 4. Collapse All
        await collapseAllBtn.click({ force: true });

        // Wait for the first toggle to become collapsed
        await expect(page.locator('.neo-tree-toggle').first()).toHaveClass(/is-collapsed/, { timeout: 15000 });

        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);
    });

    /**
     * @summary Verifies "ancestor-aware" filtering inside virtualized tree projections.
     */
    test('Filtering', async ({ page }) => {
        // Wait for initial render. The data generator creates exactly 10 roots.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(10, { timeout: 10000 });

        // Open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        const firstnameInput = page.locator('.neo-textfield input[name="firstname"]');

        // 1. Valid Filter
        await firstnameInput.fill('Amanda');

        // Wait for grid to update. Filtering by 'Amanda' will match many children,
        // causing their parents to auto-expand. The visible row count will jump
        // from 10 to fill the virtual viewport (e.g., ~29 rows).
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(10, { timeout: 10000 });

        // Verify that the filtered content actually appears in the visible rows
        await expect(page.locator('.neo-grid-row:visible').filter({ hasText: 'Amanda' })).not.toHaveCount(0);

        // 2. Invalid Filter
        // Type into the firstname filter a string that will NOT exist in the random data
        await firstnameInput.fill('Zyxwvuts');

        // Wait for grid to update. Filtering by a non-existent name should reduce the count to 0.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(0, { timeout: 10000 });

        // 3. Clear Filter
        await firstnameInput.fill('');

        // Clearing the filter will restore the projection.
        // Since 'Amanda' caused nodes to auto-expand, and clearing filters does not re-collapse them,
        // the grid will remain expanded, filling the virtual viewport.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0, { timeout: 10000 });
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(10);

        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);
    });

    test('Selection persists correctly after structural changes (BUG REPRODUCTION)', async ({ page }) => {
        // Open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // Expand All
        const expandAllBtn = page.locator('.neo-button:has-text("Expand All")');
        await expandAllBtn.click({ force: true });

        // Wait for the first toggle to become expanded
        await expect(page.locator('.neo-tree-toggle').first()).toHaveClass(/is-expanded/, { timeout: 15000 });

        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // Find a newly revealed row (e.g., a file node which wouldn't be visible before expandAll)
        // We look for a row without a toggle or simply just the 5th row to ensure it's not the root
        const dynamicRow = page.locator('.neo-grid-row:visible').nth(4);
        await expect(dynamicRow).toBeVisible();
        const recordId = await dynamicRow.getAttribute('data-record-id');
        const targetRow = page.locator(`.neo-grid-row[data-record-id="${recordId}"]`);

        // Click the row to select it
        await targetRow.click({ position: { x: 300, y: 10 }, force: true });

        // The bug: Visually, the row might not get the selection class.
        // We assert that the row MUST get the .neo-selected class.
        await expect(targetRow).toHaveClass(/neo-selected/, { timeout: 5000 });
    });
});
