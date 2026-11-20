import {expect, test} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/code/livePreview/index.html';

/**
 * @summary The Live preview example opens the engine's editor on a function component under a header that says
 * what to try, runs it in Preview, runs an edited source again with one result, and switches the page and the
 * editor to the dark theme.
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
        await expect(page.locator('.neo-examples-livepreview-title')).toHaveText('A code editor that runs the function component it holds');
        await expect(page.locator('.neo-code-live-preview .view-lines')).toContainText('defineComponent');

        await app.setProperties(preview.id, {activeView: 'preview'});
        await expect(counter).toHaveText(['Count: 0']);

        await counter.click();
        await expect(counter).toHaveText(['Count: 1']);

        // An edit runs the source again: the preview holds the new result and nothing of the old one
        await app.setProperties(preview.id, {value: preview.properties.value.replace('Count: ', 'Counter: ')});
        await expect(counter).toHaveText(['Counter: 0']);

        // The theme button switches the page to neo-dark, and the editor follows it
        await page.locator('.neo-examples-livepreview-header .neo-button').click();
        await expect(page.locator('.neo-examples-livepreview')).toHaveClass(/\bneo-theme-neo-dark\b/);
        await expect(page.locator('.neo-code-live-preview .monaco-editor').first()).toHaveClass(/\bvs-dark\b/)
    })
});
