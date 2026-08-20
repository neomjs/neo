/**
 * @file test/playwright/e2e/grid/ComponentCellScrollSync.spec.mjs
 * @summary A component cell must follow its row's record across a scroll.
 *
 * `examples/grid/bigData` renders `countAction` as a Button whose text is `record.firstname + ' ++'`,
 * beside a plain `firstname` cell fed by the same record. That pairing is a self-contained invariant:
 * whatever the row shows, the button must agree, at every scroll position.
 *
 * The invariant only breaks in the real pipeline. `Body#createViewData` updates rows with
 * `silent: true` during scrolling, and at a scroll `updateDepth` that stops at the row, the cell
 * components sit on the sparse-tree boundary, where `util/vdom/TreeBuilder` emits them as
 * `{componentId, neoIgnore: true}` — the worker leaves those nodes untouched, so they keep their last
 * rendered content. Unit specs cannot see it: they assert the component instance, which rebinds
 * correctly.
 *
 * Agreement alone is a vacuous instrument: a body that ignores every wheel event keeps showing its
 * original rows, and every pair still agrees. So the recycle is asserted first, from `data-record-id`,
 * and agreement is only evidence once the rows are known to have moved.
 *
 * @see Neo.grid.View#syncBodies
 * @see Neo.grid.column.Component
 */
import {expect, test} from '@playwright/test';

test.describe('Grid component cells across a scroll', () => {
    /**
     * Reads `(recordId, firstname, buttonText)` for the top rows. The button text is produced from
     * `firstname`, so the pair must always agree; `recordId` is what proves the row was recycled.
     */
    const readRows = page => page.evaluate(() => {
        const body = document.querySelector('.neo-grid-body');

        return [...body.querySelectorAll('[role="row"]')].slice(0, 6).map(row => {
            const cells    = [...row.children],
                  recordId = row.dataset.recordId,
                  first    = cells[1]?.textContent.trim(),
                  button   = row.querySelector('button')?.textContent.trim(),
                  nested   = row.querySelector('.bigdata-nested-cell-label')?.textContent.trim();

            return recordId && first && button && nested ? {recordId, first, button, nested} : null
        }).filter(Boolean)
    });

    test('a component cell never shows a different record than its row', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"] button', {timeout: 60000});
        await page.waitForTimeout(700);

        const settled = await readRows(page);

        expect(settled.length, 'rows with a component cell are rendered').toBeGreaterThan(0);
        settled.forEach(({first, button, nested}) => {
            expect(button, `precondition at rest, flat cell of "${first}"`).toBe(`${first} ++`);
            expect(nested, `precondition at rest, nested cell of "${first}"`).toBe(`${first} **`)
        });

        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        const mismatches = [];

        for (let i = 0; i < 30; i++) {
            await page.mouse.wheel(0, 500);
            (await readRows(page)).forEach(({first, button, nested}) => {
                if (button !== `${first} ++`) {
                    mismatches.push(`row shows "${first}" while its flat cell shows "${button}"`)
                }
                if (nested !== `${first} **`) {
                    mismatches.push(`row shows "${first}" while its nested cell shows "${nested}"`)
                }
            })
        }

        await page.waitForTimeout(800);

        const after = await readRows(page);

        // Non-vacuity control, asserted BEFORE agreement is used as evidence: 30 wheel steps of 500px
        // must carry the body far past its buffer, so not one of the rows now on screen may be a row
        // that was on screen at rest. A frozen body fails here instead of passing everything below.
        const before = new Set(settled.map(row => row.recordId)),
              stayed = after.filter(row => before.has(row.recordId)).map(row => row.recordId);

        expect(after.length, 'rows are still rendered after the scroll').toBeGreaterThan(0);
        expect(stayed, 'every visible row was recycled to a new record by the scroll').toEqual([]);

        after.forEach(({first, button, nested}) => {
            expect(button,  `after the scroll settled, flat cell of row "${first}"`).toBe(`${first} ++`);
            expect(nested, `after the scroll settled, nested cell of row "${first}"`).toBe(`${first} **`)
        });

        expect(mismatches.slice(0, 5), `component cells disagreed with their row ${mismatches.length}x during the scroll`)
            .toEqual([])
    })
});
