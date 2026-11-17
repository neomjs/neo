import {expect, test} from '../../fixtures.mjs';

const TABLE = '#myTableFilterContainer';

test.describe('examples/tableFiltering', () => {
    test('each typed header filter narrows rows, filters combine, and clearing restores every customer', async ({page}) => {
        await page.goto('/examples/tableFiltering/index.html');

        const table      = page.locator(TABLE),
              rows       = table.locator('.neo-table-body tr'),
              customer   = table.locator('.neo-table-header-toolbar .neo-textfield input').first(),
              countryBox = table.locator('.neo-table-header-toolbar .neo-combobox'),
              country    = countryBox.locator('input[role="combobox"]'),
              openOrders = table.locator('.neo-table-header-toolbar input[type="number"]'),
              lastOrder  = table.locator('.neo-table-header-toolbar input[type="date"]'),
              active     = table.locator('.neo-table-header-toolbar .neo-filter-booleancontainer .neo-radiofield');

        await expect(rows).toHaveCount(80);
        await expect(table.getByRole('columnheader', {name: /Open Orders >/})).toBeVisible();
        await expect(table.getByRole('columnheader', {name: /Last Order >=/})).toBeVisible();

        await customer.fill('Avery');
        await expect(rows).toHaveCount(8);
        expect(await rows.evaluateAll(nodes => nodes.every(row => row.querySelectorAll('.neo-table-cell')[0].textContent.includes('Avery')))).toBe(true);
        await customer.fill('');

        await country.fill('Can');
        await expect(page.getByRole('option', {name: 'Canada', exact: true})).toBeVisible();
        await country.press('ArrowDown');
        await country.press('Enter');
        await expect(country).toHaveValue('Canada');
        await expect(rows).toHaveCount(10);
        expect(await rows.evaluateAll(nodes => nodes.every(row => row.querySelectorAll('.neo-table-cell')[1].textContent.trim() === 'Canada'))).toBe(true);
        await countryBox.scrollIntoViewIfNeeded();
        await countryBox.locator('.neo-trigger-clear').click();
        await expect(rows).toHaveCount(80);

        await openOrders.fill('8');
        await expect(rows).not.toHaveCount(80);
        await expect(rows).toHaveCount(37);
        expect(await rows.evaluateAll(nodes => nodes.every(row => Number(row.querySelectorAll('.neo-table-cell')[2].textContent) > 8))).toBe(true);
        await openOrders.fill('');
        await expect(rows).toHaveCount(80);

        await lastOrder.fill('2025-08-15');
        await expect(rows).not.toHaveCount(80);
        await expect(rows).toHaveCount(38);
        expect(await rows.evaluateAll(nodes => nodes.every(row => row.querySelectorAll('.neo-table-cell')[3].textContent.trim() >= '2025-08-15'))).toBe(true);
        await lastOrder.fill('');
        await expect(rows).toHaveCount(80);

        await active.nth(0).click();
        await expect(rows).toHaveCount(53);
        await active.nth(2).click();
        await expect(rows).toHaveCount(80);

        await customer.fill('Avery');
        await country.fill('Can');
        await expect(page.getByRole('option', {name: 'Canada', exact: true})).toBeVisible();
        await country.press('ArrowDown');
        await country.press('Enter');
        await expect(country).toHaveValue('Canada');
        await expect(rows).toHaveCount(2);

        await customer.fill('');
        await countryBox.locator('.neo-trigger-clear').click();
        await expect(rows).toHaveCount(80)
    });

    test('the table fills the desktop stage and its first filter is keyboard reachable and clearable on a phone in both themes', async ({page}, testInfo) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/tableFiltering/index.html');

        const table        = page.locator(TABLE),
              rows         = table.locator('.neo-table-body tr'),
              customer     = table.locator('.neo-table-header-toolbar .neo-textfield input').first(),
              countryBox   = table.locator('.neo-table-header-toolbar .neo-combobox'),
              country      = countryBox.locator('input[role="combobox"]'),
              stage        = page.locator('.neo-table-wrapper');

        await expect(rows).toHaveCount(80);
        await expect.poll(async () => {
            const box = await stage.boundingBox();
            return box && Math.round(box.y + box.height)
        }).toBe(880);
        await expect.poll(async () => (await stage.boundingBox())?.height).toBeGreaterThan(650);
        await testInfo.attach('table-filtering-desktop-default', {body: await page.screenshot(), contentType: 'image/png'});

        await customer.fill('Avery');
        await country.fill('Can');
        await expect(page.getByRole('option', {name: 'Canada', exact: true})).toBeVisible();
        await country.press('ArrowDown');
        await country.press('Enter');
        await expect(country).toHaveValue('Canada');
        await expect(rows).toHaveCount(2);
        await testInfo.attach('table-filtering-desktop-two-filters', {body: await page.screenshot(), contentType: 'image/png'});
        await customer.fill('');
        await countryBox.scrollIntoViewIfNeeded();
        await countryBox.locator('.neo-trigger-clear').click();
        await expect(country).toHaveValue('');
        await expect(rows).toHaveCount(80);

        await page.setViewportSize({width: 390, height: 844});
        await expect(rows).toHaveCount(80);
        await testInfo.attach('table-filtering-phone-default', {body: await page.screenshot(), contentType: 'image/png'});

        await customer.fill('Avery');
        await country.fill('Can');
        await expect(page.getByRole('option', {name: 'Canada', exact: true})).toBeVisible();
        await country.press('ArrowDown');
        await country.press('Enter');
        await expect(country).toHaveValue('Canada');
        await expect(rows).toHaveCount(2);
        await testInfo.attach('table-filtering-phone-two-filters', {body: await page.screenshot(), contentType: 'image/png'});
        await customer.fill('');
        await expect(rows).toHaveCount(10);
        await countryBox.locator('.neo-trigger-clear').scrollIntoViewIfNeeded();
        await countryBox.locator('.neo-trigger-clear').click();
        await expect(country).toHaveValue('');
        await expect(rows).toHaveCount(80);

        const firstCell = table.locator('.neo-table-cell').first(),
              initialBg = await firstCell.evaluate(el => getComputedStyle(el).backgroundColor);

        for (const nextTheme of ['Dark theme', 'Light theme']) {
            await page.getByRole('button', {name: nextTheme}).click();
            await expect(page.getByRole('button', {name: nextTheme === 'Dark theme' ? 'Light theme' : 'Dark theme'})).toBeVisible();

            if (nextTheme === 'Dark theme') {
                await expect.poll(async () => firstCell.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initialBg);
            } else {
                await expect.poll(async () => firstCell.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(initialBg);
            }

            await customer.fill('Avery');
            await expect(rows).toHaveCount(8);
            await page.locator('body').click({position: {x: 1, y: 1}});

            let reachedByKeyboard = false;
            for (let index = 0; index < 30 && !reachedByKeyboard; index++) {
                await page.keyboard.press('Tab');
                reachedByKeyboard = await customer.evaluate(element => document.activeElement === element)
            }

            expect(reachedByKeyboard).toBe(true);
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.press('Backspace');
            await expect(customer).toHaveValue('');
            await expect(rows).toHaveCount(80)
        }
    })
});
