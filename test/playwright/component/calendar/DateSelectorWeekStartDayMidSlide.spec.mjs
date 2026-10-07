import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The sidebar date selector survives a `weekStartDay` change made back to back with a
 * month move.
 *
 * The month view is the calendar's other half here: the fixture mounts the whole `MainContainer`,
 * so moving `currentDate` also starts the sidebar `DateSelector`'s slide to the same month. The
 * pair this arm drives is the settings path a user creates by jumping to another month and then
 * changing the calendar's first day before the slide has finished.
 *
 * Reported in #19172 [not-ticket-ref: authority]: the sidebar's slide callback reads back
 * `vdom.cn[1].cn[0].style` after the transition wrapper is built, and the day-view rebuild that
 * `afterSetWeekStartDay` runs reshaped that same vdom, so the read lands on a node without a
 * `style`. The fixtures' worker-error gate is what reports it: nothing in this arm names the
 * error, so it fails on the crash itself before the fix, and on the assertions after it.
 */

/** The month child's id, declared in the fixture's `monthComponentConfig`. */
const VIEW = '#calendar-month-view';

/** The sidebar's day-name row, the DateSelector's own settle signal. */
const DAY_NAMES = '.neo-dateselector .neo-header-row .neo-cell-content';

/**
 * @summary Opens the fixture and waits for the month component to be attached.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openFixture(page) {
    await page.goto('test/playwright/component/apps/calendar-month/index.html');
    await expect(page.locator('.neo-calendar-monthcomponent')).toBeAttached({timeout: 15000})
}

/** The row ids, in DOM order, with the component-id prefix stripped down to the start dates. */
const rowStarts = page => page.locator(`${VIEW} .neo-week`)
    .evaluateAll(nodes => nodes.map(node => node.id.split('__week__')[1]));

/** The cell dates of one row, in DOM order. */
const rowDates = (page, weekIndex) => page.locator(`${VIEW} .neo-week`).nth(weekIndex)
    .evaluate(row => [...row.children].map(cell => cell.id.split('__day__')[1]));

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

test.describe('Neo.component.DateSelector: a weekStartDay change mid-slide', () => {
    test('moving the month and then weekStartDay back to back leaves the sidebar standing', async ({page}) => {
        await openFixture(page);

        // The mount is settled before the pair runs: the February window is drawn and the
        // sidebar's day names read as its first column, so neither write can be blamed on mount.
        await expect.poll(() => rowStarts(page), {message: 'the February window is drawn'})
            .toEqual([
                '2026-12-20', '2026-12-27',
                '2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24',
                '2027-01-31',
                '2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28',
                '2027-03-07', '2027-03-14', '2027-03-21', '2027-03-28',
                '2027-04-04', '2027-04-11', '2027-04-18'
            ]);

        await expect(page.locator(DAY_NAMES), 'the sidebar starts the week on Sunday').toHaveText(
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        );

        await drive(page, 'setCurrentDate');
        await drive(page, 'setWeekStartDay');

        // After the fix: the window lands on August 2027 at `weekStartDay: 1`, whose 1st is a
        // Sunday, so the offset is 6 and row 6 opens on Mon Jul 26. The gate above this test
        // reports the crash if the pair throws while the month grid still settles here, which is
        // what "the month grid itself ends correct" in #19172 [not-ticket-ref: authority] describes.
        await expect.poll(() => rowStarts(page).then(rows => rows[6]),
            {message: 'the August window is drawn, its own week starting Monday'})
            .toEqual('2027-07-26');

        expect(await rowDates(page, 6), 'row 6 runs Mon Jul 26 through Sun Aug 1').toEqual([
            '2027-07-26', '2027-07-27', '2027-07-28', '2027-07-29',
            '2027-07-30', '2027-07-31', '2027-08-01'
        ]);

        await expect(page.locator(DAY_NAMES), 'the sidebar follows the new first column').toHaveText(
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        )
    });
});
