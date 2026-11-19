import {test, expect} from '@playwright/test';

let buttonId;

test.describe('Neo.button.Split', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            importPath: '../button/Split.mjs',
            ntype     : 'split-button',
            parentId  : 'component-test-viewport',
            menu      : [{text: 'Save as'}, {text: 'Export'}],
            text      : 'Save'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`)
        }

        buttonId = result.id
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), buttonId)
    });

    test('clicks on either button leave two buttons with distinct ids', async ({page}) => {
        const buttons = page.locator(`#${buttonId}__wrapper button`);

        for (const index of [1, 1, 0, 0]) {
            await buttons.nth(index).click()
        }

        await expect(buttons).toHaveCount(2);
        expect(new Set(await buttons.evaluateAll(nodes => nodes.map(node => node.id))).size).toBe(2)
    });

    test('the trigger opens and closes the menu, and a press on the main button closes it', async ({page}) => {
        const buttons = page.locator(`#${buttonId}__wrapper button`),
              menu    = page.locator('.neo-menu-list');

        await buttons.nth(1).click();
        await expect(menu).toBeVisible();

        await buttons.nth(1).click();
        await expect(menu).toBeHidden();

        await buttons.nth(0).click();
        await expect(menu).toBeHidden();

        await buttons.nth(1).click();
        await expect(menu).toBeVisible();

        await buttons.nth(0).click();
        await expect(menu).toBeHidden()
    });
});
