import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/dragAndResize/index.html',
    THEMES      = [
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
        throw new Error('App Worker not found for SchedulerDragAndResize')
    }

    return worker
}

/**
 * @summary Reads an event record and active scheduler state directly from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {String} eventId
 * @returns {Promise<{endDate: String, minimumDuration: Number, resourceId: String, snapMinutes: Number, startDate: String, title: String, vanCount: Number}>}
 */
async function readWorkerBooking(page, eventId) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    return getAppWorker(page).evaluate(id => {
        const
            scheduler = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.scheduler.Container'),
            record    = scheduler?.resolveEventRecord(id);

        return {
            endDate        : record?.endDate?.toISOString() ?? null,
            minimumDuration: scheduler?.minimumDuration ?? null,
            resourceId     : record?.resourceId ?? null,
            snapMinutes    : scheduler?.timeAxis?.snapMinutes ?? null,
            startDate      : record?.startDate?.toISOString() ?? null,
            title          : record?.title ?? null,
            vanCount       : scheduler?.store?.getCount() ?? 0
        }
    }, eventId)
}

test.describe('Scheduler dragAndResize example', () => {
    test('re-plans stops across vans on 15m and 30m snap grids, clamps resize at minimumDuration, and supports keyboard rescheduling', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(EXAMPLE_URL);

        // AC-1: Opens on the depot's day with all ten vans and an instructional status prompt
        await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(10);
        await expect(page.locator('.neo-scheduler .neo-timeline-track')).toHaveCount(10);
        await expect(page.locator('.depot-status-pill')).toHaveText('Ready');
        await expect(page.locator('.depot-status-text')).toContainText('Drag Stop 14 onto Van 3');

        const initial = await readWorkerBooking(page, 'stop-14');
        expect(initial).toEqual({
            endDate        : '2026-11-20T07:45:00.000Z',
            minimumDuration: 30,
            resourceId     : 'van-4',
            snapMinutes    : 15,
            startDate      : '2026-11-20T07:15:00.000Z',
            title          : 'Stop 14',
            vanCount       : 10
        });

        // Drag Stop 9 right +132 px (preview Moving), return to start, and release -> status restores Ready
        const stop9 = page.locator('.neo-timeline-bar[data-event-id="stop-9"]');
        await expect(stop9).toBeVisible();
        const
            stop9Box = await stop9.boundingBox(),
            s9X      = stop9Box.x + stop9Box.width / 2,
            s9Y      = stop9Box.y + stop9Box.height / 2;

        await page.mouse.move(s9X, s9Y);
        await page.mouse.down();
        await page.mouse.move(s9X + 132, s9Y, {steps: 10});
        await expect(page.locator('.depot-status-pill')).toHaveText('Moving');
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 9 → Van 3, 09:30 to 10:45');
        await page.mouse.move(s9X, s9Y, {steps: 10});
        await page.mouse.up();
        await expect(page.locator('.depot-status-pill')).toHaveText('Ready');
        await expect(page.locator('.depot-status-text')).toContainText('Drag Stop 14 onto Van 3');

        // AC-2 & AC-4: Drag Stop 14 from Van 4 (07:15–07:45) onto Van 3 near ~10:17 (snaps to 10:15 on 15-min grid)
        const stop14  = page.locator('.neo-timeline-bar[data-event-id="stop-14"]');
        const van3Row = page.locator('.neo-scheduler .neo-grid-row').filter({hasText: 'Van 3'}).first();
        await expect(stop14).toBeVisible();
        await expect(van3Row).toBeVisible();

        const
            stopBox = await stop14.boundingBox(),
            van3Box = await van3Row.boundingBox(),
            startX  = stopBox.x + stopBox.width / 2,
            startY  = stopBox.y + stopBox.height / 2,
            // +180 min at 2.2 px/min = 396 px; +401 px (+182.3 min) must snap cleanly to +180 min (10:15)
            dropX   = startX + 401,
            dropY   = van3Box.y + van3Box.height / 2;

        // 30-min Stop 14 label renders whole without ellipsis truncation
        const labelFits = await stop14.locator('.neo-timeline-bar-label').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
        expect(labelFits).toBe(true);

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(dropX, dropY, {steps: 14});

        const proxy = page.locator('.neo-dragproxy');
        await expect(proxy).toBeVisible();
        await expect(page.locator('.depot-status-pill')).toHaveText('Moving');
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 10:15 to 10:45');
        await expect.poll(() => stop14.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');

        await page.mouse.up();
        await expect(proxy).toHaveCount(0);

        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate   : '2026-11-20T10:45:00.000Z',
            resourceId: 'van-3',
            startDate : '2026-11-20T10:15:00.000Z'
        });
        await expect(page.locator('.depot-status-pill')).toHaveText('Moved');
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 10:15 to 10:45');

        // Pull right edge of already-30-min Stop 14 inward -> clamps at 30m (no change) and restores Moved on release
        const
            clampBox  = await stop14.boundingBox(),
            clampEdge = await stop14.locator('.neo-resizable-end').boundingBox(),
            cx        = clampEdge.x + clampEdge.width / 2,
            cy        = clampBox.y + clampBox.height * 0.75;

        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx - 60, cy, {steps: 8});
        await expect(page.locator('.depot-status-pill')).toHaveText('Resizing');
        await page.mouse.up();
        await expect(page.locator('.depot-status-pill')).toHaveText('Moved');
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 10:15 to 10:45');

        // Resize right edge outward by ~+16.4 min (+36 px at 2.2 px/min) -> grows in 15-min steps to 11:00 (45 min)
        const
            movedBox = await stop14.boundingBox(),
            endEdge  = await stop14.locator('.neo-resizable-end').boundingBox(),
            rx       = endEdge.x + endEdge.width / 2,
            ry       = movedBox.y + movedBox.height * 0.75;

        await page.mouse.move(rx, ry);
        await page.mouse.down();
        await page.mouse.move(rx + 36, ry, {steps: 10});
        await expect(proxy).toBeVisible();
        await expect(page.locator('.depot-status-pill')).toHaveText('Resizing');
        await page.mouse.up();

        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate   : '2026-11-20T11:00:00.000Z',
            resourceId: 'van-3',
            startDate : '2026-11-20T10:15:00.000Z'
        });
        await expect(page.locator('.depot-status-pill')).toHaveText('Resized');
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 10:15 to 11:00');

        // Resize right edge far left (-140 px, well past startDate) -> clamps at 30-min minimumDuration (10:15 to 10:45)
        const
            grownBox  = await stop14.boundingBox(),
            grownEdge = await stop14.locator('.neo-resizable-end').boundingBox(),
            shrinkX   = grownEdge.x + grownEdge.width / 2,
            shrinkY   = grownBox.y + grownBox.height * 0.75;

        await page.mouse.move(shrinkX, shrinkY);
        await page.mouse.down();
        await page.mouse.move(shrinkX - 140, shrinkY, {steps: 12});
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 10:15 to 10:45');
        await page.mouse.up();

        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate   : '2026-11-20T10:45:00.000Z',
            resourceId: 'van-3',
            startDate : '2026-11-20T10:15:00.000Z'
        });

        // Switch snap grid to 30m in toolbar and verify drag snaps to 30-minute boundary (11:00)
        const snap30 = page.locator('.depot-snap-btn').filter({hasText: '30m'});
        await snap30.click();
        await expect(snap30).toHaveClass(/pressed/);
        await expect.poll(async () => (await readWorkerBooking(page, 'stop-14')).snapMinutes).toBe(30);

        const
            clampedBox = await stop14.boundingBox(),
            move30X    = clampedBox.x + clampedBox.width / 2,
            move30Y    = clampedBox.y + clampedBox.height / 2;

        // +95 px (~43.2 min from 10:15 = 10:58) -> snaps to 07:00 + 240 min = 11:00 on 30-min grid
        await page.mouse.move(move30X, move30Y);
        await page.mouse.down();
        await page.mouse.move(move30X + 95, move30Y, {steps: 10});
        await page.mouse.up();

        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate   : '2026-11-20T11:30:00.000Z',
            resourceId: 'van-3',
            startDate : '2026-11-20T11:00:00.000Z'
        });
        await expect(page.locator('.depot-status-text')).toHaveText('Stop 14 → Van 3, 11:00 to 11:30');

        // AC-3: Keyboard move (ArrowLeft -> -30m) and keyboard resize (Shift+ArrowRight -> +30m, Shift+ArrowLeft x2 -> clamps at 30m)
        await stop14.focus();
        await page.keyboard.press('ArrowLeft');
        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate  : '2026-11-20T11:00:00.000Z',
            startDate: '2026-11-20T10:30:00.000Z'
        });

        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate  : '2026-11-20T11:30:00.000Z',
            startDate: '2026-11-20T10:30:00.000Z'
        });

        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.press('Shift+ArrowLeft');
        await expect.poll(() => readWorkerBooking(page, 'stop-14')).toMatchObject({
            endDate  : '2026-11-20T11:00:00.000Z',
            startDate: '2026-11-20T10:30:00.000Z'
        });

        expect(consoleErrors).toEqual([])
    });

    test('renders cleanly at 390x844 mobile and across all five shipped themes without console errors', async ({page}) => {
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
            await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(10);
            await expect.poll(() => page.locator('.depot-viewport').evaluate((el, cls) => el.classList.contains(cls), theme)).toBe(true);

            // No horizontal document overflow at 390x844
            const docFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
            expect(docFits, `${theme} fits 390px viewport without document overflow`).toBe(true);

            // Every toolbar snap button carries custom non-default styling
            const snapBg = await page.locator('.depot-snap-btn.pressed').evaluate(el => getComputedStyle(el).backgroundColor);
            expect(snapBg).not.toBe('rgba(0, 0, 0, 0)')
        }

        expect(consoleErrors).toEqual([])
    })
});
