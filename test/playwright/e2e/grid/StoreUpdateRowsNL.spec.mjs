/**
 * @file test/playwright/e2e/grid/StoreUpdateRowsNL.spec.mjs
 * @summary A store batch shows on the grid's visible rows, in their plain, component and animated cells, and leaves
 * the scroll position where it was, also when a forced view pass rebuilds the rows while the batch repaint is in flight.
 *
 * `Neo.grid.column.AnimatedChange` marks a changed cell, and a render after the mark's window takes it off again, so
 * the first arm records each mark with a MutationObserver instead of reading the class later. The forced-pass arm
 * widens the window and reads the DOM the forced repaint settled.
 *
 * @see Neo.data.Store#updateRows
 * @see Neo.grid.Body#onStoreRowsChange
 * @see Neo.grid.column.AnimatedChange#getCellStateCls
 * @see https://github.com/neomjs/neo/issues/20968
 */
import {test, expect} from '../../fixtures.mjs';

const GRID = '.neo-grid-container';

/**
 * @summary Opens the big data grid in the middle of its 20,000 rows and records every counter cell that gets the
 * mark, however briefly.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>} The app, its store, the three target rows and the readers of rows, marks and scroll
 */
async function openMiddle(page, neuralLink) {
    await page.goto('/examples/grid/bigData/index.html');

    const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');

    await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="firstname"]`, {state: 'visible', timeout: 30000});

    const [store]     = await app.findInstances({className: 'Neo.examples.grid.bigData.MainStore'}, ['id']),
          [container] = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['headerRowCount']),
          headerRows  = container.properties.headerRowCount,
          visibleRows = async () => (await app.queryComponent({className: 'Neo.grid.Body'}, ['visibleRows']))[0].properties.visibleRows,
          scrollTop   = () => page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).scrollTop, GRID),
          marked      = () => page.evaluate(() => [...window.__animatedRows].sort()),
          readRow     = index => page.evaluate(({grid, rowIndex}) => {
              const row  = document.querySelector(`${grid} .neo-grid-body .neo-grid-row[aria-rowindex="${rowIndex}"]`),
                    cell = field => row.querySelector(`.neo-grid-cell[data-field="${field}"]`);

              return row && {
                  button   : cell('countAction').textContent.trim(),
                  counter  : cell('counter').textContent.trim(),
                  firstname: cell('firstname').textContent.trim()
              }
          }, {grid: GRID, rowIndex: index + 1 + headerRows});

    // into the middle of the 20,000 rows, until the body renders there
    await page.evaluate(grid => {document.querySelector(`${grid} .neo-grid-view`).scrollTop = 200000}, GRID);
    await expect.poll(async () => (await visibleRows())[0], {timeout: 10000}).toBeGreaterThan(1000);

    const [first] = await visibleRows(),
          indexes = [first + 1, first + 2, first + 3],
          keys    = await Promise.all(indexes.map(async index => (await app.callMethod(store.id, 'getAt', [index])).id)),
          before  = await scrollTop();

    // the aria-rowindex of every row whose counter cell gets the mark, however briefly
    await page.evaluate(grid => {
        const rows = window.__animatedRows = new Set(),
              note = node => node.matches?.('.neo-grid-cell[data-field="counter"].neo-animated') &&
                  rows.add(Number(node.closest('.neo-grid-row').getAttribute('aria-rowindex')));

        new MutationObserver(records => records.forEach(record => {
            note(record.target);
            record.addedNodes.forEach(node => {note(node); node.querySelectorAll?.('.neo-grid-cell').forEach(note)})
        })).observe(document.querySelector(`${grid} .neo-grid-body`), {attributeFilter: ['class'], childList: true, subtree: true})
    }, GRID);

    return {app, before, headerRows, indexes, keys, marked, readRow, scrollTop, store}
}

/**
 * @summary Writes the batch: the three target rows, and two rows far off-screen, which stay raw.
 * @param {Object} app
 * @param {Object} store
 * @param {Array}  keys
 * @returns {Promise<Object>} The result of `Neo.data.Store#updateRows`
 */
function writeBatch(app, store, keys) {
    return app.callMethod(store.id, 'updateRows', [[
        ...keys.map((key, i) => ({key, values: {counter: 1000 + i, firstname: `Batched${i}`}})),
        // rows far off-screen, which stay raw
        {key: 2, values: {firstname: 'Offscreen'}}, {key: 19999, values: {firstname: 'Offscreen'}}
    ]])
}

