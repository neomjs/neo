import {test, expect}                        from '@playwright/test';
import path                                  from 'node:path';
import {fileURLToPath}                       from 'node:url';
import {readThemeDeclarations, resolveValue} from '../../../../buildScripts/util/check-theme-palette.mjs';
import {readCss}                             from '../../../../buildScripts/util/themeCss.mjs';

/**
 * @summary A theme Neo app resolves a role from `resources/css/theme-neo/Global.css` under both Neo classes:
 * the browser computes the role's light value on a light page, its dark value on a dark page, and its dark
 * value inside a dark island on a light page. The expected values are read from the tracked file with the
 * palette guard's own resolver, so the spec holds no colour and the guard measures what the browser paints.
 */

const
    ROLE      = '--neo-color-background-canvas',
    THEMES    = ['neo-theme-neo-light', 'neo-theme-neo-dark'],
    tokenFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../resources/css/theme-neo/Global.css');

test.describe('Theme Neo roles — one sheet serves the light class, the dark class and a nested island', () => {
    let islandId;

    test.beforeEach(async ({page}) => {
        await page.context().route('**/test/playwright/component/apps/empty-viewport/neo-config.json', async route => {
            const response = await route.fetch();

            await route.fulfill({
                body       : JSON.stringify({...await response.json(), themes: THEMES}),
                contentType: 'application/json'
            })
        });

        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        islandId = await page.evaluate(async () => {
            const result = await Neo.worker.App.createNeoInstance({
                cls       : ['neo-theme-neo-dark'],
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport'
            });

            if (!result.success) {
                throw new Error(`Instance creation failed: ${result.error?.message}`)
            }

            return result.id
        });

        await page.waitForSelector(`#${islandId}`, {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        islandId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), islandId)
    });

    test('a role computes its light value, its dark value, and its dark value inside a dark island', async ({page}) => {
        const
            declared = readThemeDeclarations(readCss(tokenFile)),
            expected = Object.fromEntries(['light', 'dark'].map(scheme => {
                const declarations = declared.get(`neo-theme-neo-${scheme}`);

                return [scheme, resolveValue(declarations.get(ROLE), declarations, scheme)]
            }));

        // The file itself: the role resolves to a colour in each scheme, and the two differ.
        expect(expected.light).toMatch(/^oklch\(/);
        expect(expected.dark).toMatch(/^oklch\(/);
        expect(expected.light).not.toBe(expected.dark);

        // The sheet is fetched after the viewport mounts.
        await page.waitForFunction(role => getComputedStyle(document.body).getPropertyValue(role).trim() !== '', ROLE);

        const painted = await page.evaluate(({expected, islandId, role}) => {
            // The browser serialises a probe's background, so a role read and a literal compare as it paints them.
            const
                paint = (parent, value) => {
                    const probe = document.createElement('div');

                    probe.style.backgroundColor = value;
                    parent.appendChild(probe);

                    const color = getComputedStyle(probe).backgroundColor;

                    probe.remove();
                    return color
                },
                island   = document.getElementById(islandId),
                setTheme = theme => document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                    if (node !== island) {
                        node.className = node.className.replace(/neo-theme-[a-z-]+/g, theme)
                    }
                }),
                read = () => ({island: paint(island, `var(${role})`), page: paint(document.body, `var(${role})`)});

            setTheme('neo-theme-neo-light');
            const onLight = read();

            setTheme('neo-theme-neo-dark');
            const onDark = read();

            return {
                literal: {dark: paint(document.body, expected.dark), light: paint(document.body, expected.light)},
                onDark,
                onLight,
                sheets : [...document.querySelectorAll('link[rel="stylesheet"]')]
                    .filter(link => link.href.endsWith('/theme-neo/Global.css')).length
            }
        }, {expected, islandId, role: ROLE});

        expect(painted.sheets, 'one theme-neo sheet serves both classes').toBe(1);
        expect(painted.literal.light).not.toBe(painted.literal.dark);

        expect(painted.onLight.page,   'light page').toBe(painted.literal.light);
        expect(painted.onLight.island, 'dark island on a light page').toBe(painted.literal.dark);
        expect(painted.onDark.page,    'dark page').toBe(painted.literal.dark);
        expect(painted.onDark.island,  'dark island on a dark page').toBe(painted.literal.dark)
    })
});
