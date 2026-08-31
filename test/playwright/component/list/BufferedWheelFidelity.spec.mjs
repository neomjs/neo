import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/list/BufferedWheelFidelity.spec.mjs
 * @summary Real wheel gestures over a real `Neo.list.Buffered`: small deltas must stay small.
 *
 * ## Why this tier, and why a real wheel
 *
 * The existing coverage cannot see the reported defect, in two different ways:
 *
 * - `test/playwright/unit/list/Buffered.spec.mjs` calls `onScrollCapture()` with **already-decided
 *   absolute** `scrollTop` values (80, 40, 205, …). That asserts what the list does with a number it is
 *   handed; the report is about what happens to the number itself across a real scroll.
 * - every `page.mouse.wheel` in the e2e tier moves a single large delta (500, 900, 1500, 4000) and
 *   asserts only that scrolling occurred. A viewport-sized jump is invisible against a viewport-sized
 *   gesture.
 *
 * So the witness has to be an actual browser scroll, incremental, with the App-Worker truth read in the
 * same run — which is this tier: a real Chromium, a real scroll seat, and `Neo.worker.App.getConfigs`
 * to read the list instance living in the worker.
 *
 * ## The geometry is chosen, not incidental
 *
 * The harness pins `itemHeight: 40`, `height: 400`, `bufferRowRange: 3` (the shipped default). That
 * gives `availableRows` 10 and a 16-row pool, and it puts the first mounted-range boundary at an exact,
 * derivable pixel:
 *
 *     firstVisible = floor(scrollTop / 40) · visibleEnd = firstVisible + 10
 *     range [0,16] survives while visibleEnd <= 16 - 3  ⇒  firstVisible <= 3  ⇒  scrollTop <= 159
 *
 * **160px is therefore the boundary**, and the arms below sit deliberately on either side of it rather
 * than at a round number that happens to work.
 *
 * ## What this suite does NOT claim
 *
 * It does not assert a cause. `Buffered.onScrollCapture` calls `createItems()` on every captured root
 * scroll while `calculateMountedRange` documents range changes only at a buffer edge, and that
 * discrepancy is real and verified — but a green run here means the unconditional rebuild does not
 * produce the reported jump, and that is a result worth publishing rather than a fix worth forcing.
 */

const
    LIST_ID   = 'buffered-list-under-test',
    POOL_SIZE = 16;

/**
 * Reads App-Worker truth for the list under test.
 * @param {Object} page
 * @param {String[]} keys
 * @returns {Promise<Array>}
 */
const workerState = (page, keys) => page.evaluate(
    ([id, k]) => Neo.worker.App.getConfigs({id, keys: k}),
    [LIST_ID, keys]
);

/**
 * The physical scroll seat's own number, read from the DOM rather than inferred from the worker.
 * @param {Object} page
 * @returns {Promise<Number>}
 */
const domScrollTop = page => page.evaluate(id => document.getElementById(id)?.scrollTop ?? -1, LIST_ID);

/**
 * Which Store record occupies each pool slot, in DOM order — the recycle oracle.
 *
 * **Slot ids and nested component ids are both useless here, and that is not obvious.** `createPooledItem`
 * assigns `item.id = getSlotId(poolIndex)` → `…__slot-N`, and the nested component renders as
 * `…__N__component`. Both are derived from the *pool index*, so both stay byte-identical even if every
 * row were destroyed and rebuilt against different records. An assertion over either compares a
 * deterministic function of the loop counter with itself and passes unconditionally.
 *
 * `data-record-id` is the one identity that moves with the data: it answers *which record is in this
 * slot*, which is what recycling actually means. It changes iff the mounted range changes.
 *
 * The two `neo-buffered-list-spacer` nodes are excluded **by class rather than by position**
 * (`Buffered.mjs:445-458`); `slice(1, -1)` would encode the same fact as an unexplained offset and
 * would silently return the wrong set if a third structural node ever appeared.
 * @param {Object} page
 * @returns {Promise<String[]>}
 */
const slotRecordIds = page => page.evaluate(id => {
    const root = document.getElementById(id);

    return root ? Array.from(root.children)
        .filter(node => !node.classList.contains('neo-buffered-list-spacer'))
        .map(node => node.dataset.recordId)
        .filter(Boolean) : []
}, LIST_ID);

/**
 * The logical Store index each pool slot currently renders, in DOM order. Pairs with
 * {@link slotRecordIds}: the record ids prove *that* the window moved, these prove *where it moved to*.
 * @param {Object} page
 * @returns {Promise<Number[]>}
 */
const slotLogicalIndexes = page => page.evaluate(id => {
    const root = document.getElementById(id);

    return root ? Array.from(root.children)
        .filter(node => !node.classList.contains('neo-buffered-list-spacer'))
        .map(node => Number(node.dataset.logicalIndex)) : []
}, LIST_ID);