/**
 * @summary The batched values on the three target rows, as `readRow` returns them.
 * @param {Number[]} indexes
 * @returns {Object[]}
 */
function batchedRows(indexes) {
    return indexes.map((_, i) => ({
        button   : `Batched${i} ++`,
        counter  : String(1000 + i),
        firstname: `Batched${i}`
    }))
}

test.describe('Grid BigData: a store batch repaints the visible rows in place (#20968)', () => {
    test.setTimeout(90000);

    test('a batch of row edits shows on the visible rows and keeps the scroll position', async ({page, neuralLink}) => {
        const {app, before, headerRows, indexes, keys, marked, readRow, scrollTop, store} = await openMiddle(page, neuralLink),
              result = await writeBatch(app, store, keys);

        expect(result.missing, 'every key is a row of the store').toEqual([]);

        await expect.poll(() => Promise.all(indexes.map(readRow)), {timeout: 5000}).toEqual(batchedRows(indexes));
        await expect.poll(marked, {message: 'each changed counter cell was marked', timeout: 5000})
            .toEqual(indexes.map(index => index + 1 + headerRows));

        // the load path scrolls the view to the top 50 ms after its pass
        await page.waitForTimeout(250);
        expect(await scrollTop(), 'the view stays where it was').toBe(before)
    });

    test('the marks survive a forced view pass that rebuilds the rows while the batch repaint is in flight', async ({page, neuralLink}) => {
        const {app, headerRows, indexes, keys, readRow, store} = await openMiddle(page, neuralLink),
              gridId = await page.locator(GRID).getAttribute('id'),
              worker = page.workers().find(item => item.url().includes('/worker/App'));

        // The ordering a loaded CI runner produced: the batch repaint is in flight when a forced view pass rebuilds the
        // rows. Holding the repaint's acknowledgement makes that ordering certain instead of rare. Asked for inside the
        // held flight, the pass defers until the flight resolves, then rebuilds the rows in a repaint of its own.
        // `__forcedPass` records each step: the flight held, the rows rebuilt, the rebuild's repaint done.
        await worker.evaluate(id => {
            const grid             = Neo.get(id),
                  {body}           = grid,
                  {createViewData} = body,
                  {updateBatch}    = Neo.vdom.Helper,
                  pass             = globalThis.__forcedPass = {held: false, rebuilt: false, repainted: false};

            // A window no runner delay outlasts, so the settled DOM below is read inside it
            grid.columns.get('counter').markDuration = 60000;

            Neo.vdom.Helper.updateBatch = async function(data) {
                const result = await updateBatch.call(this, data);

                if (!pass.held && body.isVdomUpdating && JSON.stringify(data).includes('Batched')) {
                    pass.held = true;
                    body.createViewData(false, true);
                    await new Promise(resolve => setTimeout(resolve, 120))
                }

                return result
            };

            body.createViewData = function(silent, force) {
                // Outside a flight, the forced pass rebuilds instead of deferring
                const rebuild = pass.held && !pass.rebuilt && force && !this.isVdomUpdating;

                createViewData.call(this, silent, force);

                if (rebuild) {
                    pass.rebuilt = true;
                    this.promiseUpdate().then(() => {pass.repainted = true})
                }
            }
        }, gridId);

        await writeBatch(app, store, keys);

        await expect.poll(() => worker.evaluate(() => globalThis.__forcedPass), {
            message: 'the batch repaint was held, and the forced pass rebuilt the rows and repainted them',
            timeout: 5000
        }).toEqual({held: true, rebuilt: true, repainted: true});

        await expect.poll(() => Promise.all(indexes.map(readRow)), {timeout: 5000}).toEqual(batchedRows(indexes));

        expect(await page.evaluate(({grid, rows}) => rows.map(rowIndex => document.querySelector(
            `${grid} .neo-grid-body .neo-grid-row[aria-rowindex="${rowIndex}"] .neo-grid-cell[data-field="counter"]`
        ).classList.contains('neo-animated')), {grid: GRID, rows: indexes.map(index => index + 1 + headerRows)}),
        'each changed counter cell keeps its mark in the DOM the forced repaint settled').toEqual([true, true, true])
    })
});
