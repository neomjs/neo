import {test, expect} from '@playwright/test';

const ROOT_ID = 'tab-close';

let componentId = null;

/**
 * @summary Creates the real tab family in the existing empty-viewport component harness.
 * @param {Object} page
 * @param {Object} options
 * @returns {Promise<Object>} The root locator.
 */
async function createTabs(page, {closable, effectHeaders = false, labels = ['Orders', 'Invoices', 'Archive'], panelCloseButton = false, vetoClose = false} = {}) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        activeIndex  : 0,
        effectHeaders: config.effectHeaders,
        height       : 220,
        id           : config.id,
        importPath   : '../../test/playwright/component/apps/tab-close/Container.mjs',
        items        : config.labels.map(text => ({
            header: {text, ...(config.closable === undefined ? {} : {closable: config.closable})},
            ntype : 'component',
            text  : `${text} body`
        })),
        ntype           : 'tab-close-test-container',
        panelCloseButton: config.panelCloseButton,
        parentId        : 'component-test-viewport',
        vetoClose       : config.vetoClose,
        width           : 560
    }), {closable, effectHeaders, id: ROOT_ID, labels, panelCloseButton, vetoClose});

    if (!result.success) throw new Error(`Close fixture creation failed: ${result.error.message}`);
    componentId = result.id;

    const root = page.locator(`#${ROOT_ID}`);
    await expect(root).toBeVisible();
    await expect(root.getByRole('tab')).toHaveCount(labels.length);
    return root
}

