import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `Neo.grid.plugin.AnimateRows` moves a record whose own change re-sorts the store from its old offset to
 * its new one, like a header sort moves it.
 *
 * `Store#updateRows` with a `reapplyOnRecordChange` sorter re-sorts before it fires `rowsChange`: the plugin's first
 * step has already put the moved record's row at its previous offset when the body repaints that row for its new
 * values. The spec drives `examples/grid/animatedRowSorting` over the Neural Link, follows the record by its
 * Firstname cell (the rows are a pool, `learn/guides/datahandling/PooledGridAnimation.md`), and samples its offset
 * once per frame. It holds the example's own updates and reads the records it moves from the store, so the example
 * can change its data and its timer without moving this measurement.
 */
const APP = 'examples/grid/animatedRowSorting/index.html',
      ROW = '.neo-grid-body .neo-grid-row';

/**
 * The displayed records of the center body, top to bottom: Firstname, offset and the row's transition duration.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{name: String, offset: Number, transitions: String}[]>}
 */
async function displayedRows(page) {
    return page.evaluate(selector => [...document.querySelectorAll(selector)]
        .filter(row => row.style.display !== 'none' && row.querySelector('[data-field="firstname"]'))
        .map(row => {
            const style = getComputedStyle(row);

            return {
                name       : row.querySelector('[data-field="firstname"]').textContent.trim(),
                offset     : Math.round(new DOMMatrixReadOnly(style.transform).m42),
                transitions: style.transitionDuration
            }
        })
        .sort((a, b) => a.offset - b.offset), ROW)
}

/**
 * Waits until every displayed row rests at a whole row offset, with no transition.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} names
 * @param {Number} rowHeight
 */
async function expectSettled(page, names, rowHeight) {
    await expect.poll(async () => (await displayedRows(page)).map(({name, offset, transitions}) => [name, offset, transitions]))
        .toEqual(names.map((name, index) => [name, index * rowHeight, '0s']))
}

/**
 * Waits until the displayed rows show the store's order from its first record, each at rest on its whole row offset.
 * The rows are a pool, so they may show fewer records than the store holds.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} names The store's Firstnames in order
 * @param {Number} rowHeight
 * @returns {Promise<String[]>} The displayed Firstnames, top to bottom
 */
async function settledStoreOrder(page, names, rowHeight) {
    let shown = [];

    await expect.poll(async () => {
        const rows = await displayedRows(page);

        shown = rows.map(row => row.name);
        return rows.length > 4 && rows.every((row, index) => row.name === names[index] && row.offset === index * rowHeight && row.transitions === '0s')
    }).toBe(true);

    return shown
}

test.describe('grid: AnimateRows moves a record its own change re-sorts', () => {
    test.setTimeout(90000);

    test('updateRows under a reapplyOnRecordChange sorter moves a re-sorted record through the offsets between, and none that keeps its row', async ({page, neuralLink}) => {
        await page.goto(APP);

        const app = await neuralLink.connectToApp('Neo.examples.grid.animatedRowSorting');

        await expect(page.locator('.neo-grid-body.neo-animate-rows', {has: page.locator('[data-field="firstname"]')})).toHaveCount(1);

        const grids      = await app.findInstances({className: 'Neo.grid.Container'}, ['id']),
              gridId     = (Array.isArray(grids) ? grids[0] : grids)?.id,
              grid       = await app.getComponent(gridId, ['rowHeight', 'store']),
              storeId    = grid.store?.id,
              height     = grid.rowHeight,
              viewports  = await app.findInstances({className: 'Neo.examples.grid.animatedRowSorting.Viewport'}, ['id']),
              viewportId = (Array.isArray(viewports) ? viewports[0] : viewports)?.id;

        expect(storeId, 'the grid exposes its store').toBeTruthy();

        // a Viewport that updates its records on a timer reads `isPaused`; on one without a timer the field is inert
        await app.setProperties(viewportId, {isPaused: true});
        await app.setProperties(storeId, {sorters: [{direction: 'DESC', property: 'progress', reapplyOnRecordChange: true}]});

        const items  = (await app.inspectStore(storeId, 100, 0)).items.map(item => item.data || item),
              before = await settledStoreOrder(page, items.map(item => item.firstname), height);

        // the fifth record moves between the first two, and the first can then drop by one and keep its row
        const [first, second, , , mover] = items,
              target                     = Math.round((first.progress + second.progress) / 2),
              after                      = [before[0], mover.firstname, ...before.slice(1, 4), ...before.slice(5)];

        expect(first.progress - target > 1 && target > second.progress, `room between ${first.progress} and ${second.progress}`).toBe(true);

        await page.evaluate(([selector, name]) => {
            window.__offsets  = [];
            window.__sampling = true;

            const read = () => {
                const row = [...document.querySelectorAll(selector)]
                    .filter(item => item.style.display !== 'none')
                    .find(item => item.querySelector('[data-field="firstname"]')?.textContent.trim() === name);

                row && window.__offsets.push(Math.round(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42));
                window.__sampling && requestAnimationFrame(read)
            };

            requestAnimationFrame(read)
        }, [ROW, mover.firstname]);

        await app.callMethod(storeId, 'updateRows', [[{key: mover.id, values: {progress: target}}]]);
        await expectSettled(page, after, height);

        const offsets = await page.evaluate(() => {
            window.__sampling = false;
            return window.__offsets
        });

        expect(offsets[0], `${mover.firstname} starts on the fifth row`).toBe(4 * height);
        expect(offsets.some(offset => offset > height && offset < 4 * height),
            `a frame between the two rows: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(height);

        // the first record drops by one and keeps its row: its cell repaints, and no row transitions
        await page.evaluate(selector => {
            window.__transitions = new Set();
            window.__sampling    = true;

            const read = () => {
                document.querySelectorAll(selector).forEach(row => {
                    const {transitionDuration} = getComputedStyle(row);
                    transitionDuration !== '0s' && window.__transitions.add(transitionDuration)
                });
                window.__sampling && requestAnimationFrame(read)
            };

            requestAnimationFrame(read)
        }, ROW);

        await app.callMethod(storeId, 'updateRows', [[{key: first.id, values: {progress: first.progress - 1}}]]);
        await expectSettled(page, after, height);
        await page.waitForTimeout(600); // out-waits: the 500 ms default transition a wrongly started move would run

        const transitions = await page.evaluate(() => {
            window.__sampling = false;
            return [...window.__transitions]
        });

        expect(transitions, 'a change that keeps its record in place starts no transition').toEqual([])
    })
});
