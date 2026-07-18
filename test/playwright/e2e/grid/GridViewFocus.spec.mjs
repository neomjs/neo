import { test, expect } from '../../fixtures.mjs';

/**
 * @summary Whitebox witness — grid focus ownership after the multi-body split.
 *
 * Before the fix, `Body.onRowClick` focused the physical body that received the event; each of the
 * three bodies (`bodyStart`/`body`/`bodyEnd`) carried `tabIndex:-1` with no outline contract, so a
 * pointer row-click left an accidental user-agent focus ring and split focus across three delegates
 * while selection ownership was already View-centralized. The fix makes `grid.View` the single focus
 * anchor. This asserts the observable contract the unit suite cannot reach: a pointer row-click in
 * ANY body resolves to ONE View-owned `document.activeElement`, the pointer focus paints no outline
 * ring, the focus transfer preserves scroll position, and keyboard navigation still moves selection.
 */
test.describe('Desktop (1920x1080): grid View-owned focus after the multi-body split (#15195)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500);
    });

    test('a pointer row-click in ANY of the three bodies focuses the View (not the body); no ring, scroll stable, keyboard nav preserved', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);

        await app.setProperties(gridId, { 'body.selectionModel': { ntype: 'selection-grid-rowmodel' } });
        await expect.poll(async () =>
            (await app.getComponent(gridId, ['view.selectionModel.id']))['view.selectionModel.id'],
            { timeout: 5000 }
        ).toBeTruthy();

        const props   = await app.getComponent(gridId, ['bodyStart.id', 'body.id', 'bodyEnd.id', 'view.id']);
        const viewId  = props['view.id'];
        const regions = [['bodyStart', props['bodyStart.id']], ['body', props['body.id']], ['bodyEnd', props['bodyEnd.id']]];

        expect(viewId, 'the grid.View id resolves').toBeTruthy();

        // AC: ONE View-owned focus state — a pointer row-click in EACH physical body focuses the View,
        // never the body. The focus is a worker → Main-thread `DomAccess.focus` message (async), so
        // poll for it to land rather than reading activeElement synchronously after the click.
        for (const [region, bodyId] of regions) {
            const row = page.locator(`#${bodyId} .neo-grid-row`).first();
            await expect(row, `${region} exposes a visible row`).toBeVisible();
            await row.click();

            await expect.poll(
                () => page.evaluate(() => document.activeElement?.id ?? ''),
                { timeout: 5000, message: `a pointer row-click in ${region} focuses the View, not the body` }
            ).toBe(viewId);

            // The View's pointer/programmatic focus paints no accidental outline ring.
            const outline = await page.evaluate(vId => getComputedStyle(document.getElementById(vId)).outlineStyle, viewId);
            expect(outline, `the View's pointer focus paints no outline ring (${region})`).toBe('none');
        }

        const centerBodyId = regions[1][1];

        // AC: the row-click focus transfer preserves scroll position (preventScroll).
        const scrollBefore = (await app.getComponent(gridId, ['view.scrollTop']))['view.scrollTop'];
        await page.locator(`#${centerBodyId} .neo-grid-row`).first().click();
        const scrollAfter = (await app.getComponent(gridId, ['view.scrollTop']))['view.scrollTop'];
        expect(scrollAfter, 'a row-click focus transfer does not move the scroll position').toBe(scrollBefore);

        // AC: keyboard navigation still moves selection after a pointer activation — the View's `keys`
        // (RowModel Up/Down, registered on view.keys) fire with focus on the View.
        const row0 = page.locator(`#${centerBodyId} .neo-grid-row`).nth(0);
        const rec0 = await row0.getAttribute('data-record-id');
        await row0.click();
        await expect(row0).toHaveClass(/neo-selected/);
        await page.keyboard.press('ArrowDown');
        await expect(
            page.locator(`#${centerBodyId} .neo-grid-row[data-record-id="${rec0}"]`),
            'ArrowDown moves selection off the clicked row — keyboard nav preserved through the View'
        ).not.toHaveClass(/neo-selected/);
    });
});

/**
 * Resolves the grid-container instance id from the bound App Worker.
 * @param {Object} app
 * @returns {Promise<String>}
 */
async function resolveGridId(app) {
    const grids  = await app.findInstances({ ntype: 'grid-container' }, ['id']);
    const gridId = Array.isArray(grids) ? grids[0]?.id : grids?.id;

    expect(gridId, 'a grid-container instance must exist in the bound App Worker').toBeTruthy();

    return gridId;
}