/** @summary Pins close targeting, cancellation, semantics and native keyboard focus. */
test.describe('Neo.tab.Container — closable tabs in the browser', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('ordinary tabs have no close affordance and Delete does not close them', async ({page}) => {
        const root   = await createTabs(page),
              orders = root.getByRole('tab', {name: 'Orders', exact: true});

        await expect(root.locator('.neo-tab-close')).toHaveCount(0);
        await expect(orders).not.toHaveAttribute('aria-keyshortcuts', 'Delete');
        await orders.focus();
        await page.keyboard.press('Delete');
        await expect(root.getByRole('tab')).toHaveCount(3);
        await expect(orders).toBeFocused();
        await expect(orders).toHaveAttribute('aria-selected', 'true');
        await expect(root).toHaveAttribute('data-close-receipt', '[]');

        await root.getByRole('tab', {name: 'Invoices', exact: true}).locator('.neo-button-text').click();
        await expect(root.getByRole('tabpanel', {name: 'Invoices', exact: true})).toHaveText('Invoices body')
    });

    for (const effectHeaders of [false, true]) {
        test(`${effectHeaders ? 'effect' : 'ordinary'} headers close an inactive tab without activating it and keep text activation`, async ({page}) => {
            const root     = await createTabs(page, {closable: true, effectHeaders}),
                  invoices = root.getByRole('tab', {name: 'Invoices', exact: true}),
                  close    = invoices.locator('.neo-tab-close');

            await expect(close).toBeVisible();
            await expect(close).toHaveAttribute('aria-hidden', 'true');
            await expect(close).toHaveText('×');
            expect(await close.evaluate(node => node.tagName)).toBe('SPAN');
            await expect(invoices).toHaveAttribute('aria-keyshortcuts', 'Delete');
            await expect(root.getByRole('tab').locator('button, input, select, textarea, a[href], [role="button"], [tabindex]')).toHaveCount(0);

            await close.click();

            await expect(root.getByRole('tab')).toHaveCount(2);
            await expect(invoices).toHaveCount(0);
            await expect(root.getByRole('tab', {name: 'Orders', exact: true})).toHaveAttribute('aria-selected', 'true');
            await expect(root.getByRole('tabpanel', {name: 'Orders', exact: true})).toHaveText('Orders body');
            await expect(root).toHaveAttribute('data-close-receipt', JSON.stringify([
                {event: 'before', tabs: ['Orders', 'Invoices', 'Archive']},
                {event: 'after', tabs: ['Orders', 'Archive']}
            ]));

            await root.getByRole('tab', {name: 'Archive', exact: true}).locator('.neo-button-text').click();
            await expect(root.getByRole('tab', {name: 'Archive', exact: true})).toHaveAttribute('aria-selected', 'true');
            await expect(root.getByRole('tabpanel', {name: 'Archive', exact: true})).toHaveText('Archive body')
        })
    }

    test('beforeTabClose veto keeps pointer and keyboard closes from removing or activating a tab', async ({page}) => {
        const root     = await createTabs(page, {closable: true, vetoClose: true}),
              invoices = root.getByRole('tab', {name: 'Invoices', exact: true});

        await invoices.locator('.neo-tab-close').click();
        await expect(root.getByRole('tab')).toHaveCount(3);
        await expect(root.getByRole('tab', {name: 'Orders', exact: true})).toHaveAttribute('aria-selected', 'true');

        await invoices.focus();
        await page.keyboard.press('Delete');
        await expect(root.getByRole('tab')).toHaveCount(3);
        await expect(invoices).toBeFocused();
        await expect(root.getByRole('tab', {name: 'Orders', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(root).toHaveAttribute('data-close-receipt', JSON.stringify([
            {event: 'before', tabs: ['Orders', 'Invoices', 'Archive']},
            {event: 'before', tabs: ['Orders', 'Invoices', 'Archive']}
        ]))
    });

    for (const [label, remaining, focused] of [
        ['Orders', ['Invoices', 'Archive'], 'Invoices'],
        ['Archive', ['Orders', 'Invoices'], 'Invoices']
    ]) {
        test(`Delete on the focused ${label} tab selects and focuses the surviving neighbour`, async ({page}) => {
            const root   = await createTabs(page, {closable: true}),
                  target = root.getByRole('tab', {name: label, exact: true});

            await target.locator('.neo-button-text').click();
            await expect(target).toBeFocused();
            await page.keyboard.press('Delete');

            await expect(root.getByRole('tab')).toHaveCount(remaining.length);
            await expect(root.getByRole('tab').locator('.neo-button-text')).toHaveText(remaining);
            const survivor = root.getByRole('tab', {name: focused, exact: true});
            await expect(survivor).toBeFocused();
            await expect(survivor).toHaveAttribute('aria-selected', 'true');
            await expect(root.getByRole('tabpanel', {name: focused, exact: true})).toHaveText(`${focused} body`)
        })
    }

    test('Delete on the middle focused tab focuses the following tab while selection keeps the previous neighbour', async ({page}) => {
        const root     = await createTabs(page, {closable: true}),
              invoices = root.getByRole('tab', {name: 'Invoices', exact: true});

        await invoices.locator('.neo-button-text').click();
        await expect(invoices).toBeFocused();
        await page.keyboard.press('Delete');

        await expect(root.getByRole('tab')).toHaveCount(2);
        await expect(root.getByRole('tab', {name: 'Archive', exact: true})).toBeFocused();
        await expect(root.getByRole('tab', {name: 'Orders', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(root.getByRole('tabpanel', {name: 'Orders', exact: true})).toHaveText('Orders body')
    });

    test('Delete on the only tab leaves focus on the empty TabContainer', async ({page}) => {
        const root   = await createTabs(page, {closable: true, labels: ['Orders']}),
              orders = root.getByRole('tab', {name: 'Orders', exact: true});

        await page.evaluate(() => {
            const button = document.createElement('button');
            button.id = 'tab-close-following';
            button.textContent = 'Continue';
            document.body.append(button)
        });
        await orders.focus();
        await page.keyboard.press('Delete');

        await expect(root.getByRole('tab')).toHaveCount(0);
        await expect(root.getByRole('tabpanel')).toHaveCount(0);
        await expect(root).toHaveAttribute('tabindex', '-1');
        await expect(root).toBeFocused();
        await expect(root).toHaveAttribute('data-close-receipt', JSON.stringify([
            {event: 'before', tabs: ['Orders']},
            {event: 'after', tabs: []}
        ]));
        await page.keyboard.press('Tab');
        await expect(page.locator('#tab-close-following')).toBeFocused()
    });

    test('a focused Done button closes its active panel through closeTab() and restores surviving-tab focus', async ({page}) => {
        const root = await createTabs(page, {closable: true, panelCloseButton: true}),
              done = root.getByRole('tabpanel', {name: 'Orders', exact: true}).getByRole('button', {name: 'Done', exact: true});

        await done.focus();
        await expect(done).toBeFocused();
        await done.click();

        await expect(root.getByRole('tab')).toHaveCount(2);
        await expect(done).toHaveCount(0);
        const survivor = root.getByRole('tab', {name: 'Invoices', exact: true});
        await expect(survivor).toHaveAttribute('aria-selected', 'true');
        await expect(root.getByRole('tabpanel', {name: 'Invoices', exact: true})).toHaveText('Invoices body');
        await expect(survivor).toBeFocused();
        await expect(root).toHaveAttribute('data-close-receipt', JSON.stringify([
            {event: 'before', tabs: ['Orders', 'Invoices', 'Archive']},
            {event: 'after', tabs: ['Invoices', 'Archive']}
        ]))
    });

    test('a programmatic close does not steal focus from another control', async ({page}) => {
        const root = await createTabs(page, {closable: true});

        await page.evaluate(() => {
            const button = document.createElement('button');
            button.id = 'tab-close-outside';
            button.textContent = 'Outside';
            document.body.append(button)
        });
        const outside = page.locator('#tab-close-outside');
        await outside.focus();

        const result = await page.evaluate(id => Neo.worker.App.setConfigs({id, closeIndex: 0}), ROOT_ID);
        expect(result.success).toBe(true);
        await expect(root).toHaveAttribute('data-close-result', 'closed');
        await expect(root.getByRole('tab')).toHaveCount(2);
        await expect(root.getByRole('tab', {name: 'Invoices', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(outside).toBeFocused()
    });

    test('the actual Docs consumer uses generic close spans while glyph and text clicks select', async ({page}) => {
        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            activeIndex: 0,
            height     : 220,
            id         : 'tab-close',
            importPath : '../../docs/app/view/ContentTabContainer.mjs',
            items      : [
                {header: {iconCls: 'fa fa-book', text: 'Orders'}, ntype: 'component', text: 'Orders body'},
                {header: {iconCls: 'fa fa-file', text: 'Invoices'}, ntype: 'component', text: 'Invoices body'}
            ],
            ntype   : 'docs-content-tabcontainer',
            parentId: 'component-test-viewport',
            width   : 560
        }));

        if (!result.success) throw new Error(`Docs TabContainer creation failed: ${result.error.message}`);
        componentId = result.id;

        const root     = page.locator(`#${ROOT_ID}`),
              orders   = root.getByRole('tab', {name: /Orders$/}),
              invoices = root.getByRole('tab', {name: /Invoices$/});

        await expect(root.locator('.neo-tab-close')).toHaveCount(2);
        await invoices.locator('.neo-button-glyph').click();
        await expect(invoices).toHaveAttribute('aria-selected', 'true');
        await expect(root.getByRole('tabpanel', {name: /Invoices$/})).toHaveText('Invoices body');

        await orders.locator('.neo-button-text').click();
        await expect(orders).toHaveAttribute('aria-selected', 'true');
        await invoices.locator('.neo-tab-close').click();
        await expect(root.getByRole('tab')).toHaveCount(1);
        await expect(orders).toHaveAttribute('aria-selected', 'true');
        await expect(root.getByRole('tabpanel', {name: /Orders$/})).toHaveText('Orders body')
    })
});
