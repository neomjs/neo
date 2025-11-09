import {test, expect} from '@playwright/test';

let componentId;

test.describe('Neo.component.DateSelector', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');

        const result = await page.evaluate(async () => {
            return Neo.worker.App.createNeoInstance({
                importPath: '../component/DateSelector.mjs',
                ntype     : 'dateselector',
                parentId  : 'component-test-viewport',
                height    : 250,
                value     : '2023-10-15',
                width     : 300
            });
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        componentId = result.id;
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

    test('should render the DateSelector component', async ({page}) => {
        const dateSelector = page.locator(`#${componentId}`);
        await expect(dateSelector).toBeVisible();
    });
});
