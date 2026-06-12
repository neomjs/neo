import { test, expect } from '../fixtures.mjs';

/**
 * Whitebox-e2e: under horizontal scroll the centre cells translate optically while the locked-region
 * cells (start AND end) stay visually stationary — and they stay frozen through a large scroll that
 * recycles the centre's mounted-column window (virtualization), not just a small optical nudge.
 *
 * This restores REAL locked-cell coverage. The original probe lived in GridThumbDragDevIndex against
 * the devindex app, whose locked columns were since removed — there `.neo-locked-start` /
 * `.neo-locked-end` cells no longer exist, so the stability assertions passed vacuously (null === null).
 * On the lockedColumns fixture the locked regions are real, and the single-column locked-end region
 * renders its cells (the engine fix for the zero-row locked-end body), so both stability checks assert
 * against actual rendered cells. The test fails loudly if either locked region is absent — no vacuous pass.
 *
 * Run: npx playwright test GridLockedCellHorizontalStability -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Desktop (1920x1080): lockedColumns Fixture — locked cells stay frozen under horizontal scroll', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500); // settle render before measuring
    });

    test('locked-start AND locked-end cells stay put through optical + large (recycling) horizontal scroll', async ({ page, neuralLink }) => {
        // Worker precondition: the locked-end body actually rendered rows (the regression this builds on),
        // and identify the centre body (the overflowing region — most columns) for the recycle check.
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const bodies = await app.findInstances({ className: 'Neo.grid.Body' }, ['id', 'items.length', 'mountedColumns', 'columnPositions.count']);
        expect(bodies.length, 'three region bodies').toBe(3);
        bodies.forEach(b => expect(b.properties?.['items.length'], `body ${b.id} rows`).toBeGreaterThan(0));

        const centre        = bodies.map(b => b.properties).sort((a, b) => b['columnPositions.count'] - a['columnPositions.count'])[0];
        const centreId      = centre.id;
        const mountedBefore = JSON.stringify(centre.mountedColumns);

        const result = await page.evaluate(async () => {
            const hScrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');
            if (!hScrollbar) return { error: 'horizontal scrollbar not found' };

            const firstCenterLeft = () => {
                const c = document.querySelector('.neo-grid-row .neo-grid-cell:not(.neo-locked-start):not(.neo-locked-end)');
                return c ? c.getBoundingClientRect().left : null;
            };
            const lockedLefts = () => {
                const s = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-start');
                const e = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-end');
                return { startLeft: s ? s.getBoundingClientRect().left : null, endLeft: e ? e.getBoundingClientRect().left : null };
            };

            const initialCenter = firstCenterLeft();
            const initialLocked = lockedLefts();

            // 1. Moderate horizontal scroll → optical CSS translation of the centre region.
            hScrollbar.scrollLeft += 100;
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));

            const instantCenter = firstCenterLeft();
            const instantLocked = lockedLefts();

            // 2. Large scroll → recycle the centre's mounted-column window (virtualization) via the
            //    app-worker round-trip. Locked cells must stay frozen through this too.
            hScrollbar.scrollLeft += 2000;
            await new Promise(r => setTimeout(r, 500));

            const afterLargeLocked = lockedLefts();

            return {
                centerPresent         : initialCenter !== null,
                lockedStartPresent    : initialLocked.startLeft !== null,
                lockedEndPresent      : initialLocked.endLeft !== null,
                pixelShift            : (initialCenter !== null && instantCenter !== null) ? initialCenter - instantCenter : null,
                lockedStartStable     : initialLocked.startLeft === instantLocked.startLeft,
                lockedEndStable       : initialLocked.endLeft === instantLocked.endLeft,
                lockedStartStableLarge: initialLocked.startLeft === afterLargeLocked.startLeft,
                lockedEndStableLarge  : initialLocked.endLeft === afterLargeLocked.endLeft
            };
        });

        // Recycle signal (worker oracle): the centre's mounted-column window shifted after the large scroll.
        const mountedAfter = JSON.stringify((await app.getComponent(centreId, ['mountedColumns']))['mountedColumns']);

        console.log('[locked-cell-hscroll]', JSON.stringify({ ...result, mountedBefore, mountedAfter }));

        expect(result.error).toBeUndefined();

        // Non-vacuity: all three regions must have rendered cells (esp. locked-end — the regression target).
        expect(result.centerPresent,      'centre cells present').toBe(true);
        expect(result.lockedStartPresent, 'locked-start cells present').toBe(true);
        expect(result.lockedEndPresent,   'locked-end cells present (no vacuous pass)').toBe(true);

        // Centre cells physically shifted left as we scrolled right (optical translation).
        expect(result.pixelShift,         'centre cells translated left under optical scroll').toBeGreaterThan(0);

        // Locked regions stayed stationary through BOTH the optical scroll and the large/recycling scroll.
        expect(result.lockedStartStable,      'locked-start stayed put (optical scroll)').toBe(true);
        expect(result.lockedEndStable,        'locked-end stayed put (optical scroll)').toBe(true);
        expect(result.lockedStartStableLarge, 'locked-start stayed put through the large/recycling scroll').toBe(true);
        expect(result.lockedEndStableLarge,   'locked-end stayed put through the large/recycling scroll').toBe(true);

        // The large scroll actually recycled the centre's mounted-column window — backs the large-scroll
        // leg with evidence rather than claiming virtualization without asserting it.
        expect(mountedAfter, 'centre mounted-column window shifted after the large scroll (recycle)').not.toBe(mountedBefore);
    });
});
