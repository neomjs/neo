import {expect, test}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

const DESKTOP    = '/apps/webdesktop/index.html',
      ICON       = '.neo-desktop-launcher .neo-list-item:not(.neo-list-header)',
      MENU_ITEM  = '.neo-menu-list .neo-list-item',
      PERMISSION = '.webdesktop-permission-list .neo-list-item',
      PANEL      = '.webdesktop-permission-panel',
      TASK       = '.neo-desktop-task-list .neo-list-item',
      WINDOW     = '.neo-dialog.neo-desktop-app-window';

/**
 * @summary The web desktop on a phone and on a touch-capable computer, driven through the real main → app event path.
 * Playwright's tap and click refuse a target another element covers, so every tap below also proves that the control
 * the user aims at receives it.
 */

/**
 * @param {Object} page
 */
async function signIn(page) {
    await page.goto(DESKTOP);
    await page.getByText('Alex Morgan', {exact: true}).click();
    await expect(page.locator(ICON).first()).toBeVisible()
}

/**
 * @param {Object} page
 * @returns {Promise<Object[]>} Each visible window's title and z-index, front first
 */
function windows(page) {
    return page.locator(WINDOW).evaluateAll(nodes => nodes
        .filter(node => node.offsetParent !== null || getComputedStyle(node).position === 'fixed')
        .map(node => ({title: node.querySelector('.neo-header-toolbar')?.innerText.trim(), zIndex: Number(getComputedStyle(node).zIndex)}))
        .sort((a, b) => b.zIndex - a.zIndex))
}

/**
 * @param {Object} page
 * @param {String} app
 * @returns {Object} The visible window of the app
 */
const windowOf = (page, app) => page.locator(WINDOW).filter({hasText: app}).filter({visible: true});

test.describe('web desktop on a phone', () => {
    test.use({hasTouch: true, isMobile: true, viewport: {width: 375, height: 812}});

    test('the Apps menu and the permission sheet take taps above the open windows, however often one is raised', async ({page}) => {
        await signIn(page);

        await page.locator(ICON).filter({hasText: 'Mail'}).tap();
        await expect(windowOf(page, 'Mail')).toBeVisible();

        // Apps opens above Mail, and its submenu chooses another app
        await page.getByRole('button', {name: 'Apps'}).tap();
        await page.locator(MENU_ITEM).filter({hasText: 'Communication'}).tap();
        await page.locator(MENU_ITEM).filter({hasText: 'Calendar'}).tap();
        await expect(windowOf(page, 'Calendar')).toBeVisible();

        // The permission sheet opens above Calendar, and a row receives its tap
        await page.getByRole('button', {name: 'Permissions'}).tap();
        await expect(page.locator(PANEL)).toBeVisible();

        const photos  = page.locator(PERMISSION).filter({hasText: 'view-photos'}),
              granted = await photos.getAttribute('aria-selected');

        await photos.tap();
        await expect(photos).not.toHaveAttribute('aria-selected', granted);

        // Dismissed, the sheet hands the workspace back to Calendar, the front window
        await page.getByRole('button', {name: 'Permissions'}).tap();
        await expect(page.locator(PANEL)).toHaveCount(0);
        expect((await windows(page))[0].title).toBe('Calendar');

        // Raising windows again and again keeps them under the floating layer at 100
        for (let i = 0; i < 6; i++) {
            await page.locator(TASK).filter({hasText: i % 2 ? 'Calendar' : 'Mail'}).tap()
        }

        await expect.poll(async () => (await windows(page)).map(({title}) => title)).toEqual(['Calendar', 'Mail']);
        expect((await windows(page)).every(({zIndex}) => zIndex < 100)).toBe(true);

        await page.getByRole('button', {name: 'Apps'}).tap();
        await page.locator(MENU_ITEM).filter({hasText: 'Communication'}).tap();
        await expect(page.locator(MENU_ITEM).filter({hasText: 'Messages'})).toBeVisible()
    })
});

test.describe('web desktop on a touch-capable computer', () => {
    test.use({hasTouch: true, viewport: {width: 1280, height: 800}});

    test('a mouse click selects an app, a finger tap opens one, and a double-click and Enter open one each', async ({browser, page}) => {
        await signIn(page);

        const messages = page.locator(ICON).filter({hasText: 'Messages'}),
              mail     = page.locator(ICON).filter({hasText: 'Mail'});

        // A mouse click only selects, although the device has touch
        await messages.click();
        await expect(messages).toHaveClass(/neo-selected/);

        // A tap on another app opens it. Both opens would wait on the same window import, in order, so a
        // window opened by the click would be listed before this one is shown.
        await mail.tap();
        const mailWindow = windowOf(page, 'Mail');

        await expect(mailWindow).toBeVisible();
        await expect(page.locator(TASK)).toHaveCount(1);
        await expect(page.locator(TASK)).toHaveText(/Mail/);

        const mailId    = await mailWindow.getAttribute('id'),
              appWorker = await attachPageSharedAppWorker({browser, page});

        try {
            await expect.poll(() => appWorker.evaluate(id => {
                const dialog = Neo.get(id);

                return dialog?.mounted && !dialog.hidden && dialog.mountFlight === null
            }, mailId), {message: 'Mail has finished opening'}).toBe(true)
        } finally {
            await appWorker.close()
        }

        await mailWindow.getByRole('button', {name: 'close'}).click();
        await expect(mailWindow).toHaveCount(0);

        await messages.dblclick();
        await expect(windowOf(page, 'Messages')).toBeVisible();

        await mail.click();
        await page.keyboard.press('Enter');
        await expect(windowOf(page, 'Mail')).toBeVisible();
        await expect(page.locator(TASK)).toHaveCount(2)
    })
});
