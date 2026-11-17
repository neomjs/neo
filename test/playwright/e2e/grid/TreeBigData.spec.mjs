import {expect, test} from '../../fixtures.mjs';

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

    /**
     * The first frame of the seeded organization, row by row from the top: the names it shows and their levels
     * @param {Object} page
     * @returns {Promise<String[]>} e.g. '1 Engineering'
     */
    const firstFrame = page => page.locator('.neo-grid-container .neo-grid-row').evaluateAll(rows => rows
        .filter(row => row.getBoundingClientRect().bottom <= window.innerHeight)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map(row => `${row.getAttribute('aria-level')} ${row.querySelector(".neo-grid-cell[data-field='name']")?.textContent.trim()}`));

    test('the first frame opens an organization three levels deep, the same on every load', async ({ page }) => {
        const footer = page.locator('.neo-examples-treebigdata-footer');

        await expect(footer).toHaveText('20,000 rows · 5 levels of units · 72 shown');
        await expect(page.locator('.neo-grid-row[aria-level="3"] .neo-tree-toggle.is-expanded')).toBeVisible();

        const first = await firstFrame(page);

        expect(first.slice(0, 3)).toEqual(['1 Engineering', '2 Platform', '3 Team Atlas']);
        expect(new Set(first.map(row => row.split(' ')[0])).size, 'levels in the first frame').toBeGreaterThanOrEqual(3);
        expect(first.filter(row => /^\d+ (Folder|File) \d+$/.test(row))).toEqual([]);
        await expect(page.locator('.neo-grid-container .show-helper-lines').first()).toBeVisible();

        await page.reload();
        await expect(footer).toHaveText('20,000 rows · 5 levels of units · 72 shown', { timeout: 30000 });
        // The footer can read before the rows are laid out
        await expect.poll(() => firstFrame(page)).toEqual(first);

        // A phone still shows two levels and more
        await page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(async () => new Set((await firstFrame(page)).map(row => row.split(' ')[0])).size).toBeGreaterThanOrEqual(2)
    });

    test('Expand / Collapse node via clicks', async ({ page }) => {
        // Find the first folder node (isLeaf: false)
        const firstFolderRow = page.locator('.neo-grid-row:has(.neo-tree-toggle)').first();
        const toggleIcon     = firstFolderRow.locator('.neo-tree-toggle');
        await expect(toggleIcon).toBeVisible();

        // Get the text of the row immediately below it (its sibling initially)
        const nextRowBeforeExpand = firstFolderRow.locator('+ .neo-grid-row');
        const siblingText         = await nextRowBeforeExpand.textContent();

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

    /**
     * Every row this arm asserts on is bound by `data-record-id`, never by position — the idiom the
     * collapse arm below already uses, applied here because this arm did not have it.
     *
     * `neo-selected` is applied to the row rendering the selected RECORD, while `+ .neo-grid-row`
     * names a POSITION. `grid.Body` pools rows and recycles them in place, so an expand re-projects
     * which record each element renders. A positional locator therefore identifies one row at click
     * time and possibly a different one at assertion time, and the class it waits for will never
     * appear on the second — no timeout can help, because nothing is late.
     *
     * That is not hypothetical. A hosted failure's call log caught it mid-assertion, one element
     * resolving to two records:
     *
     *      2 x  id="neo-grid-body-1__row-1"  data-record-id="neo-record-2"   level=1
     *     12 x  id="neo-grid-body-1__row-1"  data-record-id="neo-record-79"  level=2
     */
    test('Selection happy path: initial render and after single expand', async ({ page }) => {
        // 1. Initial State Selection
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0);

        const firstRowId = await page.locator('.neo-grid-row:visible').first().getAttribute('data-record-id');
        const firstRow   = page.locator(`.neo-grid-row[data-record-id="${firstRowId}"]`);

        await firstRow.locator('.neo-grid-cell').nth(2).click({ force: true });
        await expect(firstRow).toHaveClass(/neo-selected/);

        // 2. Selection after single expand. The first frame opens the first division, so close it first
        const folderId   = await page.locator('.neo-grid-row[aria-level="1"]:has(.neo-tree-toggle)').first().getAttribute('data-record-id');
        const folderRow  = page.locator(`.neo-grid-row[data-record-id="${folderId}"]`);
        const toggleIcon = folderRow.locator('.neo-tree-toggle');
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // The child is FOUND by position — that is what "newly revealed below the folder" means — and
        // then pinned to its record before anything else happens. Position is how you locate it once;
        // identity is what every later step must use.
        const revealed    = folderRow.locator('+ .neo-grid-row'),
              folderLevel = Number(await folderRow.getAttribute('aria-level'));

        // The toggle's class can land before the rows it reveals: pin only once the row below the folder is its child
        await expect(revealed).toHaveAttribute('aria-level', String(folderLevel + 1));
        await expect(revealed).toBeVisible();

        const childId  = await revealed.getAttribute('data-record-id');
        const childRow = page.locator(`.neo-grid-row[data-record-id="${childId}"]`);

        expect(childId, 'the revealed child must carry a record id, or every assertion below is positional again').toBeTruthy();
        expect(childId, 'expanding must reveal a DIFFERENT record below the folder').not.toBe(folderId);

        await childRow.locator('.neo-grid-cell').nth(2).click();

        await expect(childRow).toHaveClass(/neo-selected/);

        // In single-select mode, the first row should no longer be selected.
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
        const expandAllBtn   = page.locator('.neo-button:has-text("Expand All")');
        const collapseAllBtn = page.locator('.neo-button:has-text("Collapse All")');

        await expect(expandAllBtn).toBeVisible();
        await expect(collapseAllBtn).toBeVisible();

        // 1. Expand All
        await expandAllBtn.click({ force: true });

        const visibleTreeToggle = page.locator('.neo-grid-row:visible .neo-tree-toggle');

        // Wait for the first visible toggle to become expanded
        await expect(visibleTreeToggle.first()).toHaveClass(/is-expanded/, { timeout: 15000 });

        // Close the settings panel to make sure grid rows are clickable without obstruction
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // 3. The Bug Reproduction: Collapse a single folder *after* Expand All
        const firstExpandedFolderDynamic = page.locator('.neo-grid-row:visible:has(.neo-tree-toggle.is-expanded)').first();
        await expect(firstExpandedFolderDynamic).toBeVisible();

        const recordId  = await firstExpandedFolderDynamic.getAttribute('data-record-id');
        const targetRow = page.locator(`.neo-grid-row[data-record-id="${recordId}"]`);

        // Get the text of the row immediately following it (its child)
        const nextRow          = targetRow.locator('+ .neo-grid-row');
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

        // Wait for the first visible toggle to become collapsed
        await expect(visibleTreeToggle.first()).toHaveClass(/is-collapsed/, { timeout: 15000 });

        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);
    });

    /**
     * @summary Verifies "ancestor-aware" filtering inside virtualized tree projections.
     */
    test('Filtering', async ({ page }) => {
        const footer = page.locator('.neo-examples-treebigdata-footer');

        // The seeded first frame opens one path of the organization: 72 of its 20,000 rows show
        await expect(footer).toHaveText('20,000 rows · 5 levels of units · 72 shown', { timeout: 10000 });

        // Open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        const firstnameInput = page.locator('.neo-textfield input[name="firstname"]');

        // 1. Valid Filter
        await firstnameInput.fill('Amanda');

        // Every Amanda keeps her units open, so the footer counts other rows than the first frame's
        await expect(footer).not.toHaveText(/· 72 shown$/, { timeout: 10000 });

        // Verify that the filtered content actually appears in the visible rows
        await expect(page.locator('.neo-grid-row:visible').filter({ hasText: 'Amanda' })).not.toHaveCount(0);

        // 2. Invalid Filter
        // Type into the firstname filter a string that will NOT exist in the random data
        await firstnameInput.fill('Zyxwvuts');

        // Wait for grid to update. Filtering by a non-existent name should reduce the count to 0.
        await expect(page.locator('.neo-grid-row:visible')).toHaveCount(0, { timeout: 10000 });
        await expect(footer).toHaveText(/· 0 shown$/);

        // 3. Clear Filter
        await firstnameInput.fill('');

        // Clearing the filter will restore the projection.
        // Since 'Amanda' caused nodes to auto-expand, and clearing filters does not re-collapse them,
        // the grid will remain expanded, filling the virtual viewport.
        await expect(page.locator('.neo-grid-row:visible')).not.toHaveCount(0, { timeout: 10000 });
        await expect(footer).not.toHaveText(/· 0 shown$/);

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

        // Wait for the first visible toggle to become expanded
        await expect(page.locator('.neo-grid-row:visible .neo-tree-toggle').first()).toHaveClass(/is-expanded/, { timeout: 15000 });

        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // Find a newly revealed row (e.g., a file node which wouldn't be visible before expandAll)
        // We look for a row without a toggle or simply just the 5th row to ensure it's not the root
        const dynamicRow = page.locator('.neo-grid-row:visible').nth(4);
        await expect(dynamicRow).toBeVisible();
        const recordId  = await dynamicRow.getAttribute('data-record-id');
        const targetRow = page.locator(`.neo-grid-row[data-record-id="${recordId}"]`);

        // Click the row to select it
        await targetRow.click({ position: { x: 300, y: 10 }, force: true });

        // The bug: Visually, the row might not get the selection class.
        // We assert that the row MUST get the .neo-selected class.
        await expect(targetRow).toHaveClass(/neo-selected/, { timeout: 5000 });
    });
});
