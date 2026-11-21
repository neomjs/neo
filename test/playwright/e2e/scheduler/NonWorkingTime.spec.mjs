import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL  = '/examples/scheduler/nonWorkingTime/index.html',
    SHADING_RULE = 'Shading shows the days. It does not move work.',
    SPANNING_IDS = ['pkg-2', 'pkg-10', 'pkg-13'],
    THEMES       = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Resolves the dedicated App Worker for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Worker}
 */
function getAppWorker(page) {
    const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

    if (!worker) {
        throw new Error('App Worker not found for SchedulerNonWorkingTime')
    }

    return worker
}

/**
 * @summary Reads active scheduler calendar settings and weekend-spanning package bounds from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} packageIds
 * @returns {Promise<{bookings: Object, crewCount: Number, crewModel: String, eventCount: Number, eventModel: String, nonWorkingDates: String[], nonWorkingDays: Number[], showNonWorkingTime: Boolean}>}
 */
async function readWorkerPlanState(page, packageIds) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    return getAppWorker(page).evaluate(ids => {
        const
            scheduler = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.scheduler.Container'),
            axis      = scheduler?.timeAxis,
            bookings  = {};

        for (const id of ids) {
            const
                rec     = scheduler?.resolveEventRecord(id),
                startMs = rec?.startDate?.getTime() ?? null,
                endMs   = rec?.endDate?.getTime()   ?? null;

            bookings[id] = {
                durationMs: startMs !== null && endMs !== null ? endMs - startMs : null,
                endDate   : rec?.endDate?.toISOString()   ?? null,
                startDate : rec?.startDate?.toISOString() ?? null
            }
        }

        return {
            bookings,
            crewCount         : scheduler?.store?.getCount()      ?? 0,
            crewModel         : scheduler?.store?.model?.className ?? null,
            eventCount        : scheduler?.eventStore?.getCount() ?? 0,
            eventModel        : scheduler?.eventStore?.model?.className ?? null,
            nonWorkingDates   : [...(axis?.nonWorkingDates || [])],
            nonWorkingDays    : [...(axis?.nonWorkingDays  || [])],
            showNonWorkingTime: Boolean(scheduler?.showNonWorkingTime)
        }
    }, packageIds)
}

/**
 * @summary Reads the ordered `data-day-key` and pixel width of rendered `.neo-timeline-non-working` bands in header and first row.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{headerBands: Array<{key: String, width: Number}>, rowBands: Array<{key: String, width: Number}>, totalRowBands: Number}>}
 */
async function readRenderedBands(page) {
    return page.evaluate(() => {
        const readList = root => [...(root?.querySelectorAll('.neo-timeline-non-working') || [])].map(el => ({
            key  : el.dataset.dayKey,
            width: Math.round(el.getBoundingClientRect().width)
        }));

        const
            header    = document.querySelector('.neo-timeline-header'),
            firstRow  = document.querySelector('.neo-scheduler .neo-timeline-track'),
            allTracks = document.querySelectorAll('.neo-scheduler .neo-timeline-track .neo-timeline-non-working');

        return {
            headerBands  : readList(header),
            rowBands     : readList(firstRow),
            totalRowBands: allTracks.length
        }
    })
}

