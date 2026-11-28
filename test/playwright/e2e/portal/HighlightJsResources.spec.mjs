import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Exercises the remaining legacy addon consumers against shared JS and CSS resources.
 * Set NEO_HIGHLIGHT_DIST_PREFIX=/dist/esm after building to replay the same paths in distribution mode.
 */
const prefix    = process.env.NEO_HIGHLIGHT_DIST_PREFIX || '';
const rawSource = '/**\n * A multiline comment.\n * @returns {Promise<Boolean>}\n */\nexport class Base {\n' +
    '    value = `<div class="probe">&amp;</div>\n${true ?\n"yes" : "no"}\nend`;\n\n    \t\n}\n\n';

/**
 * @summary Checks the copy payload; NEO_HIGHLIGHT_CLIPBOARD=1 also verifies native copy/paste serially.
 */
async function copySource(page, code) {
    await code.evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        getSelection().removeAllRanges();
        getSelection().addRange(range)
    });
    const payload = await code.evaluate(node => {
            const clipboardData = new DataTransfer();
            const event         = new ClipboardEvent('copy', {bubbles: true, cancelable: true, clipboardData});
            node.dispatchEvent(event);
            return clipboardData.getData('text/plain')
        });
    if (!process.env.NEO_HIGHLIGHT_CLIPBOARD) return payload;
    await page.keyboard.press('ControlOrMeta+c');
    await page.evaluate(() => {
        const input = document.createElement('textarea');
        input.id = 'source-copy-probe';
        document.body.append(input);
        input.focus()
    });
    await page.keyboard.press('ControlOrMeta+v');
    const pasted = await page.locator('#source-copy-probe').inputValue();
    await page.locator('#source-copy-probe').evaluate(node => node.remove());
    // A textarea normalizes pasted CR and CRLF to LF; the copy event above checks the original bytes.
    expect(pasted).toBe(payload.replace(/\r\n|\r/g, '\n'));
    return payload
}

test.beforeEach(async ({page}) => {
    // Keep source fixtures on the test's network routes rather than shared/service-worker caches.
    await page.route('**/neo-config.json*', async route => {
        const response = await route.fetch({maxRetries: 2});
        await route.fulfill({response, json: {
            ...await response.json(), useAiClient: false, useSharedWorkers: false,
            useCanvasWorkerStartingPoint: false, useServiceWorker: false
        }})
    });
});

test('cold Home keeps the addon lazy; cold Learn uses the minified worker bundle', async ({page}) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(prefix + '/apps/portal/index.html#/home');
    await expect(page.locator('.portal-home-maincontainer')).toBeVisible();
    expect(await page.evaluate(() => Boolean(Neo.main.addon.HighlightJS))).toBe(true);
    expect(requests.filter(url => /highlight\.custom|highlightjs-custom|highlightjs-line-numbers/.test(url))).toEqual([]);

    await page.route('**/learn/benefits/Introduction.md*', route => route.fulfill({
        contentType: 'text/markdown',
        body       : '# Highlight probe\n\n```javascript readonly\nconst probe = "<div>&amp;</div>";\n```'
    }));
    requests.length = 0;
    await page.goto(prefix + '/apps/portal/index.html#/learn/benefits/Introduction');
    const code = page.locator('.neo-app-content-component pre.hljs');
    await expect(code.locator('.hljs-keyword')).toBeVisible();
    expect(await code.textContent()).toBe('const probe = "<div>&amp;</div>";');
    expect(requests.filter(url => /highlight\.custom.*\.js/.test(url))).toHaveLength(1);
    expect(requests.some(url => url.endsWith('/dist/highlight/highlight.custom.min.js'))).toBe(true);
    expect(requests.filter(url => /highlightjs-custom|highlightjs-line-numbers/.test(url))).toEqual([])
});

