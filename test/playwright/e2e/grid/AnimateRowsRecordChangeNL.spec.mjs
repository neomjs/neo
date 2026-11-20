import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `Neo.grid.plugin.AnimateRows` moves a record whose own change re-sorts the store from its old offset to
 * its new one, like a header sort moves it.
 *
 * `Store#updateRows` with a `reapplyOnRecordChange` sorter re-sorts before it fires `rowsChange`: the plugin's first
 * step has already put the moved record's row at its previous offset when the body repaints that row for its new
 * values. The spec drives `examples/grid/animatedRowSorting` over the Neural Link, follows the record by its
 * Firstname cell (the rows are a pool, `learn/guides/datahandling/PooledGridAnimation.md`), and samples its offset
 * once per frame.
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

test.describe('grid: AnimateRows moves a record its own change re-sorts', () => {
    test.setTimeout(90000);

    test('updateRows under a reapplyOnRecordChange sorter moves a re-sorted record through the offsets between, and none that keeps its row', async ({page, neuralLink}) => {
        await page.goto(APP);

        const app = await neuralLink.connectToApp('Neo.examples.grid.animatedRowSorting');

        await expect(page.locator('.neo-grid-body.neo-animate-rows', {has: page.locator('[data-field="firstname"]')})).toHaveCount(1);

        const grids   = await app.findInstances({className: 'Neo.grid.Container'}, ['id']),
              gridId  = (Array.isArray(grids) ? grids[0] : grids)?.id,
              storeId = (await app.getComponent(gridId, ['store'])).store?.id;

        expect(storeId, 'the grid exposes its store').toBeTruthy();

        const before = await displayedRows(page),
              height = before[1].offset - before[0].offset;

        // Amanda 100, Sam 90, Carol 70, Max 50, Sarah 35, William 30, Paul 10
        await app.setProperties(storeId, {sorters: [{direction: 'DESC', property: 'progress', reapplyOnRecordChange: true}]});
        await expectSettled(page, ['Amanda', 'Sam', 'Carol', 'Max', 'Sarah', 'William', 'Paul'], height);

        await page.evaluate(selector => {
            window.__offsets  = [];
            window.__sampling = true;

            const read = () => {
                const row = [...document.querySelectorAll(selector)]
                    .filter(item => item.style.display !== 'none')
                    .find(item => item.querySelector('[data-field="firstname"]')?.textContent.trim() === 'Sarah');

                row && window.__offsets.push(Math.round(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42));
                window.__sampling && requestAnimationFrame(read)
            };

            requestAnimationFrame(read)
        }, ROW);

        // Sarah, 35 → 95: from the fifth row to the second
        await app.callMethod(storeId, 'updateRows', [[{key: 7, values: {progress: 95}}]]);
        await expectSettled(page, ['Amanda', 'Sarah', 'Sam', 'Carol', 'Max', 'William', 'Paul'], height);

        const offsets = await page.evaluate(() => {
            window.__sampling = false;
            return window.__offsets
        });

        expect(offsets[0], 'Sarah starts on the fifth row').toBe(4 * height);
        expect(offsets.some(offset => offset > height && offset < 4 * height),
            `a frame between the two rows: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(height);

        // Amanda, 100 → 99, keeps the first row: her cell repaints, and no row transitions
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

        await app.callMethod(storeId, 'updateRows', [[{key: 6, values: {progress: 99}}]]);
        await expectSettled(page, ['Amanda', 'Sarah', 'Sam', 'Carol', 'Max', 'William', 'Paul'], height);
        await page.waitForTimeout(600); // out-waits: the 500 ms default transition a wrongly started move would run

        const transitions = await page.evaluate(() => {
            window.__sampling = false;
            return [...window.__transitions]
        });

        expect(transitions, 'a change that keeps its record in place starts no transition').toEqual([])
    })
});
