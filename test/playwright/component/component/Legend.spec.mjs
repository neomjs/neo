import {test, expect} from '@playwright/test';

let componentId;

/**
 * @summary Mounts a Legend through the App worker into the component test viewport.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [config={}]
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function createLegend(page, config = {}) {
    componentId = await page.evaluate(async config => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Legend.mjs',
            ntype     : 'legend',
            parentId  : 'component-test-viewport',
            ...config
        });

        if (!result.success) {
            throw new Error(`Legend creation failed: ${result.error.message}`)
        }

        return result.id
    }, config);

    const legend = page.locator(`legend#${componentId}`);

    await expect(legend).toBeAttached();

    return legend
}

test.beforeEach(async ({page}) => {
    componentId = null;
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    if (componentId) {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId)
    }
});

test.describe('Neo.component.Legend', () => {
    test('renders the default check icon', async ({page}) => {
        const legend = await createLegend(page);

        await expect(legend.locator('i.neo-legend-icon')).toHaveClass('neo-legend-icon far fa-check')
    });

    test('renders the configured icon classes', async ({page}) => {
        const legend = await createLegend(page, {iconCls: 'fa fa-star'});

        await expect(legend.locator('i.neo-legend-icon')).toHaveClass('neo-legend-icon fa fa-star');
        await page.evaluate(id => Neo.worker.App.setConfigs({id, iconCls: 'far fa-check'}), componentId);
        await expect(legend.locator('i.neo-legend-icon')).toHaveClass('neo-legend-icon far fa-check')
    });

    test('removes and restores the icon when useIcon changes', async ({page}) => {
        const legend = await createLegend(page, {text: 'Account'});

        await expect(legend.locator('i.neo-legend-icon')).toHaveCount(1);
        await page.evaluate(id => Neo.worker.App.setConfigs({id, useIcon: false}), componentId);
        await expect(legend.locator('i.neo-legend-icon')).toHaveCount(0);
        await expect(legend).toHaveText('Account');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, useIcon: true}), componentId);
        await expect(legend.locator('i.neo-legend-icon')).toHaveClass('neo-legend-icon far fa-check');
        await expect(legend).toHaveText('Account')
    });

    test('renders the configured text', async ({page}) => {
        const legend = await createLegend(page, {text: 'Billing'});

        await expect(legend).toHaveText('Billing')
    });

    test('updates and clears the rendered text after creation', async ({page}) => {
        const legend = await createLegend(page, {text: 'Billing'});

        await expect(legend).toHaveText('Billing');
        await page.evaluate(id => Neo.worker.App.setConfigs({id, text: 'Shipping'}), componentId);
        await expect(legend).toHaveText('Shipping');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, text: ''}), componentId);
        await expect(legend).toHaveText('');
        await expect(legend.locator('i.neo-legend-icon')).toHaveCount(1)
    })
});
