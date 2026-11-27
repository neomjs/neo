import {test, expect}    from '@playwright/test';
import {themeSheetHrefs} from '../../util/themeSheets.mjs';

/**
 * @summary A Button variant re-values the generic variables on its own element, so both hooks of the design system
 * reach every variant: a generic variable set inline paints it, and a variant's own variable set on an ancestor
 * paints that variant only. A theme class on the button itself paints exactly what the theme paints from an ancestor.
 */

const THEMES   = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
      UIS      = [null, 'primary', 'secondary', 'ghost', 'tertiary'],
      VARIANTS = UIS.filter(Boolean);

let componentIds = [];

/**
 * Links each theme's Button values and Global sheets, then waits for them
 * @param {Object} page
 */
const loadThemeStylesheets = page => page.evaluate(async hrefs => {
    for (const href of hrefs) {
        const link = document.createElement('link');

        link.rel  = 'stylesheet';
        link.href = href;

        await new Promise((resolve, reject) => {
            link.onload  = resolve;
            link.onerror = () => reject(new Error(`stylesheet did not load: ${href}`));
            document.head.appendChild(link)
        })
    }
}, themeSheetHrefs(THEMES, ['button.Base']));

/**
 * Replaces the document theme without keeping a competing theme ancestor
 * @param {Object} page
 * @param {String} theme
 */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const element of [document.body, document.documentElement]) {
        element.classList.forEach(cls => cls.startsWith('neo-theme-') && element.classList.remove(cls))
    }

    document.body.classList.add(name)
}, theme);

/**
 * Creates a button inside the test viewport
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} The button id
 */
async function createButton(page, config) {
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
        importPath: '../button/Base.mjs',
        ntype     : 'button',
        parentId  : 'component-test-viewport',
        text      : 'Variant',
        ...config
    });

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    componentIds.push(result.id);
    await expect(page.locator(`#${result.id}`)).toBeVisible();

    return result.id
}

/**
 * Reads a button's background, top border and label colour
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
const readColors = (page, id) => page.evaluate(buttonId => {
    const button = document.getElementById(buttonId),
          style  = getComputedStyle(button);

    return {
        background: style.backgroundColor,
        border    : `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        text      : getComputedStyle(button.querySelector('.neo-button-text')).color
    }
}, id);

test.describe('Neo.button.Base variant hooks', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadThemeStylesheets(page);
        await applyTheme(page, 'neo-theme-neo-light')
    });

    test.afterEach(async ({page}) => {
        for (const id of componentIds) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), id)
        }

        componentIds = [];

        await page.evaluate(() => document.getElementById('component-test-viewport')?.removeAttribute('style'))
    });

    test('a generic variable set inline paints every variant', async ({page}) => {
        for (const ui of UIS) {
            const id = await createButton(page, {
                style: {'--neo-button-background-color': 'rgb(1, 2, 3)', '--neo-button-color': 'rgb(4, 5, 6)'},
                ui
            });

            await expect.poll(() => readColors(page, id), {message: `ui: ${ui}`}).toMatchObject({
                background: 'rgb(1, 2, 3)',
                text      : 'rgb(4, 5, 6)'
            })
        }
    });

    test("a variant's own variable set on an ancestor paints that variant and no other", async ({page}) => {
        for (const variant of VARIANTS) {
            await page.evaluate(name => {
                const viewport = document.getElementById('component-test-viewport');

                viewport.removeAttribute('style');
                viewport.style.setProperty(`--neo-button-${name}-background-color`, 'rgb(7, 8, 9)')
            }, variant);

            for (const ui of UIS) {
                const id     = await createButton(page, {ui}),
                      colors = await readColors(page, id);

                if (ui === variant) {
                    expect(colors.background, `${variant} reads its own variable`).toBe('rgb(7, 8, 9)')
                } else {
                    expect(colors.background, `${ui} ignores --neo-button-${variant}-background-color`).not.toBe('rgb(7, 8, 9)')
                }
            }

            for (const id of componentIds) {
                await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), id)
            }

            componentIds = []
        }
    });

    test('a theme class on the button itself paints what the theme paints from an ancestor', async ({page}) => {
        for (const theme of THEMES) {
            await applyTheme(page, theme);

            for (const ui of UIS) {
                const inherited = await createButton(page, {ui}),
                      scoped    = await createButton(page, {cls: [theme], ui});

                expect(await readColors(page, scoped), `${theme}, ui: ${ui}`).toEqual(await readColors(page, inherited))
            }
        }
    })
});
