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

        // the evidence pane projects the EXTERNALLY-created grid: its id (proves the write was followed)
        // + its schema. `nl-external-grid` cannot appear unless the external insert was projected.
        const evidence = page.locator('.agent-os-evidence-pane');
        await expect(evidence).toContainText('nl-external-grid', {timeout: 30000});
        await expect(evidence).toContainText('Neo.grid.Container');

        // and the externally-created grid is live in the running app
        await expect(page.locator(`#${gridId}.neo-grid-container`)).toHaveCount(1, {timeout: 15000})
    });
});
