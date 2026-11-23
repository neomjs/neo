import {test, expect} from '@playwright/test';

/**
 * @summary A toolbar's buttons take the size of the nearest theme. In the neo themes that is the compact 32 px, under
 * an ancestor that raises buttons to the Portal's 48 px too. A classic scope nested inside a neo one keeps its
 * classic buttons in its toolbars, and a toolbar that sets its own size (the desktop taskbar, the Portal header) keeps
 * it. The fixture is page-realm DOM over the built stylesheets, because the property under test is the cascade.
 */

const NEO_THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

/**
 * Links the structural sheets, and the button and toolbar values of the themes the fixture nests
 * @param {Object} page
 */
async function loadStylesheets(page) {
    const themes = ['theme-neo-dark', 'theme-neo-light', 'theme-dark', 'theme-light'],
          hrefs  = [
              ...themes.flatMap(dir => [
                  ...dir.startsWith('theme-neo-') ? [`/dist/development/css/${dir}/Global.css`] : [],
                  `/dist/development/css/${dir}/button/Base.css`,
                  `/dist/development/css/${dir}/toolbar/Base.css`
              ]),
              '/dist/development/css/src/button/Base.css',
              '/dist/development/css/src/toolbar/Base.css',
              '/dist/development/css/src/desktop/Taskbar.css',
              '/dist/development/css/src/apps/portal/Viewport.css'
          ];

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
 * Builds the fixture under a neo root: its toolbar, the taskbar, and a Portal viewport holding the header, a call to
 * action, a plain toolbar and a nested classic scope. A classic root beside it holds the classic reference toolbar.
 * @param {Object} page
 * @param {String} neoTheme
 */
const buildFixture = (page, neoTheme) => page.evaluate(theme => {
    const button = id => `<button class="neo-button" id="${id}"><span class="neo-button-text">${id}</span></button>`;

    document.getElementById('size-fixture')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="size-fixture" style="left: 0; position: absolute; top: 0; width: 1200px;">
            <div class="${theme}">
                <div class="neo-toolbar">${button('neo-toolbar')}</div>
                <div class="neo-toolbar neo-desktop-taskbar">${button('taskbar')}</div>
                <div class="neo-viewport">
                    <div class="neo-toolbar portal-header-toolbar">${button('portal-header')}</div>
                    ${button('portal-cta')}
                    <div class="neo-toolbar">${button('portal-toolbar')}</div>
                    <div class="neo-theme-dark">
                        <div class="neo-toolbar">${button('nested-classic-toolbar')}</div>
                        ${button('nested-classic-standalone')}
                    </div>
                </div>
            </div>
            <div class="neo-theme-dark">
                <div class="neo-toolbar">${button('classic-toolbar')}</div>
            </div>
        </div>`)
}, neoTheme);

/**
 * Reads a button's rendered height, padding and text size
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
const readButton = (page, id) => page.evaluate(buttonId => {
    const button = document.getElementById(buttonId),
          style  = getComputedStyle(button);

    return {
        fontSize: getComputedStyle(button.querySelector('.neo-button-text')).fontSize,
        height  : Math.round(button.getBoundingClientRect().height),
        padding : style.padding
    }
}, id);

test.describe('Neo.toolbar.Base — button size', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadStylesheets(page)
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(() => document.getElementById('size-fixture')?.remove())
    });

    for (const theme of NEO_THEMES) {
        test(`${theme}: toolbars are compact, own sizes win, and a nested classic scope keeps classic buttons`, async ({page}) => {
            await buildFixture(page, theme);

            expect((await readButton(page, 'neo-toolbar')).height, 'a neo toolbar is compact').toBe(32);
            expect((await readButton(page, 'taskbar')).height, 'the taskbar keeps its own size').toBe(40);
            expect((await readButton(page, 'portal-header')).height, 'the Portal header keeps the large size').toBe(48);
            expect((await readButton(page, 'portal-cta')).height, 'a Portal call to action is large').toBe(48);
            expect((await readButton(page, 'portal-toolbar')).height, 'a toolbar inside the Portal is compact').toBe(32);

            const nestedToolbar    = await readButton(page, 'nested-classic-toolbar'),
                  nestedStandalone = await readButton(page, 'nested-classic-standalone'),
                  classicToolbar   = await readButton(page, 'classic-toolbar');

            expect(nestedToolbar, 'a classic toolbar under a neo root matches a classic button in its scope').toEqual(nestedStandalone);
            expect(nestedToolbar, 'and a classic toolbar under a classic root').toEqual(classicToolbar)
        })
    }
});
