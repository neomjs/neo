import { test, expect } from '../../fixtures.mjs';

/**
 * @summary Whitebox witness — grid focus ownership + the input-modality ring contract after the multi-body split.
 *
 * `grid.View` is the single focus anchor for the multi-body grid: its outer element is programmatically
 * focusable (`tabIndex:-1`), so a row activation in ANY body (`bodyStart`/`body`/`bodyEnd`) resolves to ONE
 * View-owned focus state instead of an accidental per-body ring. The catch (exact-head, rebuilt themes): the
 * focus is an async worker→Main `DomAccess.focus` message, so `:focus-visible` reports true and the UA ring
 * survives — the browser cannot tie the programmatic focus back to the originating pointer gesture. The fix
 * makes modality an explicit contract: `DomAccess.focus` stamps `neo-focus-pointer` immediately before
 * `node.focus()` (atomic, no flash), which suppresses the ring; the class self-clears on blur or the first
 * keydown, so a pointer→keyboard switch WITHOUT a blur restores the intentional keyboard ring.
 *
 * This asserts the observable contract the unit suite cannot reach, against REBUILT themes (a stale-CSS run
 * false-greened the prior receipt): per-body View ownership, the atomic pointer stamp + no ring, the positive
 * keyboard ring after the modality switch, blur cleanup, and preventScroll at a genuinely non-zero offset.
 */
test.describe('Desktop (1920x1080): grid View-owned focus + input-modality ring (#15195)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500);
    });

    test('pointer focus in ANY body → View, no ring, atomic stamp; keyboard switch restores the ring; blur clears; scroll stable across the focus transfer', async ({ page, neuralLink }) => {
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

        // Reads the View's live focus/modality state in one round-trip.
        const readFocus = () => page.evaluate(vId => {
            const el = document.getElementById(vId);
            return {
                active  : document.activeElement?.id ?? '',
                outline : getComputedStyle(el).outlineStyle,
                pointer : el.classList.contains('neo-focus-pointer'),
                keyboard: el.classList.contains('neo-focus-keyboard')
            };
        }, viewId);

        // The grid is transform-virtualized: the live scroll offset is the View's `scrollTop` config,
        // driven by the wheel/scrollbar handler (the DOM element's native scrollTop stays 0).
        const scrollTop = async () => (await app.getComponent(gridId, ['view.scrollTop']))['view.scrollTop'];

        // AC-1 + AC-2 (ownership + atomic stamp + no ring): a pointer row-click in EACH physical body resolves
        // to ONE View-owned focus state; once the async focus lands, `neo-focus-pointer` is already present and
        // the outline is none — the class and focus arrived atomically, so no accidental ring is observable.
        for (const [region, bodyId] of regions) {
            const row = page.locator(`#${bodyId} .neo-grid-row`).first();
            await expect(row, `${region} exposes a visible row`).toBeVisible();
            await row.click();

            await expect.poll(async () => (await readFocus()).active, {
                timeout: 5000, message: `a pointer row-click in ${region} focuses the View, not the body`
            }).toBe(viewId);

            const f = await readFocus();
            expect(f.pointer, `pointer focus stamps neo-focus-pointer atomically (${region})`).toBe(true);
            expect(f.outline, `the View's pointer focus paints no accidental ring (${region})`).toBe('none');
        }

        // AC-2 (cleanup on blur): blurring the pointer-focused View clears the modality class.
        await page.evaluate(vId => document.getElementById(vId).blur(), viewId);
        await expect.poll(async () => (await readFocus()).pointer, {
            timeout: 5000, message: 'blur clears the pointer modality class'
        }).toBe(false);

        const centerBodyId = regions[1][1];
        // A distinct, untouched row (Section A only clicked the first row) — a fresh single-selection,
        // so the assertion does not depend on toggle parity from the earlier per-body clicks.
        const navRow = page.locator(`#${centerBodyId} .neo-grid-row`).nth(2);
        const navRec = await navRow.getAttribute('data-record-id');

        // AC-3 (positive keyboard witness + pointer→keyboard cleanup): a keyboard interaction on the
        // pointer-focused View swaps the modality WITHOUT a blur, so the intentional ring returns while the
        // View keeps focus, and keyboard nav still moves the selection through the View's keys.
        await navRow.click();
        await expect.poll(async () => (await readFocus()).active, { timeout: 5000 }).toBe(viewId);
        await expect(navRow, 'the clicked row is selected').toHaveClass(/neo-selected/);

        await page.keyboard.press('ArrowDown');

        await expect.poll(async () => (await readFocus()).keyboard, {
            timeout: 5000, message: 'the first keydown swaps pointer→keyboard modality without an intervening blur'
        }).toBe(true);

        const afterKey = await readFocus();
        expect(afterKey.pointer, 'the pointer modality class is cleared after the switch').toBe(false);
        expect(afterKey.active,  'the View retains focus through the pointer→keyboard switch').toBe(viewId);
        expect(afterKey.outline, 'the intentional keyboard ring is painted after the modality switch').not.toBe('none');
        await expect(
            page.locator(`#${centerBodyId} .neo-grid-row[data-record-id="${navRec}"]`),
            'ArrowDown moves selection off the clicked row — keyboard nav preserved through the View'
        ).not.toHaveClass(/neo-selected/);

        // AC (preventScroll): a pointer row-click focuses the View WITHOUT disturbing the scroll position.
        // The lockedColumns example holds 8 rows — they fit any normal viewport, so `view.scrollTop` is
        // structurally 0 and the grid is not row-scrollable here. This witnesses scroll STABILITY across the
        // focus transfer at the natural offset; a non-zero-offset preventScroll witness needs a big-data grid
        // harness (called out in the PR body as a follow-up).
        const scrollBefore = await scrollTop();
        await page.locator(`#${centerBodyId} .neo-grid-row`).first().click();
        await page.waitForTimeout(300);
        const scrollAfter = await scrollTop();
        expect(scrollAfter, 'a row-click focus transfer preserves the scroll position (preventScroll)').toBe(scrollBefore);
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
