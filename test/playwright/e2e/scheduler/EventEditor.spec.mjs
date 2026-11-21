import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/eventEditor/index.html',
    EDITOR      = '.neo-timeline-event-editor',
    MINIMUM     = 'The end must be at least 30 minutes after the start',
    PX          = 2.45, // the axis' pxPerMinute
    THEMES      = [
        'neo-theme-neo-light',
        'neo-theme-neo-dark',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Collects page errors and console errors for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {String[]}
 */
function trackErrors(page) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));

    return errors
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} id The appointment's id
 * @returns {import('@playwright/test').Locator}
 */
function bar(page, id) {
    return page.locator(`.neo-timeline-bar[data-event-id="${id}"]`)
}

/**
 * @summary Reads a bar's label and its width in minutes of the plan.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @returns {Promise<{minutes: Number, title: String}>}
 */
function readBar(page, id) {
    return bar(page, id).evaluate((el, px) => ({
        minutes: Math.round(el.getBoundingClientRect().width / px),
        title  : el.querySelector('.neo-timeline-bar-label').textContent
    }), PX)
}

/**
 * @summary The appointment id of the focused element, or null.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String|null>}
 */
function focusedAppointment(page) {
    return page.evaluate(() => document.activeElement?.dataset?.eventId || null)
}

/**
 * @summary Types a time into the End row's time field and leaves it.
 * @param {import('@playwright/test').Page} page
 * @param {String} time `'HH:mm'`
 */
async function typeEnd(page, time) {
    const input = page.locator(`${EDITOR} [id$="__field__endDate__time__input"]`);

    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(time);
    await input.press('Tab')
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} text `'Save'` or `'Cancel'`
 */
function clickButton(page, text) {
    return page.locator(`${EDITOR} button`, {hasText: text}).click()
}

test.describe('Scheduler event editor example (#21615)', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(bar(page, 'appt-1')).toBeVisible()
    });

    test('Tab and Enter, or a double-click, open the editor, and Cancel and Escape change nothing', async ({page}) => {
        const errors = trackErrors(page);

        // Two Tabs from the top of the page reach the first appointment; Enter opens it, Cancel closes it
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        expect(await focusedAppointment(page)).toBe('appt-1');
        await page.keyboard.press('Enter');
        await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toHaveValue('Exam');
        await clickButton(page, 'Cancel');
        await expect(page.locator(EDITOR)).toBeHidden();
        await expect.poll(() => focusedAppointment(page)).toBe('appt-1');

        // A double-click opens an appointment, worded for the practice: a room, no progress
        await bar(page, 'appt-2').dblclick();
        await expect(page.locator(EDITOR)).toBeVisible();
        await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toHaveValue('Cleaning');
        await expect(page.locator(`${EDITOR} [id$="__field__endDate__time__input"]`)).toHaveValue('09:30');
        await expect(page.locator(`${EDITOR} label`, {hasText: 'Room'})).toBeVisible();
        await expect(page.locator(`${EDITOR} label`, {hasText: 'Progress'})).toBeHidden();

        // Escape drops a changed title and hands focus back to the bar
        await page.locator(`${EDITOR} [id$="__field__title__input"]`).fill('Changed');
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toBeHidden();
        expect((await readBar(page, 'appt-2')).title).toBe('Cleaning');
        await expect.poll(() => focusedAppointment(page)).toBe('appt-2');

        expect(errors).toEqual([])
    });

    test('a save writes the appointment, its bar follows, and the toolbar names it', async ({page}) => {
        const errors = trackErrors(page);

        expect(await readBar(page, 'appt-3')).toEqual({minutes: 90, title: 'Deep cleaning'});

        await bar(page, 'appt-3').dblclick();
        await typeEnd(page, '11:00');
        await clickButton(page, 'Save');

        await expect(page.locator(EDITOR)).toBeHidden();
        await expect.poll(async () => (await readBar(page, 'appt-3')).minutes).toBe(60);
        await expect(page.locator('.dp-status')).toHaveText('Saved: Deep cleaning, Hygiene 1, 10:00–11:00');
        await expect.poll(() => focusedAppointment(page)).toBe('appt-3');

        expect(errors).toEqual([])
    });

    test('an end below the 30-minute minimum is refused, also for an appointment already at it', async ({page}) => {
        const errors = trackErrors(page);

        // Crown preparation, 10:30–12:00, would end at 10:45
        await bar(page, 'appt-13').dblclick();
        await typeEnd(page, '10:45');
        await clickButton(page, 'Save');
        await expect(page.locator(`${EDITOR} .neo-textfield-error`)).toHaveText(MINIMUM);
        await expect(page.locator(EDITOR)).toBeVisible();
        await clickButton(page, 'Cancel');
        await expect(page.locator(EDITOR)).toBeHidden();
        expect((await readBar(page, 'appt-13')).minutes, 'the refused end changed nothing').toBe(90);

        // Exam, 08:00–08:30, already sits at the minimum
        await bar(page, 'appt-1').dblclick();
        await typeEnd(page, '08:15');
        await clickButton(page, 'Save');
        await expect(page.locator(`${EDITOR} .neo-textfield-error`)).toHaveText(MINIMUM);
        await clickButton(page, 'Cancel');
        await expect(page.locator(EDITOR)).toBeHidden();
        expect((await readBar(page, 'appt-1')).minutes).toBe(30);
        await expect(page.locator('.dp-status')).toHaveText('');

        expect(errors).toEqual([])
    });

    test('at 390 x 844 a double-click opens the editor inside the screen, and a save lands', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        // Filling, 08:00–09:00, starts at the plan's left edge beside the room names
        await bar(page, 'appt-11').dblclick();
        await expect(page.locator(EDITOR)).toBeVisible();

        const box = await page.locator(EDITOR).boundingBox();

        expect(box.x, 'the dialog starts on screen').toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, 'the dialog ends on screen').toBeLessThanOrEqual(390);

        await typeEnd(page, '08:45');
        await clickButton(page, 'Save');
        await expect(page.locator('.dp-status')).toHaveText('Saved: Filling, Restorative, 08:00–08:45');

        expect(errors).toEqual([])
    });

    test('renders without errors in every theme at both sizes', async ({page}) => {
        const errors = trackErrors(page);

        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
                await expect(page.locator('.neo-viewport')).toHaveClass(new RegExp(theme));
                await expect(bar(page, 'appt-1')).toBeAttached()
            }
        }

        expect(errors).toEqual([])
    });
});
