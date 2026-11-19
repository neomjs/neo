/**
 * @summary The form app opens a team account in steps: Next validates the open step and names what is wrong, Create
 * account validates every step and shows the object the form submits, and a phone folds the step list away.
 * @see https://github.com/neomjs/neo/issues/21336
 */
import {test, expect} from '../../fixtures.mjs';

const header  = page => page.locator('.form-header-label'),
      message = page => page.locator('.form-step-message'),
      step    = (page, name) => page.locator('.form-side-nav-list .neo-list-item').filter({hasText: name}),
      input   = (page, name) => page.locator(`input[name="${name}"]`);

/**
 * @param {Object} page
 */
async function fillAboutYou(page) {
    await input(page, 'person.firstName').fill('Ada');
    await input(page, 'person.lastName').fill('Lovelace');
    await input(page, 'person.email').fill('ada@example.com')
}

/**
 * @param {Object} page
 */
async function fillAddress(page) {
    await input(page, 'address.street').fill('Unter den Linden 1');
    await input(page, 'address.zip').fill('10115');
    await input(page, 'address.city').fill('Berlin')
}

test.describe('Form app', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/apps/form/index.html');
        await expect(header(page)).toHaveText('About you', {timeout: 15000})
    });

    test('Next stays on a step with an invalid field and names it, then moves on once it is valid', async ({page}) => {
        const next = page.getByRole('button', {name: 'Next'});

        await next.click();

        await expect(message(page)).toHaveText('Check First name, Last name, Work email');
        await expect(header(page)).toHaveText('About you');
        await expect(step(page, 'About you').locator('.form-side-nav-state-invalid')).toHaveCount(1);

        await fillAboutYou(page);
        await next.click();

        await expect(header(page)).toHaveText('Address');
        await expect(page.locator('.form-header-step')).toHaveText('Step 2 of 5');
        await expect(message(page)).toHaveText('');
        await expect(step(page, 'About you').locator('.form-side-nav-state-valid')).toHaveCount(1)
    });

    test('Create account opens the first invalid step, and submits once every step is valid', async ({page}) => {
        const create = page.getByRole('button', {name: 'Create account'});

        // the step list moves freely; only Next and Create account validate
        await step(page, 'Review').click();
        await expect(header(page)).toHaveText('Review');
        await create.click();

        await expect(header(page)).toHaveText('About you');
        await expect(message(page)).toHaveText('Check First name, Last name, Work email');

        await fillAboutYou(page);
        await step(page, 'Review').click();
        await create.click();

        // the steps the visitor never opened are validated too
        await expect(header(page)).toHaveText('Address');
        await expect(message(page)).toHaveText('Check Street and number, ZIP code, City');

        await fillAddress(page);
        await step(page, 'Review').click();
        await create.click();

        await expect(message(page)).toHaveText('');
        await expect(page.locator('.form-review-done')).toHaveText('Account created for Ada Lovelace. The form submitted this object:');

        const submitted = JSON.parse(await page.locator('.form-review-values').textContent());

        expect(submitted.person).toMatchObject({firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com'});
        expect(submitted.address).toMatchObject({city: 'Berlin', country: 'germany', street: 'Unter den Linden 1', zip: '10115'});
        expect(submitted.team).toMatchObject({campaign: 'engine-14', plan: 'team', seats: 5});
        expect(submitted.preferences.topics).toEqual(expect.arrayContaining(['forms', 'grids']))
    });

    test('the form fills the frame on a desktop, and a phone folds the step list away', async ({page}) => {
        const form = await page.locator('.form-form-container').boundingBox();

        expect(form.x + form.width).toBeGreaterThan(1400);
        expect(form.height).toBeGreaterThan(840);
        await expect(page.locator('.form-step-nav')).toBeVisible();

        await page.setViewportSize({width: 390, height: 844});

        await expect(page.locator('.form-step-nav')).toBeHidden();
        await expect(header(page)).toBeInViewport();
        await expect(input(page, 'person.firstName')).toBeInViewport()
    })
});
