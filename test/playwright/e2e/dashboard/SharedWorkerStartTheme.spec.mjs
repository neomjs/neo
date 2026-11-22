import {expect, test} from '../../fixtures.mjs';

/**
 * @summary An example on SharedWorkers boots every later window in the worker its first window started, where
 * `Neo.config` is the first window's. Each window still opens on the theme its own `?theme=` names, while the first
 * stays open: two Dock Choreography tabs, two sortable dashboard tabs, and the sortable dashboard with a detached
 * tile's window.
 */
const
    DARK    = 'neo-theme-neo-dark',
    LIGHT   = 'neo-theme-neo-light',
    WINDOWS = [
        {name: 'Dock Choreography',        first: '/examples/dashboard/choreography/index.html', second: '/examples/dashboard/choreography/index.html'},
        {name: 'the sortable dashboard',   first: '/examples/dashboard/sortable/index.html',     second: '/examples/dashboard/sortable/index.html'},
        {name: 'a detached sortable tile', first: '/examples/dashboard/sortable/index.html',     second: '/examples/dashboard/sortable/childapps/widget/index.html'}
    ];

/**
 * @summary Opens a page with a theme request in a new tab of the shared browser context, once its viewport is themed.
 * @param {Object} context
 * @param {String} path
 * @param {String} theme
 * @returns {Promise<Object>} The tab's page.
 */
async function openTab(context, path, theme) {
    const page = await context.newPage();

    await page.goto(`${path}?theme=${theme}`);
    await expect(page.locator('.neo-viewport').first()).toHaveClass(/\bneo-theme-/);
    return page
}

/**
 * @summary Asserts the theme class on a tab's body and on its root viewport.
 * @param {Object} page
 * @param {String} theme
 * @param {String} label
 */
async function expectTheme(page, theme, label) {
    const pattern = new RegExp(`\\b${theme}\\b`);

    await expect(page.locator('body'), `${label}: body`).toHaveClass(pattern);
    await expect(page.locator('.neo-viewport').first(), `${label}: viewport`).toHaveClass(pattern)
}

test('a tile opened in its own window follows its dashboard switched to Neo Dark', async ({context, page}) => {
    await page.goto('/examples/dashboard/sortable/index.html');
    await expectTheme(page, LIGHT, 'dashboard at start');

    await page.locator('.neo-theme-switcher').first().click();
    await expectTheme(page, DARK, 'dashboard after the switch');

    // The dashboard's popupUrl passes the tile's current theme as `?theme=`
    const popupOpened = context.waitForEvent('page');

    await page.locator('.sortable-kpi-window-button').nth(1).click();

    const popup = await popupOpened;

    await expect(popup.locator('.sortable-kpi-tile')).toHaveCount(1);
    await expectTheme(popup, DARK, 'the tile\'s window')
});

test.describe('A SharedWorker example starts each window on its own requested theme', () => {
    for (const {first, name, second} of WINDOWS) {
        for (const [firstTheme, secondTheme] of [[LIGHT, DARK], [DARK, LIGHT]]) {
            test(`${name}: a ${secondTheme} window opened beside a ${firstTheme} one`, async ({context}) => {
                const firstTab  = await openTab(context, first,  firstTheme),
                      secondTab = await openTab(context, second, secondTheme);

                await expectTheme(secondTab, secondTheme, 'second window');
                await expectTheme(firstTab,  firstTheme,  'first window, still open')
            })
        }
    }
});
