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
 * @summary Sets the End row's time and leaves the field, once the editor has arrived. The field is a native time
 * input, so the spec fills it: keystrokes edit the platform's segments, and on hosted runners they never landed.
 * @param {import('@playwright/test').Page} page
 * @param {String} time `'HH:mm'`
 */
async function setEnd(page, time) {
    const input = page.locator(`${EDITOR} [id$="__field__endDate__time__input"]`);

    // The editor focuses its Title when it has arrived: a user types after that, and so does this spec
    await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toBeFocused();
    await input.fill(time);
    await expect(input).toHaveValue(time);
    await input.press('Tab')
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} text `'Save'` or `'Cancel'`
 */
function clickButton(page, text) {
    return page.locator(`${EDITOR} button`, {hasText: text}).click()
}

/** @summary Closes the example's initial editor before exercising another appointment. */
async function dismissOpening(page) {
    await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toHaveValue('Root canal');
    await clickButton(page, 'Cancel');
    await expect(page.locator(EDITOR)).toBeHidden()
}

test('the landing editor names its visible appointment and can be reopened by keyboard', async ({page}) => {
    await page.setViewportSize({width: 960, height: 540});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    const editor      = page.locator(EDITOR), title = editor.locator('[id$="__field__title__input"]'),
          appointment = bar(page, 'appt-22');
    await expect(title).toHaveValue('Root canal');
    await expect(title).toBeFocused();
    await expect(editor).toBeInViewport({ratio: 1});
    await expect(appointment).toBeInViewport();
    const dialogBox = await editor.boundingBox(), barBox = await appointment.boundingBox();
    expect(barBox.y).toBeGreaterThanOrEqual(dialogBox.y + dialogBox.height);
    expect(barBox.y).toBeLessThan(540);
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await appointment.focus();
    await page.keyboard.press('Enter');
    await expect(title).toHaveValue('Root canal');
    await editor.getByRole('button', {name: 'close'}).click();
    await expect(editor).toBeHidden()
});

test.describe('Scheduler event editor example (#21615)', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(bar(page, 'appt-1')).toBeVisible();
        await dismissOpening(page)
    });

    test('Tab and Enter, or a double-click, open the editor, and Cancel and Escape change nothing', async ({page}) => {
        const errors = trackErrors(page);

        // Two Tabs from the toolbar's last control, its theme switcher, reach the first appointment past the grid's
        // header button; Enter opens it, Cancel closes it
        await page.locator('.neo-theme-switcher').first().focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        expect(await focusedAppointment(page)).toBe('appt-1');
        await page.keyboard.press('Enter');
        await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toHaveValue('Exam');
        await clickButton(page, 'Cancel');
        await expect(page.locator(EDITOR)).toBeHidden();
        await expect.poll(() => focusedAppointment(page)).toBe('appt-1');

        await page.locator('.neo-theme-switcher').first().click();
        await page.getByRole('menuitemradio', {name: 'Neo Light', exact: true}).click();
        await expect(page.locator('.neo-viewport').first()).toHaveClass(/\bneo-theme-neo-light\b/);

        // A double-click reopens the editor in the current theme, with a room and no progress
        await bar(page, 'appt-2').dblclick();
        await expect(page.locator(EDITOR)).toBeVisible();
        await expect(page.locator(EDITOR)).toHaveClass(/\bneo-theme-neo-light\b/);
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
        await setEnd(page, '11:00');
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
        await setEnd(page, '10:45');
        await clickButton(page, 'Save');
        await expect(page.locator(`${EDITOR} .neo-textfield-error`)).toHaveText(MINIMUM);
        await expect(page.locator(EDITOR)).toBeVisible();
        await clickButton(page, 'Cancel');
        await expect(page.locator(EDITOR)).toBeHidden();
        expect((await readBar(page, 'appt-13')).minutes, 'the refused end changed nothing').toBe(90);

        // Exam, 08:00–08:30, already sits at the minimum
        await bar(page, 'appt-1').dblclick();
        await setEnd(page, '08:15');
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
        await dismissOpening(page);

        // About two hours fit the phone, and the hint says the plan scrolls
        await expect(page.locator('.dp-hint-narrow', {hasText: 'Scroll sideways'})).toBeVisible();

        // Filling, 08:00–09:00, starts at the plan's left edge beside the room names
        await bar(page, 'appt-11').dblclick();
        await expect(page.locator(EDITOR)).toBeVisible();

        const box = await page.locator(EDITOR).boundingBox();

        expect(box.x, 'the dialog starts on screen').toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, 'the dialog ends on screen').toBeLessThanOrEqual(390);

        await setEnd(page, '08:45');
        await clickButton(page, 'Save');
        await expect(page.locator('.dp-status')).toHaveText('Saved: Filling, Restorative, 08:00–08:45');

        expect(errors).toEqual([])
    });

    test('the Room select has its label beside it, in the column of the other fields, at both sizes', async ({page}) => {
        const errors = trackErrors(page);

        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);
            await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
            await dismissOpening(page);
            await bar(page, 'appt-2').dblclick();
            await expect(page.locator(`${EDITOR} [id$="__field__title__input"]`)).toBeFocused();

            const {room, roomLabel, title, titleLabel} = await page.locator(EDITOR).evaluate(editor => {
                const rect = selector => editor.querySelector(selector).getBoundingClientRect().toJSON();

                return {
                    room      : rect('[id$="__field__resourceId"] .neo-selectfield-input'),
                    roomLabel : rect('[id$="__field__resourceId"] .neo-selectfield-label'),
                    title     : rect('[id$="__field__title"] .neo-textfield-input'),
                    titleLabel: rect('[id$="__field__title"] .neo-textfield-label')
                }
            });

            expect(Math.abs(roomLabel.left - titleLabel.left), `${size.width} px: the labels start together`).toBeLessThanOrEqual(1);
            expect(Math.abs(room.left - title.left), `${size.width} px: the select starts where Title's input does`).toBeLessThanOrEqual(1);
            expect(Math.abs((roomLabel.top + roomLabel.bottom) - (room.top + room.bottom)) / 2, `${size.width} px: the label sits beside the select`).toBeLessThanOrEqual(2);

            await clickButton(page, 'Cancel');
            await expect(page.locator(EDITOR)).toBeHidden()
        }

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
