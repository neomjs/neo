import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The calendar year example: it opens on the year of today with today marked, every day of a vacation is
 * shaded, a click on a day opens that day in the day view, and a phone opens on the month of today.
 *
 * The example's data is generated around today. Sofia's 14-day vacation from 20 July is in every year it generates,
 * so its days are the fixture: 22 July sits inside it, with no other event that day unless today's week reaches it.
 */
const URL       = '/examples/calendar/year/index.html',
      YEAR_VIEW = '.neo-calendar-yearcomponent',
      DAY_VIEW  = '.neo-calendar-daycomponent',
      THEMES    = ['neo-theme-neo-dark', 'neo-theme-neo-light'],
      year      = new Date().getFullYear(),
      cellOf    = (month, day) => `${YEAR_VIEW} [id$="__${year}-${month}-${day}"]`;

/**
 * @summary Collects page errors and console errors of `page` into `bucket`.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} bucket
 */
function captureErrors(page, bucket) {
    page.on('pageerror', error => bucket.push(error.message));
    page.on('console',   msg   => msg.type() === 'error' && bucket.push(msg.text()))
}

test.describe('Calendar year example', () => {
    test('opens on the year of today with today marked, and shades every day of a vacation', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        await expect(page.locator(`${YEAR_VIEW} .neo-today`)).toHaveText(String(new Date().getDate()));
        await expect(page.locator(`${YEAR_VIEW} .neo-year-header`)).toContainText(String(year));

        // A multi-day all-day event marks each of its days, not only a day it starts and ends on
        for (const [month, day] of [['07', '20'], ['07', '27'], ['08', '02']]) {
            await expect(page.locator(cellOf(month, day)), `${day}.${month}.`).toHaveClass(/\bneo-events-(low|medium|high)\b/)
        }
    });

    test('a click on a day opens that day in the day view', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const day = page.locator(cellOf('07', '22'));

        await expect(day).toBeVisible();
        await day.click();

        await expect(page.locator(YEAR_VIEW)).toBeHidden();
        await expect(page.locator(DAY_VIEW).first()).toBeVisible();
        await expect(page.locator(`${DAY_VIEW} .neo-allday-event`, {hasText: 'Vacation: hiking'}).first()).toBeVisible();
        await expect(page.getByRole('button', {name: 'Day', exact: true})).toHaveClass(/\bpressed\b/)
    });

    test('a phone opens the year on the month of today', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(URL);

        await expect(page.locator(`${YEAR_VIEW} .neo-today`)).toBeInViewport();
        await expect(page.locator(`${YEAR_VIEW} .neo-month`).first()).not.toBeInViewport()
    });

    for (const theme of THEMES) {
        for (const [width, height] of [[1440, 900], [390, 844]]) {
            test(`${theme} at ${width} × ${height}: no console error, and a click on a day still opens it`, async ({page}) => {
                const errors = [];

                captureErrors(page, errors);
                await page.setViewportSize({width, height});
                await page.goto(`${URL}?theme=${theme}`);

                await expect(page.locator('.neo-viewport').first()).toHaveClass(new RegExp(`\\b${theme}\\b`));
                await expect(page.locator(`${YEAR_VIEW} .neo-today`)).toBeInViewport();

                await page.locator(`${YEAR_VIEW} .neo-cell:has(.neo-today)`).click();
                await expect(page.locator(DAY_VIEW).first()).toBeVisible();

                expect(errors).toEqual([])
            })
        }
    }
});
