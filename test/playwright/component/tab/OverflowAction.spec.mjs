import {test, expect} from '@playwright/test';

const TAB_ID = 'overflow-action-tab-container';

let componentId = null;

/**
 * Creates a real TabContainer whose Overflow plugin contributes into a host/close action rail.
 * @param {Object} page
 * @returns {Promise<String>}
 */
async function createTabContainer(page) {
    const result = await page.evaluate(async id => {
        const loaded = await Neo.worker.App.loadModule({path: '../tab/plugin/Overflow.mjs'});

        if (!loaded.success) {
            throw new Error(`Overflow module load failed: ${loaded.error?.message}`)
        }

        return Neo.worker.App.createNeoInstance({
            activeIndex  : 0,
            height       : 240,
            headerActions: [{
                action     : 'host-action',
                iconCls    : 'fa fa-star',
                showOnFocus: false
            }, {
                action     : 'close',
                iconCls    : 'fa fa-times',
                showOnFocus: false
            }],
            headerToolbar: {
                plugins: [{ntype: 'plugin-tab-overflow', projectAsAction: true}]
            },
            id,
            importPath: '../tab/Container.mjs',
            items     : Array.from({length: 8}, (_, index) => ({
                header: {text: `Tab ${index + 1}`},
                ntype : 'component',
                text  : `Content ${index + 1}`
            })),
            ntype   : 'tab-container',
            parentId: 'component-test-viewport',
            width   : 380
        })
    }, TAB_ID);

    if (!result.success) {
        throw new Error(`TabContainer creation failed: ${result.error.message}`)
    }

    return result.id
}

/** Returns the action-root ids in rendered toolbar order. */
const actionIds = toolbar => toolbar.locator(':scope > .neo-toolbar-action')
    .evaluateAll(nodes => nodes.map(node => node.id));

/** Replaces consumer actions through the public TabContainer config path. */
const replaceHeaderActions = (page, suffix) => page.evaluate(({id, suffix}) =>
    Neo.worker.App.setConfigs({
        id,
        headerActions: [{
            action     : `host-${suffix}`,
            iconCls    : 'fa fa-bolt',
            showOnFocus: false
        }, {
            action     : 'close',
            iconCls    : 'fa fa-times',
            showOnFocus: false
        }]
    }), {id: TAB_ID, suffix});

test.describe('Neo.tab.plugin.Overflow — toolbar action projection', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        componentId = await createTabContainer(page);
        await page.waitForSelector(`#${componentId}`, {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('renders first, outside focus gating, with measured non-overlap and ordinary menu activation', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(String(error?.message || error)));

        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              host    = toolbar.getByRole('button', {name: 'host action', exact: true}),
              close   = toolbar.getByRole('button', {name: 'close', exact: true});

        await expect(control).toBeVisible({timeout: 10000});
        await expect(host).toBeVisible();
        await expect(close).toBeVisible();
        await expect(control).not.toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(control).not.toHaveAttribute('aria-hidden');
        await expect(page.locator('body > .neo-tab-overflow-control')).toHaveCount(0);

        const ids = await actionIds(toolbar);

        expect(ids[0], 'Overflow owns the first action slot').toBe(await control.getAttribute('id'));
        expect(ids.at(-1), 'close remains the final action').toBe(await close.getAttribute('id'));

        const visibleTabs = toolbar.locator(':scope > .neo-tab-header-button:visible'),
              lastTab     = visibleTabs.last(),
              tabBox      = await lastTab.boundingBox(),
              controlBox  = await control.boundingBox();

        expect(tabBox.x + tabBox.width,
            'the visible tab partition ends before the measured contribution').toBeLessThanOrEqual(controlBox.x + 1);

        await control.click();

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem).toBeVisible({timeout: 10000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click();
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}))
            .toHaveCount(1, {timeout: 10000});
        expect(errors).toEqual([])
    });

    test('preserves one instance across visible and all-fit consumer action replacements', async ({page}) => {
        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true});

        await expect(control).toBeVisible({timeout: 10000});

        const controlId = await control.getAttribute('id');

        await replaceHeaderActions(page, 'visible');
        await expect(toolbar.getByRole('button', {name: 'host visible', exact: true})).toBeVisible();
        expect((await actionIds(toolbar))[0]).toBe(controlId);
        await expect(toolbar.locator(`#${controlId}`)).toHaveCount(1);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator(`#${controlId}`), 'all-fit hides the contribution from DOM')
            .toHaveCount(0, {timeout: 10000});

        await replaceHeaderActions(page, 'hidden');
        await expect(toolbar.getByRole('button', {name: 'host hidden', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        const restored = toolbar.locator(`#${controlId}`);

        await expect(restored, 'the pre-overflow contribution instance returns after replacement')
            .toBeVisible({timeout: 10000});
        await expect(toolbar.locator('.neo-tab-overflow-control')).toHaveCount(1);

        const ids = await actionIds(toolbar);

        expect(ids[0]).toBe(controlId);
        expect(ids.at(-1)).toBe(await toolbar.getByRole('button', {name: 'close', exact: true}).getAttribute('id'));

        await restored.click();

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem, 'the recovered contribution keeps its ordinary menu route')
            .toBeVisible({timeout: 10000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click();
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}),
            'selection still activates through activeIndex after the hidden replacement').toHaveCount(1)
    })
});
