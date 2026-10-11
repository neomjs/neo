/**
 * @file test/playwright/e2e/grid/RowSlotRemapDuplication.spec.mjs
 * @summary A record must not be painted by two rows at once, and a row the worker cleared must not
 * stay painted.
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
 * meaningless green through. That measurement falsified the scroll-driven mechanism this file was
 * originally written against.
 *
 * Slots are remapped by anything that RENUMBERS records — a filter, a sort, an insert or removal.
 *
 * ## Two planes, because one of them cannot see the decisive state
 *
 * **The DOM proves painted duplication.** `Row#createVdom` writes `data: {recordId, rowId: rowIndex}`,
 * so one record shown by two visible rows is a defect on the face of the DOM and needs no worker access.
 *
 * **The DOM cannot prove the cleared-but-painted case, and an earlier revision of this spec claimed it
 * could.** On `record === null`, `Row#createVdom` (`src/grid/Row.mjs:321-325`) sets
 * `vdom.style = {display: 'none'}` and returns *early* — it never rewrites `vdom.data`. So a row the
 * worker cleared, whose clear the bounded flush failed to carry, still presents in the DOM with its
 * PREVIOUS non-null `data-record-id`, its previous `data-row-id`, and no `display: none`. A predicate
 * looking for a visible row whose DOM `recordId` is `null` can never match it. Worker truth is the
 * only discriminator, so these tests read it through the Neural Link and join it to the DOM by element
 * id. Credit to @neo-gpt-emmy, who found that false-green in review rather than letting it ship.
 *
 * ## Which arm actually exercises which plane — measured, not assumed
 *
 * Mutation receipt: inverting the visibility term of the cleared-but-painted predicate (so it matches
 * cleared rows that ARE hidden) turns **driver 3 red and leaves drivers 1 and 2 green**. That is the
 * honest reach of this spec:
 *
 * | driver | painted-duplication plane | cleared-but-painted plane |
 * |---|---|---|
 * | 1 filter renumber   | load-bearing, unconditional remap control | present, but **vacuous** — this regime strands no slot |
 * | 2 store replacement | load-bearing, conditional remap control   | present, but **vacuous** — same reason |
 * | 3 small set         | load-bearing                              | **load-bearing**, with a precondition asserting the clear ran |
 *
 * The cleared-plane assertion is kept on all three because it costs nothing and would catch a
 * regression that started stranding slots in drivers 1 or 2. It is only *claimed* as coverage for
 * driver 3, which is the regime the downstream report was in and the only one that proves the clear
 * path ran at all.
 *
 * Credit to @neo-opus-ada, who observed the symptom downstream — two records, four live rows, every
 * field identical — and later corrected the report's shape from her own capture's body ids.
 *
 * @see Neo.grid.Body#createViewData
 * @see Neo.grid.Row#createVdom
 */
import {expect, test} from '../../fixtures.mjs';

