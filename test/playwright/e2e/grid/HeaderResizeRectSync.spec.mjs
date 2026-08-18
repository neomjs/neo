import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox-e2e: header↔cell rect synchronization across a real column RESIZE, asserted
 * where it actually breaks — AFTER the drop.
 *
 * ## Why a second spec, next to a net that already asserts this exact property
 *
 * `HeaderCellRectSync.spec.mjs` already pairs every visible header rect against its first-row cell
 * rect on x and width, at mid-drag hold points and after every drop. It is the right net. It has
 * never once fired on a resize defect, and it structurally cannot: its only gesture is a column
 * REORDER, grabbed at the button's centre via `.neo-draggable`. Resize is armed exclusively from
 * `.neo-resizable` (the right-edge handle), and `grid.header.Toolbar#createSortZone` sets
 * `ignoreDragSelector: '.neo-resizable'` so the two gestures provably never overlap. A
 * reorder-driven spec therefore cannot reach the resize path, however many passes it runs.
 *
 * So the assertion core below is deliberately the same shape; only the DRIVER is new. The
 * separation that makes both features correct is what left half of the property uncovered.
 *
 * ## Gesture realism
 *
 * The resize handles are not in the DOM at rest — `plugin.Resizable#onMouseMove` injects them when
 * the pointer is over a header button. So the hover is load-bearing setup, not padding: without it
 * there is nothing to grab, and a spec that skipped it would fail for the wrong reason. The drag
 * itself must be a real stepped mouse gesture; a synthetic worker-side event does not arm Neo's
 * Mouse drag sensor and would green-wash the whole class.
 *
 * ## What it covers
 *
 * Both directions (widen AND narrow — the 9k-era defect was shrink-only, and a widen-only spec
 * re-opens that blind spot), on the fixed-px surface. The dynamic-width surface takes a
 * structurally different branch in `passSizeToBody` (it awaits a DOM measurement) and needs its
 * own case.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/grid/HeaderResizeRectSync.spec.mjs --workers=1
 */
test.describe('Grid header↔cell rect sync across a column resize', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1600, height: 900}});

    /** Visible headers + first-row cells, x-sorted and clipped to the body box. */
    const readPairs = page => page.evaluate(() => {
        const body   = document.querySelector('.neo-grid-body'),
              clip   = body.getBoundingClientRect(),
              inClip = r => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1;

        const toolbar = document.querySelector('.neo-grid-header-toolbar'),
              headers = [...toolbar.children]
                  .map(b => ({b, r: b.getBoundingClientRect()}))
                  .filter(({b, r}) => inClip(r) && getComputedStyle(b).visibility !== 'hidden')
                  .map(({b, r}) => ({
                      text: b.querySelector('.neo-button-text')?.textContent ?? b.id,
                      x   : Math.round(r.left),
                      w   : Math.round(r.width)
                  }))
                  .sort((a, b2) => a.x - b2.x);

        const row   = body.querySelector('[role="row"]'),
              cells = [...row.children]
                  .map(c => ({c, r: c.getBoundingClientRect()}))
                  .filter(({c, r}) => inClip(r) && getComputedStyle(c).display !== 'none')
                  .map(({c, r}) => ({
                      id: c.id.split('__').pop(),
                      x : Math.round(r.left),
                      w : Math.round(r.width)
                  }))
                  .sort((a, b2) => a.x - b2.x);

        return {headers, cells};
    });

    /**
     * Every visible header must sit pixel-exactly on a first-row cell. A drop that leaves the cells
     * on the pre-drag geometry fails every lookup at and after the resized column and prints both
     * rect sets, so the failure names the offending column and the offset rather than a bare count.
     */
    const assertAligned = ({headers, cells}, label) => {
        const dump = `headers=${JSON.stringify(headers)} cells=${JSON.stringify(cells)}`;

        expect(headers.length, `${label}: visible header/cell count parity — ${dump}`).toBe(cells.length);

        headers.forEach(h => {
            const c = cells.find(cell => Math.abs(cell.x - h.x) <= 1);

            expect(c, `${label}: no cell under header "${h.text}" (x=${h.x}, w=${h.w}) — ${dump}`).toBeDefined();
            expect(Math.abs(h.w - c.w), `${label}: width mismatch for "${h.text}": header w=${h.w} vs cell "${c.id}" w=${c.w}`)
                .toBeLessThanOrEqual(1)
        })
    };

    /**
     * One real resize: hover the button to materialize the handle, grab it, drag `delta` px with a
     * stepped move, drop. Returns the button's pre-drag box so the caller can assert the intent
     * actually landed rather than trusting that the gesture engaged at all.
     */
    const resizeColumn = async (page, headerText, delta) => {
        const header = page.locator('.neo-grid-header-button', {hasText: headerText}).first();

        await expect(header).toBeVisible({timeout: 15000});

        const box = await header.boundingBox(),
              y   = box.y + box.height / 2,
              x   = box.x + box.width - 3;

        // the handles are injected on hover — without this there is nothing to grab
        await page.mouse.move(x, y);
        await expect(header.locator('.neo-resizable-right')).toBeAttached({timeout: 5000});

        await page.mouse.down();
        await page.mouse.move(x + delta, y, {steps: 40});
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForTimeout(900);

        return box
    };

    test('widening a column moves its cells with it', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await expect(page.locator('[role="grid"]').first()).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible({timeout: 30000});
        await page.waitForTimeout(600);

        assertAligned(await readPairs(page), 'baseline');

        const before = await resizeColumn(page, 'Number 7', 160);

        // the gesture must have actually resized something, or the parity below is vacuous
        const after = await page.locator('.neo-grid-header-button', {hasText: 'Number 7'}).first().boundingBox();

        expect(after.width, `the widen gesture engaged (before=${before.width} after=${after.width})`)
            .toBeGreaterThan(before.width + 20);

        assertAligned(await readPairs(page), 'after widening "Number 7"')
    });

    test('narrowing a column moves its cells with it', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await expect(page.locator('[role="grid"]').first()).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible({timeout: 30000});
        await page.waitForTimeout(600);

        assertAligned(await readPairs(page), 'baseline');

        // widen first: the column ships at the 100px `columnDefaults` width and `minWidth` is 100,
        // so there is no room to shrink from the shipped size — the narrow leg needs headroom, and
        // taking it through a real resize keeps the whole gesture chain under test.
        await resizeColumn(page, 'Number 7', 200);
        assertAligned(await readPairs(page), 'after the setup widen');

        const before = await resizeColumn(page, 'Number 7', -120),
              after  = await page.locator('.neo-grid-header-button', {hasText: 'Number 7'}).first().boundingBox();

        expect(after.width, `the narrow gesture engaged (before=${before.width} after=${after.width})`)
            .toBeLessThan(before.width - 20);

        assertAligned(await readPairs(page), 'after narrowing "Number 7"')
    })
});
