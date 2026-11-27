import {test, expect} from '@playwright/test';

/**
 * @summary Verifies that structural CSS sets `color-scheme: var(--neo-color-scheme)` once on the
 * `[class*="neo-theme-"]` base selector (`resources/css/src/Global.css`), propagating the active
 * theme's declared scheme to themed roots, `<progress>`, `<select>`, `::picker(select)`, `<iframe>`,
 * and `.neo-theme-scope` containers while resetting cleanly at nested theme island boundaries.
 */

const ALL_THEMES = [
    'neo-theme-neo-dark',
    'neo-theme-neo-light',
    'neo-theme-dark',
    'neo-theme-light',
    'neo-theme-cyberpunk'
];

const MATRIX = [
    {theme: 'neo-theme-neo-dark',  scheme: 'dark',  islandTheme: 'neo-theme-light',     islandScheme: 'light'},
    {theme: 'neo-theme-dark',      scheme: 'dark',  islandTheme: 'neo-theme-neo-light', islandScheme: 'light'},
    {theme: 'neo-theme-cyberpunk', scheme: 'dark',  islandTheme: 'neo-theme-light',     islandScheme: 'light'},
    {theme: 'neo-theme-neo-light', scheme: 'light', islandTheme: 'neo-theme-dark',      islandScheme: 'dark'},
    {theme: 'neo-theme-light',     scheme: 'light', islandTheme: 'neo-theme-neo-dark',  islandScheme: 'dark'}
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
                body       : JSON.stringify({...json, themes: ALL_THEMES})
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

            return {
                progressId,
                selectId,
                iframeId,
                scopeId,
                islandId,
                islandProgressId,
                islandSelectId,
                islandIframeId
            }
        });

        await expect(page.locator(`progress#${createdIds.progressId}`)).toBeVisible();
        await expect(page.locator(`#${createdIds.selectId} select.neo-selectfield-input`)).toBeVisible();
        await expect(page.locator(`iframe#${createdIds.iframeId}`)).toBeVisible();
        await expect(page.locator(`#${createdIds.islandId} select.neo-selectfield-input`)).toBeVisible()
    });

    test.afterEach(async ({page}) => {
        if (createdIds?.progressId) {
            await page.evaluate(async ids => {
                for (const key of ['islandId', 'scopeId', 'iframeId', 'selectId', 'progressId']) {
                    if (ids[key]) {
                        await Neo.worker.App.destroyNeoInstance(ids[key])
                    }
                }
            }, createdIds)
        }
    });

    test('sets color-scheme across all five themes, inherits into controls/pickers/iframes, and resets on nested theme islands', async ({page}) => {
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
                      bodyStyle    = getComputedStyle(document.body),
                      islandStyle  = getComputedStyle(islandEl);

                return {
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
    })
});
