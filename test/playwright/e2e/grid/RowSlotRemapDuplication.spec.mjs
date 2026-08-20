/**
 * @file test/playwright/e2e/grid/RowSlotRemapDuplication.spec.mjs
 * @summary When a record is remapped onto a different pool slot, it must not stay painted in the old one.
 *
 * `Body#createViewData` assigns records to a FIXED pool by `rowIndex % poolSize`, and every write it
 * makes — the used-slot loop and the unused-slot clear alike — passes `silent: true`. Nothing is
 * flushed inside `createViewData` on that path; the whole render depends on the single bounded
 * `update()` its caller issues afterwards. A write the flush fails to carry leaves the DOM showing
 * whatever that slot last rendered.
 *
 * ## What actually remaps a slot, which is NOT scrolling
 *
 * A record's slot is `storeIndex % poolSize` — a function of the record's own index. Scrolling changes
 * which records are visible; it never changes a visible record's index, so under pure scrolling a
 * record cannot move slots. Measured, not assumed: an earlier revision of this spec scrolled and found
 * 14 surviving records with **0** remapped, and its non-vacuity guard failed rather than letting a
 * meaningless green through.
 *
 * Slots are remapped by anything that RENUMBERS records — a filter, a sort, an insert or removal.
 * Filtering to a smaller set moves surviving records to new indices and therefore to new slots, and
 * shrinks the used set so the clear path runs too. That is the gesture this spec drives.
 *
 * ## The instrument is DOM-only, deliberately
 *
 * `Row#createVdom` writes `data: {recordId, rowId: rowIndex}`, and the cleared path writes
 * `vdom.style = {display: 'none'}`. Painted truth therefore carries its own identity and its own
 * visibility, and no worker access is needed to judge it: one record shown by two visible rows is a
 * defect on the face of the DOM.
 *
 * Credit to @neo-opus-ada, who observed the symptom downstream — two records, four live rows, every
 * field identical — and established that the pairing is systematic rather than coincidental.
 *
 * @see Neo.grid.Body#createViewData
 * @see Neo.grid.View#syncBodies
 * @see Neo.grid.Row#createVdom
 */
import {expect, test} from '@playwright/test';

