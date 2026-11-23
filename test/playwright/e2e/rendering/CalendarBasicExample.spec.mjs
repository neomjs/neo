import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The calendar example opens on the team's working day: with no input, the week view and the phone's day view
 * start at 8 AM with the team's meetings in view, and the settings panel shows that range and still changes it.
 *
 * The team week is generated around today, so these checks read hours, not dates: the time axis's first label, and
 * a weekday stand-up at 09:30 that every generated week carries.
 */
const URL      = '/examples/calendar/basic/index.html',
      DAY_VIEW = '.neo-calendar-daycomponent',
      THEMES   = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

/**
 * @summary Collects page errors and console errors of `page` into `bucket`. The browser's own request for a favicon
 * the example never names is not the example's error, so its 404 is left out.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} bucket
 */
function captureErrors(page, bucket) {
    page.on('pageerror', error => bucket.push(error.message));
    page.on('console',   msg   => {
        const {url} = msg.location();
        msg.type() === 'error' && !url?.endsWith('/favicon.ico') && bucket.push(`${msg.text()} ${url}`)
    })
}

/**
 * @summary Reads the visible time axis: its first hour label, and how many stand-ups sit wholly inside the viewport.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{firstHour: String|null, standUpsInView: Number}>}
 */
function readOpening(page) {
    return page.evaluate(() => {
        const inView = el => {
                  const rect = el.getBoundingClientRect();
                  return rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
              },
              axis   = [...document.querySelectorAll('.neo-calendar-timeaxis')].find(el => el.offsetParent !== null),
              labels = axis ? [...axis.querySelectorAll('.neo-c-w-timeaxis-item')].map(el => el.textContent.trim()).filter(Boolean) : [];

        return {
            firstHour     : labels[0] || null,
            standUpsInView: [...document.querySelectorAll('.neo-event')].filter(el => /Stand-up/.test(el.textContent) && inView(el)).length
        }
    })
}

/**
 * @summary Opens the example at `width` × `height` in `theme` and waits for its first event.
 * @param {import('@playwright/test').Page} page
 * @param {Number} width
 * @param {Number} height
 * @param {String} theme
 */
async function open(page, width, height, theme) {
    await page.setViewportSize({width, height});
    await page.goto(`${URL}?theme=${theme}`);
    await expect(page.locator('.neo-calendar-weekcomponent .neo-event').first()).toBeAttached()
}

test.describe('The calendar example opens on the working day', () => {
    for (const [width, height] of [[960, 540], [1440, 900]]) {
        for (const theme of THEMES) {
            test(`the week starts at 8 AM with a stand-up in view at ${width} × ${height} in ${theme}`, async ({page}) => {
                const errors = [];
                captureErrors(page, errors);

                await open(page, width, height, theme);

                await expect.poll(async () => (await readOpening(page)).firstHour).toMatch(/^0?8\b/);
                await expect.poll(async () => (await readOpening(page)).standUpsInView).toBeGreaterThan(0);
                expect(errors).toEqual([])
            })
        }
    }

    test('a phone opens the day view at 8 AM', async ({page}) => {
        await open(page, 390, 844, THEMES[0]);

        await expect(page.locator(DAY_VIEW).first()).toBeVisible();
        await expect.poll(async () => (await readOpening(page)).firstHour).toMatch(/^0?8\b/)
    });

    test('the settings panel shows 08:00 to 19:00 and a new start moves the day', async ({page}) => {
        await open(page, 1440, 900, THEMES[0]);

        await page.locator('.neo-button:has(.fa-cog)').first().click();

        const start = page.locator('input[name="startTime"]').first();

        await expect(start).toHaveValue('08:00');
        await expect(page.locator('input[name="endTime"]').first()).toHaveValue('19:00');

        await start.fill('07:00');
        await start.press('Enter');

        await expect.poll(async () => (await readOpening(page)).firstHour).toMatch(/^0?7\b/)
    })
});
