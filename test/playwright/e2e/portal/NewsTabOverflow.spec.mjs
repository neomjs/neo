import {expect, test} from '../../fixtures.mjs';

const PORTAL  = '/apps/portal/index.html',
      HEADERS = '.portal-news-tab-container .neo-tab-header-button',
      CONTROL = '.neo-tab-overflow-control',
      MENU    = '.neo-tab-overflow-menu .neo-list-item',
      TABS    = ['Blog', 'Discussions', 'Medium', 'Pull Requests', 'Release Notes', 'Tickets', 'Videos'];

/**
 * @summary Reads which news tabs a user can reach: headers fully inside the viewport, plus the overflow menu's items.
 * Leaves the menu open when the control exists.
 * @param {Object} page
 * @returns {Promise<String[]>} The reachable tab labels, sorted
 */
async function reachableTabs(page) {
    const inBar = await page.$$eval(HEADERS, buttons => buttons
        .filter(button => {
            const rect = button.getBoundingClientRect();
            return button.offsetParent !== null && rect.height > 0 && rect.bottom <= innerHeight
        })
        .map(button => button.innerText.trim()));

    let inMenu = [];

    if (await page.locator(CONTROL).isVisible()) {
        await page.locator(CONTROL).click();
        await page.locator(MENU).first().waitFor();
        inMenu = (await page.locator(MENU).allInnerTexts()).map(text => text.trim())
    }

    return [...inBar, ...inMenu].sort()
}

/**
 * The news section docks seven rotated tab labels on the left, and they need 883 px of height. A portrait phone
 * shows less, and the content area clips the rest, so without the overflow control the last tabs cannot be reached.
 */
test.describe('Portal section tab bars on a portrait phone', () => {
    test('every news tab stays reachable at 390×664, and a tab chosen from the menu moves the route', async ({page}) => {
        await page.setViewportSize({width: 390, height: 664});
        await page.goto(`${PORTAL}#/news/releases`);
        await page.locator(HEADERS).first().waitFor();

        await expect(page.locator(CONTROL), 'the overflow control holds the tabs that do not fit').toBeVisible();
        const box = await page.locator(CONTROL).boundingBox();
        expect(box.y + box.height, 'the control sits inside the viewport').toBeLessThanOrEqual(664);

        expect(await reachableTabs(page)).toEqual(TABS);

        await page.locator(MENU, {hasText: 'Videos'}).click();
        await expect(page).toHaveURL(/#\/news\/videos$/);
        await expect(page.locator('.portal-videos-list')).toBeVisible()
    });

    test('every news tab stays reachable at 320×568', async ({page}) => {
        await page.setViewportSize({width: 320, height: 568});
        await page.goto(`${PORTAL}#/news/releases`);
        await page.locator(HEADERS).first().waitFor();
        await expect(page.locator(CONTROL)).toBeVisible();

        expect(await reachableTabs(page)).toEqual(TABS)
    });

    test('both section bars withdraw the control once a desktop viewport fits every header', async ({page}) => {
        for (const route of ['#/examples', '#/news/releases']) {
            await page.setViewportSize({width: 390, height: 300});
            await page.goto(`${PORTAL}${route}`);
            await expect(page.locator(CONTROL), `${route}: the plugin projects this bar`).toBeVisible();

            await page.setViewportSize({width: 1920, height: 1080});
            await expect(page.locator(CONTROL), `${route}: everything fits, so the control is gone`).toHaveCount(0)
        }

        expect(await reachableTabs(page)).toEqual(TABS)
    });
});
