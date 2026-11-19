import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.button.Base#pressed` sets a pressed button apart from its rest state in the neo themes, for every `ui`,
 * with a readable label, and keeps that look under the pointer. The classic themes keep what they drew before: the
 * pressed border, and in cyberpunk the hover tint. A tab header button keeps its own background when pressed, even
 * when the button stylesheet loads after the tab's.
 */

const NEO_THEMES     = ['neo-theme-neo-light', 'neo-theme-neo-dark'],
      CLASSIC_THEMES = ['neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
      UIS            = [null, 'secondary', 'ghost', 'tertiary'],
      PRIMARY        = 'rgb(62, 99, 221)';

let componentIds = [];

/**
 * Links a stylesheet and waits for it
 * @param {Object} page
 * @param {String[]} hrefs
 */
const linkStylesheets = (page, hrefs) => page.evaluate(async hrefs => {
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
}, hrefs);

/**
 * Each theme's button values, the neo themes' design tokens and neo-light's tab values
 * @param {Object} page
 */
const loadThemeStylesheets = page => linkStylesheets(page, [...NEO_THEMES, ...CLASSIC_THEMES].flatMap(theme => {
    const directory = theme.replace('neo-theme-', 'theme-'),
          files     = [`/dist/development/css/${directory}/button/Base.css`];

    theme.includes('-neo-') && files.unshift(`/dist/development/css/${directory}/Global.css`);

    return files
}).concat('/dist/development/css/theme-neo-light/tab/header/Button.css'));

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
 * Reads a button's background, label colour and top border colour
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
const readColors = (page, id) => page.evaluate(buttonId => {
    const button = document.getElementById(buttonId),
          style  = getComputedStyle(button);

    return {
        background: style.backgroundColor,
        border    : style.borderTopColor,
        text      : getComputedStyle(button.querySelector('.neo-button-text')).color
    }
}, id);

/**
 * Reads a button's colours with the pointer over it
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function readHovered(page, id) {
    await page.hover(`#${id}`);

    const colors = await readColors(page, id);

    await page.mouse.move(0, 0);

    return colors
}

/**
 * WCAG 2.2 contrast ratio of two opaque `rgb()` colours
 * @param {String} a
 * @param {String} b
 * @returns {Number}
 */
function contrast(a, b) {
    const luminance = rgb => {
        const [r, g, bl] = rgb.match(/[\d.]+/g).slice(0, 3).map(value => {
            value /= 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
        });

        return .2126 * r + .7152 * g + .0722 * bl
    };

    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return (light + .05) / (dark + .05)
}

const idOf = (ui, pressed) => `pressed-${ui || 'primary'}-${pressed ? 'on' : 'off'}`;

test.describe('Neo.button.Base — pressed', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadThemeStylesheets(page);

        componentIds = await page.evaluate(async uis => {
            const ids = [];

            for (const [index, ui] of uis.entries()) {
                for (const pressed of [false, true]) {
                    const result = await Neo.worker.App.createNeoInstance({
                        id        : `pressed-${ui || 'primary'}-${pressed ? 'on' : 'off'}`,
                        importPath: '../button/Base.mjs',
                        ntype     : 'button',
                        parentId  : 'component-test-viewport',
                        pressed,
                        style     : {left: `${index * 160}px`, position: 'absolute', top: pressed ? '60px' : '0px'},
                        text      : `${ui || 'primary'} ${pressed}`,
                        ui
                    });

                    if (!result.success) {
                        throw new Error(`Button creation failed: ${result.error.message}`)
                    }

                    ids.push(result.id)
                }
            }

            for (const pressed of [false, true]) {
                const result = await Neo.worker.App.createNeoInstance({
                    id        : `pressed-tab-${pressed ? 'on' : 'off'}`,
                    importPath: '../tab/header/Button.mjs',
                    ntype     : 'tab-header-button',
                    parentId  : 'component-test-viewport',
                    pressed,
                    style     : {left: `${pressed ? 160 : 0}px`, position: 'absolute', top: '120px'},
                    text      : `tab ${pressed}`
                });

                if (!result.success) {
                    throw new Error(`Tab header button creation failed: ${result.error.message}`)
                }

                ids.push(result.id)
            }

            return ids
        }, UIS);

        await Promise.all(componentIds.map(id => page.waitForSelector(`#${id}`, {state: 'attached'})))
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async ids => {
            for (const id of ids) {
                await Neo.worker.App.destroyNeoInstance(id)
            }
        }, componentIds);

        componentIds = []
    });

    for (const theme of NEO_THEMES) {
        test(`${theme}: each ui draws its pressed state apart from its rest, with a readable label, under the pointer too`, async ({page}) => {
            await applyTheme(page, theme);

            for (const ui of UIS) {
                const rest    = await readColors(page, idOf(ui, false)),
                      pressed = await readColors(page, idOf(ui, true)),
                      name    = ui || 'primary';

                expect(pressed.background, `${name}: pressed background`).not.toBe(rest.background);
                expect(contrast(pressed.text, pressed.background), `${name}: pressed label contrast`).toBeGreaterThanOrEqual(4.5);
                expect(await readHovered(page, idOf(ui, true)), `${name}: hovered pressed`).toEqual(pressed)
            }

            expect((await readColors(page, idOf('secondary', true))).border, 'secondary: pressed border').toBe(PRIMARY)
        })
    }

    for (const theme of CLASSIC_THEMES) {
        test(`${theme}: a pressed button keeps the colours it drew before`, async ({page}) => {
            await applyTheme(page, theme);

            for (const ui of UIS) {
                // Cyberpunk's primary and tertiary buttons drew their hover tint on a pressed button under the pointer
                const hoverTint = theme === 'neo-theme-cyberpunk' && (ui === null || ui === 'tertiary'),
                      expected  = hoverTint ? await readHovered(page, idOf(ui, false)) : await readColors(page, idOf(ui, false)),
                      pressed   = await readColors(page, idOf(ui, true)),
                      name      = ui || 'primary';

                expect(pressed.background, `${name}: pressed background`).toBe(expected.background);
                expect(pressed.text, `${name}: pressed label`).toBe(expected.text)
            }
        })
    }

    test('a pressed tab header keeps its own background, even when the button stylesheet loads after the tab one', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-light');
        await linkStylesheets(page, ['/dist/development/css/src/button/Base.css']);

        expect((await readColors(page, 'pressed-tab-on')).background).toBe((await readColors(page, 'pressed-tab-off')).background)
    })
});
