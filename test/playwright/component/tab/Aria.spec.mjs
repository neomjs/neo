import {test, expect} from '@playwright/test';

let componentId = null;

/**
 * @summary Pins the WAI-ARIA tabs pattern as the browser exposes it.
 *
 * The unit spec proves the VDOM; this one proves what reaches assistive technology: the queries go
 * through the browser's accessibility tree (role, accessible name, selected state), so a tab that
 * names a missing panel, or a panel whose label does not resolve to its tab, fails here.
 */
test.describe('Neo.tab.Container — ARIA tabs pattern in the browser', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        componentId = await page.evaluate(async () => {
            const result = await Neo.worker.App.createNeoInstance({
                activeIndex: 0,
                height     : 200,
                id         : 'tab-aria',
                importPath : '../tab/Container.mjs',
                items      : [
                    {header: {text: 'Orders'},   ntype: 'component', text: 'Orders body'},
                    {header: {text: 'Invoices'}, ntype: 'component', text: 'Invoices body'}
                ],
                ntype   : 'tab-container',
                parentId: 'component-test-viewport',
                width   : 320
            });

            if (!result.success) {
                throw new Error(`TabContainer creation failed: ${result.error.message}`)
            }

            return result.id
        });

        await page.waitForSelector('#tab-aria', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('tabs sit in a tablist, name their panel, and the panel is named by its tab', async ({page}) => {
        const root     = page.locator('#tab-aria'),
              tablist  = root.getByRole('tablist'),
              orders   = tablist.getByRole('tab', {name: 'Orders'}),
              invoices = tablist.getByRole('tab', {name: 'Invoices'});

        await expect(tablist.getByRole('tab')).toHaveCount(2);
        await expect(orders).toHaveAttribute('aria-selected', 'true');
        await expect(invoices).toHaveAttribute('aria-selected', 'false');

        const ordersPanel = root.getByRole('tabpanel', {name: 'Orders'});

        await expect(ordersPanel).toHaveText('Orders body');
        await expect(ordersPanel).toHaveAttribute('id', await orders.getAttribute('aria-controls'));

        // A real click moves the selection and the exposed panel together.
        await invoices.click();

        await expect(invoices).toHaveAttribute('aria-selected', 'true');
        await expect(orders).toHaveAttribute('aria-selected', 'false');

        const invoicesPanel = root.getByRole('tabpanel', {name: 'Invoices'});

        await expect(invoicesPanel).toHaveText('Invoices body');
        await expect(invoicesPanel).toHaveAttribute('id', await invoices.getAttribute('aria-controls'))
    })
});