for (const host of ['docs', 'portal']) {
    test(`${host}: source highlighting, line numbers and theme switching`, async ({page}, info) => {
        const sourceText = host === 'portal' ? rawSource.replace(/\n/g, '\r\n') : rawSource;
        const requests   = [];
        page.on('request', request => requests.push(request.url()));
        let releaseSource;
        const sourceDelivery = new Promise(resolve => { releaseSource = resolve });
        await page.context().route(/\/docs\/output\/structure\.json/, route => route.fulfill({json: [{
            id      : 10, name: 'src', parentId: null, isLeaf: false
        }, {
            id      : 1, name: 'Base', className: 'Neo.core.Base', isLeaf: true,
            parentId: 10, srcPath: 'resources/highlight-source-fixture.mjs'
        }]}));
        await page.context().route(/\/docs\/output\/all\.json/, route => route.fulfill({json: [{
            id      : 1, $kind: 'class', kind: 'class', neoClassName: 'Neo.core.Base', name: 'Base',
            longname: 'Neo.core.Base', meta: {filename: 'Base.mjs', path: 'src/core', lineno: 1}
        }]}));
        await page.context().route('**/resources/highlight-source-fixture.mjs', async route => {
            await sourceDelivery;
            await route.fulfill({
                contentType: 'application/javascript', body: sourceText
            })
        });

        await page.goto(prefix + (host === 'docs' ? '/docs/index.html' : '/apps/portal/index.html#/docs'));
        await page.locator('.neo-docs-maincontainer .neo-list-item-leaf').filter({hasText: 'Base'}).click();
        await page.locator('.neo-docs-header-text').click();
        const source = page.locator('[id="Neo.core.Base__source"]');
        await page.waitForFunction(() => Boolean(globalThis.hljs?.highlightBlock));
        await expect(source.locator('code')).toBeEmpty();
        // A mounted source view can request highlighting before its network response arrives.
        await source.locator('code').evaluate(node => {
            Neo.main.addon.HighlightJS.syntaxHighlight({vnodeId: node.id})
        }).finally(() => releaseSource());
        await expect(source.locator('.hljs-keyword').first()).toBeVisible();
        await expect(source.locator('.hljs-ln-numbers').first()).toBeVisible();
        await page.screenshot({path: info.outputPath('source-before-theme-switch.png')});
        const code = source.locator('code');
        expect(await code.textContent()).toBe(sourceText);
        expect(await copySource(page, code)).toBe(sourceText);
        const start = sourceText.indexOf('multiline'), end = sourceText.indexOf('    \t');
        for (const backwards of [false, true]) {
            const selected = await code.evaluate((node, {start, end, backwards}) => {
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), nodes = [];
                while (walker.nextNode()) nodes.push(walker.currentNode);
                const point = offset => {
                    for (const text of nodes) {
                        if (offset <= text.length) return [text, offset];
                        offset -= text.length
                    }
                };
                const first = point(start), last = point(end);
                getSelection().setBaseAndExtent(...(backwards ? last : first), ...(backwards ? first : last));
                const clipboardData = new DataTransfer();
                node.dispatchEvent(new ClipboardEvent('copy', {bubbles: true, cancelable: true, clipboardData}));
                return clipboardData.getData('text/plain')
            }, {start, end, backwards});
            expect(selected).toBe(sourceText.slice(start, end))
        }
        for (const line of [1, 2, 3, 4]) {
            await expect(source.locator(`.hljs-ln-code[data-line-number="${line}"] .hljs-comment`).first()).toBeVisible()
        }
        for (const line of [6, 7, 8, 9]) {
            await expect(source.locator(`.hljs-ln-code[data-line-number="${line}"] .hljs-string`).first()).toBeVisible()
        }
        expect(await source.locator('.hljs-ln-n').first().evaluate(node => getComputedStyle(node, '::before').content)).toBe('"1"');
        expect(requests.filter(url => /highlight\.custom.*\.js/.test(url))).toHaveLength(1);
        expect(requests.some(url => url.endsWith('/dist/highlight/highlight.custom.min.js'))).toBe(true);
        expect(requests.some(url => url.includes('highlightjs-line-numbers.min.js'))).toBe(false);
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
        await page.evaluate(() => getSelection().removeAllRanges());
        await page.screenshot({path: info.outputPath('highlighting.png')});
    });
}

