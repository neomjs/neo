import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 provenance proof: an EXTERNAL Neural-Link `create_component` into the widget stage is
 * reflected by the evidence pane — closing the agent-driven conversational-creation loop end to end.
 *
 * The render-together spec proves the in-app bootstrap. This proves the same insert seam carries an
 * external agent's write: connect to the childapp's worker session, `create_component` a DISTINCT grid
 * into the known `widget-stage`, and the controller projects that actually-created grid into the
 * evidence pane. The pane shows the EXTERNAL grid's id (`nl-external-grid`) — which cannot appear unless
 * a real `create_component` crossed the bridge and was projected. (Connect via the worker appName
 * `agentos`, not the window appName — a childapp's components live in the parent worker session.)
 *
 * @see apps/agentos/childapps/widget/view/ViewportController.mjs
 * @see test/playwright/e2e/NeuralLinkChildappConnect.spec.mjs
 */
test.describe('AgentOS first widget — external Neural-Link create → evidence (H2 provenance)', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1280, height: 720}});

    test('an external create_component into the stage projects into the evidence pane', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');
        // the in-app bootstrap grid mounts first — the app is live before the external write
        await page.waitForSelector('.agent-os-first-widget-grid', {state: 'visible', timeout: 30000});

        const app = await neuralLink.connectToApp('agentos');

        const gridId = 'nl-external-grid';

        // an external agent creates a DISTINCT grid (2 columns / 2 rows) into the known widget stage
        await app.createComponent('widget-stage', {
            id     : gridId,
            ntype  : 'grid-container',
            flex   : 1,
            columns: [
                {dataField: 'metric', text: 'Metric'},
                {dataField: 'value',  text: 'Value'}
            ],
            store: {
                keyProperty: 'metric',
                model: {fields: [
                    {name: 'metric', type: 'String'},
                    {name: 'value',  type: 'String'}
                ]},
                data: [
                    {metric: 'latency',    value: '12ms'},
                    {metric: 'throughput', value: '1k/s'}
                ]
            }
        });

        // ENGINE STATE: the external write produced the INTENDED live grid WITH content (not a shell) —
        // asserted as test truth, not read from bridge debug output. Poll store.count (populates async).
        let grid;
        await expect.poll(async () => {
            grid = await app.getComponent(gridId, ['ntype', 'className', 'parentId', 'store.count']);
            return grid?.['store.count']
        }, {message: 'the external grid must register a live store of 2 rows', timeout: 15000}).toBe(2);
        expect(grid.ntype).toBe('grid-container');
        expect(grid.className).toBe('Neo.grid.Container');
        expect(grid.parentId).toBe('widget-stage');

        // EVIDENCE: projects the EXTERNAL grid — id + schema + its ACTUAL column/row counts (2 / 2, NOT
        // the bootstrap grid's 4 / 3), so id/schema-only projection cannot satisfy this.
        const evidence = page.locator('.agent-os-evidence-pane');
        await expect(evidence).toContainText('nl-external-grid', {timeout: 30000});
        await expect(evidence).toContainText('Neo.grid.Container');
        const evidenceMeta = evidence.locator('.agent-os-evidence-meta dd'); // [schema, title, columns, rows]
        await expect(evidenceMeta.nth(2)).toHaveText('2'); // Columns — the external grid's count
        await expect(evidenceMeta.nth(3)).toHaveText('2'); // Rows

        // RENDERED CONTENT: the external grid renders its real data — 2 cols × 2 rows = 4 cells, with the
        // created values (not a zero-content grid-shaped shell).
        const gridEl = page.locator(`#${gridId}.neo-grid-container`);
        await expect(gridEl).toBeVisible({timeout: 15000});
        await expect(gridEl.locator('.neo-grid-cell')).toHaveCount(4);
        for (const value of ['latency', '12ms', 'throughput', '1k/s']) {
            await expect(gridEl.locator('.neo-grid-cell', {hasText: value})).toHaveCount(1)
        }
    });
});
