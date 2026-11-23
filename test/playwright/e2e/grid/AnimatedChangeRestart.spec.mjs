/**
 * @file test/playwright/e2e/grid/AnimatedChangeRestart.spec.mjs
 * @summary `examples/grid/bigData`: every change of an animatedChange cell restarts its animation in the browser, also
 * a change after the cell's mark ended when nothing rendered the row since, so the ended mark's class is still on it.
 *
 * A restart is an `animationstart` event on the cell's element. The mark switches between two keyframes with the same
 * frames, `grid-animated-cell` and `grid-animated-cell-alt`: a change to a cell that still carries one gets the other.
 * The spec edits a record's counter in the App worker and records the events of its counter cell.
 *
 * @see Neo.grid.column.AnimatedChange#mark
 */
import {expect, test} from '../../fixtures.mjs';

const GRID = '.neo-grid-container';

test.describe('Grid BigData: an animatedChange cell restarts its animation on every change', () => {
    test('a change after the mark ended, with no render in between, and one inside the next mark each restart it', async ({page}) => {
        await page.goto('/examples/grid/bigData/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="counter"]`, {state: 'visible', timeout: 30000});

        const gridId = await page.locator(GRID).getAttribute('id'),
              worker = page.workers().find(item => item.url().includes('/worker/App')),
              target = await worker.evaluate(id => {
                  const {body} = Neo.get(id),
                        row    = body.items.find(item => item.rowIndex === 1);

                  return {cellId: row.vdom.cn.find(node => node.data?.field === 'counter').id, key: body.store.getKey(row.record)}
              }, gridId),
              edit   = counter => worker.evaluate(({id, key, counter}) => {Neo.get(id).store.get(key).counter = counter}, {id: gridId, key: target.key, counter}),
              events = () => page.evaluate(() => window.__restarts.events),
              cls    = () => page.evaluate(id => document.getElementById(id).className, target.cellId);

        await page.evaluate(id => {
            const cell = document.getElementById(id);

            window.__restarts = {cell, events: []};
            cell.addEventListener('animationstart', event => window.__restarts.events.push(event.animationName))
        }, target.cellId);

        await edit(881);
        await expect.poll(events).toEqual(['grid-animated-cell']);

        // The mark ends, and nothing renders the row: the ended mark's class stays on the cell
        await expect.poll(() => worker.evaluate(({id, key}) => {
            const grid = Neo.get(id);
            return grid.columns.get('counter').getCellStateCls({record: grid.store.get(key)})
        }, {id: gridId, key: target.key}), {timeout: 5000}).toBeNull();
        expect(await cls(), 'control: no render took the ended mark off').toContain('neo-animated');

        await edit(882);
        await expect.poll(events).toEqual(['grid-animated-cell', 'grid-animated-cell-alt']);

        await edit(883);
        await expect.poll(events).toEqual(['grid-animated-cell', 'grid-animated-cell-alt', 'grid-animated-cell']);

        expect(await page.evaluate(id => window.__restarts.cell === document.getElementById(id), target.cellId),
            'the classes restarted the animation, not a new element').toBe(true)
    })
});
