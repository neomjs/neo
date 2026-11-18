import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The calendar on a phone and with its side panel folded, on the fixed-data fixture (active on Sun 21 July
 * 2024): a folded start mounts cleanly, the week header stays in step with narrow columns, and the week and day views
 * stay on the active week and day when the side panel folds or expands, or when a resize's measurement arrives late.
 */
const FIXTURE = '/test/playwright/component/apps/calendar-basic/index.html',
      // The day view extends the week view and keeps its class
      WEEK_VIEW = '.neo-calendar-weekcomponent:not(.neo-calendar-daycomponent)',
      DAY_VIEW  = '.neo-calendar-daycomponent',
      WEEK      = ['Sun 21', 'Mon 22', 'Tue 23', 'Wed 24', 'Thu 25', 'Fri 26', 'Sat 27'];

/**
 * @summary Reads the header items that lie fully inside the visible part of a view's header: right of its 50 px time
 * axis and left of the scroll container's edge.
 */
const readVisibleHeader = (page, selector) => page.evaluate(selector => {
    const root     = [...document.querySelectorAll(selector)].find(el => el.offsetParent !== null),
          scroller = root?.querySelector('.neo-c-w-scrollcontainer');

    if (!scroller) return null;

    const box = scroller.getBoundingClientRect();

    return [...root.querySelectorAll('.neo-header-row-item')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.left >= box.left + 49 && rect.right <= box.right + 1
    }).map(el => el.innerText.replace(/\s+/g, ' ').trim())
}, selector);

/** @summary Adds calendar configs to the fixture through its neo-config. */
const routeCalendarConfig = (page, calendarConfig) => page.route('**/calendar-basic/neo-config.json', async route => {
    const response = await route.fetch();
    await route.fulfill({response, json: {...await response.json(), calendarConfig}})
});

/** @summary Opens the fixture at 1280 px in the day view, on the active Sunday. */
const openDayView = async page => {
    await page.setViewportSize({width: 1280, height: 720});
    await page.goto(FIXTURE);
    await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();

    await page.evaluate(() => Neo.worker.App.setConfigs({
        id        : document.querySelector('.neo-calendar-maincontainer').id,
        activeView: 'day'
    }));

    await expect.poll(() => readVisibleHeader(page, DAY_VIEW)).toEqual(['Sun 21'])
};

/**
 * @summary In the main thread, answers the day view's next column measurement only on `releaseMeasurement()`, and
 * holds the view's resize reports that arrive meanwhile until `releaseResize()`: a test picks which lands first.
 */
const holdNextMeasurement = page => page.evaluate(selector => {
    const root    = [...document.querySelectorAll(selector)].find(el => el.offsetParent !== null),
          columns = root.querySelector('.neo-c-w-column-container'),
          access  = Neo.main.DomAccess,
          manager = Neo.worker.Manager,
          measure = access.getBoundingClientRect,
          send    = manager.sendMessage,
          hold    = window.calendarHold = {resizeReports: []};

    access.getBoundingClientRect = function(data) {
        const rect = measure.call(this, data);

        if (data.id !== columns.id || hold.measured) return rect;

        hold.measured = true;
        return new Promise(resolve => {hold.releaseMeasurement = () => resolve(rect)})
    };

    manager.sendMessage = function(dest, data, ...args) {
        if (hold.measured && !hold.resizeReleased && data?.eventName === 'resize' && data.data?.id === root.id) {
            hold.resizeReports.push(() => send.call(this, dest, data, ...args));
            return
        }

        return send.call(this, dest, data, ...args)
    };

    hold.releaseResize = () => {
        hold.resizeReleased = true;
        hold.resizeReports.forEach(report => report())
    }
}, DAY_VIEW);

/** @summary Waits until the app worker has handled every message sent so far, and the frames after it. */
const settle = page => page.evaluate(async () => {
    const id    = document.querySelector('.neo-calendar-maincontainer').id,
          frame = () => new Promise(resolve => requestAnimationFrame(resolve));

    for (let i = 0; i < 3; i++) {
        await Neo.worker.App.getConfigs({id, keys: 'activeView'});
        await frame();
        await frame()
    }
});

