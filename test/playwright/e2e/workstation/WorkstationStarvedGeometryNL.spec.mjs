import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: grid geometry converges without rendering opportunities.
 *
 * A grid acquires geometry once at mount (a paint-independent layout read) and forever after
 * through ResizeObserver deliveries — and BOTH the native observer (spec: deliveries ride
 * rendering opportunities) and the addon's rAF-locked dispatch dam starve in documents that
 * never paint: hidden browser panes, occluded or backgrounded windows. Worker timers and
 * postMessage keep flowing there, so a data-driven grid keeps streaming while a
 * geometry-driven grid fossilizes at its last delivered box (witnessed live: the 100k Matrix
 * booted as a 1-row pool at worker containerWidth 2, and a dock resize left the worker at
 * 335.85 against a 226.05 DOM box until one forced frame flushed it). The repair keeps RO as
 * the fast path and adds two guards in the main-thread addon: a timer arm racing the rAF dam,
 * and a hidden poll that feeds synthetic entries through the same dispatch pipeline.
 *
 * This spec runs the real workstation app under a fully synthetic starvation rig, installed
 * before any app script: the native ResizeObserver replaced with a silent stub (no deliveries,
 * ever), requestAnimationFrame black-holed (no serviced frames), and document.hidden
 * overridden to true (the poll's arming condition). Under that rig, ONLY the new carrier can
 * move geometry to the worker.
 *
 * Worker truth is asserted through its DOM artifact (the same content-space technique the
 * splitter-geometry spec binds): the rendered row pool is sized from worker availableHeight
 * (pool = availableRows + buffer), so the DOM row count is a direct function of the geometry
 * the worker last received. A dead carrier caps it at the mount-time snapshot forever:
 *   1. boot leg — the pool must exceed a 1-row degenerate mount, with cells rendering real
 *      content across mounted columns;
 *   2. geometry-change leg — shrinking the bottom dock zone grows the Matrix pane VERTICALLY;
 *      the row pool can only grow if the worker learned the taller box through the new
 *      carrier (pre-fix it holds at the boot count forever);
 *   3. control legs — the Feed grid keeps painting fresh rows throughout (the ingestion
 *      stream is geometry-independent and must never trade against the geometry stream), and
 *      the rig itself is asserted live (hidden document, frames requested but never serviced)
 *      so a broken rig fails the run instead of green-washing it.
 *
 * All settlement is bounded expect.poll on state — no fixed-delay sleeps. No locator actions:
 * with rAF black-holed, actionability stability checks would hang; the spec drives the page
 * through evaluate() only.
 *
 * Run: npx playwright test WorkstationStarvedGeometryNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation rendering starvation: grid geometry still converges (#16402)', () => {
    test.setTimeout(120000);
    test.use({ viewport: { width: 1280, height: 720 } });

    const GRID_ID      = 'neo-grid-container-1',
          FEED_GRID_ID = 'neo-grid-container-2';

    const readMatrixState = (page, gridId) => page.evaluate(id => {
        const grid  = document.getElementById(id),
              rect  = grid?.getBoundingClientRect(),
              cells = grid ? [...grid.querySelectorAll('[role="gridcell"]')] : [];

        return {
            gridHeight    : rect ? rect.height : -1,
            gridWidth     : rect ? rect.width : -1,
            mountedColumns: new Set(cells.map(cell => cell.getAttribute('aria-colindex')).filter(Boolean)).size,
            renderedCells : cells.filter(cell => cell.textContent.trim().length > 0).length,
            rows          : grid ? grid.querySelectorAll('[role="row"]').length : -1
        }
    }, gridId);

    test('boot pool, geometry change, and feed control under a starved renderer', async ({ page }) => {
        await page.addInitScript(() => {
            // The starvation rig — installed before any app script runs:
            // no native deliveries, no serviced frames, a hidden document.
            window.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };

            window.__starvedFrameRequests = 0;

            window.requestAnimationFrame = () => {
                window.__starvedFrameRequests++;
                return 0
            };
            window.cancelAnimationFrame = () => {};

            Object.defineProperty(Document.prototype, 'hidden', {
                configurable: true,
                get         : () => true
            });
            Object.defineProperty(Document.prototype, 'visibilityState', {
                configurable: true,
                get         : () => 'hidden'
            });
        });

        await page.goto('/apps/workstation/index.html');

        // RIG CONTROL: the app must actually see the starved environment.
        const rig = await page.evaluate(() => ({
            hidden         : document.hidden,
            visibilityState: document.visibilityState
        }));

        expect(rig.hidden).toBe(true);
        expect(rig.visibilityState).toBe('hidden');

        // BOOT LEG: with the native observer silent and no frames, only the hidden poll can
        // carry the Matrix pane's real box to the worker. The row pool (worker
        // availableHeight) must outgrow a degenerate 1-row mount, and cells must render
        // real content across several mounted columns (worker containerWidth windowing).
        await expect.poll(
            async () => (await readMatrixState(page, GRID_ID)).rows,
            { message: 'the Matrix row pool populates without a single rendering opportunity', timeout: 30000 }
        ).toBeGreaterThan(20);

        await expect.poll(
            async () => (await readMatrixState(page, GRID_ID)).renderedCells,
            { message: 'Matrix cells render real content', timeout: 15000 }
        ).toBeGreaterThan(40);

        const bootState = await readMatrixState(page, GRID_ID);

        expect(bootState.mountedColumns, 'boot mounts a real column set')
            .toBeGreaterThanOrEqual(3);

        // FEED CONTROL baseline: the newest feed cell text (a per-batch timestamp/counter).
        const feedSnapshot = () => page.evaluate(id => {
            const grid = document.getElementById(id);
            return grid ? [...grid.querySelectorAll('[role="gridcell"]')].map(cell => cell.textContent).join('|') : ''
        }, FEED_GRID_ID);

        const feedBefore = await feedSnapshot();

        // GEOMETRY-CHANGE LEG: shrinking the bottom dock zone grows the Matrix pane
        // VERTICALLY under starvation. The rendered row pool is a direct function of the
        // worker's availableHeight — it can only grow past its boot count if the worker
        // learned the taller box through a delivery no frame ever carried.
        const {domHeightAfterFlex, freedBandHeight} = await page.evaluate(feedGridId => {
            let zoneChild = document.getElementById(feedGridId);

            while (zoneChild && !zoneChild.parentElement?.classList.contains('neo-dashboard-dock-edge-zone')) {
                zoneChild = zoneChild.parentElement
            }

            const bandHeightBefore = zoneChild.getBoundingClientRect().height;

            // rig mutation, not a product journey: the walk-up lands on the bottom edge band,
            // whose theme floor (min-block-size) would clamp the shrink and starve the trigger
            // of its growth — release it alongside the flex pin
            Object.assign(zoneChild.style, {flex: '0 0 60px', minHeight: '0px'});

            return {
                domHeightAfterFlex: document.getElementById('neo-grid-container-1').getBoundingClientRect().height,
                freedBandHeight   : bandHeightBefore - zoneChild.getBoundingClientRect().height
            }
        }, FEED_GRID_ID);

        const bootRows = bootState.rows;

        // trigger premise, derived from the mutation itself: most of the height the band gave
        // up must arrive at the grid's layout box (a fixed literal here calibrates to one
        // theme era's band chrome and rots when extents or floors change; the layout-chain
        // integrity claim is proportional, and a pipeline that eats the freed space still fails)
        expect(freedBandHeight, 'the rig mutation must actually free band height').toBeGreaterThan(60);
        expect(domHeightAfterFlex - bootState.gridHeight, 'the zone mutation grew the grid layout box (trigger premise)')
            .toBeGreaterThan(freedBandHeight * 0.6);

        await expect.poll(
            async () => (await readMatrixState(page, GRID_ID)).rows,
            { message: 'the taller box grows the row pool without frames', timeout: 15000 }
        ).toBeGreaterThan(bootRows + 1);

        // FEED CONTROL: ingestion kept painting fresh rows while the geometry carrier worked.
        await expect.poll(
            async () => (await feedSnapshot()) !== feedBefore,
            { message: 'the feed grid keeps painting fresh rows throughout', timeout: 10000 }
        ).toBe(true);

        // RIG CONTROL, closing: frames were requested but never serviced — the run really
        // happened under starvation (a rig failure must fail the spec, not green-wash it).
        const frameRequests = await page.evaluate(() => window.__starvedFrameRequests);
        expect(frameRequests).toBeGreaterThan(0)
    });
});