/**
 * Count of structural spacer nodes — asserted alongside the pool so the exclusion above is proven to
 * have excluded something, rather than silently matching nothing.
 * @param {Object} page
 * @returns {Promise<Number>}
 */
const spacerCount = page => page.evaluate(id => {
    const root = document.getElementById(id);

    return root ? Array.from(root.children).filter(n => n.classList.contains('neo-buffered-list-spacer')).length : -1
}, LIST_ID);

/**
 * Applies one wheel delta over the list and lets the scroll + worker round-trip settle.
 * @param {Object} page
 * @param {Number} deltaY
 * @returns {Promise<void>}
 */
async function wheel(page, deltaY) {
    await page.mouse.wheel(0, deltaY);
    // The scroll is native and synchronous; the App-Worker mirror is a round-trip. Waiting on an
    // animation frame plus a task tick is what makes the two readings below comparable rather than
    // racing — a bare assertion here reads a half-applied state and flakes in whichever direction the
    // machine is fast that day.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))))
}

test.describe('Neo.list.Buffered — wheel-distance fidelity', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/buffered-list/index.html');
        await page.waitForSelector(`#${LIST_ID}`, {state: 'attached'});
        // The list owns its scroll seat; hovering it makes the wheel target it rather than the document.
        await page.locator(`#${LIST_ID}`).hover();
        await expect.poll(() => domScrollTop(page)).toBe(0)
    });

    test('RED CONTROL: an induced small-input→viewport-output makes the fidelity arm fail', async ({page}) => {
        // Proves the oracle is not vacuous BEFORE any green is reported, by reproducing the REPORTED
        // FAILURE CLASS rather than a large correct scroll.
        //
        // Two earlier revisions of this control were both inadequate, and the reasons are worth keeping:
        //   1. Writing `element.scrollTop` directly raced the engine — `createItems()` clamps
        //      `me.scrollTop` (`Buffered.mjs:357`) and re-stamps `vdom.scrollTop` (`:377`) on every
        //      captured scroll — and was intermittently observed reading 680 for a written 400. A
        //      control whose failure mode is indistinguishable from the defect certifies nothing.
        //   2. A plain `wheel(400)` producing 400 is *correct native fidelity for a large gesture*. It
        //      passes, and passing is the problem: the reported class is a SMALL input yielding a
        //      VIEWPORT output, so an arm that never exhibits that shape never shows the assertion
        //      turning red.
        //
        // This installs an amplifier that adds a viewport per wheel event, drives the SAME 4 x 30px
        // gesture the green arm uses, and asserts the green arm's own expectation is violated. The
        // amplifier lives on this page only; every other test gets a fresh `page.goto`.
        await page.evaluate(id => {
            const el = document.getElementById(id);

            el.addEventListener('wheel', () => { el.scrollTop += 400 }, {passive: true})
        }, LIST_ID);

        for (let i = 0; i < 4; i++) {
            await wheel(page, 30)
        }

        const observed = await domScrollTop(page);

        // The exact expectation the green arm asserts. Under amplification it MUST NOT hold.
        expect(observed, 'the small-delta expectation must be violated when output is amplified').not.toBe(120);
        // And it must fail in the reported direction: a 120px input producing at least a viewport.
        expect(observed, 'a 120px gesture must land past a full 400px viewport under amplification')
            .toBeGreaterThanOrEqual(400)
    });

    test('four small deltas below the boundary move exactly their sum, and recycle nothing', async ({page}) => {
        const recordsBefore = await slotRecordIds(page);

        expect(await spacerCount(page), 'the pool is bracketed by exactly two stable spacers').toBe(2);
        expect(recordsBefore.length, 'pool cardinality is viewport + 2*buffer, spacers excluded').toBe(POOL_SIZE);
        expect(await slotLogicalIndexes(page), 'at rest the window starts at the first record').toEqual(
            Array.from({length: POOL_SIZE}, (_, i) => i)
        );

        for (let i = 0; i < 4; i++) {
            await wheel(page, 30)
        }

        // 120px total, deliberately short of the 160px boundary derived in the file docblock.
        await expect.poll(() => domScrollTop(page), {
            message: 'four 30px wheel deltas must land at exactly 120px — not a viewport'
        }).toBe(120);

        const [workerScrollTop, mountedRange] = await workerState(page, ['scrollTop', 'mountedRange']);

        expect(workerScrollTop, 'App-Worker scrollTop must equal the physical seat').toBe(120);
        expect(mountedRange, 'no buffer edge was crossed, so the range must not move').toEqual([0, POOL_SIZE]);
        expect(await slotRecordIds(page), 'an unchanged range must leave every slot on its own record')
            .toEqual(recordsBefore)
    });

    test('crossing the 160px boundary moves the range to exactly [1, 17] and re-points the slots', async ({page}) => {
        const recordsBefore = await slotRecordIds(page);

        // 6 x 30 = 180px: one delta past the boundary, still far smaller than the 400px viewport.
        for (let i = 0; i < 6; i++) {
            await wheel(page, 30)
        }

        await expect.poll(() => domScrollTop(page), {
            message: 'crossing a buffer edge must not add distance the user did not scroll'
        }).toBe(180);

        const [workerScrollTop, mountedRange] = await workerState(page, ['scrollTop', 'mountedRange']);

        expect(workerScrollTop).toBe(180);

        // The exact range is derivable, so assert it exactly. `mountedRange[0] > 0` would admit any
        // advanced-but-wrong window, which is the failure a windowing defect actually produces:
        //   firstVisible = floor(180/40) = 4 · visibleEnd = 14 · 14 > 16 - 3, so
        //   start = min(maxStart, visibleEnd + buffer - poolSize) = min(maxStart, 1) = 1
        expect(mountedRange, 'the window must land where the arithmetic says, not merely move').toEqual([1, 17]);

        // The App Worker's range moves synchronously with the captured scroll; the DOM follows a
        // worker → VDOM → main round trip. Polling separates "the DOM has not caught up yet" from "the
        // DOM disagrees with the engine", which are very different findings — a timeout here means the
        // rendered window never reconciles with `mountedRange`, not merely that it was slow.
        await expect.poll(() => slotLogicalIndexes(page), {
            message: 'the rendered window must reconcile with mountedRange [1, 17]'
        }).toEqual(Array.from({length: POOL_SIZE}, (_, i) => i + 1));

        // Only once the DOM reflects the range is the recycle question meaningful. Comparing slot ids
        // would pass unconditionally — they are pool-index-derived (see `slotRecordIds`).
        const recordsAfter = await slotRecordIds(page);

        expect(recordsAfter, 'a range move must re-point the slots onto different records').not.toEqual(recordsBefore);
        expect(recordsAfter.length, 'pool cardinality is invariant across a range move').toBe(POOL_SIZE)
    });

    test('negative deltas are symmetric — scrolling back lands on the same pixels', async ({page}) => {
        for (let i = 0; i < 6; i++) {
            await wheel(page, 30)
        }

        await expect.poll(() => domScrollTop(page)).toBe(180);

        for (let i = 0; i < 3; i++) {
            await wheel(page, -30)
        }

        await expect.poll(() => domScrollTop(page), {
            message: 'reversing three deltas must return exactly three deltas of distance'
        }).toBe(90);

        const [workerScrollTop] = await workerState(page, ['scrollTop']);

        expect(workerScrollTop).toBe(90)
    });

    test('twenty small deltas accumulate linearly — the reported symptom is a summed drift', async ({page}) => {
        // The operator report is "a very small gesture moves roughly a full page". A single delta can
        // hide that; twenty cannot. Each is 8px — a fifth of one row — so any per-event over-application
        // compounds into an obvious multiple rather than a rounding argument.
        for (let i = 0; i < 20; i++) {
            await wheel(page, 8)
        }

        await expect.poll(() => domScrollTop(page), {
            message: '20 x 8px must be 160px; a per-event amplification shows up here as a multiple'
        }).toBe(160);

        const [workerScrollTop] = await workerState(page, ['scrollTop']);

        expect(workerScrollTop).toBe(160)
    })
});

