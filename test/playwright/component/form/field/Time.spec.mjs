import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.form.field.Time` in a real browser: its key map replaces the picker field's, so the picker key has to
 * be in it too.
 *
 * Harness: `apps/empty-viewport`, one field created through `Neo.worker.App.createNeoInstance`.
 */
const PICKER = '.neo-picker-container';

let componentId;

test.describe('Neo.form.field.Time', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Time.mjs',
            ntype     : 'timefield',
            parentId  : 'component-test-viewport',
            labelText : 'Time',
            value     : '10:00',
            width     : 300
        }));

        expect(result.success, 'the field was created').toBe(true);
        componentId = result.id
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('Alt+ArrowDown opens the picker, and Escape closes it again', async ({page}) => {
        await page.locator(`#${componentId} input`).click();
        await page.keyboard.press('Alt+ArrowDown');
        await expect(page.locator(PICKER)).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0)
    })
});
