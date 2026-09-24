import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The month grid's structure, pinned to dates derived by hand.
 *
 * `createContent` builds a continuous scrolling window rather than a calendar page: 18 weeks of 7
 * day cells, starting six weeks before the week that holds the 1st, which puts the 1st in row index
 * 6 of every month. Each cell's id carries its own date (`<id>__day__2027-08-01`) and each row's id
 * carries its start date (`<id>__week__2027-08-01`), so the window is asserted as literal id lists.
 * `Neo.util.Date.getFirstDayOffset` is the oracle these dates were derived against while writing
 * them, not a value the spec reads back at runtime: an assertion that calls the helper would only
 * prove the view and the helper agree, not that either is right.
 *
 * The derivation, for a reader checking the literals: the offset is `getDay of the 1st -
 * weekStartDay`, wrapped by `+7` when negative, and the grid starts at `1st - offset - 42`.
 * February 2027's 1st is a Monday (offset 1 at `weekStartDay: 0`, 0 at 1), so its six leading weeks
 * run from Dec 20 and the month's own week starts Jan 31. August 2027's 1st is a Sunday: offset 0
 * at `weekStartDay: 0`, where the 1st itself starts row 6, and 6 at `weekStartDay: 1`, the wrap the
 * fixture is aimed at, where row 6 starts Jul 26.
 *
 * The fixture mounts at February 2027 with `weekStartDay: 0` and a pinned `en-US` locale; the
 * driver moves `currentDate`, `weekStartDay` and `showWeekends` at runtime through the state
 * provider, the path the app's own date selector and settings take.
 */

/** The month child's id, declared in the fixture's `monthComponentConfig`. */
const VIEW = '#calendar-month-view';

/** Weeks `createContent` renders, and the day cells those weeks hold. */
const EXPECTED_WEEKS = 18,
      EXPECTED_DAYS  = EXPECTED_WEEKS * 7;

/** Row start dates, in DOM order: the 18-week window of the February 2027 mount. */
const FEB_ROWS = [
    '2026-12-20', '2026-12-27',
    '2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24',
    '2027-01-31', // row 6: holds 2027-02-01
    '2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28',
    '2027-03-07', '2027-03-14', '2027-03-21', '2027-03-28',
    '2027-04-04', '2027-04-11', '2027-04-18'
];

/** Row start dates of the same February window with `weekStartDay: 1`. */
const FEB_ROWS_WSD1 = [
    '2026-12-21', '2026-12-28',
    '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25',
    '2027-02-01', // row 6: the month's own week, now starting on its Monday
    '2027-02-08', '2027-02-15', '2027-02-22', '2027-03-01',
    '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29',
    '2027-04-05', '2027-04-12', '2027-04-19'
];

/** The same window after the runtime move to August 2027, `weekStartDay: 0`. */
const AUG_ROWS_WSD0 = [
    '2027-06-20', '2027-06-27',
    '2027-07-04', '2027-07-11', '2027-07-18', '2027-07-25',
    '2027-08-01', // row 6: the 1st starts the month's own week
    '2027-08-08', '2027-08-15', '2027-08-22', '2027-08-29',
    '2027-09-05', '2027-09-12', '2027-09-19', '2027-09-26',
    '2027-10-03', '2027-10-10', '2027-10-17'
];

/** August 2027 with `weekStartDay: 1`: the same month, its week starting Jul 26. */
const AUG_ROWS_WSD1 = [
    '2027-06-14', '2027-06-21', '2027-06-28',
    '2027-07-05', '2027-07-12', '2027-07-19',
    '2027-07-26', // row 6: holds 2027-08-01 at its last cell
    '2027-08-02', '2027-08-09', '2027-08-16', '2027-08-23', '2027-08-30',
    '2027-09-06', '2027-09-13', '2027-09-20', '2027-09-27',
    '2027-10-04', '2027-10-11'
];

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

/** The row ids, in DOM order, with the component-id prefix stripped down to the start dates. */
const rowStarts = page => page.locator(`${VIEW} .neo-week`)
    .evaluateAll(nodes => nodes.map(node => node.id.split('__week__')[1]));

/** The cell dates of one row, in DOM order. */
const rowDates = (page, weekIndex) => page.locator(`${VIEW} .neo-week`).nth(weekIndex)
    .evaluate(row => [...row.children].map(cell => cell.id.split('__day__')[1]));

/** One boolean per cell of a row: whether it carries `neo-weekend`. */
const rowWeekends = (page, weekIndex) => page.locator(`${VIEW} .neo-week`).nth(weekIndex)
    .evaluate(row => [...row.children].map(cell => cell.classList.contains('neo-weekend')));

/** The month header directly above a row, as text; `null` when the sibling is not one. */
const headerOfRow = (page, weekIndex) => page.locator(`${VIEW} .neo-week`).nth(weekIndex)
    .evaluate(row => {
        const {previousElementSibling} = row;
        return previousElementSibling?.classList.contains('neo-month-header') ?
            previousElementSibling.textContent.trim() : null
    });

