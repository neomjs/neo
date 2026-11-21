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
    test('evaluates a 5-day Thursday task across weekends and a holiday, reschedules via Neo.gantt.Container, and verifies Saturday drops in both modes', async ({page}) => {
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
        await expect(page.locator('.neo-timeline-non-working[data-day-key="2026-11-07"]').first()).toBeVisible();
        await expect(page.locator('.neo-timeline-non-working[data-day-key="2026-11-12"]').first()).toBeVisible();
        await expect(page.locator('.neo-timeline-non-working[data-day-key="2026-11-14"]').first()).toBeVisible();

        const appWorker = page.workers().find(w => w.url().includes('worker/App'));
        await appWorker.evaluate(() => {
            const gantt = Neo.manager.Instance.findFirst({ntype: 'gantt'});
            globalThis.__taskChanges = 0;
            gantt.on('taskChange', () => { globalThis.__taskChanges++ })
        });
        await page.evaluate(() => {
            Neo.config.logDeltaUpdates = true;
            window.__observedUpdates   = 0;
            window.__idlessInserts     = 0;

            const orig = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    window.__observedUpdates++;
                    const
                        data   = args[3],
                        deltas = Array.isArray(data) ? data : (data?.deltas || []);

                    window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id && !d.vnode?.id).length
                }
                orig(...args)
            }
        });

        // AC-1 & AC-4: First frame — working days ON (`useWorkingTime: true`) on fixed dates
        const initial = await readScheduleState(page);
        expect(initial.count).toBe(12);
        expect(initial.useWorkingTime).toBe(true);
        expect(initial.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-12'});
        expect(initial.t5).toEqual({duration: 3, startDate: '2026-11-10', endDate: '2026-11-14'});
        expect(initial.t6).toEqual({duration: 2, startDate: '2026-11-13', endDate: '2026-11-17'});
        expect(initial.t12).toEqual({duration: 1, startDate: '2026-11-20', endDate: '2026-11-21'});

        // AC-2 & AC-4: Switch working days OFF -> `Neo.gantt.Container` reschedules and emits `taskChange`
        await page.locator('.kitchen-working-switch').click();

        await expect.poll(async () => (await readScheduleState(page)).useWorkingTime).toBe(false);
        const calendarMode = await readScheduleState(page);
        expect(calendarMode.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-10'});
        expect(calendarMode.t5).toEqual({duration: 3, startDate: '2026-11-08', endDate: '2026-11-11'});
        expect(calendarMode.t6).toEqual({duration: 2, startDate: '2026-11-10', endDate: '2026-11-12'});
        expect(calendarMode.t12).toEqual({duration: 1, startDate: '2026-11-15', endDate: '2026-11-16'});
        expect(await appWorker.evaluate(() => globalThis.__taskChanges)).toBe(1);

        // AC-3 (mode OFF): Dragging `t3` (+2 days) onto Saturday `2026-11-07` while `useWorkingTime` is `false`
        // lands directly on Saturday `2026-11-07` and counts 5 calendar days (`2026-11-12`).
        const
            heroBar    = page.locator('.kitchen-bar-hero'),
            holidayBox = await page.locator('.neo-timeline-non-working[data-day-key="2026-11-12"]').first().boundingBox(),
            dayPx      = holidayBox.width;

        await expect.poll(async () => Math.abs((await heroBar.boundingBox()).width - 5 * dayPx)).toBeLessThanOrEqual(2);

        const
            offBox    = await heroBar.boundingBox(),
            offStartX = offBox.x + 24,
            offStartY = offBox.y + offBox.height / 2;

        await page.mouse.move(offStartX, offStartY);
        await page.mouse.down();
        await page.mouse.move(offStartX + Math.round(2 * dayPx), offStartY, {steps: 10});
        await page.mouse.up();

        await expect.poll(async () => (await readScheduleState(page)).t3.startDate).toBe('2026-11-07');
        const afterOffSaturdayDrop = await readScheduleState(page);
        expect(afterOffSaturdayDrop.t3).toEqual({duration: 5, startDate: '2026-11-07', endDate: '2026-11-12'});

        // Switching working days back ON preserves `t3`'s hand-placed offset (snapping Saturday forward to Monday `2026-11-09`)
        await page.locator('.kitchen-working-switch').click();
        await expect.poll(async () => (await readScheduleState(page)).useWorkingTime).toBe(true);
        const preservedAfterSwitch = await readScheduleState(page);
        expect(preservedAfterSwitch.t3).toEqual({duration: 5, startDate: '2026-11-09', endDate: '2026-11-17'});

        // Reset restores seeded working-calendar schedule (`t3` at `2026-11-05..2026-11-12`)
        await page.locator('.kitchen-reset-btn').click();
        await expect.poll(async () => (await readScheduleState(page)).t3.startDate).toBe('2026-11-05');
        const restored = await readScheduleState(page);
        expect(restored.t3).toEqual({duration: 5, startDate: '2026-11-05', endDate: '2026-11-12'});
        expect(restored.t6).toEqual({duration: 2, startDate: '2026-11-13', endDate: '2026-11-17'});

        // AC-3 (mode ON): Dragging `t3` (+2 days) onto Saturday `2026-11-07` while `useWorkingTime` is `true`
        // snaps `startDate` forward to Monday `2026-11-09` and evaluates 5 working days across `2026-11-12` + weekend to `2026-11-17`.
        await expect.poll(async () => Math.abs((await heroBar.boundingBox()).width - 7 * dayPx)).toBeLessThanOrEqual(2);

        const
            onBox    = await heroBar.boundingBox(),
            onStartX = onBox.x + 24,
            onStartY = onBox.y + onBox.height / 2;

        await page.mouse.move(onStartX, onStartY);
        await page.mouse.down();
        await page.mouse.move(onStartX + Math.round(2 * dayPx), onStartY, {steps: 10});
        await page.mouse.up();

        await expect.poll(async () => (await readScheduleState(page)).t3.startDate).toBe('2026-11-09');
        const afterOnSaturdayDrop = await readScheduleState(page);
        expect(afterOnSaturdayDrop.t3).toEqual({duration: 5, startDate: '2026-11-09', endDate: '2026-11-17'});
        expect(afterOnSaturdayDrop.t12).toEqual({duration: 1, startDate: '2026-11-24', endDate: '2026-11-25'});

        const deltaStats = await page.evaluate(() => ({
            idlessInserts  : window.__idlessInserts,
            observedUpdates: window.__observedUpdates
        }));
        expect(deltaStats.observedUpdates).toBeGreaterThan(0);
        expect(deltaStats.idlessInserts).toBe(0);
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
