import { test, expect } from '../../fixtures.mjs';

test.describe('Desktop: Neural Link Baseline Validation (Grid BigData)', () => {
    test.setTimeout(90000);

    test('Component Discovery and State Validation via Worker State', async ({ page, neuralLink }) => {
        // Navigate to the Grid Big Data Example
        await page.goto('/examples/grid/bigData/index.html');

        console.log('[BigDataNL.spec.mjs] Loading Grid Big Data Example...');

        // Wait for connection to App Worker
        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');
        console.log(`[BigDataNL.spec.mjs] Connected to App Session ID: ${app.sessionId}`);

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

    test('the Column menus checkbox switches the header menus and follows the grid', async ({ page, neuralLink }) => {
        await page.goto('/examples/grid/bigData/index.html');

        const app   = await neuralLink.connectToApp('Neo.examples.grid.bigData'),
              field = page.locator('.neo-checkboxfield', {hasText: 'Column menus'}),
              input = field.locator('input'),
              // The native input is visually hidden behind the field's icon; the label is what a pointer reaches
              toggle = field.locator('.neo-checkbox-value-label');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});

        const [grid]      = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['id']),
              gridMenu    = async () => (await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['columnMenu']))[0].properties.columnMenu,
              headerMenus = async () => (await app.queryComponent({className: 'Neo.grid.header.Button'}, ['columnMenu'])).map(button => button.properties.columnMenu);

        // The Settings panel starts collapsed off-screen
        await page.locator('.controls-container-button').click();
        await expect(page.locator('.neo-examples-bigdata-controls-container')).toHaveClass(/neo-expanded/);

        // The checkbox starts at the grid's own value
        await expect(input).not.toBeChecked();
        expect(await gridMenu()).toBe(false);

        await toggle.click();
        await expect(input).toBeChecked();
        await expect.poll(gridMenu).toBe(true);
        await expect.poll(async () => (await headerMenus()).every(Boolean), {message: 'every header button follows the grid'}).toBe(true);
        await expect.poll(async () => {
            const plugins = await app.findInstances({className: 'Neo.grid.header.plugin.Menu'}, ['trigger.id']);
            return plugins.filter(plugin => plugin.properties['trigger.id']).length
        }, {message: 'the headers carry their menu triggers'}).toBeGreaterThan(0);

        await toggle.click();
        await expect(input).not.toBeChecked();
        await expect.poll(gridMenu).toBe(false);
        await expect.poll(async () => (await headerMenus()).some(Boolean), {message: 'no header keeps its menu'}).toBe(false);

        // A change made on the grid itself, the way the Neural Link makes it, moves the checkbox
        await app.setProperties(grid.id, {columnMenu: true});
        await expect(input).toBeChecked()
    });

    test('the footer names the size in the first frame and follows a new size and a filter', async ({page, neuralLink}) => {
        await page.goto('/examples/grid/bigData/index.html');

        const app    = await neuralLink.connectToApp('Neo.examples.grid.bigData'),
              footer = page.locator('.neo-examples-bigdata-footer');

        // Readable without opening the Settings panel, and naming the size the page title promises
        await expect(footer).toContainText('20,000 rows × 50 columns = 1,000,000 cells', {timeout: 30000});
        await expect(footer).toContainText('Up to 100,000 × 200 in ☰ Settings');

        const [grid]  = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['id', 'store.id']),
              storeId = grid.properties['store.id'];

        await app.setProperties(grid.id, {amountColumns: 10});
        await app.setProperties(storeId, {amountRows: 1000});
        await expect(footer).toContainText('1,000 rows × 10 columns = 10,000 cells');

        await page.locator('.controls-container-button').click();
        await page.locator('.neo-examples-bigdata-controls-container .neo-textfield', {hasText: 'Firstname'}).locator('input').fill('Max');

        // A filter keeps some rows of all rows: the line names both and the cells the kept rows hold
        await expect(footer).toContainText(/^\d{1,3} of 1,000 rows × 10 columns = [\d,]+ cells/)
    });

    test('the first frame shows the same rows on every load', async ({page}) => {
        // the catalog cover is shot from the first frame, so a visitor's first frame has to be that one
        const firstRows = async () => {
            await page.goto('/examples/grid/bigData/index.html');

            const rows = page.locator('.neo-grid-body .neo-grid-row');
            await expect(rows.first()).toContainText(/\S/, {timeout: 30000});

            return rows.evaluateAll(nodes => nodes.slice(0, 3).map(node => node.innerText))
        };

        const first = await firstRows();

        expect(first.join('')).toMatch(/\d/);
        expect(await firstRows()).toEqual(first)
    });

    test('the headline holds the Settings button, and the open panel leaves the grid its columns', async ({page}) => {
        await page.setViewportSize({width: 1024, height: 768});
        await page.goto('/examples/grid/bigData/index.html');

        const grid   = page.locator('.neo-examples-bigdata-maincontainer > .neo-grid-container'),
              button = page.locator('.controls-container-button'),
              panel  = page.locator('.neo-examples-bigdata-controls-container');

        await expect(page.locator('.neo-examples-bigdata-title')).toHaveText('A data grid that scales to 100,000 rows × 200 columns', {timeout: 30000});

        // Closed, the button sits in the header band, above the grid's header row
        await expect.poll(async () => {
            const [gridBox, buttonBox] = [await grid.boundingBox(), await button.boundingBox()];
            return buttonBox.y + buttonBox.height <= gridBox.y
        }).toBe(true);

        // Open, the grid ends left of the panel
        await button.click();
        await expect(panel).toHaveClass(/neo-expanded/);
        await expect.poll(async () => {
            const [gridBox, panelBox] = [await grid.boundingBox(), await panel.boundingBox()];
            return gridBox.x + gridBox.width <= panelBox.x
        }).toBe(true)
    });
});
