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

    /**
     * Visible headers + first-row cells, x-sorted and clipped to the body box.
     *
     * The region index matters on a locked grid: a grid owns up to three toolbar/body pairs and
     * `grid.header.Toolbar#body` routes between them, so a pairing read that always took index 0
     * would silently assert the locked-start region while the gesture happened in the centre.
     */
    const readPairs = (page, region = 0) => page.evaluate(({region}) => {
        const body   = document.querySelectorAll('.neo-grid-body')[region],
              clip   = body.getBoundingClientRect(),
              inClip = r => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1;

        const toolbar = document.querySelectorAll('.neo-grid-header-toolbar')[region],
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
    }, {region});

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
    });

    /**
     * The MIXED surface: one genuinely flex-sized column beside explicitly-sized ones.
     *
     * This is the case the per-column width decision exists for. When the toolbar contains any
     * column whose width only layout can answer, the geometry pass still has to measure — but it
     * must measure ONLY that column, and keep reading the explicit px widths from the configs that
     * own them. Sizing the whole header from one layout read is what let a stale rect repaint every
     * cell; a spec that only ever runs all-explicit columns cannot tell the two designs apart.
     */
    test('a flex column beside explicit ones does not drag the others onto a stale measurement', async ({page, neuralLink}) => {
        await page.goto('/examples/grid/bigData/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await expect(page.locator('[role="grid"]').first()).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible({timeout: 30000});
        await page.waitForTimeout(600);

        const app     = await neuralLink.connectToApp('Neo.examples.grid.bigData'),
              buttons = await app.queryComponent({className: 'Neo.grid.header.Button'}, ['dataField', 'id']),
              flexCol = buttons.find(b => b.properties.dataField === 'number13');

        expect(flexCol, 'the surface exposes a column to make dynamic').toBeTruthy();

        // make it genuinely measured: no explicit width, a real flex value
        await app.setProperties(flexCol.properties.id, {flex: 1, width: null});
        await page.waitForTimeout(800);

        assertAligned(await readPairs(page), 'baseline with a flex column present');

        const before = await resizeColumn(page, 'Number 7', 160),
              after  = await page.locator('.neo-grid-header-button', {hasText: 'Number 7'}).first().boundingBox();

        expect(after.width, `the widen gesture engaged (before=${before.width} after=${after.width})`)
            .toBeGreaterThan(before.width + 20);

        assertAligned(await readPairs(page), 'after widening beside a flex column')
    });

    /**
     * The LOCKED surface: a grid owning three toolbar/body pairs.
     *
     * `grid.header.Toolbar#body` routes each toolbar to its own region's body, and the geometry
     * pass this fix changes runs per toolbar. So a resize in the centre must move the centre's
     * cells and leave the locked regions exactly where they were — a repair that accidentally
     * sized every region from the centre's items would still satisfy the single-body specs above.
     */
    test('resizing a centre column leaves the locked regions untouched', async ({page}) => {
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await expect(page.locator('[role="grid"]').first()).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-grid-body [role="row"]').first()).toBeVisible({timeout: 30000});
        await page.waitForTimeout(800);

        const lockedBefore = await readPairs(page, 0);

        assertAligned(lockedBefore, 'locked-start baseline');
        assertAligned(await readPairs(page, 1), 'centre baseline');

        // the centre toolbar owns the resizable target; grab its first header
        const centreHeader = page.locator('.neo-grid-header-toolbar').nth(1).locator('.neo-grid-header-button').first(),
              label        = (await centreHeader.locator('.neo-button-text').innerText()).trim();

        const box = await centreHeader.boundingBox(),
              y   = box.y + box.height / 2,
              x   = box.x + box.width - 3;

        await page.mouse.move(x, y);
        await expect(centreHeader.locator('.neo-resizable-right')).toBeAttached({timeout: 5000});
        await page.mouse.down();
        await page.mouse.move(x + 140, y, {steps: 40});
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForTimeout(900);

        const after = await centreHeader.boundingBox();

        expect(after.width, `the centre widen engaged on "${label}" (before=${box.width} after=${after.width})`)
            .toBeGreaterThan(box.width + 20);

        assertAligned(await readPairs(page, 1), `centre after widening "${label}"`);

        // the locked region is not a participant in this gesture and must not have moved
        const lockedAfter = await readPairs(page, 0);

        assertAligned(lockedAfter, 'locked-start after the centre resize');
        expect(JSON.stringify(lockedAfter.cells), 'the locked-start cells are byte-identical across a centre resize')
            .toBe(JSON.stringify(lockedBefore.cells))
    })
});
