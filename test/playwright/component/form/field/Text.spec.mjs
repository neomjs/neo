import {test, expect} from '@playwright/test';

let componentId;

async function createTextField(page, config) {
    const result = await page.evaluate(async (config) => {
        return Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Text.mjs',
            ntype     : 'textfield',
            parentId  : 'component-test-viewport',
            labelText : 'My label',
            labelWidth: 80,
            width     : 300,
            ...config
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id;
}

test.describe('Neo.form.field.Text', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy component ${id}:`, result.error);
                }
            }, componentId);
            componentId = null;
        }
    });

    test('Check isTouched on focusLeave', async ({page}) => {
        componentId = await createTextField(page, {value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();
        await page.locator('#component-test-viewport').click(); // Click outside to blur

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched on focusEnter', async ({page}) => {
        componentId = await createTextField(page, {isTouchedEvent: 'focusEnter', value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched set initially', async ({page}) => {
        componentId = await createTextField(page, {isTouched: true, value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Label Positions', async ({page}) => {
        componentId = await createTextField(page);
        const field = page.locator(`#${componentId}`);
        const label = field.locator('.neo-textfield-label');

        // left (default)
        await expect(label).toBeVisible();

        // top
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'top'}), componentId);
        await expect(field).toHaveClass(/label-top/);

        // bottom
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'bottom'}), componentId);
        await expect(field).toHaveClass(/label-bottom/);

        // right
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'right'}), componentId);
        await expect(field).toHaveClass(/label-right/);

        // inline
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'inline'}), componentId);
        await expect(field).toHaveClass(/label-inline/);
    });
});
