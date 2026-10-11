import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.form.field.Date` in a real browser, outside any grid: the keys that open its picker.
 *
 * Harness: `apps/empty-viewport`, one field created through `Neo.worker.App.createNeoInstance`.
 */
const PICKER = '.neo-picker-container';

let componentId;

test.describe('Neo.form.field.Date', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Date.mjs',
            ntype     : 'datefield',
            parentId  : 'component-test-viewport',
            labelText : 'Day',
            value     : '2024-12-18',
            width     : 300
        }));

        expect(result.success, 'the field was created').toBe(true);
        componentId = result.id
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('Alt+ArrowDown opens the picker and hands it focus, and Escape closes it again', async ({page}) => {
        const input = page.locator(`#${componentId} input`);

        await input.click();
        await page.keyboard.press('Alt+ArrowDown');

        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => page.evaluate(picker => !!document.activeElement?.closest(picker), PICKER),
            {message: 'the date selector took focus'}).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0)
    });

    // `window` hears a keydown last, after the engine's listener: that is where a cancelled default shows. Whether the
    // plain arrow opens NO picker is proven in the grid, where Escape tells an open picker from none
    test('plain ArrowDown keeps its native default; the picker key loses its default', async ({page}) => {
        const input = page.locator(`#${componentId} input`);

        await input.click();

        await page.evaluate(() => {
            window.__prevented = {};
            window.addEventListener('keydown', event => {
                if (event.key !== 'Alt') {
                    window.__prevented[`${event.altKey ? 'Alt+' : ''}${event.key}`] = event.defaultPrevented
                }
            })
        });

        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Alt+ArrowDown');
        await expect(page.locator(PICKER)).toBeVisible();

        expect(await page.evaluate(() => window.__prevented)).toEqual({'ArrowDown': false, 'Alt+ArrowDown': true})
    })
});
