import {test, expect} from '@playwright/test';

/**
 * @summary A select with its label left: the label stands beside the select, and an error under the select. A unit
 * spec cannot see this, since `Select.css` lays out the columns.
 */
test.describe('Neo.form.field.Select', () => {
    let componentId = null;

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('with its label left, the label stands beside the select and an error under the select', async ({page}) => {
        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath   : '../form/field/Select.mjs',
            ntype        : 'selectfield',
            parentId     : 'component-test-viewport',
            error        : 'Pick a room',
            labelPosition: 'left',
            labelText    : 'Room',
            options      : ['Hygiene 1', 'Hygiene 2'],
            width        : 400
        }));

        expect(result.success).toBe(true);
        componentId = result.id;

        const field = page.locator(`#${componentId}`);

        await expect(field.locator('.neo-selectfield-error')).toHaveText('Pick a room');

        const [label, select, error] = await Promise.all(
            ['.neo-selectfield-label', '.neo-selectfield-input', '.neo-selectfield-error'].map(selector => field.locator(selector).boundingBox())
        );

        expect(Math.round(label.width), 'the label is labelWidth wide').toBe(150);
        expect(Math.abs(select.x - (label.x + label.width)), 'the select starts after the label').toBeLessThanOrEqual(1);
        expect(Math.abs(error.x - select.x), 'the error starts under the select').toBeLessThanOrEqual(1);
        expect(error.y, 'the error is below the select').toBeGreaterThanOrEqual(select.y + select.height - 1)
    })
});
