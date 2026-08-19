/**
 * @file test/playwright/e2e/grid/ComponentCellScrollSync.spec.mjs
 * @summary A component cell must follow its row's record across a scroll.
 *
 * `examples/grid/bigData` renders `countAction` as a Button whose text is `record.firstname + ' ++'`,
 * beside a plain `firstname` cell fed by the same record. That pairing is a self-contained invariant:
 * whatever the row shows, the button must agree, at every scroll position.
 *
 * The invariant only breaks in the real pipeline. `Body#createViewData` updates rows with
 * `silent: true` during scrolling, and at the scroll `updateDepth` the cell components sit on the
 * sparse-tree boundary, where `util/vdom/TreeBuilder` emits them as `{componentId, neoIgnore: true}`
 * — the worker leaves those nodes untouched, so they keep their last rendered content. Unit specs
 * cannot see it: they assert the component instance, which rebinds correctly.
 *
 * @see Neo.grid.View#syncBodies
 * @see Neo.grid.column.Component
 */
import {expect, test} from '@playwright/test';

test.describe('Grid component cells across a scroll', () => {
    /**
     * Reads `(firstname, buttonText)` for the top rows. The button text is produced from
     * `firstname`, so the pair must always agree.
     */
    const readPairs = page => page.evaluate(() => {
        const body = document.querySelector('.neo-grid-body');

        return [...body.querySelectorAll('[role="row"]')].slice(0, 6).map(row => {
            const cells  = [...row.children],
                  first  = cells[1]?.textContent.trim(),
                  button = row.querySelector('button')?.textContent.trim();

            return first && button ? {first, button} : null
        }).filter(Boolean)
    });

    test('a component cell never shows a different record than its row', async ({page}) => {
        await page.goto('/examples/grid/bigData/');
        await page.waitForSelector('.neo-grid-body [role="row"] button', {timeout: 60000});
        await page.waitForTimeout(700);

        const settled = await readPairs(page);

        expect(settled.length, 'rows with a component cell are rendered').toBeGreaterThan(0);
        settled.forEach(({first, button}) => {
            expect(button, `precondition at rest: ${first}`).toBe(`${first} ++`)
        });

        const box = await page.locator('.neo-grid-view').boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        const mismatches = [];

        for (let i = 0; i < 30; i++) {
            await page.mouse.wheel(0, 500);
            (await readPairs(page)).forEach(({first, button}) => {
                if (button !== `${first} ++`) {
                    mismatches.push(`row shows "${first}" while its component cell shows "${button}"`)
                }
            })
        }

        await page.waitForTimeout(800);

        const after = await readPairs(page);

        after.forEach(({first, button}) => {
            expect(button, `after the scroll settled, row "${first}"`).toBe(`${first} ++`)
        });

        expect(mismatches.slice(0, 5), `component cells disagreed with their row ${mismatches.length}x during the scroll`)
            .toEqual([])
    })
});
