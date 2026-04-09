import { expect } from '@playwright/test';
import { test } from '../fixtures.mjs';

test.describe('Grid BigData Multi-Body Neural Link Validation', () => {

    test('Dynamic Locked Columns and Multi-Body Selection Sync', async ({ page, neuralLink }) => {
        // Step 1: Initialize application & connect Neural Link
        await page.goto('/examples/grid/bigData/', { waitUntil: 'networkidle' });
        
        // Connect the fixture to the running app worker to allow direct instance manipulation
        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');
        
        // --- MULTI-BODY LAYOUT ORCHESTRATION ---
        
        // Locate the target instances (the Columns we want to lock)
        const firstnameCols = await app.findInstances({dataField: 'firstname'}, ['id']);
        if (firstnameCols.length > 0) {
            await app.setProperties(firstnameCols[0].id, { locked: 'start' });
        }
        
        const progressCols = await app.findInstances({dataField: 'progress'}, ['id']);
        if (progressCols.length > 0) {
            await app.setProperties(progressCols[0].id, { locked: 'end' });
        }
        
        // Give the GridContainer a moment to unmount/remount the vdom bodies
        await page.waitForTimeout(500);
        
        // Verify via DOM that three distinct bodies exist 
        const leftBodyId   = '#neo-grid-body-2';
        const centerBodyId = '#neo-grid-body-1';
        const rightBodyId  = '#neo-grid-body-3';
        
        await expect(page.locator(leftBodyId)).toBeVisible();
        await expect(page.locator(centerBodyId)).toBeVisible();
        await expect(page.locator(rightBodyId)).toBeVisible();

        // --- SELECTION SYNCHRONIZATION TEST ---
        
        // Locate row in the center body
        const centerBodyRow = page.locator(`${centerBodyId} .neo-grid-row[data-record-id="neo-record-1"]`);
        const leftBodyRow   = page.locator(`${leftBodyId} .neo-grid-row[data-record-id="neo-record-1"]`);
        const rightBodyRow  = page.locator(`${rightBodyId} .neo-grid-row[data-record-id="neo-record-1"]`);
        
        // Ensure the items are rendered
        await expect(centerBodyRow).toBeAttached();
        await expect(leftBodyRow).toBeAttached();
        await expect(rightBodyRow).toBeAttached();
        
        // Click the center body row. This should trigger the selection model.
        await centerBodyRow.click();
        
        // It should be selected.
        await expect(centerBodyRow).toHaveClass(/neo-selected/);
        
        // They should BOTH be selected as well due to multi-body orchestration
        await expect(leftBodyRow).toHaveClass(/neo-selected/);
        await expect(rightBodyRow).toHaveClass(/neo-selected/);
        
        // God Mode Assertion: Verify the exact backend state mirrors our action.
        const grids = await app.findInstances({className: 'Neo.examples.grid.bigData.GridContainer'}, ['id']);
        if (grids.length > 0) {
            const gridProps = await app.getInstanceProperties(grids[0].id, ['body.selectionModel.selectedRows']);
            expect(gridProps.properties['body.selectionModel.selectedRows']).toContain('neo-record-1');
        }
    });

});
