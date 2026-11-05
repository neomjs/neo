import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Exercises the remaining legacy addon consumers against shared JS and CSS resources.
 * Set NEO_HIGHLIGHT_DIST_PREFIX=/dist/esm after building to replay the same paths in distribution mode.
 */
const prefix = process.env.NEO_HIGHLIGHT_DIST_PREFIX || '';

test.beforeEach(async ({page}) => {
    // Keep source fixtures on the test's network routes rather than shared/service-worker caches.
    await page.route('**/neo-config.json*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, json: {
            ...await response.json(), useAiClient: false, useSharedWorkers: false,
            useCanvasWorkerStartingPoint: false, useServiceWorker: false
        }})
    });
});

for (const host of ['docs', 'portal']) {
    test(`${host}: source highlighting, line numbers and theme switching`, async ({page}, info) => {
        let releaseSource;
        const sourceDelivery = new Promise(resolve => { releaseSource = resolve });
        await page.context().route(/\/docs\/output\/structure\.json/, route => route.fulfill({json: [{
            id      : 1, name: 'Base', className: 'Neo.core.Base', isLeaf: true,
            parentId: null, srcPath: 'resources/highlight-source-fixture.mjs'
        }]}));
        await page.context().route(/\/docs\/output\/all\.json/, route => route.fulfill({json: [{
            id      : 1, $kind: 'class', kind: 'class', neoClassName: 'Neo.core.Base', name: 'Base',
            longname: 'Neo.core.Base', meta: {filename: 'Base.mjs', path: 'src/core', lineno: 1}
        }]}));
        await page.context().route('**/resources/highlight-source-fixture.mjs', async route => {
            await sourceDelivery;
            await route.fulfill({
                contentType: 'application/javascript', body: 'export class Base {\n    value = "highlighted";\n}\n'
            })
        });

        await page.goto(prefix + (host === 'docs' ? '/docs/index.html' : '/apps/portal/index.html#/docs'));
        await page.locator('.neo-docs-maincontainer .neo-list-item-leaf').filter({hasText: 'Base'}).click();
        await page.locator('.neo-docs-header-text').click();
        const source = page.locator('[id="Neo.core.Base__source"]');
        await page.waitForFunction(() => Boolean(globalThis.hljs?.lineNumbersBlockSync));
        await expect(source.locator('code')).toBeEmpty();
        // A mounted source view can request highlighting before its network response arrives.
        await source.locator('code').evaluate(node => {
            Neo.main.addon.HighlightJS.syntaxHighlight({vnodeId: node.id})
        }).finally(() => releaseSource());
        await expect(source.locator('.hljs-keyword').first()).toBeVisible();
        await expect(source.locator('.hljs-ln-numbers').first()).toBeVisible();
        const lines = await source.locator('.hljs-ln-code').allTextContents();
        // Source delivery and the mounted callback may both request highlighting of the same leaf.
        await source.locator('code').evaluate(async node => {
            Neo.main.addon.HighlightJS.syntaxHighlight({vnodeId: node.id});
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        });
        expect(await source.locator('.hljs-ln-code').allTextContents()).toEqual(lines);
        const style = page.locator('#hljs-theme');
        await expect(style).toHaveAttribute('href', /resources\/lib\/highlightjs-custom-.*-theme\.css$/);
        const before = await style.getAttribute('href');
        await page.getByRole('button', {name: /^Source View Theme /}).click();
        await expect(style).not.toHaveAttribute('href', before);
        expect(await page.evaluate(() => globalThis.hljs.listLanguages())).toContain('javascript');
        await page.screenshot({path: info.outputPath('highlighting.png')});
    });
}

test('Toast: generated code remains highlighted and padded', async ({page}, info) => {
    await page.goto(prefix + '/examples/component/toast/index.html');
    await page.locator('input[name="msg"]').fill('Shared highlighter');
    const output = page.locator('.neo-examples-toast .output');
    await expect(output.locator('.hljs-keyword').first()).toBeVisible();
    await expect(output.locator('.hljs-ln-numbers').first()).toBeVisible();
    await expect(output.locator('.hljs').first()).toHaveCSS('padding', '6px');
    await page.locator('input[name="msg"]').fill('Updated highlighter');
    await expect(output.locator('.hljs-string').filter({hasText: 'Updated highlighter'})).toBeVisible();
    await expect(output.locator('.hljs-ln-numbers').first()).toBeVisible();
    await expect(page.locator('#hljs-theme')).toHaveAttribute('href', /resources\/lib\/highlightjs-custom-dark-theme\.css$/);
    await page.screenshot({path: info.outputPath('highlighting.png')});
});
