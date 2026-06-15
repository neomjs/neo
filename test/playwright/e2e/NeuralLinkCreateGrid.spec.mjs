import { test, expect } from '../fixtures.mjs';

/**
 * @summary H2 Agent Harness proof: create a real grid inside a live Neo app through Neural Link.
 *
 * This intentionally combines two existing whitebox patterns:
 * - `NeuralLinkCreateComponent.spec.mjs`: the agent writes through `create_component`.
 * - `GridBigDataNL.spec.mjs`: the test asserts grid truth inside the App Worker.
 *
 * The point is NOT to render a static blueprint that looks like a grid. The proof is that normal
 * Neo grid config can cross the Neural Link create path into a running app, then remain queryable
 * and inspectable as a live component/store.
 */
test.describe('Neural Link - create grid (H2 first-widget proof)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1280, height: 720 } });

    test('creates a grid in a live app and verifies worker-state truth', async ({ page, neuralLink }) => {
        await page.goto('/examples/grid/bigData/index.html');
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');

        const mainContainers = await app.findInstances(
            { className: 'Neo.examples.grid.bigData.MainContainer' },
            ['id']
        );
        const mainContainer = (Array.isArray(mainContainers) ? mainContainers[0] : mainContainers) || {};

        expect(mainContainer.id, 'the live target app must expose a container to create into').toBeTruthy();

        const
            gridId = 'nl-created-grid-h2-proof',
            rows   = [{
                id      : 'intent',
                task    : 'Verify intent',
                owner   : 'Euclid',
                evidence: 'Neural Link'
            }, {
                id      : 'grid',
                task    : 'Create grid',
                owner   : 'Runtime',
                evidence: 'create_component'
            }, {
                id      : 'truth',
                task    : 'Inspect truth',
                owner   : 'Whitebox E2E',
                evidence: 'App Worker'
            }];

        await app.createComponent(mainContainer.id, {
            id            : gridId,
            ntype         : 'grid-container',
            flex          : 1,
            minWidth      : 420,
            wrapperStyle  : { height: '260px' },
            columnDefaults: { width: 140 },

            store: {
                keyProperty: 'id',
                model: {
                    fields: [
                        { name: 'id',       type: 'String' },
                        { name: 'task',     type: 'String' },
                        { name: 'owner',    type: 'String' },
                        { name: 'evidence', type: 'String' }
                    ]
                },
                data: rows
            },

            columns: [
                { dataField: 'task',     text: 'Task' },
                { dataField: 'owner',    text: 'Owner' },
                { dataField: 'evidence', text: 'Evidence' }
            ]
        });

        let gridProps;

        await expect.poll(async () => {
            try {
                gridProps = await app.getComponent(gridId, [
                    'ntype',
                    'store.id',
                    'store.count',
                    'columns',
                    'mounted'
                ]);

                return gridProps?.['store.count']
            } catch {
                return -1
            }
        }, {
            message: 'the NL-created grid should register with a live store in the App Worker',
            timeout: 15000
        }).toBe(rows.length);

        expect(gridProps.ntype).toBe('grid-container');
        expect(gridProps.columns.count).toBe(3);

        const storeId = gridProps['store.id'] || gridProps.store?.id || gridProps.store;
        expect(storeId, 'the created grid must expose an inspectable live store').toBeTruthy();

        const
            storeData = await app.inspectStore(storeId, 10, 0),
            itemData  = storeData.items.map(item => item.data || item);

        expect(storeData.count).toBe(rows.length);
        expect(itemData.map(item => item.task)).toEqual(rows.map(row => row.task));

        const tree = await app.getComponentTree(gridId, 2, true);
        expect(JSON.stringify(tree), 'created grid should be visible in the live component tree').toContain(gridId);

        await expect(page.locator(`#${gridId}.neo-grid-container`)).toBeVisible({ timeout: 10000 });
    });
});