test.describe('Grid row pooling across a slot remap', () => {
    /**
     * Reads every rendered row's painted identity from the committed DOM.
     *
     * @returns {Promise<Object[]>} `{elementId, recordId, rowId, hidden}` per row, in DOM order
     */
    const readDomRows = page => page.evaluate(() => {
        const body = document.querySelector('.neo-grid-body');

        if (!body) return [];

        return [...body.querySelectorAll('[role="row"]')].map(row => ({
            elementId: row.id || null,
            recordId : row.dataset.recordId ?? null,
            rowId    : row.dataset.rowId ?? null,
            hidden   : row.style.display === 'none'
        }))
    });

    /**
     * Reads worker-side truth for every `grid.Row` instance: whether it currently holds a record at
     * all. Only nullness is taken, deliberately — the DOM's `data-record-id` comes from
     * `Body#getRecordId`, which resolves through `store.getInternalId` or `store.getKey`, and
     * reproducing that resolution in a test would assert the test's copy of the rule rather than the
     * rule. Nullness needs no such reproduction and is the discriminator the DOM lacks.
     *
     * @returns {Promise<Object>} `elementId -> {hasRecord, rowIndex}`
     */
    const readWorkerRows = async app => {
        const rows = await app.findInstances({ntype: 'grid-row'}, ['id', 'record', 'rowIndex']);

        return Object.fromEntries((rows || []).map(row => {
            const props = row.properties || {};

            return [props.id ?? row.id, {
                hasRecord: (props.record ?? null) !== null,
                rowIndex : props.rowIndex
            }]
        }))
    };

    /**
     * Joins committed DOM against worker truth. Rows the worker does not know about are dropped rather
     * than guessed at; the join is DOM-driven because the DOM is what the user sees.
     *
     * @returns {Object} `{painted, clearedButPainted, workerClearedCount, joinedCount}`
     */
    const joinPlanes = (domRows, workerRows) => {
        const joined = domRows.filter(row => workerRows[row.elementId]);

        return {
            painted           : domRows.filter(row => !row.hidden && row.recordId !== null),
            // THE DISCRIMINATOR the DOM alone cannot express: the worker cleared this row, and the DOM
            // is still painting it. Its stale `data-record-id` is non-null, so no DOM-only predicate
            // sees it.
            clearedButPainted : joined.filter(row => !workerRows[row.elementId].hasRecord && !row.hidden),
            workerClearedCount: joined.filter(row => !workerRows[row.elementId].hasRecord).length,
            joinedCount       : joined.length
        }
    };

    const idsOf   = rows => rows.map(row => row.recordId),
          slotMap = rows => Object.fromEntries(rows.map(row => [row.recordId, row.elementId])),
          dupes   = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

    /**
     * Asserts the painted-duplication properties every arm owns, plus the worker-plane clear check.
     *
     * The clear check is load-bearing ONLY where the caller has asserted `workerClearedCount > 0`
     * (driver 3). Elsewhere it is a free safety net over a regime that currently strands no slot —
     * see the mutation table in the file docblock. Do not read a green here as evidence the clear
     * path was exercised; that is what the precondition is for.
     */
    const assertNoDoublePaint = ({painted, clearedButPainted}, label) => {
        expect(dupes(idsOf(painted)),
            `${label}: no record is painted by two visible rows at once`).toEqual([]);

        expect(dupes(painted.map(row => row.rowId)),
            `${label}: no two visible rows claim the same row index`).toEqual([]);

        // Worker-plane assertion. Fails on exactly the state an uncarried silent clear produces, which
        // the DOM plane above cannot detect.
        expect(clearedButPainted.map(row => `${row.elementId}(shows ${row.recordId})`),
            `${label}: no row the worker cleared is still painted`).toEqual([])
    };

    const openControls = async page => {
        await page.locator('.controls-container-button').first().click();
        await page.waitForTimeout(500)
    };

    const connect = async (page, neuralLink) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"]', {timeout: 60000});
        await page.waitForTimeout(700);

        return neuralLink.connectToApp('Neo.examples.grid.bigData')
    };

    /**
     * Driver 1 — a filter renumbers the surviving records against a smaller population, which is what
     * moves a record onto a different pool slot, and shrinks the used set so the clear path runs too.
     *
     * Non-vacuity here is the strongest of the three: survivors are guaranteed, so the remap assertion
     * is unconditional.
     */
    test('a record remapped onto a new pool slot is not left painted in the old one', async ({page, neuralLink}) => {
        const app = await connect(page, neuralLink);

        // Scroll away from the top first. At index 0 the visible range and the pool are aligned, which
        // is the one position where a remap is least likely to expose an uncarried write.
        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(700);

        const beforePlanes = joinPlanes(await readDomRows(page), await readWorkerRows(app)),
              before       = beforePlanes.painted,
              beforeIds    = idsOf(before),
              beforeSlots  = slotMap(before);

        expect(before.length, 'rows are rendered before the filter').toBeGreaterThan(3);
        expect(beforePlanes.joinedCount, 'worker truth is readable for the painted rows').toBeGreaterThan(3);

        // Precondition: coherent BEFORE the gesture, so a pre-existing duplicate cannot be blamed on it.
        expect(new Set(beforeIds).size, `before the filter, every visible row shows a distinct record: ${beforeIds.join()}`)
            .toBe(beforeIds.length);

        await openControls(page);
        await page.locator('#neo-textfield-1__input').fill('a');
        await page.waitForTimeout(1200);

        const afterPlanes = joinPlanes(await readDomRows(page), await readWorkerRows(app)),
              after       = afterPlanes.painted,
              afterIds    = idsOf(after),
              afterSlots  = slotMap(after);

        expect(after.length, 'rows are still rendered after the filter').toBeGreaterThan(0);

        // NON-VACUITY, unconditional on this arm: the filter must have changed the painted set AND at
        // least one surviving record must now sit in a different pool element. Without the second arm
        // this passes against a grid that never remapped anything — the case an earlier revision hit.
        const survivors = afterIds.filter(id => id in beforeSlots),
              remapped  = survivors.filter(id => afterSlots[id] !== beforeSlots[id]);

        expect(afterIds.join(), 'the filter actually changed the rendered rows').not.toBe(beforeIds.join());
        expect(remapped.length, `at least one surviving record moved pool element (survivors: ${survivors.length})`)
            .toBeGreaterThan(0);

        assertNoDoublePaint(afterPlanes, 'filter remap')
    });

    /**
     * Driver 2 — the store's record set is REPLACED rather than filtered. `onAmountRowsChange` assigns
     * `store.amountRows`, which regenerates the records, so every index is renumbered against a
     * different population and shrinking it also strands pool slots the clear path must empty.
     *
     * **This arm's non-vacuity is weaker than driver 1's, and deliberately so.** A replacement may
     * share no record with the previous view, so a surviving-record remap cannot be required — it is
     * asserted only when survivors exist. What carries non-vacuity unconditionally is the population
     * change plus the worker-plane clear count: the replacement must actually strand slots.
     */
    test('a store replacement that renumbers and shrinks leaves no record painted twice', async ({page, neuralLink}) => {
        const app = await connect(page, neuralLink);

        const box = await page.locator('.neo-grid-view').boundingBox();

        // Scroll deep enough that the visible range sits well past the incoming store's size, so the
        // replacement must both renumber AND strand slots rather than merely re-filling them.
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(800);

        const before      = joinPlanes(await readDomRows(page), await readWorkerRows(app)).painted,
              beforeIds   = idsOf(before),
              beforeSlots = slotMap(before);

        expect(before.length, 'rows are rendered before the replacement').toBeGreaterThan(3);
        expect(new Set(beforeIds).size, 'before the replacement, every visible row shows a distinct record')
            .toBe(beforeIds.length);

        // 20,000 -> 1,000. The combobox is not editable, so the value is chosen from its list.
        await openControls(page);
        await page.locator('#neo-combobox-1__input').click();
        await page.waitForTimeout(400);
        await page.getByRole('option', {name: '1000', exact: true}).click();
        await page.waitForTimeout(1600);

        const afterPlanes = joinPlanes(await readDomRows(page), await readWorkerRows(app)),
              after       = afterPlanes.painted,
              afterIds    = idsOf(after),
              afterSlots  = slotMap(after);

        expect(after.length, 'rows are rendered after the replacement').toBeGreaterThan(0);
        expect(afterIds.join(), 'the replacement actually changed the rendered rows').not.toBe(beforeIds.join());

        // Conditional by necessity — see the docblock. Recorded as conditional rather than presented
        // as an unconditional control.
        const survivors = afterIds.filter(id => id in beforeSlots),
              remapped  = survivors.filter(id => afterSlots[id] !== beforeSlots[id]);

        survivors.length > 0 && expect(remapped.length,
            `a surviving record moved pool element (survivors: ${survivors.length})`).toBeGreaterThan(0);

        assertNoDoublePaint(afterPlanes, 'store replacement')
    });

    /**
     * Driver 3 — the regime the original downstream report was actually in, which neither driver above
     * reaches: a record set far SMALLER than the row pool. There the used-slot loop touches a handful
     * of slots and the unused-slot clear owns all the rest, so the CLEAR path decides what the DOM
     * shows. The report was two records against four live row elements.
     *
     * Non-vacuity here is a worker-plane precondition, and it could not be written before this spec
     * read worker truth: the clear path must actually have run. A DOM-only version of this arm can
     * only check that fewer rows are visible than exist, which a re-fill satisfies just as well as a
     * clear.
     */
    test('a record set far smaller than the pool leaves no stale row painted beside the survivors', async ({page, neuralLink}) => {
        const app = await connect(page, neuralLink);

        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(700);

        await openControls(page);
        await page.locator('#neo-textfield-1__input').fill('Tobias');
        await page.waitForTimeout(900);
        await page.locator('#neo-textfield-2__input').fill('Uhlig');
        await page.waitForTimeout(1600);

        const domRows = await readDomRows(page),
              planes  = joinPlanes(domRows, await readWorkerRows(app));

        // PRECONDITION 1 — the small-set regime: the pool is larger than the surviving record set.
        expect(domRows.length, 'the row pool is materialised').toBeGreaterThan(3);
        expect(planes.painted.length, 'the double filter left a non-empty set').toBeGreaterThan(0);
        expect(planes.painted.length,
            `the surviving set is smaller than the pool (${planes.painted.length} painted of ${domRows.length} pool elements)`)
            .toBeLessThan(domRows.length);

        // PRECONDITION 2 — the clear path genuinely ran. This is the load-bearing one: without it the
        // arm's central assertion has nothing to be true ABOUT, and a grid that simply re-filled every
        // slot would satisfy precondition 1 alone.
        expect(planes.workerClearedCount,
            `the unused-slot clear ran (${planes.workerClearedCount} of ${planes.joinedCount} joined rows hold no record)`)
            .toBeGreaterThan(0);

        assertNoDoublePaint(planes, 'small set against an over-sized pool')
    })
});
