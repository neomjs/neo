import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/timeZones/index.html',
    HOUR_PX     = 45, // the example's pxPerMinute is 0.75
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

// The viewer's zone is the browser's: pinning it makes "your zone" one known city that is none of the three
test.use({timezoneId: 'America/Los_Angeles'});

/**
 * @summary Collects page errors and console errors for the current page. The dev server has no favicon, and the
 * browser's request for one is no error of the example.
 * @param {import('@playwright/test').Page} page
 * @returns {String[]}
 */
function trackErrors(page) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico') && errors.push(msg.text()));

    return errors
}

/**
 * @summary Reads the zone switch, the readout, the rendered day ticks and the left edge of one shift's bar.
 * @param {import('@playwright/test').Page} page
 * @param {String} shiftId
 * @returns {Promise<Object>}
 */
function readPlan(page, shiftId) {
    return page.evaluate(id => {
        const bar = document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`);

        return {
            barLeft: bar ? parseFloat(bar.style.getPropertyValue('--neo-timeline-bar-left')) : null,
            days   : [...document.querySelectorAll('.neo-timeline-tick-major')].map(tick => ({
                label: tick.textContent.trim(),
                left : parseFloat(tick.style.left),
                width: parseFloat(tick.style.width)
            })),
            axisClock: document.querySelector('.tz-clock-axis .tz-clock-city')?.textContent.trim(),
            clocks   : [...document.querySelectorAll('.tz-clock')].map(clock =>
                `${clock.querySelector('.tz-clock-city').textContent.trim()}: ${clock.querySelector('.tz-clock-time').textContent.trim()}`),
            pressed  : [...document.querySelectorAll('.tz-zone.pressed')].map(button => button.textContent.trim()),
            shift    : document.querySelector('.tz-readout-shift')?.textContent.trim(),
            stored   : document.querySelector('.tz-readout-stored')?.textContent.trim()
        }
    }, shiftId)
}

/**
 * @summary Chooses a zone with its button and waits for the readout and Sunday's header to name that zone's clock.
 * The bars re-render in their own update; read them with `barLeftOf`.
 * @param {import('@playwright/test').Page} page
 * @param {String} city
 */
async function chooseZone(page, city) {
    await page.locator('.tz-zone', {hasText: new RegExp(`^${city}$`)}).click();
    await expect(page.locator('.tz-clock-axis .tz-clock-city')).toContainText(city);
    await expect(page.locator('.neo-timeline-tick-major', {hasText: 'Sun 1 Nov'})).toContainText(city)
}

/**
 * @summary Polls one shift's left edge until it settles on the expected pixel offset.
 * @param {import('@playwright/test').Page} page
 * @param {String} shiftId
 * @param {Number} expected
 */
async function expectBarLeft(page, shiftId, expected) {
    await expect.poll(async () => (await readPlan(page, shiftId)).barLeft).toBe(expected)
}

test.describe('Scheduler time zones example (#21620)', () => {
    test('opens on the viewer\'s clock, and a zone moves every shift while the stored times stay', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

        // The plan opens at Saturday 15:00, so Sunday's header comes into view once the opening scroll has landed
        await expect(page.locator('.neo-timeline-tick-major', {hasText: 'Sun 1 Nov'})).toBeVisible();
        // The four clocks are one named control for assistive technology
        await expect(page.getByRole('group', {name: 'Time zone'})).toBeVisible();

        // Dana Ortiz works Sunday 09:00–17:00 in New York, stored 14:00–22:00 UTC: on the viewer's clock 06:00–14:00
        const clocks = [
            'New York · own clock: Sun 09:00 – 17:00',
            'Los Angeles · you: Sun 06:00 – 14:00',
            'Tokyo: Sun 23:00 – Mon 07:00',
            'Berlin: Sun 15:00 – 23:00'
        ];
        let plan = await readPlan(page, 'shift-1-2');
        expect(plan.pressed).toEqual(['Los Angeles (you)']);
        expect(plan).toMatchObject({axisClock: 'Los Angeles · you', clocks, shift: 'Dana Ortiz\'s shift', stored: 'Stored in UTC: Sun 14:00 – 22:00'});
        expect(plan.days.find(day => day.label.startsWith('Sun')).label).toBe('Sun 1 Nov · Los Angeles · clocks go back 1 h: UTC−7 → UTC−8');

        // Every zone's axis starts on its own Friday midnight, so Sunday begins at 48 h whatever the zone
        await chooseZone(page, 'Tokyo');
        plan = await readPlan(page, 'shift-1-2');
        expect(plan).toMatchObject({axisClock: 'Tokyo', clocks, stored: 'Stored in UTC: Sun 14:00 – 22:00'});
        expect(plan.days.find(day => day.label.startsWith('Sun'))).toMatchObject({label: 'Sun 1 Nov · Tokyo · UTC+9', left: 48 * HOUR_PX});
        // Haruto Sato's Sunday, stored from Saturday 22:00 UTC, starts at 07:00 on Sunday in Tokyo
        await expectBarLeft(page, 'shift-1-2', (48 + 7) * HOUR_PX);

        await chooseZone(page, 'Berlin');
        plan = await readPlan(page, 'shift-1-2');
        expect(plan).toMatchObject({axisClock: 'Berlin', clocks, stored: 'Stored in UTC: Sun 14:00 – 22:00'});
        expect(plan.days.find(day => day.label.startsWith('Sun'))).toMatchObject({label: 'Sun 1 Nov · Berlin · UTC+1', left: 48 * HOUR_PX});
        // The same shift starts at 23:00 on Saturday in Berlin
        await expectBarLeft(page, 'shift-1-2', 47 * HOUR_PX);

        expect(errors).toEqual([])
    });

    test('in New York time, Sunday 1 November has 25 hours and 01:00 twice', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();
        await chooseZone(page, 'New York');

        // Sunday's day tick spans 25 hours; the clock goes back from 02:00 EDT to 01:00 EST
        const sunday = page.locator('.neo-timeline-tick-major', {hasText: 'Sun 1 Nov'});
        await expect(sunday).toContainText('Sun 1 Nov · New York · clocks go back 1 h: UTC−4 → UTC−5');
        expect(await sunday.evaluate(tick => parseFloat(tick.style.width))).toBe(25 * HOUR_PX);

        // The hours of that night, stored as instants an hour apart, read 00:00, 01:00, 01:00, 02:00
        const night = await page.evaluate(() => ['04', '05', '06', '07'].map(hour =>
            document.querySelector(`.neo-timeline-tick-minor[data-date="2026-11-01T${hour}:00:00.000Z"]`)?.textContent));
        expect(night).toEqual(['00:00', '01:00', '01:00', '02:00']);

        // Dana Ortiz's Sunday starts after the change, at 09:00 on Dana's clock: ten hours into a day that began on UTC−4
        await expect(page.locator('.tz-clock-axis .tz-clock-time')).toHaveText('Sun 09:00 – 17:00');
        const dana = page.locator('.neo-timeline-bar[data-event-id="shift-8-2"]');
        await expect(dana).toContainText('09:00–17:00 in New York');
        await expectBarLeft(page, 'shift-8-2', (48 + 10) * HOUR_PX);

        expect(errors).toEqual([])
    });

    test('a click or Enter on a shift puts it in the readout', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await chooseZone(page, 'Tokyo');

        await page.locator('.neo-timeline-bar[data-event-id="shift-1-2"]').click();
        await expect(page.locator('.tz-readout-shift')).toHaveText('Haruto Sato\'s shift');
        await expect(page.locator('.tz-clock-axis')).toContainText('Tokyo · own clockSun 07:00 – 15:00');
        await expect(page.locator('.tz-readout-stored')).toHaveText('Stored in UTC: Sat 22:00 – Sun 06:00');
        await expect(page.locator('.neo-timeline-bar[data-event-id="shift-1-2"]')).toHaveClass(/neo-timeline-bar-highlighted/);

        await page.locator('.neo-timeline-bar[data-event-id="shift-2-2"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.tz-readout-shift')).toHaveText('Yui Tanaka\'s shift');

        expect(errors).toEqual([])
    });

    test('at 390 x 844 the plan opens at the chosen shift and keeps it in view across zones', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        const chosen = page.locator('.neo-timeline-bar[data-event-id="shift-8-2"]');
        await expect(chosen).toBeInViewport();

        for (const city of ['Tokyo', 'Berlin', 'New York']) {
            await chooseZone(page, city);
            await expect(chosen).toBeInViewport()
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
                await expect(page.locator('.neo-timeline-bar').first()).toBeAttached()
            }
        }

        expect(errors).toEqual([])
    });
});
