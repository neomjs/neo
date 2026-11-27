import {test, expect} from '@playwright/test';

/**
 * @summary Verifies map-driven stylesheet loading (`theme-base` + single-request multi-class folders) and
 * `Neo.setCssVariable` across `@layer` blocks, dual-scheme folders, classic themes, and runtime `<style>` sheets
 * in a live browser + App Worker runtime.
 */
test.describe('Stylesheet theme-map loading and layered setCssVariable', () => {
    test('editing a compiled Material widget variable updates its role scopes in that scheme only', async ({page}) => {
        await page.route('**/empty-viewport/neo-config.json', async route => {
            const response = await route.fetch();
            await route.fulfill({json: {...await response.json(), themes: ['neo-theme-material-dark', 'neo-theme-material-light']}})
        });
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await expect(page.locator('#component-test-viewport')).toBeAttached();

        const button = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../button/Base.mjs', ntype: 'button', parentId: 'component-test-viewport', text: 'Theme edit'
        }));
        await expect(page.locator('#' + button.id)).toHaveCSS('border-radius', '9999px');

        const actual = await page.evaluate(() => {
            const key = '--neo-button-border-radius',
                  set = Neo.main.addon.Stylesheet.setCssVariable({theme: 'neo-theme-material-dark', key, value: '19px'});
            const read = theme => {
                const root = document.createElement('div'),
                      role = document.createElement('div');
                root.className = theme;
                role.className = 'neo-theme-scope';
                root.append(role);
                document.body.append(root);
                const values = [root, role].map(node => getComputedStyle(node).getPropertyValue(key).trim());
                root.remove();
                return values
            };

            return {set, dark: read('neo-theme-material-dark'), light: read('neo-theme-material-light')}
        });

        expect(actual).toEqual({set: true, dark: ['19px', '19px'], light: ['9999px', '9999px']})
    });

    test('loads theme-base and a dual-scheme fixture folder once, and updates layered variables with a runtime <style> sheet present', async ({page}) => {
        const requestedCss = [],
              warnings     = [];

        page.on('console', msg => {
            if (msg.type() === 'warning') {
                warnings.push(msg.text())
            }
        });

        await page.context().route('**/test/playwright/component/apps/empty-viewport/neo-config.json', async route => {
            const response = await route.fetch(),
                  json     = await response.json();

            await route.fulfill({
                contentType: 'application/json',
                body       : JSON.stringify({
                    ...json,
                    themes: ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-dark', 'neo-theme-missing']
                })
            })
        });

        await page.context().route('**/resources/theme-map.json', async route => {
            const response = await route.fetch(),
                  json     = await response.json();

            json.themes = {
                ...(json.themes || {}),
                'neo-theme-dark'     : ['theme-dark'],
                'neo-theme-neo-dark' : ['theme-neo-fixture'],
                'neo-theme-neo-light': ['theme-neo-fixture']
            };

            const withFixture = list => [...new Set([
                ...(list || ['src']),
                'theme-base',
                'theme-neo-fixture',
                'theme-dark'
            ])];

            json.Neo.Global      = withFixture(json.Neo.Global);
            json.Neo.button.Base = withFixture(json.Neo.button.Base);

            await route.fulfill({
                contentType: 'application/json',
                body       : JSON.stringify(json)
            })
        });

        const virtualSheets = {
            '/dist/development/css/theme-base/Global.css': [
                '@layer neo.roles, neo.base, neo.theme, neo.rules;',
                '@layer neo.base {',
                '    [class*="neo-theme-"] {',
                '        --fixture-base-marker: 12px;',
                '        --fixture-paint: var(--fixture-role-paint);',
                '    }',
                '}'
            ].join('\n'),
            '/dist/development/css/theme-base/button/Base.css': [
                '@layer neo.roles, neo.base, neo.theme, neo.rules;',
                '@layer neo.base {',
                '    [class*="neo-theme-"] {',
                '        --fixture-button-base: 6px;',
                '    }',
                '}'
            ].join('\n'),
            '/dist/development/css/theme-neo-fixture/Global.css': [
                '@layer neo.roles, neo.base, neo.theme, neo.rules;',
                '@layer neo.roles {',
                '    .neo-theme-neo-light {',
                '        --neo-color-scheme: light;',
                '        --fixture-scheme-token: rgb(240, 240, 245);',
                '    }',
                '    .neo-theme-neo-dark {',
                '        --neo-color-scheme: dark;',
                '        --fixture-scheme-token: rgb(20, 20, 28);',
                '    }',
                '    :where(.neo-theme-neo-light, .neo-theme-neo-dark) {',
                '        --fixture-role-paint: light-dark(rgb(250, 250, 252), rgb(15, 15, 20));',
                '    }',
                '}'
            ].join('\n'),
            '/dist/development/css/theme-neo-fixture/button/Base.css': [
                '@layer neo.roles, neo.base, neo.theme, neo.rules;',
                '@layer neo.theme {',
                '    :where(.neo-theme-neo-light, .neo-theme-neo-dark) {',
                '        --fixture-button-override: 1;',
                '    }',
                '}'
            ].join('\n'),
            '/dist/development/css/theme-dark/Global.css': [
                '@layer neo.roles, neo.base, neo.theme, neo.rules;',
                '@layer neo.roles {',
                '    :root .neo-theme-dark {',
                '        --neo-color-scheme: dark;',
                '        --fixture-classic-token: rgb(50, 50, 50);',
                '    }',
                '}'
            ].join('\n')
        };

        await page.context().route('**/dist/development/css/**', async route => {
            const pathname = new URL(route.request().url()).pathname;

            requestedCss.push(pathname);

            if (Object.hasOwn(virtualSheets, pathname)) {
                await route.fulfill({
                    contentType: 'text/css',
                    body       : virtualSheets[pathname]
                });
                return
            }

            // Other component classes lack files in theme-base / theme-neo-fixture unless listed in theme-map
            if (pathname.includes('/css/theme-base/') || pathname.includes('/css/theme-neo-fixture/')) {
                await route.fulfill({status: 404, body: 'not found'});
                return
            }

            await route.continue()
        });

        await page.context().route('**/test/playwright/component/main/virtual-set-css-var-probe.mjs', async route => {
            await route.fulfill({
                contentType: 'application/javascript',
                body       : [
                    'const windowId = Object.keys(Neo.windowConfigs)[0];',
                    'const setDarkScheme    = await Neo.setCssVariable({key: "fixture-scheme-token",  theme: "neo-theme-neo-dark",  value: "rgb(12, 34, 56)",    windowId});',
                    'const setLightScheme   = await Neo.setCssVariable({key: "fixture-scheme-token",  theme: "neo-theme-neo-light", value: "rgb(210, 220, 230)", windowId});',
                    'const setSharedDark    = await Neo.setCssVariable({key: "fixture-role-paint",    theme: "neo-theme-neo-dark",  value: "rgb(90, 10, 20)",    windowId});',
                    'const setClassicDark   = await Neo.setCssVariable({key: "fixture-classic-token", theme: "neo-theme-dark",      value: "rgb(77, 88, 99)",    windowId});',
                    'const setUndeclaredVar = await Neo.setCssVariable({key: "does-not-exist",        theme: "neo-theme-neo-dark",  value: "rgb(0, 0, 0)",       windowId});',
                    'Neo.getComponent("component-test-viewport").probeResults = {setClassicDark, setDarkScheme, setLightScheme, setSharedDark, setUndeclaredVar};'
                ].join('\n')
            })
        });

        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const buttonId = await page.evaluate(async () => {
            const res = await Neo.worker.App.createNeoInstance({
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : 'component-test-viewport',
                text      : 'Theme Map Probe'
            });

            if (!res.success) {
                throw new Error(res.error.message)
            }

            return res.id
        });

        await expect(page.locator(`#${buttonId}`)).toBeVisible();

        // AC-2: shared fixture folder's Global.css and button/Base.css are each requested once, and theme-base is requested
        const countOf = target => requestedCss.filter(p => p === target).length;

        expect(countOf('/dist/development/css/theme-neo-fixture/Global.css')).toBe(1);
        expect(countOf('/dist/development/css/theme-neo-fixture/button/Base.css')).toBe(1);
        expect(countOf('/dist/development/css/theme-base/Global.css')).toBe(1);
        expect(countOf('/dist/development/css/theme-base/button/Base.css')).toBe(1);

        // Unmapped theme class logged once and triggered zero requests of its own
        expect(warnings.filter(w => w.includes('neo-theme-missing'))).toHaveLength(1);
        expect(requestedCss.some(p => p.includes('missing'))).toBe(false);

        // AC-3: insert a runtime <style> sheet (href === null) and set variables in both Neo schemes and classic theme inside @layer
        const outcome = await page.evaluate(async () => {
            Neo.main.addon.Stylesheet.insertCssRules({
                rules: ['.runtime-probe-rule { color: rgb(1, 2, 3); }']
            });

            const hasNullHrefStyleSheet = [...document.styleSheets].some(sheet => sheet.href === null);

            const loaded = await Neo.worker.App.loadModule({
                path: '../../test/playwright/component/main/virtual-set-css-var-probe.mjs'
            });

            if (!loaded.success) {
                throw new Error(String(loaded.error))
            }

            const results = await Neo.worker.App.getConfigs({
                id  : 'component-test-viewport',
                keys: 'probeResults'
            });

            const readForTheme = cls => {
                const probe = document.createElement('div');
                probe.className     = cls;
                probe.style.cssText = 'background-color: var(--fixture-paint); color-scheme: var(--neo-color-scheme);';
                document.body.appendChild(probe);
                const cs     = getComputedStyle(probe);
                const values = {
                    baseMarker  : cs.getPropertyValue('--fixture-base-marker').trim(),
                    buttonBase  : cs.getPropertyValue('--fixture-button-base').trim(),
                    classicToken: cs.getPropertyValue('--fixture-classic-token').trim(),
                    paint       : cs.backgroundColor,
                    schemeToken : cs.getPropertyValue('--fixture-scheme-token').trim()
                };
                probe.remove();
                return values
            };

            return {
                classic : readForTheme('neo-theme-dark'),
                hasNullHrefStyleSheet,
                neoDark : readForTheme('neo-theme-neo-dark'),
                neoLight: readForTheme('neo-theme-neo-light'),
                results
            }
        });

        expect(outcome.hasNullHrefStyleSheet).toBe(true);
        expect(outcome.results).toEqual({
            setClassicDark  : true,
            setDarkScheme   : true,
            setLightScheme  : true,
            setSharedDark   : true,
            setUndeclaredVar: false
        });

        expect(outcome.neoDark.baseMarker).toBe('12px');
        expect(outcome.neoDark.buttonBase).toBe('6px');
        expect(outcome.neoDark.schemeToken).toBe('rgb(12, 34, 56)');
        expect(outcome.neoDark.paint).toBe('rgb(90, 10, 20)');

        expect(outcome.neoLight.schemeToken).toBe('rgb(210, 220, 230)');
        // Shared light-dark() rule for light scheme remains uncorrupted when dark scheme was overridden
        expect(outcome.neoLight.paint).toBe('rgb(250, 250, 252)');

        expect(outcome.classic.classicToken).toBe('rgb(77, 88, 99)');

        const destroyed = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), buttonId);
        expect(destroyed.success).toBe(true)
    });
});
