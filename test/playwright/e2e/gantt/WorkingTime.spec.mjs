import {test, expect} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/gantt/workingTime/index.html';

const THEMES = [
    'neo-theme-neo-dark',
    'neo-theme-neo-light',
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-cyberpunk'
];

/**
 * Evaluates a snapshot of key task dates directly inside the App Worker without external Brain dependencies.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readScheduleState(page) {
    const appWorker = await expect.poll(() => page.workers().find(w => w.url().includes('worker/App'))).toBeTruthy()
        .then(() => page.workers().find(w => w.url().includes('worker/App')));

    return appWorker.evaluate(() => {
        const
            gantt = Neo.manager.Instance.findFirst({ntype: 'gantt'}),
            store = gantt?.store,
            iso   = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10),
            pick  = id => {
                const r = store.get(id);
                return {
                    duration : r.duration,
                    endDate  : iso(r.endDate),
                    startDate: iso(r.startDate)
                }
            };

        return {
            count         : store.getCount(),
            t3            : pick('t3'),
            t5            : pick('t5'),
            t6            : pick('t6'),
            t12           : pick('t12'),
            useWorkingTime: gantt.useWorkingTime
        }
    })
}

test.describe('Gantt working days example (#21623)', () => {
    test('evaluates a 5-day Thursday task across a weekend and holiday, updates ends & successors on switch, and snaps Saturday drops', async ({page}) => {
        const errors = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text())
            }
        });
        page.on('pageerror', err => errors.push(err.message));
        page.on('response', res => {
            if (res.status() === 404) {
                errors.push(`404: ${res.url()}`)
            }
        });

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator('.kitchen-bar-hero')).toBeVisible();
        await expect(page.locator('.neo-timeline-non-working[data-day-key="2026-11-12"]').first()).toBeVisible();

        // AC-1 & AC-4: First frame — working days ON (`useWorkingTime: true`) on fixed dates
        // `t3` ("Rough plumbing & gas", 5d) starts Thu 2026-11-05, spans Sat 7–Sun 8, and finishes end of Wed 2026-11-11 (`2026-11-12`).
        // `t5` (3d) crosses Thu 2026-11-12 holiday (`2026-11-10` -> `2026-11-14`); `t6` (2d, FS `t3`) skips Thu 2026-11-12 holiday to start Fri `2026-11-13`.
        const initial = await readScheduleState(page);
        expect(initial.count).toBe(12);
        expect(initial.useWorkingTime).toBe(true);
        expect(initial.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-12'});
        expect(initial.t5).toEqual({duration: 3, startDate: '2026-11-10', endDate: '2026-11-14'});
        expect(initial.t6).toEqual({duration: 2, startDate: '2026-11-13', endDate: '2026-11-17'});
        expect(initial.t12).toEqual({duration: 1, startDate: '2026-11-20', endDate: '2026-11-21'});

        // AC-2 & AC-4: Switch working days OFF -> `t3` ends 2 days earlier (`2026-11-10`), `t6` starts `2026-11-10` (3 days earlier), `t12` moves up to `2026-11-16`
        await page.locator('.kitchen-working-switch').click();

        await expect.poll(async () => (await readScheduleState(page)).useWorkingTime).toBe(false);
        const calendarMode = await readScheduleState(page);
        expect(calendarMode.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-10'});
        expect(calendarMode.t5).toEqual({duration: 3, startDate: '2026-11-08', endDate: '2026-11-11'});
        expect(calendarMode.t6).toEqual({duration: 2, startDate: '2026-11-10', endDate: '2026-11-12'});
        expect(calendarMode.t12).toEqual({duration: 1, startDate: '2026-11-15', endDate: '2026-11-16'});

        // Switch working days back ON -> restores exact working-calendar schedule
        await page.locator('.kitchen-working-switch').click();
        await expect.poll(async () => (await readScheduleState(page)).useWorkingTime).toBe(true);
        const restored = await readScheduleState(page);
        expect(restored.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-12'});
        expect(restored.t6).toEqual({duration: 2, startDate: '2026-11-13', endDate: '2026-11-17'});

        // AC-3 empirical verification: dropping `t3` onto Saturday `2026-11-07` (+2 days = +126px at 63px/day)
        // snaps `startDate` forward to Monday `2026-11-09` (`snapToWorkingTime(startMs, 1)`) and advances `endDate`
        // across the `2026-11-12` holiday + `Sat 14–Sun 15` weekend to `2026-11-17` (5 working days: Mon 9, Tue 10, Wed 11, Fri 13, Mon 16).
        const
            heroBar = page.locator('.kitchen-bar-hero'),
            barBox  = await heroBar.boundingBox(),
            startX  = barBox.x + 40,
            startY  = barBox.y + barBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 126, startY, {steps: 10});
        await page.mouse.up();

        await expect.poll(async () => (await readScheduleState(page)).t3.startDate).toBe('2026-11-09');
        const afterSaturdayDrop = await readScheduleState(page);
        expect(afterSaturdayDrop.t3).toEqual({duration: 5, startDate: '2026-11-09', endDate: '2026-11-17'});

        expect(errors).toEqual([])
    });

    test('renders cleanly across all five themes at 1440x900 and 390x844 with custom toolbar controls', async ({page}) => {
        const errors = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text())
            }
        });
        page.on('pageerror', err => errors.push(err.message));
        page.on('response', res => {
            if (res.status() === 404) {
                errors.push(`404: ${res.url()}`)
            }
        });

        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);

                await expect(page.locator('.kitchen-bar-hero')).toBeVisible();

                const switchRadius = await page.locator('.kitchen-working-switch').evaluate(el => getComputedStyle(el).borderRadius);
                const resetRadius  = await page.locator('.kitchen-reset-btn').evaluate(el => getComputedStyle(el).borderRadius);
                expect(parseFloat(switchRadius)).toBeGreaterThanOrEqual(12);
                expect(parseFloat(resetRadius)).toBeGreaterThanOrEqual(12)
            }
        }

        expect(errors).toEqual([])
    });
});
