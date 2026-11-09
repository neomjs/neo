import {test, expect} from '@playwright/test';

const TAB_ID = 'overflow-route-tab-container';

let componentId = null;

/**
 * @summary Creates a narrow TabContainer whose last header is an `editRoute` header, so the Overflow plugin hides it
 * behind the floating control.
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
            headerToolbar: {plugins: [{ntype: 'plugin-tab-overflow'}]},
            height       : 240,
            id,
            importPath   : '../tab/Container.mjs',
            items        : [
                ...Array.from({length: 7}, (_, index) => ({header: {text: `Tab ${index + 1}`}, ntype: 'component'})),
                {header: {editRoute: true, route: 'mainview=table', text: 'Table'}, ntype: 'component'}
            ],
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

test.describe('Neo.tab.plugin.Overflow route policy', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html#country=DE&mainview=worldmap');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        componentId = await createTabContainer(page);
        await page.waitForSelector(`#${componentId}`, {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('a hidden editRoute header chosen from the menu merges its field and keeps the others', async ({page}) => {
        const control = page.locator('body > .neo-tab-overflow-control');

        await expect(control, 'the narrow bar hides the last header').toBeVisible();
        await control.click();
        await page.locator('.neo-tab-overflow-menu:visible .neo-list-item', {hasText: 'Table'}).click();

        await expect.poll(() => page.evaluate(() => location.hash), {message: 'country=DE survives the merge'})
            .toBe('#country=DE&mainview=table');
        await expect(page.locator(`#${componentId} .neo-tab-header-button.pressed`).filter({hasText: 'Table'}),
            'the menu choice activates the tab').toHaveCount(1)
    });
});