/**
 * The arms above drive `component/apps/buffered-list/` — a harness with its own model, store and row
 * classes. It is deliberately separate, but that separation means **it is not evidence that the public
 * example works**, and an evidence row citing the harness for the example would be citing a different
 * app. This boots the real one.
 */
test.describe('Neo.examples.list.buffered — the public example boots', () => {
    test('mounts a bounded pool and exposes its three windowing controls', async ({page}) => {
        await page.goto('examples/list/buffered/index.html');

        const list = page.locator('.neo-buffered-list');

        await expect(list, 'the example must mount an actual Buffered list').toBeVisible();

        // Bounded by construction: 5,000 records, but the DOM holds viewport + 2*buffer rows and two
        // spacers. A list that mounted every record would still "be visible" — the count is what proves
        // the example demonstrates windowing rather than merely rendering.
        await expect.poll(
            () => list.locator('li.neo-list-item').count(),
            {message: 'the pool must stay bounded — this is the property the example exists to show'}
        ).toBeGreaterThan(0);

        const rowCount = await list.locator('li.neo-list-item').count();

        expect(rowCount, '5,000 records must not produce 5,000 rows').toBeLessThan(100);
        expect(await list.locator('.neo-buffered-list-spacer').count(), 'both extents are held by spacers').toBe(2);

        // The three configs whose entire effect is windowing behaviour. An example that renders a list
        // but cannot vary these would demonstrate nothing the plain list example does not already show.
        for (const label of ['bufferRowRange', 'itemHeight', 'height']) {
            await expect(
                page.locator('.neo-textfield-label', {hasText: label}).first(),
                `the example must expose ${label} as a live control`
            ).toBeVisible()
        }
    })
});
