import {expect, test} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/code/livePreview/index.html';

/**
 * @summary The Live preview example opens the engine's editor on a function component, runs it in Preview,
 * and runs an edited source again with one result.
 */
test.describe('Live preview example (Neural Link)', () => {
    test.setTimeout(60000);

    test('opens on the function, runs it in Preview, and runs an edit with one result', async ({page, neuralLink}) => {
        await page.goto(EXAMPLE_URL);

        const app = await neuralLink.connectToApp('Neo.examples.code.livePreview');

        await page.waitForSelector('.neo-code-live-preview', {state: 'visible', timeout: 30000});

        const [preview] = await app.queryComponent({className: 'Neo.code.LivePreview'}, ['id', 'activeView', 'value']),
              counter   = page.locator('.neo-code-live-preview .neo-button').filter({hasText: /^Count/});

        expect(preview.properties.activeView).toBe('source');
        await expect(page.locator('.neo-code-live-preview .view-lines')).toContainText('defineComponent');

        await app.setProperties(preview.id, {activeView: 'preview'});
        await expect(counter).toHaveText(['Count: 0']);

        await counter.click();
        await expect(counter).toHaveText(['Count: 1']);

        // An edit runs the source again: the preview holds the new result and nothing of the old one
        await app.setProperties(preview.id, {value: preview.properties.value.replace('Count: ', 'Counter: ')});
        await expect(counter).toHaveText(['Counter: 0'])
    })
});