/** @summary Narrows to a phone width, measured but held, then widens again with the wide resize report held. */
const narrowThenWiden = async page => {
    await holdNextMeasurement(page);
    await page.setViewportSize({width: 390, height: 720});
    await page.waitForFunction(() => window.calendarHold.measured);
    await page.setViewportSize({width: 1280, height: 720});
    await page.waitForFunction(() => window.calendarHold.resizeReports.length > 0)
};

test.describe('Neo.calendar on a phone and with a folded side panel', () => {
    test('a calendar created with its side panel folded mounts without an error and without the panel', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(error.message));
        await routeCalendarConfig(page, {sideBarExpanded: false});
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(0);
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW)).toEqual(WEEK);
        expect(errors).toEqual([])
    });

    test('at 390 × 844 the week header reads the active week, in step with its narrow columns', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeAttached();
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW), {timeout: 5000}).toEqual(WEEK)
    });

    test('folding the side panel keeps the active week, expanding it keeps the active day', async ({page}) => {
        const toggle = page.locator('.neo-calendar-header-toolbar.neo-left .fa-bars');

        await page.setViewportSize({width: 1280, height: 720});
        await page.goto(FIXTURE);

        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW)).toEqual(WEEK);

        await toggle.click();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(0);
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW), {message: 'the week after folding'}).toEqual(WEEK);

        await page.getByRole('button', {name: 'Day', exact: true}).click();
        await expect.poll(() => readVisibleHeader(page, DAY_VIEW)).toEqual(['Sun 21']);

        await toggle.click();
        await expect(page.locator('.neo-calendar-sidebar')).toHaveCount(1);
        await expect.poll(() => readVisibleHeader(page, DAY_VIEW), {message: 'the day after expanding'}).toEqual(['Sun 21'])
    });

    test('crossing back to a wide view before the fold finishes keeps the week and the side panel', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto(FIXTURE);
        await expect(page.locator(`${WEEK_VIEW} .neo-event`).first()).toBeVisible();

        // The example controller's two calls when a phone width turns wide again, the second before the fold's
        // delayed removal (400 ms in afterSetSideBarExpanded) has run
        const sideBarExpanded = await page.evaluate(async () => {
            const id = document.querySelector('.neo-calendar-maincontainer').id;

            await Neo.worker.App.setConfigs({id, activeView: 'day', sideBarExpanded: false});
            await Neo.worker.App.setConfigs({id, activeView: 'week', sideBarExpanded: true});
            await new Promise(resolve => setTimeout(resolve, 600)); // the stale fold's 400 ms removal has had its chance to run

            return Neo.worker.App.getConfigs({id, keys: 'sideBarExpanded'})
        });

        expect(sideBarExpanded).toBe(true);
        await expect(page.locator('.neo-calendar-sidebar')).toBeVisible();
        await expect.poll(() => readVisibleHeader(page, WEEK_VIEW)).toEqual(WEEK)
    });

    test('a narrow measurement that lands after the view widened again keeps the active day', async ({page}) => {
        await openDayView(page);
        await narrowThenWiden(page);

        await page.evaluate(() => window.calendarHold.releaseMeasurement());
        await settle(page); // the obsolete scroll and its scroll event have reached the view
        await page.evaluate(() => window.calendarHold.releaseResize());
        await settle(page);

        await expect.poll(() => readVisibleHeader(page, DAY_VIEW)).toEqual(['Sun 21'])
    });

    test('a narrow measurement that lands after the wide one keeps the active day', async ({page}) => {
        await openDayView(page);
        await narrowThenWiden(page);

        await page.evaluate(() => window.calendarHold.releaseResize());
        await settle(page); // the wide width has re-centered the view
        await page.evaluate(() => window.calendarHold.releaseMeasurement());
        await settle(page);

        await expect.poll(() => readVisibleHeader(page, DAY_VIEW)).toEqual(['Sun 21'])
    })
});