test.describe('Scheduler nonWorkingTime example', () => {
    test('shades weekends and the week-two holiday, moves bands across working-week choices, removes them when switched off, and keeps weekend-spanning booking lengths unchanged', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(EXAMPLE_URL);

        // AC-1: Eight crews in a Store of Models, holiday named in legend, explicit rule line, and weekend + holiday shaded in header and rows
        await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(8);
        await expect(page.locator('.neo-scheduler .neo-timeline-track')).toHaveCount(8);
        await expect(page.locator('.site-legend-holiday')).toContainText('Armistice Day · Wed 11 Nov');
        await expect(page.locator('.site-note-text')).toHaveText(SHADING_RULE);

        const initialWorker = await readWorkerPlanState(page, SPANNING_IDS);
        expect(initialWorker).toMatchObject({
            crewCount         : 8,
            crewModel         : 'Neo.examples.scheduler.nonWorkingTime.CrewModel',
            eventCount        : 25,
            eventModel        : 'Neo.examples.scheduler.nonWorkingTime.WorkPackageModel',
            nonWorkingDates   : ['2026-11-11'],
            nonWorkingDays    : [0, 6],
            showNonWorkingTime: true
        });

        const baselineBookings = initialWorker.bookings;
        const readBarWidths    = async () => {
            const widths = {};
            for (const id of SPANNING_IDS) {
                const box = await page.locator(`.neo-timeline-bar[data-event-id="${id}"]`).boundingBox();
                widths[id] = Math.round(box.width)
            }
            return widths
        };
        const baselineWidths = await readBarWidths();

        // Default Monday to Friday: two 2-day weekends (136px each) + Wed 11 Nov holiday (68px) in header and all 8 rows
        await expect.poll(() => readRenderedBands(page)).toEqual({
            headerBands: [
                {key: '2026-11-07', width: 136},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-14', width: 136}
            ],
            rowBands: [
                {key: '2026-11-07', width: 136},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-14', width: 136}
            ],
            totalRowBands: 24
        });

        // Setting 2 — Sunday to Thursday: shaded weekends move to Fri–Sat (Nov 6–7, Nov 13–14, Fri Nov 20); holiday stays Nov 11
        const sunThuBtn = page.locator('.site-week-btn').filter({hasText: 'Sunday to Thursday'});
        await sunThuBtn.click();
        await expect(sunThuBtn).toHaveClass(/pressed/);

        await expect.poll(() => readRenderedBands(page)).toEqual({
            headerBands: [
                {key: '2026-11-06', width: 136},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-13', width: 136},
                {key: '2026-11-20', width: 68}
            ],
            rowBands: [
                {key: '2026-11-06', width: 136},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-13', width: 136},
                {key: '2026-11-20', width: 68}
            ],
            totalRowBands: 32
        });
        expect((await readWorkerPlanState(page, SPANNING_IDS)).bookings).toEqual(baselineBookings);
        expect(await readBarWidths()).toEqual(baselineWidths);

        // Setting 3 — Monday to Saturday: only Sundays (Nov 8, Nov 15) + Wed 11 Nov holiday stay shaded
        const monSatBtn = page.locator('.site-week-btn').filter({hasText: 'Monday to Saturday'});
        await monSatBtn.click();
        await expect(monSatBtn).toHaveClass(/pressed/);

        await expect.poll(() => readRenderedBands(page)).toEqual({
            headerBands: [
                {key: '2026-11-08', width: 68},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-15', width: 68}
            ],
            rowBands: [
                {key: '2026-11-08', width: 68},
                {key: '2026-11-11', width: 68},
                {key: '2026-11-15', width: 68}
            ],
            totalRowBands: 24
        });
        expect((await readWorkerPlanState(page, SPANNING_IDS)).bookings).toEqual(baselineBookings);
        expect(await readBarWidths()).toEqual(baselineWidths);

        // Shading switch OFF removes all non-working bands while preserving every booking's dates and length
        const shadingSwitch = page.locator('.site-shading-switch');
        await shadingSwitch.click();
        await expect(shadingSwitch).not.toHaveClass(/pressed/);

        await expect.poll(() => readRenderedBands(page)).toEqual({
            headerBands  : [],
            rowBands     : [],
            totalRowBands: 0
        });
        expect((await readWorkerPlanState(page, SPANNING_IDS)).bookings).toEqual(baselineBookings);
        expect(await readBarWidths()).toEqual(baselineWidths);

        // Toggling shading back ON restores the active working-week shading
        await shadingSwitch.click();
        await expect(shadingSwitch).toHaveClass(/pressed/);
        await expect.poll(async () => (await readRenderedBands(page)).totalRowBands).toBe(24);

        expect(consoleErrors).toEqual([])
    });

    test('renders weekend and holiday shading on the 390x844 mobile first frame and across all five shipped themes without console errors', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 390, height: 844});

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(8);
            await expect.poll(() => page.locator('.site-viewport').evaluate((el, cls) => el.classList.contains(cls), theme)).toBe(true);

            // Both the first weekend (2026-11-07) and the week-two holiday (2026-11-11) sit visibly inside the 390px first frame
            await expect.poll(() => page.evaluate(() => {
                const
                    weekend = document.querySelector('.neo-timeline-header .neo-timeline-non-working[data-day-key="2026-11-07"]')?.getBoundingClientRect(),
                    holiday = document.querySelector('.neo-timeline-header .neo-timeline-non-working[data-day-key="2026-11-11"]')?.getBoundingClientRect();

                return Boolean(weekend && holiday && weekend.width > 0 && holiday.right <= window.innerWidth + 1)
            })).toBe(true);

            // No horizontal document overflow and all 8 crew rows fit unclipped inside 390x844
            const layoutFits = await page.evaluate(() => {
                const lastRow = [...document.querySelectorAll('.neo-scheduler .neo-grid-cell.neo-locked-start')].at(-1)?.getBoundingClientRect();
                return document.documentElement.scrollWidth <= window.innerWidth + 1 && Boolean(lastRow && lastRow.bottom <= window.innerHeight)
            });
            expect(layoutFits, `${theme} fits 390x844 viewport with all 8 crews unclipped`).toBe(true);

            // Both toolbar controls (shading switch + working-week buttons) carry custom non-default styling
            const controlStyles = await page.evaluate(() => ({
                switchBg  : getComputedStyle(document.querySelector('.site-shading-switch')).backgroundColor,
                switchPill: getComputedStyle(document.querySelector('.site-shading-switch')).borderRadius,
                weekBg    : getComputedStyle(document.querySelector('.site-week-btn.pressed')).backgroundColor
            }));
            expect(controlStyles.switchBg).not.toBe('rgba(0, 0, 0, 0)');
            expect(controlStyles.switchPill).toBe('999px');
            expect(controlStyles.weekBg).not.toBe('rgba(0, 0, 0, 0)')
        }

        expect(consoleErrors).toEqual([])
    })
});
