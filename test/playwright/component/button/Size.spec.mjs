import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.button.Base#size` sets a button's height, padding and text in every theme, over the size of its
 * context, and `null` keeps the context's: medium in the neo themes, inside a toolbar too. A button with only an
 * icon is as tall as one with text, at every size. On a phone a size keeps its metrics in a toolbar, while a button
 * without one takes the phone's padding and text.
 */

const THEMES = ['neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk', 'neo-theme-neo-light', 'neo-theme-neo-dark'];

/**
 * The neo themes step 24, 32 and 48 px. The classic themes size a button by its content, so only their padding and
 * text are fixed, and their heights must rise from small to large.
 */
const EXPECTED = {
    neo    : {null: ['32px', '12px', '14px'], small: ['24px', '8px', '12px'], medium: ['32px', '12px', '14px'], large: ['48px', '16px', '16px']},
    classic: {null: [null,   '12px', '11px'], small: [null,   '8px',  '10px'], medium: [null,   '12px', '11px'], large: [null,   '16px', '13px']}
};

// Cyberpunk's text is two pixels larger at every step
const CYBERPUNK_FONT = {null: '13px', small: '11px', medium: '13px', large: '15px'};

const SIZES = [null, 'small', 'medium', 'large'];

let componentIds = [];

/**
 * Links each theme's button and toolbar values, and the neo themes' design tokens
 * @param {Object} page
 */
async function loadThemeStylesheets(page) {
    const hrefs = THEMES.flatMap(theme => {
        const directory = theme.replace('neo-theme-', 'theme-'),
              files     = [`/dist/development/css/${directory}/button/Base.css`, `/dist/development/css/${directory}/toolbar/Base.css`];

        theme.includes('-neo-') && files.unshift(`/dist/development/css/${directory}/Global.css`);

        return files
    });

    await page.evaluate(async hrefs => {
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
    }, hrefs)
}

/**
 * Two standalone buttons per size, one with text and one with only an icon, and a toolbar holding a text and an
 * icon button without a size and a large one
 * @param {Object} page
 */
async function createButtons(page) {
    componentIds = await page.evaluate(async sizes => {
        const ids = [];

        for (const [index, size] of sizes.entries()) {
            for (const [suffix, content] of [['', {text: `Size ${size}`}], ['-icon', {iconCls: 'fa fa-cog'}]]) {
                const result = await Neo.worker.App.createNeoInstance({
                    id        : `size-${size}${suffix}`,
                    importPath: '../button/Base.mjs',
                    ntype     : 'button',
                    parentId  : 'component-test-viewport',
                    size,
                    style     : {left: `${index * 160}px`, position: 'absolute', top: suffix ? '60px' : '0px'},
                    ...content
                });

                if (!result.success) {
                    throw new Error(`Button creation failed: ${result.error.message}`)
                }

                ids.push(result.id)
            }
        }

        const toolbar = await Neo.worker.App.createNeoInstance({
            id        : 'size-toolbar',
            importPath: '../toolbar/Base.mjs',
            items     : [
                {id: 'size-toolbar-null',   ntype: 'button', text: 'In a toolbar'},
                {id: 'size-toolbar-icon',   ntype: 'button', iconCls: 'fa fa-cog'},
                {id: 'size-toolbar-small',  ntype: 'button', size: 'small',  text: 'Small'},
                {id: 'size-toolbar-medium', ntype: 'button', size: 'medium', text: 'Medium'},
                {id: 'size-toolbar-large',  ntype: 'button', size: 'large',  text: 'Large in a toolbar'}
            ],
            ntype     : 'toolbar',
            parentId  : 'component-test-viewport',
            style     : {left: '0px', position: 'absolute', top: '120px'}
        });

        if (!toolbar.success) {
            throw new Error(`Toolbar creation failed: ${toolbar.error.message}`)
        }

        ids.push(toolbar.id);

        return ids
    }, SIZES);

    await Promise.all(['size-null', 'size-large-icon', 'size-toolbar-large'].map(id => page.waitForSelector(`#${id}`, {state: 'attached'})))
}

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
 * Reads a button's rendered height, left padding and text size
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
const readButton = (page, id) => page.evaluate(buttonId => {
    const button = document.getElementById(buttonId),
          style  = getComputedStyle(button);

    return {
        fontSize   : getComputedStyle(button.querySelector('.neo-button-text')).fontSize,
        height     : button.getBoundingClientRect().height,
        paddingLeft: style.paddingLeft
    }
}, id);

/**
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Number>}
 */
const readHeight = (page, id) => page.evaluate(buttonId => document.getElementById(buttonId).getBoundingClientRect().height, id);

test.describe('Neo.button.Base — size', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadThemeStylesheets(page);
        await createButtons(page)
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async ids => {
            for (const id of ids) {
                await Neo.worker.App.destroyNeoInstance(id)
            }
        }, componentIds);

        componentIds = []
    });

    for (const theme of THEMES) {
        test(`${theme}: each size sets height, padding and text, for an icon button too, and wins over a toolbar`, async ({page}) => {
            await applyTheme(page, theme);

            const isNeo    = theme.includes('-neo-'),
                  expected = EXPECTED[isNeo ? 'neo' : 'classic'],
                  heights  = {};

            for (const size of SIZES) {
                const read                    = await readButton(page, `size-${size}`),
                      [height, padding, font] = expected[size];

                heights[size] = read.height;

                height && expect(`${read.height}px`, `${size} height`).toBe(height);
                expect(read.paddingLeft, `${size} padding`).toBe(padding);
                expect(read.fontSize, `${size} text`).toBe(theme === 'neo-theme-cyberpunk' ? CYBERPUNK_FONT[size] : font);
                expect(await readHeight(page, `size-${size}-icon`), `${size}: an icon button is as tall as a text one`).toBe(read.height)
            }

            expect(heights.small, 'small is lower than medium').toBeLessThan(heights.medium);
            expect(heights.medium, 'medium is lower than large').toBeLessThan(heights.large);

            const inToolbar = await readButton(page, 'size-toolbar-null'),
                  large     = await readButton(page, 'size-toolbar-large');

            expect(inToolbar.height, 'a toolbar button without a size matches the default').toBe(heights.null);
            expect(await readHeight(page, 'size-toolbar-icon'), 'an icon button in a toolbar is as tall as a text one').toBe(inToolbar.height);
            expect(large.height, 'a size wins over the toolbar').toBe(heights.large)
        });

        test(`${theme}: on a phone a size keeps its metrics in a toolbar, and a button without one takes the phone's`, async ({page}) => {
            await applyTheme(page, theme);

            const desktop = {};

            for (const size of ['small', 'medium', 'large']) {
                desktop[size] = await readButton(page, `size-toolbar-${size}`)
            }

            await page.setViewportSize({width: 390, height: 844});

            for (const size of ['small', 'medium', 'large']) {
                expect(await readButton(page, `size-toolbar-${size}`), `${size} on a phone`).toEqual(desktop[size])
            }

            const contextual = await readButton(page, 'size-toolbar-null');

            expect(contextual.paddingLeft, 'a button without a size takes the phone padding').toBe('5px');
            expect(contextual.fontSize, 'and the phone text').toBe('13px')
        })
    }
});
