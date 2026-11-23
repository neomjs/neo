import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/form/checkout`: one checkout form with Country, ZipCode, Phone, Currency and IBAN. The postal
 * code follows the chosen country, the phone checks its format, the amount its range, the IBAN its format by its own
 * prefix and its check digits always, and Check order names what still needs a fix or what would be ordered. The
 * phone frame completes it by keyboard.
 */
const CARD   = '.neo-examples-form-checkout .checkout-card',
      RESULT = '.neo-examples-form-checkout .checkout-result',
      URL    = '/examples/form/checkout/index.html';

/**
 * @param {Object} page
 */
const ready = async page => {
    await page.goto(URL);
    await expect(page.locator(`${CARD} h1`)).toHaveText('Address and payment', {timeout: 30000})
};

/**
 * @param {Object} page
 * @returns {Object} The form's inputs and its button
 */
const fields = page => ({
    amount : page.getByRole('spinbutton', {name: /Amount/}),
    button : page.getByRole('button', {name: 'Check order'}),
    country: page.getByRole('combobox', {name: 'Country'}),
    iban   : page.getByRole('textbox', {name: 'IBAN'}),
    name   : page.getByRole('textbox', {name: 'Full name'}),
    phone  : page.getByRole('textbox', {name: 'Phone'}),
    zip    : page.getByRole('textbox', {name: 'Postal code'})
});

/**
 * @param {Object} page
 * @param {String} text
 * @returns {Object} A field error with this text
 */
const fieldError = (page, text) => page.locator('.checkout-form .neo-textfield-error', {hasText: text});

test.describe('Checkout form example', () => {
    test.setTimeout(90000);

    test('the postal code follows the country, the IBAN checks its digits, and Check order reports', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const form = fields(page);

        // A four-digit code is no German postal code, but an Austrian one
        await form.zip.fill('1010');
        await form.zip.press('Tab');
        await expect(fieldError(page, 'Not a valid zip code')).toBeVisible();

        await page.locator('.neo-countryfield .fa-caret-down').first().click();
        await page.locator('.neo-list-item', {hasText: 'Austria'}).click();
        await expect(fieldError(page, 'Not a valid zip code')).toHaveCount(0);
        await expect(form.phone).toHaveAttribute('placeholder', '+43 1 2345678');

        // Check order names the fields still empty
        await form.button.click();
        await expect(page.locator(RESULT)).toHaveText('Fix: Full name, Phone, Amount (EUR), IBAN.');

        // A change takes the result back to the hint; a complete order is ready
        await form.name.fill('Jane Doe');
        await expect(page.locator(RESULT)).toHaveText('Fill in the form, then check the order.');

        // The phone checks its format, the amount its range
        await form.phone.fill('call me');
        await form.phone.press('Tab');
        await expect(fieldError(page, 'Not a valid phone number')).toBeVisible();
        // The range error shows while the amount has focus; leaving the field clamps it to the maximum
        await form.amount.fill('20000');
        await expect(fieldError(page, 'Max value violation')).toBeVisible();
        await form.amount.press('Tab');
        await expect(form.amount).toHaveValue('10000.00');

        await form.phone.fill('+43 1 2345678');
        await form.amount.fill('49.90');
        await form.iban.fill('AT61 1904 3002 3457 3201');
        await form.button.click();
        await expect(page.locator(RESULT)).toHaveText(
            'Ready: 49.90 EUR from AT61 1904 3002 3457 3201, shipped to 1010 Austria.'
        );

        // The format fits Austria, but a wrong check digit fails
        await form.iban.fill('AT62 1904 3002 3457 3201');
        await form.iban.press('Tab');
        await expect(fieldError(page, 'Not a valid IBAN')).toBeVisible()
    });

    test('the form completes by keyboard at phone size: Tab between fields, Enter on Check order', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await ready(page);

        const form = fields(page);

        await form.name.focus();
        await page.keyboard.type('Jane Doe');

        // Germany stays chosen: Tab passes the country on to the postal code
        await page.keyboard.press('Tab');
        await expect(form.country).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(form.zip).toBeFocused();
        await page.keyboard.type('10115');
        await page.keyboard.press('Tab');
        await expect(form.phone).toBeFocused();
        await page.keyboard.type('+49 30 1234567');
        await page.keyboard.press('Tab');
        await expect(form.amount).toBeFocused();
        await page.keyboard.type('19.99');
        await page.keyboard.press('Tab');
        await expect(form.iban).toBeFocused();
        await page.keyboard.type('DE89 3704 0044 0532 0130 00');
        await page.keyboard.press('Tab');
        await expect(form.button).toBeFocused();
        await page.keyboard.press('Enter');

        await expect(page.locator(RESULT)).toHaveText(
            'Ready: 19.99 EUR from DE89 3704 0044 0532 0130 00, shipped to 10115 Germany.'
        )
    });
});
