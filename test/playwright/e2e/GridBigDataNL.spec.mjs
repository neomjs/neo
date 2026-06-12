import { test, expect } from '../fixtures.mjs';

test.describe('Desktop: Neural Link Baseline Validation (Grid BigData)', () => {
    test.setTimeout(90000);

    test('Component Discovery and State Validation via Worker State', async ({ page, neuralLink }) => {
        // Navigate to the Grid Big Data Example
        await page.goto('/examples/grid/bigData/index.html');
        
        console.log('[GridBigDataNL.spec.mjs] Loading Grid Big Data Example...');
        
        // Wait for connection to App Worker
        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');
        console.log(`[GridBigDataNL.spec.mjs] Connected to App Session ID: ${app.sessionId}`);

        // Wait for the grid to be visible in the DOM
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        
        // Neural Link Semantic Discovery: GridContainer
        const gridResults = await app.queryComponent({ className: 'Neo.examples.grid.bigData.GridContainer' }, ['id', 'amountColumns']);
        
        // Ensure we got one result
        expect(Array.isArray(gridResults) ? gridResults.length : (gridResults ? 1 : 0)).toBeGreaterThan(0);
        const gridContainer = Array.isArray(gridResults) ? gridResults[0] : gridResults;
        
        expect(gridContainer.id).toBeTruthy();
        
        // Verify we can read simple state from the grid
        expect(gridContainer.properties.amountColumns).toBeDefined();

        // Neural Link Semantic Discovery: ControlsContainer
        const controlsResults = await app.queryComponent({ className: 'Neo.examples.grid.bigData.ControlsContainer' }, ['id']);
        expect(Array.isArray(controlsResults) ? controlsResults.length : (controlsResults ? 1 : 0)).toBeGreaterThan(0);
        const controlsContainer = Array.isArray(controlsResults) ? controlsResults[0] : controlsResults;

        expect(controlsContainer.id).toBeTruthy();

        // Find the "Amount Rows" ComboBox in the config to verify query capabilities by ntype/labelText
        const rowAmountComboResults = await app.queryComponent({ ntype: 'combobox', labelText: 'Amount Rows' }, ['id', 'value']);
        expect(Array.isArray(rowAmountComboResults) ? rowAmountComboResults.length : (rowAmountComboResults ? 1 : 0)).toBeGreaterThan(0);
        
        const rowAmountCombo = Array.isArray(rowAmountComboResults) ? rowAmountComboResults[0] : rowAmountComboResults;
        // Verify default value of the combobox (Neo stores String store items as objects with an 'id' property)
        expect(rowAmountCombo.properties.value.id).toBe('20000');
    });
});
