import {test, expect} from '@playwright/test';

let componentId;

/**
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} the created component's id
 */
async function createSwitch(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/Switch.mjs',
        ntype     : 'switchfield',
        parentId  : 'component-test-viewport',
        labelText : 'Enable notifications',
        labelWidth: 140,
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id
}

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Object} the label locator
 */
function clickTarget(page, id) {
    return page.locator(`#${id} label`)
}

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function domChecked(page, id) {
    return page.locator(`#${id} input.neo-switchfield-input`).evaluate(node => node.checked)
}

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
function configChecked(page, id) {
    return page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'checked'}), id)
}

test.describe('Neo.form.field.Switch', () => {
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

    test('renders with switchfield classes, switch input, and omits the checkbox icon node', async ({page}) => {
        componentId = await createSwitch(page, {checked: false, valueLabel: 'Off'});

        const field      = page.locator(`#${componentId}`),
              input      = field.locator('input.neo-switchfield-input'),
              icon       = field.locator('.neo-switchfield-icon'),
              valueLabel = field.locator('.neo-checkbox-value-label');

        await expect(field).toHaveClass(/neo-switchfield/);
        await expect(field).toHaveClass(/neo-checkboxfield/);
        await expect(input).toHaveAttribute('type', 'checkbox');
        await expect(icon).toHaveCount(0);
        await expect(valueLabel).toHaveText('Off')
    });

    test('toggles checked state between DOM and App Worker on click and config updates', async ({page}) => {
        componentId = await createSwitch(page, {checked: false});

        expect(await domChecked(page, componentId),    'starts unchecked in the DOM').toBe(false);
        expect(await configChecked(page, componentId), 'and in its config').toBe(false);

        await clickTarget(page, componentId).click();

        await expect.poll(() => configChecked(page, componentId), {message: 'click reaches the App Worker'}).toBe(true);
        expect(await domChecked(page, componentId), 'and updates the DOM input property').toBe(true);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, checked: false}), componentId);

        await expect.poll(() => domChecked(page, componentId), {message: 'config change updates the DOM property'}).toBe(false);
        expect(await configChecked(page, componentId)).toBe(false)
    });

    test('updates labelPosition, valueLabel, and required validation state', async ({page}) => {
        componentId = await createSwitch(page, {checked: true, required: true, valueLabel: 'Active'});

        const field        = page.locator(`#${componentId}`),
              valueLabel   = field.locator('.neo-checkbox-value-label'),
              errorWrapper = field.locator('.neo-error-wrapper');

        await expect(valueLabel).toHaveText('Active');
        await expect(errorWrapper).toHaveCount(0);

        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            checked      : false,
            labelPosition: 'top',
            valueLabel   : 'Inactive'
        }), componentId);

        await expect(field).toHaveClass(/neo-label-top/);
        await expect(field).toHaveClass(/neo-invalid/);
        await expect(valueLabel).toHaveText('Inactive');
        await expect(errorWrapper).toBeVisible();
        await expect(errorWrapper.locator('.neo-error')).toHaveText('Required')
    })
});
