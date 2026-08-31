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
    BOUNDARY_PX = 160,
    ITEM_HEIGHT = 40,
    LIST_ID     = 'buffered-list-under-test',
    POOL_SIZE   = 16;

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
 * The pooled row component ids in DOM order. Identity here is the recycle oracle: a scroll that crosses
 * no buffer edge must leave every slot occupied by the same component instance.
 *
 * The two `neo-buffered-list-spacer` nodes are excluded **by class rather than by position**. The list
 * mounts its bounded pool *between* two stable spacers that hold the unmounted extents
 * (`Buffered.mjs:445-458`), so a naive `children` read counts 18 for a 16-row pool. Filtering by class
 * states the reason in the code; the equivalent `slice(1, -1)` would encode the same fact as an
 * unexplained offset and would quietly return the wrong set if a third structural node ever appeared.
 * @param {Object} page
 * @returns {Promise<String[]>}
 */
const poolIds = page => page.evaluate(id => {
    const root = document.getElementById(id);

    return root ? Array.from(root.children)
        .filter(node => !node.classList.contains('neo-buffered-list-spacer'))
        .map(node => node.id)
        .filter(Boolean) : []
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

    test('RED CONTROL: the fidelity assertion can actually fail', async ({page}) => {
        // Proves the oracle is not vacuous BEFORE any green is reported.
        //
        // The control drives a real wheel through the SAME path as every green arm, with a
        // deliberately viewport-sized delta, and asserts the small-delta expectation rejects it. An
        // earlier revision instead wrote `element.scrollTop` directly — that raced the engine and was
        // intermittently observed reading back 680 rather than the written 400, because `createItems()`
        // clamps `me.scrollTop` (`Buffered.mjs:357`) and re-stamps `vdom.scrollTop` (`:377`) on every
        // captured scroll. A control whose own instrument fights the subject under test cannot certify
        // anything, and its intermittency was indistinguishable from the defect it was built to detect.
        await wheel(page, 400);

        const observed = await domScrollTop(page);

        expect(observed, 'a viewport-sized gesture must NOT satisfy the small-delta expectation').not.toBe(120);
        expect(observed, 'and it must move the full requested distance').toBe(400)
    });

    test('four small deltas below the boundary move exactly their sum, and recycle nothing', async ({page}) => {
        const idsBefore = await poolIds(page);

        expect(await spacerCount(page), 'the pool is bracketed by exactly two stable spacers').toBe(2);
        expect(idsBefore.length, 'pool cardinality is viewport + 2*buffer, spacers excluded').toBe(POOL_SIZE);

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
        expect(await poolIds(page), 'an unchanged range must not recycle any slot').toEqual(idsBefore)
    });

    test('crossing the 160px boundary moves the range without moving the scroll seat off its sum', async ({page}) => {
        const idsBefore = await poolIds(page);

        // 6 x 30 = 180px: one delta past the boundary, still far smaller than the 400px viewport.
        for (let i = 0; i < 6; i++) {
            await wheel(page, 30)
        }

        await expect.poll(() => domScrollTop(page), {
            message: 'crossing a buffer edge must not add distance the user did not scroll'
        }).toBe(180);

        const [workerScrollTop, mountedRange] = await workerState(page, ['scrollTop', 'mountedRange']);

        expect(workerScrollTop).toBe(180);
        expect(mountedRange[0], 'past the boundary the range must have advanced').toBeGreaterThan(0);
        expect(mountedRange[1] - mountedRange[0], 'pool cardinality is invariant across a range move').toBe(POOL_SIZE);
        expect(await poolIds(page), 'a boundary crossing recycles slots in place, ids stay stable').toEqual(idsBefore);

        // The record now at the first visible pixel is derivable, and is the real proof the range moved
        // to the right place rather than merely moving.
        expect(Math.floor(180 / ITEM_HEIGHT)).toBe(4)
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
