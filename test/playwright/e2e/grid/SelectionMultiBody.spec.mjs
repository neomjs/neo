import { test, expect } from '../../fixtures.mjs';

test.describe('Desktop (1920x1080): lockedColumns Multi-Body Neural Link Selection Validation', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500);
    });

    test('Cross-Body Row Selection Synchronization and Verification via Neural Link', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);

        await app.setProperties(gridId, { 'body.selectionModel': { ntype: 'selection-grid-rowmodel' } });

        await expect.poll(async () => {
            const props = await app.getComponent(gridId, ['view.selectionModel.id']);
            return props['view.selectionModel.id'];
        }, { timeout: 5000 }).toBeTruthy();

        const gridProps = await app.getComponent(gridId, [
            'bodyStart.id',
            'body.id',
            'bodyEnd.id',
            'lockedStartColumns',
            'lockedEndColumns',
            'ntype',
            'view.selectionModel.id'
        ]);

        expect(gridProps.ntype).toBe('grid-container');
        expect((gridProps.lockedStartColumns || []).length, 'fixture has locked-start columns').toBeGreaterThan(0);
        expect((gridProps.lockedEndColumns || []).length, 'fixture has locked-end columns').toBeGreaterThan(0);
        expect(gridProps['view.selectionModel.id']).toBeTruthy();

        const leftBodyId   = gridProps['bodyStart.id'];
        const centerBodyId = gridProps['body.id'];
        const rightBodyId  = gridProps['bodyEnd.id'];

        expect(leftBodyId,   'locked-start body id').toBeTruthy();
        expect(centerBodyId, 'center body id').toBeTruthy();
        expect(rightBodyId,  'locked-end body id').toBeTruthy();

        const centerBodyRow = page.locator(`#${centerBodyId} .neo-grid-row`).first();
        await expect(centerBodyRow).toBeVisible();

        const recordId = await centerBodyRow.getAttribute('data-record-id');
        expect(recordId, 'center row must expose a record id').toBeTruthy();

        await expect(centerBodyRow).not.toHaveClass(/neo-selected/);

        await centerBodyRow.click();

        await expect(centerBodyRow).toHaveClass(/neo-selected/);

        const leftBodyRow  = page.locator(`#${leftBodyId} .neo-grid-row[data-record-id="${recordId}"]`);
        const rightBodyRow = page.locator(`#${rightBodyId} .neo-grid-row[data-record-id="${recordId}"]`);

        await expect(leftBodyRow).toHaveClass(/neo-selected/);
        await expect(rightBodyRow).toHaveClass(/neo-selected/);

        const selectedRows = (await app.getComponent(gridId, ['view.selectionModel.selectedRows']))['view.selectionModel.selectedRows'];
        expect(selectedRows).toContain(recordId);
    });

    test('Live Body Resize Path Updates Center Cells and Width Cache', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);
        const { 'body.id': centerBodyId } = await app.getComponent(gridId, ['body.id']);

        expect(centerBodyId, 'center body id').toBeTruthy();

        const centerBodyRow = page.locator(`#${centerBodyId} .neo-grid-row`).first();
        await expect(centerBodyRow).toBeVisible();

        const totalCell = centerBodyRow.locator('[role="gridcell"]').first();
        await expect(totalCell).toBeVisible();

        const beforeBox = await totalCell.boundingBox();
        expect(beforeBox?.width, 'Total cell width before resize').toBeGreaterThan(0);

        const beforeProps = await app.getComponent(centerBodyId, ['availableWidth']);
        const newWidth    = Math.round(beforeBox.width + 40);

        await app.callMethod(centerBodyId, 'updateCellPositions', ['totalContributions', newWidth]);

        await expect(totalCell).toHaveCSS('width', `${newWidth}px`);

        const afterProps = await app.getComponent(centerBodyId, ['availableWidth']);
        expect(afterProps.availableWidth).toBe(beforeProps.availableWidth + 40);
    });
});

/**
 * Resolves the grid-container instance id from the App Worker.
 * @param {Object} app
 * @returns {Promise<String>}
 */
async function resolveGridId(app) {
    const grids  = await app.findInstances({ ntype: 'grid-container' }, ['id']);
    const gridId = Array.isArray(grids) ? grids[0]?.id : grids?.id;

    expect(gridId, 'a grid-container instance must exist in the bound App Worker').toBeTruthy();

    return gridId;
}
