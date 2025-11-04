import {test, expect} from '@playwright/test';

let componentId;

const SRC = '../../../../../resources/images/logo/neo_logo_primary.svg',
      ALT = 'neo.mjs logo';

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');

    await page.waitForSelector('#component-test-viewport');

    componentId = await page.evaluate(async ({SRC, ALT}) => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Image.mjs', // path is relative to the App worker
            ntype     : 'image',
            parentId  : 'component-test-viewport',
            src       : SRC,
            alt       : ALT
        });
        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }
        return result.id;
    }, {SRC, ALT});
});

test.afterEach(async ({page}) => {
    if (componentId) {
        await page.evaluate((id) => {
            return Neo.worker.App.destroyNeoInstance(id);
        }, componentId);
    }
});

test.describe('Neo.component.Image', () => {
    test('should render and mount correctly', async ({page}) => {
        const image = page.locator(`#${componentId}`);

        // Verify the image is mounted inside the viewport
        await expect(image.locator('..')).toHaveId('component-test-viewport');

        await expect(image).toHaveAttribute('src', SRC);
        await expect(image).toHaveAttribute('alt', ALT);
    });

    test('should update src and alt attributes on config change', async ({page}) => {
        const image = page.locator(`#${componentId}`);

        const NEW_SRC = '../../../../../resources/images/logo/neo_logo_favicon.svg',
              NEW_ALT = 'neo.mjs favicon';

        await page.evaluate(({id, src, alt}) => {
            return Neo.worker.App.setConfigs({id, src, alt});
        }, {id: componentId, src: NEW_SRC, alt: NEW_ALT});

        await expect(image).toHaveAttribute('src', NEW_SRC);
        await expect(image).toHaveAttribute('alt', NEW_ALT);
    });
});
