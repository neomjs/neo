import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Pins the week view to the active week across view switches, on the fixed-data calendar fixture.
 *
 * The week view renders three weeks and scrolls its container to the middle one when it mounts
 * (`afterSetMounted`). The view is mounted again every time its card is shown, and the container
 * keeps its `scrollLeft` in between. A relative scroll on the second mount moved the content one
 * week further, which `onScroll` -> `onWheel` took for edge paging: the header then read the week
 * after the active date while the navigator still marked the active day.
 *
 * The fixture's data sits in July 2024 with the active date Sunday 21 July, so the visible header
 * must read 21–27 July at load and after Month → Week, Year → Week and Day → Week.
 */
// The day view extends the week view and keeps its class, so it is excluded here.
const WEEK_VIEW = '.neo-calendar-weekcomponent:not(.neo-calendar-daycomponent)';

test.describe('Neo.calendar week view keeps the active week across view switches', () => {
    const readVisibleWeek = page => page.evaluate(() => {
        const root = [...document.querySelectorAll('.neo-calendar-weekcomponent:not(.neo-calendar-daycomponent)')].find(el => el.offsetParent !== null);

        if (!root) return null;

        const box = root.getBoundingClientRect();

        return [...root.querySelectorAll('.neo-header-row-item')].filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.left >= box.left - 1 && rect.right <= box.right + 1
        }).map(el => el.innerText.replace(/\s+/g, ' ').trim())
    });

    const weekIsActive = week => Array.isArray(week) && week.length === 7 && /\b21\b/.test(week[0]) && /\b27\b/.test(week[6]);

    const expectActiveWeek = async (page, step) => {
        await expect.poll(async () => weekIsActive(await readVisibleWeek(page)), {
            message: `${step}: the week view shows the week of the active date (21–27 July)`,
            timeout: 5000
        }).toBe(true);

        // The mount scroll is asynchronous (timeout + DOM rect round trip). Give a wrong paging
        // a chance to happen before reading the final state.
        await page.waitForTimeout(600);

        const week = await readVisibleWeek(page);
        expect(weekIsActive(week), `${step}: visible header items ${JSON.stringify(week)}`).toBe(true)
    };

    const switchTo = async (page, name) => {
        await page.getByRole('button', {name, exact: true}).click()
    };

    test('the week of the active date is shown at load and after Month, Year and Day round trips', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/test/playwright/component/apps/calendar-basic/index.html');

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();
        await expectActiveWeek(page, 'at load');

        for (const other of ['Month', 'Year', 'Day']) {
            await switchTo(page, other);
            await expect(page.locator(WEEK_VIEW).first()).toBeHidden();

            await switchTo(page, 'Week');
            await expect(page.locator(WEEK_VIEW).first()).toBeVisible();
            await expectActiveWeek(page, `after ${other} → Week`)
        }
    });

    test('double-clicking two all-day bars in sequence switches the editor without losing either event (#20883)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/calendar/basic/index.html');

        const freezeBar = page.locator(`${WEEK_VIEW} .neo-allday-event`, {hasText: 'Release freeze'}).first(),
              summitBar = page.locator(`${WEEK_VIEW} .neo-allday-event`, {hasText: 'Architecture summit'}).first();

        await expect(freezeBar).toBeVisible();
        await expect(summitBar).toBeVisible();

        await freezeBar.dblclick();

        const editor         = page.locator('.neo-calendar-edit-event-container'),
              titleInput     = editor.locator('input[name="title"]'),
              allDayCheckbox = editor.locator('input[type="checkbox"]');

        await expect(editor).toBeVisible();
        await expect(titleInput).toHaveValue('Release freeze');
        await expect(allDayCheckbox).toBeChecked();

        await summitBar.dblclick();

        // out-waits: EditEventContainer#onFocusLeave 100ms timeout from click 1
        await page.waitForTimeout(150);

        await expect(editor).toBeVisible();
        await expect(titleInput).toHaveValue('Architecture summit');
        await expect(allDayCheckbox).toBeChecked();
        await expect(freezeBar).toBeVisible();
        await expect(summitBar).toBeVisible();

        await switchTo(page, 'Month');
        await expect(page.locator(WEEK_VIEW).first()).toBeHidden();
        await switchTo(page, 'Week');

        await expect(freezeBar).toBeVisible();
        await expect(summitBar).toBeVisible();
    });
});
