import {test, expect} from '@playwright/test';

let componentId;

/**
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} the created component's id
 */
async function createEmailField(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/Email.mjs',
        ntype     : 'emailfield',
        parentId  : 'component-test-viewport',
        labelText : 'Email',
        labelWidth: 80,
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id
}

test.describe('Neo.form.field.Email', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('renders with type="email" input and label', async ({page}) => {
        componentId = await createEmailField(page, {
            placeholderText: 'user@example.com'
        });

        const field = page.locator(`#${componentId}`),
              input = field.locator('input.neo-textfield-input'),
              label = field.locator('label.neo-textfield-label');

        await expect(field).toHaveClass(/neo-textfield/);
        await expect(input).toHaveAttribute('type', 'email');
        await expect(input).toHaveAttribute('placeholder', 'user@example.com');
        await expect(label).toHaveText('Email')
    });

    test('validates email format on user input and clears error when corrected', async ({page}) => {
        componentId = await createEmailField(page, {});

        const field   = page.locator(`#${componentId}`),
              input   = field.locator('input.neo-textfield-input'),
              errorEl = field.locator('.neo-textfield-error');

        await input.fill('not-an-email');

        await expect(field).toHaveClass(/neo-invalid/);
        await expect(errorEl).toHaveText('Not a valid email address');

        await input.fill('maryam@neomjs.com');

        await expect(field).not.toHaveClass(/neo-invalid/);
        await expect(errorEl).toHaveCount(0)
    });

    test('supports custom errorTextValidEmail, required validation, and clear trigger', async ({page}) => {
        componentId = await createEmailField(page, {
            errorTextValidEmail: 'Custom email error',
            required           : true
        });

        const field        = page.locator(`#${componentId}`),
              input        = field.locator('input.neo-textfield-input'),
              clearTrigger = field.locator('.neo-trigger-clear'),
              errorEl      = field.locator('.neo-textfield-error');

        await input.fill('bad@');

        await expect(field).toHaveClass(/neo-invalid/);
        await expect(errorEl).toHaveText('Custom email error');

        await field.hover();
        await clearTrigger.click();

        await expect(input).toHaveValue('');
        await expect(field).toHaveClass(/neo-invalid/);
        await expect(errorEl).toHaveText('Required')
    })
});
