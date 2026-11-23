import {test, expect} from '../../fixtures.mjs';

const URL    = '/examples/calendar/birthdays/index.html',
      year   = Number(new Intl.DateTimeFormat('en-US', {year: 'numeric', timeZone: 'Europe/Berlin'}).format(new Date())),
      picker = page => page.locator('.birthday-picker'),
      detail = page => page.locator('.birthday-detail'),
      cell   = (page, date) => picker(page).locator(`[role="gridcell"][id$="__${date}"]`);

test.describe('The birthday book', () => {
    test('opens on the shared anniversary and a roster choice shows all four naming records', async ({page, context}) => {
        await page.goto(`${URL}?theme=neo-theme-neo-dark`);
        await expect(page.getByRole('heading', {name: 'The birthday book'})).toBeVisible();
        await expect(cell(page, `${year}-11-23`)).toHaveAttribute('aria-selected', 'true');
        await expect(detail(page)).toContainText('Tobi');
        await expect(detail(page)).toContainText('Neo.mjs');
        await expect(detail(page)).toContainText('GA anniversary');
        await expect(page.locator('.birthday-roster button')).toHaveCount(15);
        for (const [name, date] of [['Phoebe', 'July 18'], ['Iris', 'July 19'], ['Eos', 'August 22']]) {
            await page.locator('.birthday-roster').getByRole('button', {name: new RegExp(name)}).click();
            await expect(detail(page).getByRole('heading', {name: date, exact: true})).toBeVisible();
            await expect(detail(page).getByRole('heading', {name, exact: true})).toBeVisible()
        }

        await page.locator('.birthday-roster').getByRole('button', {name: /Grace/}).click();
        await expect(cell(page, `${year}-06-11`)).toHaveAttribute('aria-selected', 'true');
        for (const name of ['Grace', 'Euclid', 'Clio', 'Mnemosyne']) {
            await expect(detail(page).getByRole('heading', {name, exact: true})).toBeVisible();
            await expect(detail(page).getByRole('link', {name: new RegExp(`naming record for ${name}`)}))
                .toHaveAttribute('href', /https:\/\/github\.com\/neomjs\/neo\/discussions\/11240#/)
        }
        const source = detail(page).getByRole('link', {name: /naming record for Grace/});
        const href   = await source.getAttribute('href');
        // Keep the link navigation real without depending on external network access in CI.
        await context.route('https://github.com/neomjs/neo/discussions/11240', route => route.fulfill({body: 'Naming record'}));
        const [recordPage] = await Promise.all([page.waitForEvent('popup'), source.click()]);
        await expect(recordPage).toHaveURL(href);
        await recordPage.close();
    });

    test('date selection, keyboard and month/year navigation retain civil dates across a year boundary', async ({page}) => {
        await page.goto(URL);
        const next     = picker(page).getByRole('button', {name: 'Next Month'}),
              previous = picker(page).getByRole('button', {name: 'Previous Month'});
        await cell(page, `${year}-11-24`).click();
        await expect(detail(page)).toContainText('No birthdays on this day');
        await cell(page, `${year}-11-24`).focus();
        await page.keyboard.press('ArrowRight');
        await expect(cell(page, `${year}-11-25`)).toBeFocused();
        await expect(detail(page)).toContainText('November 25');
        await next.click();
        await expect(picker(page).locator('.neo-month-text')).toHaveText('Dec');
        await next.click();
        await expect(picker(page).locator('.neo-year-text')).toHaveText(String(year + 1));
        await expect(picker(page).locator('.neo-month-text')).toHaveText('Jan');
        await previous.click();
        await expect(picker(page).locator('.neo-year-text')).toHaveText(String(year));
        await expect(picker(page).locator('.neo-month-text')).toHaveText('Dec');

        await picker(page).locator('.neo-center-region').click();
        const monthYear = picker(page).locator('.neo-monthyearselector');
        await expect(monthYear).toBeVisible();
        await monthYear.getByRole('option', {name: 'June'}).click();
        await monthYear.getByRole('option', {name: String(year - 1), exact: true}).click();
        await monthYear.getByRole('button', {name: 'OK'}).click();
        await expect(picker(page).locator('.neo-year-text')).toHaveText(String(year - 1));
        await expect(picker(page).locator('.neo-month-text')).toHaveText('Jun')
    });

    test('phone theme switch keeps the native picker usable without page overflow', async ({page}) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${URL}?theme=neo-theme-neo-dark`);
        await expect(picker(page)).toBeVisible();
        await page.getByRole('button', {name: 'Switch to Neo Light'}).click();
        await expect(page.locator('.birthday-book')).toHaveClass(/neo-theme-neo-light/);
        await cell(page, `${year}-11-24`).click();
        await expect(detail(page)).toContainText('No birthdays on this day');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.locator('.birthday-roster').getByRole('button', {name: /Vega/}).click();
        await expect(detail(page)).toBeFocused();
        await expect(detail(page)).toBeInViewport();
        await expect(detail(page)).toContainText('June 7');
        expect(errors).toEqual([])
    })
});
