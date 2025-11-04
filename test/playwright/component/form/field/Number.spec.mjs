import {test, expect} from '@playwright/test';

let componentId;

const MIN = 0, MAX = 10

test.beforeEach(async ({page}) => {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport');

    componentId = await page.evaluate(async ({MIN, MAX}) => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath     : '../form/field/Number.mjs',
            ntype          : 'numberfield',
            parentId       : 'component-test-viewport',
            labelText      : 'My Number',
            width          : 300,
            triggerPosition: 'right',
            useSpinButtons : true,
            minValue       : MIN,
            maxValue       : MAX,
            value          : MIN
        });
        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }
        return result.id;
    }, {MIN, MAX});
});

test.afterEach(async ({page}) => {
    if (componentId) {
        await page.evaluate((id) => {
            return Neo.worker.App.destroyNeoInstance(id);
        }, componentId);
    }
});


test.describe('Neo.form.field.Number', () => {
    test('should create a number field', async ({page}) => {
        const numberField = page.locator(`#${componentId}`);
        await expect(numberField).toHaveClass(/neo-numberfield/);

        const input = numberField.locator('input');
        await expect(input).toHaveAttribute('type', 'number');
    });

    test('should increment and decrement value with spin buttons', async ({page}) => {
        const numberField = page.locator(`#${componentId}`);
        const input = numberField.locator('input');

        await expect(input).toHaveValue('0');

        const spinUp = numberField.locator('.neo-spin-button.neo-up');
        await spinUp.click({ force: true });
        await expect(input).toHaveValue('1');

        const spinDown = numberField.locator('.neo-spin-button.neo-down');
        await spinDown.click({ force: true });
        await expect(input).toHaveValue('0');
    });


    test('should wrap around when exceeding maxValue', async ({page}) => {
        const numberField = page.locator(`#${componentId}`);
        const input = numberField.locator('input');
        const spinUp = numberField.locator('.neo-spin-button.neo-up');

        const NEW_MIN = 0, NEW_MAX = 1;

        await page.evaluate(({id, maxValue, minValue}) => {
            return Neo.worker.App.setConfigs({id, maxValue, minValue});
        }, {id: componentId, minValue: NEW_MIN, maxValue: NEW_MAX});

        // Click up to reach maxValue
        await spinUp.click({ force: true });
        await expect(input).toHaveValue('1');

        // Click up again to wrap around to minValue (default is 0)
        await spinUp.click({ force: true });
        await expect(input).toHaveValue('0');
    });

    test('should wrap around when falling below minValue', async ({page}) => {
        const numberField = page.locator(`#${componentId}`);
        const input = numberField.locator('input');
        const spinDown = numberField.locator('.neo-spin-button.neo-down');

        const NEW_MIN = 0, NEW_MAX = 1;

        await page.evaluate(({id, maxValue, minValue}) => {
            return Neo.worker.App.setConfigs({id, maxValue, minValue});
        }, {id: componentId, minValue: NEW_MIN, maxValue: NEW_MAX});

        // Click down to reach wrap around to maxValue
        await spinDown.click({ force: true });
        await expect(input).toHaveValue('1');
    });
});
