import {test, expect} from '@playwright/test';

/**
 * @summary Verifies that structural CSS sets `color-scheme: var(--neo-color-scheme)` once on
 * `:root:has(> [class*="neo-theme-"]), [class*="neo-theme-"]` (`resources/css/src/Global.css`),
 * propagating the active theme's declared scheme to the document root (`<html>`) when `<body>`
 * carries a theme class, themed roots, `<progress>`, `<select>`, `::picker(select)`, `<iframe>`,
 * embedded themed Neo documents, `.neo-theme-scope`, and `Neo.component.Timer` while resetting
 * cleanly at nested theme island boundaries.
 */

const MATRIX = [
    {theme: 'neo-theme-neo-dark',       scheme: 'dark',  islandTheme: 'neo-theme-light',          islandScheme: 'light'},
    {theme: 'neo-theme-dark',           scheme: 'dark',  islandTheme: 'neo-theme-neo-light',      islandScheme: 'light'},
    {theme: 'neo-theme-cyberpunk',      scheme: 'dark',  islandTheme: 'neo-theme-light',          islandScheme: 'light'},
    {theme: 'neo-theme-neo-light',      scheme: 'light', islandTheme: 'neo-theme-material-dark',  islandScheme: 'dark'},
    {theme: 'neo-theme-light',          scheme: 'light', islandTheme: 'neo-theme-neo-dark',       islandScheme: 'dark'},
    {theme: 'neo-theme-material-dark',  scheme: 'dark',  islandTheme: 'neo-theme-material-light', islandScheme: 'light'},
    {theme: 'neo-theme-material-light', scheme: 'light', islandTheme: 'neo-theme-dark',           islandScheme: 'dark'}
];

