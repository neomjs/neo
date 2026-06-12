import { test, expect } from '../fixtures.mjs';

/**
 * Whitebox-e2e regression guard: every grid region body renders its rows — including a
 * single-column locked-end region.
 *
 * A single-column region has a width-invariant mounted-column range of [0, 0]. The row render
 * used to be reachable only as a side effect of that range *changing* when the body was measured,
 * so a single-column locked-end body mounted 0 rows while the multi-column center / locked-start
 * bodies rendered all of them. This spec pins each region body to the store's row count via the
 * App-Worker consistency oracle (logical items / vdom / rendered DOM must agree).
 *
 * Run: npx playwright test GridLockedRegionRowRender -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Desktop (1920x1080): lockedColumns Fixture — every region body renders its rows', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500); // settle render before measuring
    });

    test('all three region bodies — incl. single-column locked-end — mount every store row (items/vdom/DOM agree)', async ({ page, neuralLink }) => {
        const app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');

        // Worker precondition: a genuine three-region topology with a non-empty locked-end region
        // (the bug's surface). The region column arrays are the engine's own region model.
        // findInstances returns each match as {className, id, properties:{...requested...}}.
        const grids = await app.findInstances({ ntype: 'grid-container' }, ['id', 'store.count', 'lockedStartColumns', 'lockedEndColumns']);
        const grid  = (Array.isArray(grids) ? grids[0] : grids) || {};
        const gp    = grid.properties || {};
        expect(grid.id, 'a grid-container must exist in the bound App Worker').toBeTruthy();

        const rowCount = gp['store.count'];
        expect(rowCount, 'fixture store must have rows').toBeGreaterThan(0);
        expect((gp.lockedStartColumns || []).length, 'fixture has a locked-start region').toBeGreaterThan(0);
        expect((gp.lockedEndColumns   || []).length, 'fixture has a locked-end region (the regression surface)').toBeGreaterThan(0);

        // The three region bodies: locked-start, center, locked-end.
        const bodies = await app.findInstances({ className: 'Neo.grid.Body' }, ['id', 'items.length']);
        expect(bodies.length, 'three region bodies expected (locked-start / center / locked-end)').toBe(3);

        // Worker oracle: each body's logical row pool, vdom and rendered DOM all hold every store row.
        // The single-column locked-end body is the regression target — it used to report 0 here.
        for (const body of bodies) {
            expect(body.properties?.['items.length'], `body ${body.id}: logical row pool`).toBe(rowCount);

            const check = await app.verifyComponentConsistency(body.id);
            expect(check.consistent,   `body ${body.id}: items/vdom/DOM must agree`).toBe(true);
            expect(check.counts.dom,   `body ${body.id}: rendered DOM rows`).toBe(rowCount);
            expect(check.counts.items, `body ${body.id}: logical rows`).toBe(rowCount);
            expect(check.counts.vdom,  `body ${body.id}: vdom rows`).toBe(rowCount);
        }
    });
});
