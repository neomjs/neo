import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Dock Choreography runs on a SharedWorker, so a second tab boots in the worker the first tab started. Each
 * tab still opens on the theme its own `?theme=` names, while the first tab stays open.
 */
const
    DARK    = 'neo-theme-neo-dark',
    EXAMPLE = '/examples/dashboard/choreography/index.html',
    LIGHT   = 'neo-theme-neo-light';

/**
 * @summary Opens the example in a new tab of the shared browser context.
 * @param {Object} context
 * @param {String} theme
 * @returns {Promise<Object>} The tab's page.
 */
async function openTab(context, theme) {
    const page = await context.newPage();

    await page.goto(`${EXAMPLE}?theme=${theme}`);
    await expect(page.locator('.neo-theme-switcher').first()).toBeVisible();
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

test.describe('Dock Choreography starts each tab on its own requested theme', () => {
    for (const [first, second] of [[LIGHT, DARK], [DARK, LIGHT]]) {
        test(`a ${second} tab opened beside a ${first} tab`, async ({context}) => {
            const firstTab  = await openTab(context, first),
                  secondTab = await openTab(context, second);

            await expectTheme(secondTab, second, 'second tab');
            await expectTheme(firstTab,  first,  'first tab, still open')
        })
    }
});