test.describe('Base [class*="neo-theme-"] color-scheme inheritance and nested scope reset', () => {
    let createdIds = [];

    test.beforeEach(async ({page}) => {
        createdIds = [];

        await page.context().route('**/test/playwright/component/apps/empty-viewport/neo-config.json', async route => {
            const response = await route.fetch(),
                  json     = await response.json();

            await route.fulfill({
                contentType: 'application/json',
                body       : JSON.stringify({...json, themes: MATRIX.map(row => row.theme)})
            })
        });

        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        createdIds = await page.evaluate(async () => {
            const create = async config => {
                const res = await Neo.worker.App.createNeoInstance(config);
                if (!res.success) {
                    throw new Error(`Instance creation failed (${config.importPath}): ${res.error?.message}`);
                }
                return res.id
            };

            const progressId = await create({
                importPath: '../component/Progress.mjs',
                labelText : 'Outer progress',
                ntype     : 'progress',
                parentId  : 'component-test-viewport',
                value     : 45
            });

            const selectId = await create({
                importPath: '../form/field/Select.mjs',
                labelText : 'Outer select',
                ntype     : 'selectfield',
                options   : ['One', 'Two'],
                parentId  : 'component-test-viewport',
                value     : 'One'
            });

            const iframeId = await create({
                className : 'Neo.component.Iframe',
                importPath: '../component/Iframe.mjs',
                parentId  : 'component-test-viewport',
                style     : {height: '40px', width: '120px'}
            });

            const scopeId = await create({
                cls       : ['neo-theme-scope'],
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport'
            });

            const islandId = await create({
                cls       : ['neo-theme-light'],
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport'
            });

            const islandProgressId = await create({
                importPath: '../component/Progress.mjs',
                labelText : 'Island progress',
                ntype     : 'progress',
                parentId  : islandId,
                value     : 65
            });

            const islandSelectId = await create({
                importPath: '../form/field/Select.mjs',
                labelText : 'Island select',
                ntype     : 'selectfield',
                options   : ['Alpha', 'Beta'],
                parentId  : islandId,
                value     : 'Alpha'
            });

            const islandIframeId = await create({
                className : 'Neo.component.Iframe',
                importPath: '../component/Iframe.mjs',
                parentId  : islandId,
                style     : {height: '40px', width: '120px'}
            });

            const timerId = await create({
                dimensions: '6rem',
                duration  : '20s',
                importPath: '../component/Timer.mjs',
                ntype     : 'timer',
                parentId  : 'component-test-viewport'
            });

            return {
                progressId,
                selectId,
                iframeId,
                scopeId,
                islandId,
                islandProgressId,
                islandSelectId,
                islandIframeId,
                timerId
            }
        });

        await expect(page.locator(`progress#${createdIds.progressId}`)).toBeVisible();
        await expect(page.locator(`#${createdIds.selectId} select.neo-selectfield-input`)).toBeVisible();
        await expect(page.locator(`iframe#${createdIds.iframeId}`)).toBeVisible();
        await expect(page.locator(`#${createdIds.islandId} select.neo-selectfield-input`)).toBeVisible();
        await expect(page.locator(`#${createdIds.timerId} .flip-card-front > button`)).toBeVisible()
    });

    test.afterEach(async ({page}) => {
        if (createdIds?.progressId) {
            await page.evaluate(async ids => {
                for (const key of ['timerId', 'islandId', 'scopeId', 'iframeId', 'selectId', 'progressId']) {
                    if (ids[key]) {
                        await Neo.worker.App.destroyNeoInstance(ids[key])
                    }
                }
            }, createdIds)
        }
    });

    test('sets color-scheme on document root and themed scopes across shipped themes, inherits into controls/pickers/iframes, and resets on nested theme islands', async ({page}) => {
        for (const {theme, scheme, islandTheme, islandScheme} of MATRIX) {
            const snapshot = await page.evaluate(async ({ids, theme, islandTheme}) => {
                const islandEl = document.getElementById(ids.islandId);

                document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                    if (node === islandEl || node.classList.contains('neo-theme-scope')) {
                        return
                    }
                    node.className = node.className.replace(/neo-theme-[a-z-]+/g, theme)
                });

                islandEl.className = islandEl.className.replace(/neo-theme-[a-z-]+/g, islandTheme);

                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const outerSelect  = document.querySelector(`#${ids.selectId} select.neo-selectfield-input`),
                      islandSelect = document.querySelector(`#${ids.islandId} select.neo-selectfield-input`),
                      rootStyle    = getComputedStyle(document.documentElement),
                      bodyStyle    = getComputedStyle(document.body),
                      islandStyle  = getComputedStyle(islandEl);

                return {
                    rootDeclared  : rootStyle.getPropertyValue('--neo-color-scheme').trim(),
                    rootUsed      : rootStyle.colorScheme,
                    bodyDeclared  : bodyStyle.getPropertyValue('--neo-color-scheme').trim(),
                    bodyUsed      : bodyStyle.colorScheme,
                    progress      : getComputedStyle(document.getElementById(ids.progressId)).colorScheme,
                    select        : getComputedStyle(outerSelect).colorScheme,
                    selectPicker  : getComputedStyle(outerSelect, '::picker(select)').colorScheme,
                    iframe        : getComputedStyle(document.getElementById(ids.iframeId)).colorScheme,
                    scope         : getComputedStyle(document.getElementById(ids.scopeId)).colorScheme,
                    islandDeclared: islandStyle.getPropertyValue('--neo-color-scheme').trim(),
                    islandUsed    : islandStyle.colorScheme,
                    islandProgress: getComputedStyle(document.getElementById(ids.islandProgressId)).colorScheme,
                    islandSelect  : getComputedStyle(islandSelect).colorScheme,
                    islandPicker  : getComputedStyle(islandSelect, '::picker(select)').colorScheme,
                    islandIframe  : getComputedStyle(document.getElementById(ids.islandIframeId)).colorScheme
                }
            }, {ids: createdIds, theme, islandTheme});

            expect(snapshot.rootDeclared,   `${theme} declares --neo-color-scheme on :root when body is themed`).toBe(scheme);
            expect(snapshot.rootUsed,       `${theme} sets color-scheme on :root despite nested ${islandTheme} island`).toBe(scheme);
            expect(snapshot.bodyDeclared,   `${theme} declares --neo-color-scheme`).toBe(scheme);
            expect(snapshot.bodyUsed,       `${theme} sets color-scheme on the themed body`).toBe(scheme);
            expect(snapshot.progress,       `${theme} propagates color-scheme to <progress>`).toBe(scheme);
            expect(snapshot.select,         `${theme} propagates color-scheme to <select>`).toBe(scheme);
            expect(snapshot.selectPicker,   `${theme} propagates color-scheme to ::picker(select)`).toBe(scheme);
            expect(snapshot.iframe,         `${theme} propagates color-scheme to <iframe>`).toBe(scheme);
            expect(snapshot.scope,          `${theme} preserves color-scheme on .neo-theme-scope`).toBe(scheme);

            expect(snapshot.islandDeclared, `${islandTheme} declares nested --neo-color-scheme`).toBe(islandScheme);
            expect(snapshot.islandUsed,     `${islandTheme} resets color-scheme on nested scope root`).toBe(islandScheme);
            expect(snapshot.islandProgress, `${islandTheme} resets color-scheme on nested <progress>`).toBe(islandScheme);
            expect(snapshot.islandSelect,   `${islandTheme} resets color-scheme on nested <select>`).toBe(islandScheme);
            expect(snapshot.islandPicker,   `${islandTheme} resets color-scheme on nested ::picker(select)`).toBe(islandScheme);
            expect(snapshot.islandIframe,   `${islandTheme} resets color-scheme on nested <iframe>`).toBe(islandScheme)
        }
    });

    test('propagates root color-scheme inside an embedded themed Neo document while leaving unthemed documents normal', async ({page}) => {
        const result = await page.evaluate(async ({ids, matrix}) => {
            const sheetHrefs = [...document.querySelectorAll('link[rel="stylesheet"]')]
                .map(link => link.href)
                .filter(href => href.includes('/Global.css'));

            const loadEmbeddedDoc = (iframeEl, bodyClass) => new Promise((resolve, reject) => {
                const links = sheetHrefs.map(href => `<link rel="stylesheet" href="${href}">`).join('');
                iframeEl.onload = () => {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        const doc = iframeEl.contentDocument;
                        resolve({
                            outerScheme: getComputedStyle(iframeEl).colorScheme,
                            rootScheme : getComputedStyle(doc.documentElement).colorScheme,
                            bodyScheme : getComputedStyle(doc.body).colorScheme
                        })
                    }))
                };
                iframeEl.onerror = () => reject(new Error('Embedded srcdoc failed to load'));
                iframeEl.srcdoc  = `<!DOCTYPE html><html><head>${links}</head><body${bodyClass ? ` class="${bodyClass}"` : ''}></body></html>`
            });

            const iframeEl = document.getElementById(ids.iframeId),
                  rows     = [];

            for (const {theme, scheme} of matrix) {
                document.body.className = document.body.className.replace(/neo-theme-[a-z-]+/g, theme);
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                const themed   = await loadEmbeddedDoc(iframeEl, `neo-body ${theme}`),
                      unthemed = await loadEmbeddedDoc(iframeEl, '');

                rows.push({theme, scheme, themed, unthemed})
            }

            return rows
        }, {ids: createdIds, matrix: MATRIX});

        for (const {theme, scheme, themed, unthemed} of result) {
            expect(themed.outerScheme,  `${theme} outer <iframe> carries ${scheme}`).toBe(scheme);
            expect(themed.rootScheme,   `${theme} embedded themed Neo document :root carries ${scheme}`).toBe(scheme);
            expect(themed.bodyScheme,   `${theme} embedded themed Neo document <body> carries ${scheme}`).toBe(scheme);
            expect(unthemed.rootScheme, `${theme} embedded unthemed document :root stays normal`).toBe('normal');
            expect(unthemed.bodyScheme, `${theme} embedded unthemed document <body> stays normal`).toBe('normal')
        }
    });

    test('keeps Neo.component.Timer play button legible in neo-theme-neo-dark under dark ButtonText', async ({page}) => {
        const timerMetrics = await page.evaluate(async ({ids}) => {
            document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                if (!node.classList.contains('neo-theme-scope')) {
                    node.className = node.className.replace(/neo-theme-[a-z-]+/g, 'neo-theme-neo-dark')
                }
            });

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            const btn   = document.querySelector(`#${ids.timerId} .flip-card-front > button`),
                  style = getComputedStyle(btn),
                  parse = rgb => rgb.match(/\d+/g).slice(0, 3).map(Number),
                  lum   = ([r, g, b]) => {
                      const chan = v => {
                          const s = v / 255;
                          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
                      };
                      return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
                  };

            const fgLum = lum(parse(style.color)),
                  bgLum = lum(parse(style.backgroundColor)),
                  ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);

            return {
                colorScheme    : style.colorScheme,
                color          : style.color,
                backgroundColor: style.backgroundColor,
                contrastRatio  : Number(ratio.toFixed(2))
            }
        }, {ids: createdIds});

        expect(timerMetrics.colorScheme).toBe('dark');
        expect(timerMetrics.color).toBe('rgb(255, 255, 255)');
        expect(timerMetrics.backgroundColor).toBe('rgb(31, 87, 84)');
        expect(timerMetrics.contrastRatio).toBeGreaterThanOrEqual(4.5)
    })
});
