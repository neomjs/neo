import { test, expect } from '../fixtures.mjs';

test.describe('Desktop (1280x720): Grid Multi-Body Neural Link Selection Validation', () => {
    test.setTimeout(90000); // DevIndex is heavy; give 90s for page render + NL mapping
    test.use({ viewport: { width: 1280, height: 720 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/apps/devindex/index.html');
        
        // Wait for grid skeleton to mount
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        
        // Wait for initial data stream to hit (Stop button becomes visible)
        const stopButton = page.locator('.devindex-stop-stream-button');
        await expect(stopButton).toBeVisible({ timeout: 10000 });
        
        // Click the stop button immediately so we don't wait for thousands of rows.
        // We use force in case it's animating, and ignore errors if it somehow already hid itself.
        try {
            await stopButton.click({ timeout: 2000, force: true });
        } catch (e) {
            // Stream finished extremely fast and button auto-hid
        }
        
        // Let UI settle for a moment after stopping
        await page.waitForTimeout(500);
    });

    test('Cross-Body Row Selection Synchronization and Verification via Neural Link', async ({ page, neuralLink }) => {
        // Connect directly to the App Worker
        const app = await neuralLink.connectToApp('DevIndex');
        
        // Locate the main GridContainer manually via Main Thread DOM to prove it works
        const gridId = await page.evaluate(() => document.querySelector('.neo-grid-container').id);
        
        // Activate RowModel natively using Neural Link (since DevIndex defaults to null on load)
        await app.setProperties(gridId, { 'body.selectionModel': { ntype: 'selection-grid-rowmodel' } });
        
        // Let it initialize
        await page.waitForTimeout(200);

        // Inspect the Grid Component directly
        const gridProps = await app.getComponent(gridId, ['bodyStart.id', 'body.id', 'bodyEnd.id', 'body.selectionModel', 'store', 'ntype']);
        
        expect(gridProps.ntype).toBe('grid-container');
        expect(gridProps['body.selectionModel']).toBeTruthy();

        // We want to test clicking a row in the CENTER body to avoid locked-column interaction edge cases for now
        const centerBodyId = gridProps['body.id'];
        const leftBodyId = gridProps['bodyStart.id'];
        const rightBodyId = gridProps['bodyEnd.id'];
        const storeId = gridProps.store?.id || gridProps.store;
        
        // Locate the first row in the center body
        const centerBodyRow = page.locator(`#${centerBodyId} .neo-grid-row`).first();
        
        // Grab the recordId mapped to this DOM node
        const recordId = await centerBodyRow.getAttribute('data-record-id');
        
        // It should NOT be selected yet
        await expect(centerBodyRow).not.toHaveClass(/neo-selected/);
        
        // Native User Interaction (Clicking the center column row)
        await centerBodyRow.click();
        
        // Visual Assertion: Wait for App Worker to reconcile and add selections
        await expect(centerBodyRow).toHaveClass(/neo-selected/);
        
        // Mult-Body Validation: Check the left and right bodies for that same record ID
        const leftBodyRow = page.locator(`#${leftBodyId} .neo-grid-row[data-record-id="${recordId}"]`);
        const rightBodyRow = page.locator(`#${rightBodyId} .neo-grid-row[data-record-id="${recordId}"]`);
        
        // They should BOTH be selected as well due to multi-body orchestration
        await expect(leftBodyRow).toHaveClass(/neo-selected/);
        await expect(rightBodyRow).toHaveClass(/neo-selected/);
        
        // God Mode Assertion: Verify the exact backend state mirrors our action.
        // DevIndex Grid defaults to array-based selection since selectedRecordField ('selected') 
        // does not exist on the Contributor model prototype. We check the RowModel's selectedRows array.
        const smId = gridProps['body.selectionModel'].id;
        const smProps = await app.getComponent(smId, ['selectedRows']);
        expect(smProps.selectedRows.includes(recordId)).toBe(true);
    });

    test('Live Property Updation (Column Width Alignment)', async ({ page, neuralLink }) => {
        const app = await neuralLink.connectToApp('DevIndex');
        const gridId = await page.evaluate(() => document.querySelector('.neo-grid-container').id);
        
        // Get the structural columns from the Grid container
        // Note: The dev index columns setup has multiple bodies. We need a visible column ID.
        const headerCells = page.locator('.neo-grid-header-button');
        const firstCenterCellId = await headerCells.nth(2).getAttribute('id'); // Skip start columns
        
        // Just verify we can fetch the column config
        const colProps = await app.getComponent(firstCenterCellId, ['width', 'dataField']);
        const oldWidth = colProps.width;
        
        // Using God Mode, forcibly alter the width of a specific column component
        const newWidth = oldWidth + 100;
        await app.setProperties(firstCenterCellId, { width: newWidth });
        
        // Assert: Playwright observes the CSS strictly matches the new injected God Mode constraint
        const targetCell = page.locator(`#${firstCenterCellId}`);
        await expect(targetCell).toHaveCSS('width', `${newWidth}px`);
    });
});
