import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The month view's grid, asserted from what mounts rather than from what the stores hold.
 *
 * The ticket that asked for this file was filed from a measurement: mounting
 * `Neo.calendar.view.month.Component` with two empty stores renders the header and an empty scroll
 * area. `weekCount: 0, dayCount: 0`. So every arm here counts rendered rows and day cells, and none
 * of them reads `needsEventUpdate` or a store count back off the instance. A spec that asked the
 * component whether it had built its grid would pass on the component that does not build it.
 *
 * The row counts are derived rather than copied: `createContent` renders 18 weeks of 7 days, 126
 * cells, which is the continuous scrolling month and not a calendar's 5 or 6 rows. The month view
 * never calls `getWeeksOfMonth`; that helper's only caller under `src/` is `YearComponent`.
 *
 * The fixture is `component/apps/calendar-month/`, whose month child carries a known id so these
 * counts belong to that view alone.
 */

/** The month child's id, declared in the fixture's `monthComponentConfig`. */
const VIEW = '#calendar-month-view';

/** Weeks `createContent` renders, and the day cells those weeks hold. */
const EXPECTED_WEEKS = 18,
      EXPECTED_DAYS  = EXPECTED_WEEKS * 7;

/**
 * @summary Opens the fixture and waits for the month component to be attached.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openFixture(page) {
    await page.goto('test/playwright/component/apps/calendar-month/index.html');
    await expect(page.locator('.neo-calendar-monthcomponent')).toBeAttached({timeout: 15000})
}

const countWeeks = page => page.locator(`${VIEW} .neo-week`).count();
const countDays  = page => page.locator(`${VIEW} .neo-day`).count();

/**
 * @summary Runs one store write inside the App Worker.
 *
 * The stores live beside the component, so `page.evaluate` on the main thread cannot reach them.
 * `Neo.worker.App.loadModule()` imports the driver where they are, and the counter makes every call
 * a new module URL, evaluated again rather than served from the import cache.
 * @param {import('@playwright/test').Page} page
 * @param {String} action
 * @returns {Promise<void>}
 */
let driverCount = 0;

async function drive(page, action) {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/calendar-month/driver.mjs?action=${action}&n=${++driverCount}`);

    expect(success, `the ${action} write reached the App Worker`).toBe(true)
}

test.describe('Neo.calendar.view.month.Component — the empty-store mount', () => {
    test('a month with no calendars and no events still draws its days', async ({page}) => {
        await openFixture(page);

        // A month grid is a calendar's frame: the days are not data-dependent. Reading the counts
        // through `expect.poll` rather than once is deliberate — the grid arrives on mount, and a
        // single read would race the patch that mounts it.
        await expect.poll(() => countWeeks(page), {message: 'the month renders its weeks'})
            .toBe(EXPECTED_WEEKS);

        expect(await countDays(page), 'every week renders its seven day cells').toBe(EXPECTED_DAYS)
    });

    test('the day cells of an empty month are real dates, not placeholders', async ({page}) => {
        await openFixture(page);

        await expect.poll(() => countDays(page), {message: 'the month renders its day cells'})
            .toBe(EXPECTED_DAYS);

        // The fixture fixes `currentDate` to February 2027, so the cell ids are derivable: the grid
        // starts six weeks before the week holding the 1st. Asserting one exact id keeps this from
        // passing on a grid that renders 126 cells of the wrong month. The id separator is `-`, as
        // `DateUtil.convertToyyyymmdd` produces it.
        await expect(page.locator(`${VIEW}__day__2027-02-01`),
            'the 1st of the fixture month has its own cell').toBeAttached()
    });

    test('calendars and events that do not exist as a pair do not reach the day cells', async ({page}) => {
        await openFixture(page);

        // An event is drawn inside a day cell only through its calendar, which supplies the color
        // class. The orphan event alone does not reach that read: `onEventStoreLoad` returns while
        // the calendar store is empty, so nothing rebuilds the grid around it. The calendar write
        // that follows is the rebuild, and the rebuild is where `createWeek` reads `.active` with no
        // calendar record to read it from.
        await drive(page, 'addOrphanEvent');
        await drive(page, 'addCalendar');

        await expect.poll(() => countDays(page), {message: 'the month still renders its day cells'})
            .toBe(EXPECTED_DAYS);

        expect(await page.locator(`${VIEW} .neo-event`).count(),
            'an event whose calendar is missing is not drawn').toBe(0)
    });

    test('a matched calendar and event still reach their day cell', async ({page}) => {
        await openFixture(page);

        await drive(page, 'addCalendar');

        // The calendar arrives with the event store still empty, and the days are already drawn.
        await expect.poll(() => countDays(page), {message: 'the month still renders its day cells'})
            .toBe(EXPECTED_DAYS);

        await drive(page, 'addEvent');

        // The control for the arms above: the days are not bought by dropping events. One event on
        // 2027-02-10 must land in that cell, with its title.
        const cell = page.locator(`${VIEW}__day__2027-02-10`);

        await expect(cell.locator('.neo-event'), {message: 'the event reaches its day'})
            .toHaveCount(1);

        await expect(cell.locator('.neo-event-title')).toHaveText('Probe event')
    });
});