test('Toast: generated code remains highlighted and padded', async ({page}, info) => {
    await page.goto(prefix + '/examples/component/toast/index.html');
    const message = '@returns {Promise<Boolean>} <div class="probe">&amp;</div> `template ${value}`';
    await page.locator('input[name="msg"]').fill(message);
    const output = page.locator('.neo-examples-toast .output');
    await expect(output.locator('.hljs-title').first()).toBeVisible();
    await expect(output.locator('.hljs-ln-numbers').first()).toBeVisible();
    await expect(output.locator('.hljs').first()).toHaveCSS('padding', '6px');
    const expected = `Neo.toast({\n    appName : this.appName,\n    windowId: this.windowId,\n    msg     : '${message}'\n})`;
    expect(await output.locator('code').textContent()).toBe(expected);
    expect(await copySource(page, output.locator('code'))).toBe(expected);
    await page.locator('input[name="msg"]').fill('Updated highlighter');
    await expect(output.locator('.hljs-string').filter({hasText: 'Updated highlighter'})).toBeVisible();
    await expect(output.locator('.hljs-ln-numbers').first()).toBeVisible();
    await expect(page.locator('#hljs-theme')).toHaveAttribute('href', /resources\/lib\/highlightjs-custom-dark-theme\.css$/);
    await page.screenshot({path: info.outputPath('highlighting.png')});
});


test('Main: stock and custom palettes keep their gutter styles through the real loader', async ({page}) => {
    await page.goto(prefix + '/examples/component/toast/index.html');
    await page.locator('input[name="msg"]').fill('Palette probe');
    const code   = page.locator('.neo-examples-toast .output code'),
          gutter = code.locator('.hljs-ln-numbers').first(),
          cell   = code.locator('.hljs-ln-code').first();
    await expect(gutter).toHaveCSS('color', 'rgb(155, 159, 163)');
    await expect(gutter).toHaveCSS('background-color', 'rgb(48, 51, 53)');
    await expect(gutter).toHaveCSS('border-right', '1px solid rgb(85, 85, 85)');
    await page.evaluate(() => Neo.main.addon.HighlightJS.switchTheme({
        theme: Neo.config.basePath + 'resources/lib/highlightjs-custom-github-theme.css'
    }));
    await expect(gutter).toHaveCSS('color', 'rgb(106, 115, 125)');
    await expect(gutter).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await page.route('**/highlight-import.css', route => route.fulfill({contentType: 'text/css', body: ''}));
    for (const imported of [false, true]) {
        const themePath = `/highlight-custom-${imported}.css`;
        await page.route('**' + themePath, route => route.fulfill({contentType: 'text/css', body:
            (imported ? '@import url("/highlight-import.css");' : '') + `
            .hljs { color: #123456; }
            .hljs-ln-numbers { color: #123abc; background: #fefefe; border-right: 3px solid red; }
            .hljs-ln-code { padding-left: 7px !important; padding-right: 9px !important; }
        `}));
        await page.evaluate(themePath => Neo.main.addon.HighlightJS.loadFiles({themePath}), themePath);
        await expect(gutter).toHaveCSS('color', 'rgb(18, 58, 188)');
        await expect(gutter).toHaveCSS('background-color', 'rgb(254, 254, 254)');
        await expect(gutter).toHaveCSS('border-right', '3px solid rgb(255, 0, 0)');
        await expect(cell).toHaveCSS('padding-left', '7px');
        await expect(cell).toHaveCSS('padding-right', '9px')
    }
    await expect(page.locator('#hljs-lines')).toHaveCount(1);
    await expect(page.locator('#hljs-theme')).toHaveCount(1);
    expect(await code.locator('.hljs-ln-n').first().evaluate(node => getComputedStyle(node, '::before').content)).toBe('"1"');
});

test('Main: highlighted and skipped blocks preserve mixed line endings and copy text', async ({page}) => {
    await page.goto(prefix + '/examples/component/toast/index.html');
    await page.locator('input[name="msg"]').fill('Newline probe');
    await expect(page.locator('.neo-examples-toast .output .hljs-ln')).toBeVisible();
    const source = 'one\r\ntwo\rthree\n';
    for (const language of ['javascript', 'language-plaintext', 'no-highlight']) {
        await page.evaluate(({language, source}) => {
            const code = document.createElement('code'), pre = document.createElement('pre');
            code.id = 'mixed-newlines';
            code.className = language;
            code.textContent = source;
            pre.append(code);
            document.body.append(pre);
            Neo.main.addon.HighlightJS.syntaxHighlight({vnodeId: code.id})
        }, {language, source});
        const code = page.locator('#mixed-newlines');
        expect(await code.textContent()).toBe(source);
        await expect(code.locator('.hljs-ln-code')).toHaveCount(4);
        expect(await copySource(page, code)).toBe(source);
        await code.evaluate(node => node.parentElement.remove())
    }
});
