import { test, expect } from '../fixtures.mjs';

/**
 * Whitebox-e2e: header↔cell rect synchronization through repeated drag passes.
 *
 * The grid renders column headers (header toolbar buttons) and body cells from two different
 * scroll mechanisms: the toolbar scrolls natively, while body cells render against the scroll
 * SSOT (the ScrollManager's value, applied via the grid's scroll CSS var). A browser reflow
 * during a drag's lift/switch frames can clamp the toolbar's NATIVE scrollLeft while the SSOT —
 * and therefore every cell — stays put. The result is a whole-strip offset: every header covers
 * the wrong cell span (perceived width shrink), the last column clips out of view, and the
 * desync survives switch-backs within the same drag because nothing re-applies the toolbar's
 * scrollLeft until drag-end.
 *
 * The net below is deliberately layer-agnostic: after horizontal scrolling, it drags a centre
 * column back and forth across its neighbours MULTIPLE times and, at every hold point and after
 * every drop, asserts that each visible header's rect (x, width) matches its first-row cell's
 * rect pairwise. ANY mechanism that lets the header layer drift from the cell layer — scroll
 * clamps, width churn, stale transforms, lost re-renders — fails these assertions with the
 * exact offending column and offset in the message.
 *
 * Gesture realism matters: the failure class lives in main-thread reflow behavior, so the drag
 * MUST be a real mouse gesture (page.mouse with stepped moves arms Neo's Mouse drag sensor);
 * worker-side synthetic events cannot trigger native scroll clamping and would green-wash this.
 *
 * Surface: the canonical locked-column fixture — its centre region overflows by design, giving
 * the toolbar real native scroll to clamp. Pairing scope: centre toolbar ↔ centre body (body-1).
 *
 * Run: npx playwright test GridHeaderCellRectSync -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Grid header↔cell rect sync through drag passes (#12955)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    /** Reads the visible centre headers + body-1 row-0 cells, x-sorted, clipped to the body box. */
    const readPairs = page => page.evaluate(() => {
        const body = document.getElementById('neo-grid-body-1');
        const clip = body.getBoundingClientRect();
        const inClip = r => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1;

        const toolbar = document.querySelectorAll('.neo-grid-header-toolbar')[1];
        const headers = [...toolbar.children]
            .map(b => ({b, r: b.getBoundingClientRect()}))
            .filter(({b, r}) => inClip(r) && getComputedStyle(b).visibility !== 'hidden')
            .map(({b, r}) => ({
                text: b.querySelector('.neo-button-text')?.textContent ?? b.id,
                x   : Math.round(r.left),
                w   : Math.round(r.width)
            }))
            .sort((a, b2) => a.x - b2.x);

        const row   = body.querySelector('[role="row"]');
        const cells = [...row.children]
            .map(c => ({c, r: c.getBoundingClientRect()}))
            .filter(({c, r}) => inClip(r) && getComputedStyle(c).display !== 'none')
            .map(({c, r}) => ({
                id: c.id.split('__').pop(),
                x : Math.round(r.left),
                w : Math.round(r.width)
            }))
            .sort((a, b2) => a.x - b2.x);

        // per-layer scroll context — pins WHICH layer drifted when the pairing fails
        const scrollCtx = {
            toolbarScrollLeft: toolbar.scrollLeft,
            toolbarLeft      : Math.round(toolbar.getBoundingClientRect().left),
            bodyScrollLeft   : body.scrollLeft,
            bodyLeft         : Math.round(clip.left),
            rowTransform     : getComputedStyle(row).transform,
            scrollVar        : getComputedStyle(body).getPropertyValue('--grid-scroll-left') ||
                               getComputedStyle(body.parentElement).getPropertyValue('--grid-scroll-left')
        };

        return {headers, cells, scrollCtx};
    });

    /**
     * Every visible header must sit pixel-exactly on a first-row cell: for each header, a cell
     * with the same x (±1px) and the same width (±1px) must exist. Mid-drag the dragged column's
     * header is lifted (visibility) and excluded by the read; its orphan cell is tolerated via
     * `midDrag`. After a drop, counts must match exactly. A layer offset of ANY size fails every
     * header's lookup and prints both rect sets for diagnosis.
     */
    const assertAligned = ({headers, cells, scrollCtx}, label, midDrag = false) => {
        const dump = `scroll=${JSON.stringify(scrollCtx)} headers=${JSON.stringify(headers)} cells=${JSON.stringify(cells)}`;

        if (!midDrag) {
            expect(headers.length, `${label}: visible header/cell count parity — ${dump}`).toBe(cells.length);
        }

        headers.forEach(h => {
            const c = cells.find(cell => Math.abs(cell.x - h.x) <= 1);
            expect(c, `${label}: no cell under header "${h.text}" (x=${h.x}, w=${h.w}) — ${dump}`).toBeDefined();
            expect(Math.abs(h.w - c.w), `${label}: width mismatch for "${h.text}": header w=${h.w} vs cell "${c.id}" w=${c.w}`)
                .toBeLessThanOrEqual(1);
        });
    };

    test('repeated back-and-forth drag keeps every header rect locked to its cell rect', async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(600);

        // give the centre toolbar real native scroll — the precondition of the clamp class
        const gridBox = await page.locator('[role="grid"]').first().boundingBox();
        await page.mouse.move(gridBox.x + gridBox.width / 2, gridBox.y + gridBox.height / 2);
        for (let i = 0; i < 6; i++) {
            await page.mouse.wheel(800, 0);
            await page.waitForTimeout(120);
        }
        await page.waitForTimeout(600);

        assertAligned(await readPairs(page), 'baseline (scrolled right)');

        const centerToolbar = page.locator('.neo-grid-header-toolbar').nth(1);
        const DRAG = '2011'; // the LAST centre column — lifting at max-right scroll is the clamp class's precondition

        for (let pass = 1; pass <= 2; pass++) {
            const src    = centerToolbar.locator('.neo-draggable', { hasText: DRAG }).first();
            await expect(src).toBeVisible({ timeout: 5000 });
            const srcBox = await src.boundingBox();
            const y      = srcBox.y + srcBox.height / 2;
            const step   = 110; // one year-column width — guarantees neighbour switches

            await page.mouse.move(srcBox.x + srcBox.width / 2, y);
            await page.mouse.down();

            // slide LEFT across two neighbours
            await page.mouse.move(srcBox.x + srcBox.width / 2 - 2 * step, y, { steps: 50 });
            await page.waitForTimeout(750);
            assertAligned(await readPairs(page), `pass ${pass}: mid-drag after sliding left`, true);

            // slide back RIGHT within the same drag op
            await page.mouse.move(srcBox.x + srcBox.width / 2, y, { steps: 50 });
            await page.waitForTimeout(750);
            assertAligned(await readPairs(page), `pass ${pass}: mid-drag after sliding back`, true);

            await page.mouse.up();
            await page.waitForTimeout(900);
            assertAligned(await readPairs(page), `pass ${pass}: after drop`);
        }
    });
});
