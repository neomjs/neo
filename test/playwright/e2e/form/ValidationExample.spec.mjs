import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/form/validation`: a sign-up form that validates as you type and lists what is wrong.
 * A bad email shows its error under the field and in the list beside the button while the button stays
 * disabled; a password that differs from its repeat is listed too; a valid form unlocks the button and
 * signing up shows the submitted values with the password masked. The phone frame holds the same form.
 */
const CARD     = '.neo-examples-form-validation .signup-card',
      PROBLEMS = '.neo-examples-form-validation .signup-problems',
      RESULT   = '.neo-examples-form-validation .signup-result',
      URL      = '/examples/form/validation/index.html';

/**
 * @param {Object} page
 */
const ready = async page => {
    await page.goto(URL);
    await expect(page.locator(`${CARD} h1`)).toHaveText('Create your account', {timeout: 30000})
};

/**
 * @param {Object} page
 * @returns {Object} The form's inputs and its button
 */
const fields = page => ({
    button  : page.getByRole('button', {name: 'Sign up'}),
    email   : page.getByRole('textbox', {name: 'Email'}),
    name    : page.getByRole('textbox', {name: 'Full name'}),
    password: page.getByRole('textbox', {name: 'Password', exact: true}),
    repeat  : page.getByRole('textbox', {name: 'Repeat password'}),
    terms   : page.getByText('I agree to the terms and conditions')
});

test.describe('Form validation example', () => {
    test.setTimeout(90000);

    test('errors show as you type, the list names them, and a valid form signs up', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const form = fields(page);

        await expect(form.button).toBeDisabled();

        // a bad email: the field shows its error, the list names it, the button stays blocked
        await form.email.fill('jane.doe@');
        await expect(page.locator('.signup-form .neo-textfield-error', {hasText: 'Not a valid email address'})).toBeVisible();
        await expect(page.locator(PROBLEMS)).toContainText('Not a valid email address');
        await expect(form.button).toBeDisabled();

        // a short password and a repeat that differs from it join the list
        await form.password.fill('short');
        await expect(page.locator(PROBLEMS)).toContainText('Min length violation');
        await form.password.fill('correct horse battery');
        await form.repeat.fill('correct horse batter');
        await expect(page.locator(PROBLEMS)).toContainText('Passwords do not match');
        await expect(form.button).toBeDisabled();

        // fixing everything empties the list and unlocks the button
        await form.name.fill('Jane Doe');
        await form.email.fill('jane.doe@example.com');
        await form.repeat.fill('correct horse battery');
        await form.terms.click();
        await expect(page.locator(PROBLEMS)).toContainText('Nothing wrong');
        await expect(form.button).toBeEnabled();

        await form.button.click();
        await expect(page.locator(RESULT)).toContainText('Sign-up complete');
        await expect(page.locator(RESULT)).toContainText('jane.doe@example.com');
        await expect(page.locator(RESULT)).not.toContainText('correct horse battery')
    });

    test('a blocked Sign up says why when only the untouched terms box is missing', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const form = fields(page);

        await form.name.fill('Jane Doe');
        await form.email.fill('jane.doe@example.com');
        await form.password.fill('correct horse battery');
        await form.repeat.fill('correct horse battery');

        await expect(page.locator(PROBLEMS)).toContainText('Still to fill in: Terms');
        await expect(form.button).toBeDisabled()
    });

    test('the form completes by keyboard: Tab between fields, Space on the terms box, Enter on Sign up', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const form = fields(page);

        await form.name.focus();
        await page.keyboard.type('Jane Doe');
        await page.keyboard.press('Tab');
        await page.keyboard.type('jane.doe@example.com');
        await page.keyboard.press('Tab');
        await page.keyboard.type('correct horse battery');
        await page.keyboard.press('Tab');
        await page.keyboard.type('correct horse battery');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Space');
        await expect(form.button).toBeEnabled();

        await page.keyboard.press('Tab');
        await expect(form.button).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator(RESULT)).toContainText('Sign-up complete')
    });

    test('the page opens in the theme ?theme= names, else in the dark theme when the system prefers dark', async ({page}) => {
        const view = page.locator('.neo-examples-form-validation');

        await page.goto(`${URL}?theme=neo-theme-neo-dark`);
        await expect(view).toHaveClass(/neo-theme-neo-dark/, {timeout: 30000});

        await page.emulateMedia({colorScheme: 'dark'});
        await page.goto(URL);
        await expect(view).toHaveClass(/neo-theme-neo-dark/, {timeout: 30000});

        await page.emulateMedia({colorScheme: 'light'});
        await page.goto(URL);
        await expect(view).toHaveClass(/neo-theme-neo-light/, {timeout: 30000})
    });

    test('the same form works at phone size', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await ready(page);

        const form = fields(page),
              box  = await page.locator(CARD).boundingBox();

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);

        await form.email.fill('jane.doe@');
        await expect(page.locator(PROBLEMS)).toContainText('Not a valid email address');
        await expect(form.button).toBeDisabled()
    });
});