/**
 * @summary Runs one write inside the App Worker.
 *
 * The stores and the state provider live beside the component, so `page.evaluate` on the main
 * thread cannot reach them. `Neo.worker.App.loadModule()` imports the driver where they are, and
 * the counter makes every call a new module URL, evaluated again rather than served from the
 * import cache.
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

test.describe('Neo.calendar.view.month.Component: the month grid\'s structure', () => {
    test('the window is 18 weeks of 7, and every row is one week after the last', async ({page}) => {
        await openFixture(page);

        await expect.poll(() => rowStarts(page), {message: 'the window spans its 18 literal start dates'})
            .toEqual(FEB_ROWS);

        expect(await countDays(page), '18 weeks hold 126 day cells').toBe(EXPECTED_DAYS);

        expect(await page.locator(`${VIEW} .neo-week`).evaluateAll(nodes =>
            nodes.map(row => [...row.children].length)),
            'every week row holds its seven cells').toEqual(Array(EXPECTED_WEEKS).fill(7))
    });

    test('the week that holds the 1st is row 6, with its month header directly before it', async ({page}) => {
        await openFixture(page);

        await expect.poll(() => rowStarts(page), {message: 'the grid is drawn before its rows are read'})
            .toEqual(FEB_ROWS);

        // Row 6 of February 2027 starts on Jan 31 and holds the 1st at its second cell.
        expect(await rowDates(page, 6), 'row 6 is the week the 1st falls into').toEqual([
            '2027-01-31', '2027-02-01', '2027-02-02', '2027-02-03',
            '2027-02-04', '2027-02-05', '2027-02-06'
        ]);

        expect(await headerOfRow(page, 6), 'the month header carries the month the row opens')
            .toBe('Feb 2027')
    });

    test('moving the date to August re-renders the window, the wrap still landing on row 6', async ({page}) => {
        await openFixture(page);

        await drive(page, 'setCurrentDate');

        // August 2027's 1st is a Sunday: at weekStartDay 0 the offset is 0, so the month opens its
        // own week. The full window moves with it.
        await expect.poll(() => rowStarts(page), {message: 'the window follows the new currentDate'})
            .toEqual(AUG_ROWS_WSD0);

        expect(await rowDates(page, 6), 'row 6 starts on the 1st itself').toEqual([
            '2027-08-01', '2027-08-02', '2027-08-03', '2027-08-04',
            '2027-08-05', '2027-08-06', '2027-08-07'
        ]);

        expect(await headerOfRow(page, 6), 'the header before row 6 is August').toBe('Aug 2027')
    });

    test('neo-weekend follows the day, not the column, across a runtime weekStartDay change', async ({page}) => {
        await openFixture(page);

        // The weekStartDay write goes first, while the sidebar date selector has no month
        // transition in flight: that selector rebuilds its own day view in place. Moving the month
        // first would leave the selector's slide reading back a vdom the second write had already
        // reshaped, which is how the pair crashed when it ran the other way round.
        await drive(page, 'setWeekStartDay');

        await expect.poll(() => rowStarts(page), {message: 'the rows rebuild for the new first column'})
            .toEqual(FEB_ROWS_WSD1);

        // February's week now runs Mon Feb 1 through Sun Feb 7: the weekend sits on the last two
        // cells, where at weekStartDay 0 it sat on the first and the last.
        expect(await rowDates(page, 6), 'row 6 now starts on the month\'s own Monday').toEqual([
            '2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04',
            '2027-02-05', '2027-02-06', '2027-02-07'
        ]);

        expect(await rowWeekends(page, 6), 'Feb 6 and Feb 7 close the row').toEqual([
            false, false, false, false, false, true, true
        ]);

        // The sidebar's day names are the settle signal: once they show the new first column, its
        // rebuild has landed and the month move starts from a clean vdom.
        await expect(page.locator('.neo-dateselector .neo-header-row .neo-cell-content'),
            'the sidebar\'s own day names follow the change').toHaveText(
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

        await drive(page, 'setCurrentDate');

        await expect.poll(() => rowStarts(page), {message: 'August is up with the same first column'})
            .toEqual(AUG_ROWS_WSD1);

        // At weekStartDay 1 the August row runs Mon Jul 26 through Sun Aug 1.
        expect(await rowDates(page, 6), 'row 6 starts on the Monday of that week').toEqual([
            '2027-07-26', '2027-07-27', '2027-07-28', '2027-07-29',
            '2027-07-30', '2027-07-31', '2027-08-01'
        ]);

        expect(await rowWeekends(page, 6), 'Sunday and Saturday sit at the row\'s end').toEqual([
            false, false, false, false, false, true, true
        ]);

        expect(await headerOfRow(page, 6), 'the header still names the month the row opens').toBe('Aug 2027')
    });

    test('a Sunday-start row carries its weekend on the first and last cells', async ({page}) => {
        await openFixture(page);

        await drive(page, 'setCurrentDate');

        await expect.poll(() => rowStarts(page), {message: 'August is up at weekStartDay 0'})
            .toEqual(AUG_ROWS_WSD0);

        expect(await rowWeekends(page, 6), 'the row starts Sunday and ends Saturday').toEqual([
            true, false, false, false, false, false, true
        ])
    });

    test('the day-name header starts at the week\'s first column', async ({page}) => {
        await openFixture(page);

        const names = page.locator(`${VIEW} .neo-day-name`);

        await expect(names, 'the header names the week from Sunday').toHaveText(
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

        await drive(page, 'setWeekStartDay');

        await expect(names, 'the header follows the new first column').toHaveText(
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    });

    test('with the weekends off, the frame keeps its 18 weeks and leaves 90 day cells', async ({page}) => {
        await openFixture(page);

        await drive(page, 'setShowWeekends');

        // 126 cells minus the 36 weekend days of an 18-week window.
        await expect.poll(() => countDays(page), {message: 'the weekend cells leave the DOM'}).toBe(90);

        expect(await countWeeks(page), 'the rows are not the weekend cells').toBe(EXPECTED_WEEKS);

        expect(await page.locator(`${VIEW} .neo-weekend`).count(),
            'no weekend cell is left behind').toBe(0)
    });
});
