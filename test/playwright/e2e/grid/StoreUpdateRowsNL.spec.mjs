/**
 * @file test/playwright/e2e/grid/StoreUpdateRowsNL.spec.mjs
 * @summary A store batch shows on the grid's visible rows, in their plain, component and animated cells, and leaves
 * the scroll position where it was.
 *
 * @see Neo.data.Store#updateRows
 * @see Neo.grid.Body#onStoreRowsChange
 * @see https://github.com/neomjs/neo/issues/20968
 */
import {test, expect} from '../../fixtures.mjs';

const GRID = '.neo-grid-container';

test.describe('Grid BigData: a store batch repaints the visible rows in place (#20968)', () => {
    test.setTimeout(90000);

    test('a batch of row edits shows on the visible rows and keeps the scroll position', async ({page, neuralLink}) => {
        await page.goto('/examples/grid/bigData/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');

        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="firstname"]`, {state: 'visible', timeout: 30000});

        const [store]     = await app.findInstances({className: 'Neo.examples.grid.bigData.MainStore'}, ['id']),
              [container] = await app.queryComponent({className: 'Neo.examples.grid.bigData.GridContainer'}, ['headerRowCount']),
              headerRows  = container.properties.headerRowCount,
              visibleRows = async () => (await app.queryComponent({className: 'Neo.grid.Body'}, ['visibleRows']))[0].properties.visibleRows,
              scrollTop   = () => page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).scrollTop, GRID),
              readRow     = index => page.evaluate(({grid, rowIndex}) => {
                  const row  = document.querySelector(`${grid} .neo-grid-body .neo-grid-row[aria-rowindex="${rowIndex}"]`),
                        cell = field => row.querySelector(`.neo-grid-cell[data-field="${field}"]`);

                  return row && {
                      animated : cell('counter').classList.contains('neo-animated'),
                      button   : cell('countAction').textContent.trim(),
                      counter  : cell('counter').textContent.trim(),
                      firstname: cell('firstname').textContent.trim()
                  }
              }, {grid: GRID, rowIndex: index + 1 + headerRows});

        // into the middle of the 20,000 rows, until the body renders there
        await page.evaluate(grid => {document.querySelector(`${grid} .neo-grid-view`).scrollTop = 200000}, GRID);
        await expect.poll(async () => (await visibleRows())[0], {timeout: 10000}).toBeGreaterThan(1000);

        const [first] = await visibleRows(),
              [body]  = await app.queryComponent({className: 'Neo.grid.Body'}, ['id']),
              indexes = [first + 1, first + 2, first + 3],
              keys    = await Promise.all(indexes.map(async index => (await app.callMethod(store.id, 'getAt', [index])).id)),
              before  = await scrollTop();

        // The batch lands while a pass of the body is in flight, as a live grid meets it under load: a repaint
        // deferred past that flight would drop the animated cells' marks
        const [, result] = await Promise.all([
            app.callMethod(body.id, 'createViewData', [false, true]),
            app.callMethod(store.id, 'updateRows', [[
                ...keys.map((key, i) => ({key, values: {counter: 1000 + i, firstname: `Batched${i}`}})),
                // rows far off-screen, which stay raw
                {key: 2, values: {firstname: 'Offscreen'}}, {key: 19999, values: {firstname: 'Offscreen'}}
            ]])
        ]);

        expect(result.missing, 'every key is a row of the store').toEqual([]);

        await expect.poll(() => Promise.all(indexes.map(readRow)), {timeout: 5000}).toEqual(indexes.map((_, i) => ({
            animated : true,
            button   : `Batched${i} ++`,
            counter  : String(1000 + i),
            firstname: `Batched${i}`
        })));

        // the load path scrolls the view to the top 50 ms after its pass
        await page.waitForTimeout(250);
        expect(await scrollTop(), 'the view stays where it was').toBe(before)
    })
});
