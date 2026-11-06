import {test, expect} from '@playwright/test';

let componentId;

/**
 * @summary Mounts a preset through the App Worker's native instance API.
 * @param {Object} page
 * @param {String} name
 * @returns {Promise<Object>} The preset's DOM locator
 */
async function createField(page, name) {
    const result = await page.evaluate(name => Neo.worker.App.createNeoInstance({
        importPath: `../form/field/${name}.mjs`,
        ntype     : `${name.toLowerCase()}field`,
        parentId  : 'component-test-viewport',
        width     : 300
    }), name);

    expect(result.success, result.error?.message).toBe(true);
    componentId = result.id;

    return page.locator(`#${componentId}`)
}

test.describe('form field presets', () => {
    test.beforeEach(async ({page}) => {
        componentId = null;
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('Password renders a password input', async ({page}) => {
        const field = await createField(page, 'Password');

        await expect(field).toBeVisible();
        await expect(field.locator('input')).toHaveAttribute('type', 'password')
    });

    test('Hidden starts hidden, with a visible control using the same instance', async ({page}) => {
        const field = await createField(page, 'Hidden');

        await expect(field).toBeHidden();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, hidden: false}), componentId);
        await expect(field).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, hidden: true}), componentId);
        await expect(field).toBeHidden()
    });

    test('Search renders its preset classes and placeholder without a label', async ({page}) => {
        const field = await createField(page, 'Search');

        await expect(field).toBeVisible();
        await expect(field).toHaveClass(/neo-searchfield/);
        await expect(field).toHaveClass(/neo-textfield/);
        await expect(field.locator('label')).toHaveCount(0);
        await expect(field.locator('input')).toHaveAttribute('placeholder', 'Search')
    });

    test('Display renders a readonly input outside the tab order, without a clear trigger', async ({page}) => {
        const field = await createField(page, 'Display'),
              input = field.locator('input');

        await expect(field).toBeVisible();
        await expect(input).toHaveAttribute('readonly', /.*/);
        await expect(input).not.toBeEditable();
        await expect(input).toHaveAttribute('tabindex', '-1');
        await expect(field.locator('.neo-trigger-clear')).toHaveCount(0)
    })
});
