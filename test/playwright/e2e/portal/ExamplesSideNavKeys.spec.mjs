import {expect, test} from '../../fixtures.mjs';

const PORTAL    = '/apps/portal/index.html',
      SIDEBAR   = '.portal-examples-sidebar:visible nav.portal-examples-group-index-list',
      MOBILE_IX = '.portal-examples-overview:visible nav.portal-examples-group-index-overview',
      CRUMB     = '.portal-examples-main-container > .portal-examples-group-crumb:visible',
      SHEET     = '.portal-examples-main-container .portal-examples-group-index-sheet',
      PAGE      = '.portal-examples-group-page:visible',
      CARDS     = `${PAGE} .portal-examples-list:not(.portal-examples-tiles) .neo-list-item`,
      FEATURED  = '.portal-examples-overview:visible .portal-examples-overview-cards .neo-list-item',
      MATCHES   = '.portal-examples-search-groups:visible .neo-list-item';

/**
 * @summary A group's link in the desktop side nav, by the title its accessible name starts with.
 * @param {Object} page
 * @param {String} name
 * @returns {Object} The locator
 */
const groupLink = (page, name) => page.locator(SIDEBAR).getByRole('link', {name: new RegExp(`^${name}, `)});

/**
 * @param {Object} page
 * @returns {Object} The side nav's `"All examples"` link
 */
const allLink = page => page.locator(SIDEBAR).getByRole('link', {name: /^All examples\b/});

/**
 * @param {Object} page
 * @returns {Promise<Number>} The browser history's length
 */
const historyLength = page => page.evaluate(() => history.length);

/**
 * @summary Waits until the stage shows exactly one group page, the one titled `name`.
 * @param {Object} page
 * @param {String} name
 * @returns {Promise<void>}
 */
async function expectOpenPage(page, name) {
    await expect(page.locator(PAGE).filter({has: page.getByRole('heading', {level: 1, name, exact: true})})).toBeVisible();
    await expect(page.locator(PAGE)).toHaveCount(1)
}

test.describe('Portal examples side nav keys (#22061)', () => {
    test.use({viewport: {width: 1440, height: 900}});

    test('the arrow keys walk the side nav, the page follows the link focus rests on, and one Back returns to where the walk started', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const nav       = page.locator(SIDEBAR),
              scheduler = groupLink(page, 'Scheduler'),
              bands     = nav.locator('section'),
              last      = nav.getByRole('link').last();

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        const before = await historyLength(page);

        await scheduler.focus();
        await page.keyboard.press('ArrowDown');
        await expect(groupLink(page, 'Gantt')).toBeFocused();
        await expectOpenPage(page, 'Gantt');
        await expect(groupLink(page, 'Gantt')).toHaveAttribute('aria-current', 'page');

        await page.keyboard.press('ArrowUp');
        await expect(scheduler).toBeFocused();
        await expectOpenPage(page, 'Scheduler');

        // A band heading takes no stop: the last link of a band steps to the first link of the next
        await bands.nth(0).getByRole('link').last().focus();
        await page.keyboard.press('ArrowDown');
        await expect(bands.nth(1).getByRole('link').first()).toBeFocused();

        await page.keyboard.press('End');
        await expect(last).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`${await last.getAttribute('href')}$`));
        await page.keyboard.press('ArrowDown');
        await expect(last, 'the walk does not wrap').toBeFocused();

        await page.keyboard.press('Home');
        await expect(allLink(page)).toBeFocused();
        await expect(page.locator(FEATURED).first()).toBeVisible();
        await expect(page).toHaveURL(/#\/examples$/);

        expect(await historyLength(page), 'one history entry for the whole walk').toBe(before + 1);
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(/#\/examples\/scheduler$/);
        await expectOpenPage(page, 'Scheduler')
    });

    test('a held arrow opens only the group focus rests on', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const scheduler = groupLink(page, 'Scheduler');

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        const before = await historyLength(page);

        await scheduler.focus();
        for (let press = 0; press < 3; press++) {
            await page.keyboard.down('ArrowDown')
        }

        await expect(groupLink(page, 'Dashboard & Docking')).toBeFocused();
        await expect(page, 'nothing opens while the key is held').toHaveURL(/#\/examples\/scheduler$/);

        await page.keyboard.up('ArrowDown');
        await expectOpenPage(page, 'Dashboard & Docking');
        expect(await historyLength(page)).toBe(before + 1)
    });

    test('the side nav is one Tab stop, the open group\'s link: Tab leaves for the content and Shift+Tab comes back', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const nav       = page.locator(SIDEBAR),
              scheduler = groupLink(page, 'Scheduler');

        await expect(scheduler).toHaveAttribute('aria-current', 'page');
        await expect(nav.locator('a[href]:not([tabindex="-1"])')).toHaveCount(1);

        await scheduler.focus();
        await page.keyboard.press('Tab');
        await expect(nav.locator(':focus')).toHaveCount(0);
        await expect(page.locator(`${PAGE} :focus`)).toHaveCount(1);

        await page.keyboard.press('Shift+Tab');
        await expect(scheduler).toBeFocused()
    });

    test('ArrowRight enters the cards at the selected card, or else the first, and ArrowLeft on the first card returns to the side nav', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const scheduler = groupLink(page, 'Scheduler'),
              cards     = page.locator(CARDS);

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        await scheduler.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await expect(cards.first()).toHaveClass(/\bneo-selected\b/);

        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(cards.first(), 'ArrowLeft on another card steps back one card').toBeFocused();

        await page.keyboard.press('ArrowLeft');
        await expect(scheduler).toBeFocused();
        await expect(cards.first(), 'the card keeps its selection').toHaveClass(/\bneo-selected\b/);
        await expect(page).toHaveURL(/#\/examples\/scheduler$/);

        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toHaveClass(/\bneo-selected\b/);

        await scheduler.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1), 'the selected card is the way back in').toBeFocused()
    });

    test('on All examples and under a filter ArrowRight enters what the stage shows, and Tab into the side nav keeps the filter', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);

        const all  = allLink(page),
              find = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples');

        await expect(all).toHaveAttribute('aria-current', 'page');
        await all.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(FEATURED).first()).toBeFocused();

        await find.fill('grid');
        await expect(page.locator(MATCHES).first()).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(all).toBeFocused();
        await expect(find, 'focus arriving by Tab opens nothing').toHaveValue('grid');

        await page.keyboard.press('ArrowRight');
        await expect(page.locator(MATCHES).first()).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(all).toBeFocused();

        // A walk opens the group it rests on, as a click on its link does, and that ends the filter
        await page.keyboard.press('ArrowDown');
        await expect(find).toHaveValue('');
        await expectOpenPage(page, 'Apps')
    });
});

test.describe('Portal examples phone index keys (#22061)', () => {
    test.use({viewport: {width: 390, height: 844}});

    test('390 × 844: the overview index and the sheet keep every link in the tab order', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);

        await expect(page.locator(MOBILE_IX).getByRole('link').first()).toBeVisible();
        await expect(page.locator(`${MOBILE_IX} a[tabindex="-1"]`)).toHaveCount(0);

        await page.goto(`${PORTAL}#/examples/scheduler`);
        await page.locator(`${CRUMB} .portal-examples-group-button`).click();
        await expect(page.locator(SHEET)).toBeVisible();
        await expect(page.locator(`${SHEET} a`).first()).toBeVisible();
        await expect(page.locator(`${SHEET} a[tabindex="-1"]`)).toHaveCount(0)
    });
});