test.describe('Grid row pooling across a slot remap', () => {
    /**
     * Reads every rendered row's painted identity. `hidden` comes from the inline style the cleared
     * path writes, so a row emptied worker-side but never repainted still reports VISIBLE — which is
     * exactly the state under test.
     *
     * @returns {Promise<Object[]>} `{elementId, recordId, rowId, hidden}` per row, in DOM order
     */
    const readRows = page => page.evaluate(() => {
        const body = document.querySelector('.neo-grid-body');

        if (!body) return [];

        return [...body.querySelectorAll('[role="row"]')].map(row => ({
            elementId: row.id || null,
            recordId : row.dataset.recordId ?? null,
            rowId    : row.dataset.rowId ?? null,
            hidden   : row.style.display === 'none'
        }))
    });

    const visible = rows => rows.filter(row => !row.hidden && row.recordId !== null),
          slotMap = rows => Object.fromEntries(rows.map(row => [row.recordId, row.elementId]));

    test('a record remapped onto a new pool slot is not left painted in the old one', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"]', {timeout: 60000});
        await page.waitForTimeout(700);

        // Scroll away from the top first. At index 0 the visible range and the pool are aligned, which
        // is the one position where a remap is least likely to expose an uncarried write.
        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(700);

        const before      = visible(await readRows(page)),
              beforeIds   = before.map(row => row.recordId),
              beforeSlots = slotMap(before);

        expect(before.length, 'rows are rendered before the filter').toBeGreaterThan(3);

        // Precondition: coherent BEFORE the gesture, so a pre-existing duplicate cannot be blamed on it.
        expect(new Set(beforeIds).size, `before the filter, every visible row shows a distinct record: ${beforeIds.join()}`)
            .toBe(beforeIds.length);

        // Apply a firstname filter. This renumbers the surviving records — the operation that actually
        // moves a record onto a different pool slot — and shrinks the used set so the clear path runs.
        await page.locator('.controls-container-button').first().click();
        await page.waitForTimeout(500);
        await page.locator('#neo-textfield-1__input').fill('a');
        await page.waitForTimeout(1200);

        const after      = visible(await readRows(page)),
              afterIds   = after.map(row => row.recordId),
              afterSlots = slotMap(after);

        expect(after.length, 'rows are still rendered after the filter').toBeGreaterThan(0);

        // NON-VACUITY. The filter must have changed the painted set, AND at least one surviving record
        // must now sit in a different pool element. Without the second arm this passes against a grid
        // that never remapped anything, which is the case an earlier revision of this spec hit.
        const survivors = afterIds.filter(id => id in beforeSlots),
              remapped  = survivors.filter(id => afterSlots[id] !== beforeSlots[id]);

        expect(afterIds.join(), 'the filter actually changed the rendered rows').not.toBe(beforeIds.join());
        expect(remapped.length, `at least one surviving record moved pool element (survivors: ${survivors.length})`)
            .toBeGreaterThan(0);

        // THE DEFECT. A record left painted in the slot it vacated is shown twice.
        const duplicates = [...new Set(afterIds.filter((id, index) => afterIds.indexOf(id) !== index))];

        expect(duplicates, `no record is painted by two visible rows at once (duplicated: ${duplicates.join() || 'none'})`)
            .toEqual([]);

        // The same defect seen from the row's own index, which is written from `rowIndex` rather than
        // from the record — so it still holds on a fixture whose records are not uniquely identified.
        const rowIds     = after.map(row => row.rowId),
              rowIdDupes = [...new Set(rowIds.filter((id, index) => rowIds.indexOf(id) !== index))];

        expect(rowIdDupes, `no two visible rows claim the same row index (duplicated: ${rowIdDupes.join() || 'none'})`)
            .toEqual([])
    });

    /**
     * The second remap driver, and the one closer to the original downstream report: the store's
     * record set is REPLACED rather than filtered. `onAmountRowsChange` assigns `store.amountRows`,
     * which regenerates the records — so every index is renumbered against a different population,
     * and shrinking it also strands pool slots the clear path must empty.
     *
     * Filtering (above) narrows one population; replacement swaps it. They are different operations
     * and only one of them was exercised before, so the passing filter case is not evidence for this.
     */
    test('a store replacement that renumbers and shrinks leaves no record painted twice', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"]', {timeout: 60000});
        await page.waitForTimeout(700);

        const box = await page.locator('.neo-grid-view').boundingBox();

        // Scroll deep enough that the visible range sits well past the incoming store's size, so the
        // replacement must both renumber AND strand slots rather than merely re-filling them.
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(800);

        const before      = visible(await readRows(page)),
              beforeIds   = before.map(row => row.recordId),
              beforeSlots = slotMap(before);

        expect(before.length, 'rows are rendered before the replacement').toBeGreaterThan(3);
        expect(new Set(beforeIds).size, 'before the replacement, every visible row shows a distinct record')
            .toBe(beforeIds.length);

        // 20,000 -> 1,000. The combobox is not editable, so the value is chosen from its list.
        await page.locator('.controls-container-button').first().click();
        await page.waitForTimeout(500);
        await page.locator('#neo-combobox-1__input').click();
        await page.waitForTimeout(400);
        await page.getByRole('option', {name: '1000', exact: true}).click();
        await page.waitForTimeout(1600);

        const after      = visible(await readRows(page)),
              afterIds   = after.map(row => row.recordId),
              afterSlots = slotMap(after);

        expect(after.length, 'rows are rendered after the replacement').toBeGreaterThan(0);

        // NON-VACUITY: the population must actually have changed under the rows.
        expect(afterIds.join(), 'the replacement actually changed the rendered rows').not.toBe(beforeIds.join());

        const survivors = afterIds.filter(id => id in beforeSlots),
              remapped  = survivors.filter(id => afterSlots[id] !== beforeSlots[id]);

        // Survivors are not guaranteed here — a replacement may share no record with the old view —
        // so the remap arm is asserted only when there is something to remap, and the population
        // change above carries non-vacuity on its own.
        survivors.length > 0 && expect(remapped.length,
            `a surviving record moved pool element (survivors: ${survivors.length})`).toBeGreaterThan(0);

        const duplicates = [...new Set(afterIds.filter((id, index) => afterIds.indexOf(id) !== index))];

        expect(duplicates, `no record is painted by two visible rows at once (duplicated: ${duplicates.join() || 'none'})`)
            .toEqual([]);

        const rowIds     = after.map(row => row.rowId),
              rowIdDupes = [...new Set(rowIds.filter((id, index) => rowIds.indexOf(id) !== index))];

        expect(rowIdDupes, `no two visible rows claim the same row index (duplicated: ${rowIdDupes.join() || 'none'})`)
            .toEqual([])
    });

    /**
     * The regime the original downstream report was actually in, which neither case above reaches:
     * a record set far SMALLER than the row pool. There the used-slot loop touches a handful of
     * slots and the unused-slot clear owns all the rest — so the clear path, not the re-fill path,
     * decides what the DOM shows. The report was two records against four live row elements.
     *
     * Both filters are applied so the surviving set is a few records out of the pool, and the
     * precondition asserts we are genuinely in that regime (visible rows strictly fewer than pool
     * elements) rather than merely filtering a large set to a slightly smaller one.
     */
    test('a record set far smaller than the pool leaves no stale row painted beside the survivors', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"]', {timeout: 60000});
        await page.waitForTimeout(700);

        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(700);

        await page.locator('.controls-container-button').first().click();
        await page.waitForTimeout(500);
        await page.locator('#neo-textfield-1__input').fill('Tobias');
        await page.waitForTimeout(900);
        await page.locator('#neo-textfield-2__input').fill('Uhlig');
        await page.waitForTimeout(1600);

        const all     = await readRows(page),
              shown   = visible(all),
              shownId = shown.map(row => row.recordId);

        // PRECONDITION — we are in the small-set regime. The pool must be larger than the surviving
        // record set, which is what makes the unused-slot clear the deciding path. Without this the
        // case degenerates into the filter test above and proves nothing new.
        expect(all.length, 'the row pool is materialised').toBeGreaterThan(3);
        expect(shown.length, 'the double filter left a non-empty set').toBeGreaterThan(0);
        expect(shown.length,
            `the surviving set is smaller than the pool (${shown.length} shown of ${all.length} pool elements)`)
            .toBeLessThan(all.length);

        // THE DEFECT, in the shape the downstream envelope reported it: more painted rows than
        // records, with a record appearing twice.
        const duplicates = [...new Set(shownId.filter((id, index) => shownId.indexOf(id) !== index))];

        expect(duplicates,
            `no record is painted twice while the pool is over-sized (shown: ${shownId.join() || 'none'})`)
            .toEqual([]);

        const rowIds     = shown.map(row => row.rowId),
              rowIdDupes = [...new Set(rowIds.filter((id, index) => rowIds.indexOf(id) !== index))];

        expect(rowIdDupes, `no two visible rows claim the same row index (duplicated: ${rowIdDupes.join() || 'none'})`)
            .toEqual([]);

        // Every stranded slot is genuinely hidden rather than left painting its previous record —
        // the property the silent clear path is responsible for.
        const strandedButVisible = all.filter(row => !row.hidden && row.recordId === null);

        expect(strandedButVisible, 'a cleared pool element is not left visible without a record').toEqual([])
    })
});
