import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The calendar on a phone and with its side panel folded, on the fixed-data fixture (active on Sun 21 July
 * 2024): a folded start mounts cleanly, the week header stays in step with narrow columns, and the week and day views
 * stay on the active week and day when the side panel folds or expands.
 */
const FIXTURE = '/test/playwright/component/apps/calendar-basic/index.html',
      // The day view extends the week view and keeps its class
      WEEK_VIEW = '.neo-calendar-weekcomponent:not(.neo-calendar-daycomponent)',
      DAY_VIEW  = '.neo-calendar-daycomponent',
      WEEK      = ['Sun 21', 'Mon 22', 'Tue 23', 'Wed 24', 'Thu 25', 'Fri 26', 'Sat 27'];

/**
 * @summary Reads the header items that lie fully inside the visible part of a view's header: right of its 50 px time
 * axis and left of the scroll container's edge.
 */
const readVisibleHeader = (page, selector) => page.evaluate(selector => {
    const root     = [...document.querySelectorAll(selector)].find(el => el.offsetParent !== null),
          scroller = root?.querySelector('.neo-c-w-scrollcontainer');

    if (!scroller) return null;

    const box = scroller.getBoundingClientRect();

    return [...root.querySelectorAll('.neo-header-row-item')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.left >= box.left + 49 && rect.right <= box.right + 1
    }).map(el => el.innerText.replace(/\s+/g, ' ').trim())
}, selector);

/** @summary Adds calendar configs to the fixture through its neo-config. */
const routeCalendarConfig = (page, calendarConfig) => page.route('**/calendar-basic/neo-config.json', async route => {
    const response = await route.fetch();
    await route.fulfill({response, json: {...await response.json(), calendarConfig}})
});

test.describe('Neo.calendar on a phone and with a folded side panel', () => {
    test('a calendar created with its side panel folded mounts without an error and without the panel', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(error.message));
        await routeCalendarConfig(page, {sideBarExpanded: false});
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(0);
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW)).toEqual(WEEK);
        expect(errors).toEqual([])
    });

    test('at 390 × 844 the week header reads the active week, in step with its narrow columns', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeAttached();
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW), {timeout: 5000}).toEqual(WEEK)
    });

    test('folding the side panel keeps the active week, expanding it keeps the active day', async ({page}) => {
        const toggle = page.locator('.neo-calendar-header-toolbar.neo-left .fa-bars');

        await page.setViewportSize({width: 1280, height: 720});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW)).toEqual(WEEK);

        await toggle.click();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(0);
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW), {message: 'the week after folding'}).toEqual(WEEK);

        await page.getByRole('button', {name: 'Day', exact: true}).click();
        await expect.poll(() => readVisibleHeader(page, DAY_VIEW)).toEqual(['Sun 21']);

        await toggle.click();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(1);
        await expect.poll(() => readVisibleHeader(page, DAY_VIEW), {message: 'the day after expanding'}).toEqual(['Sun 21'])
    })
});
