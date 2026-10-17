import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A `wrapText` tree column wraps its labels in a content-sized grid, and its rows grow to fit them through
 * expand, collapse and its header filter. In a fixed-height grid the label keeps its one-line ellipsis.
 *
 * The oracle is the browser's layout. In `#grid-sized` a row is as tall as its tallest wrapped text plus the cell's
 * padding and borders, never less than `rowHeight`, and the rows stack without gaps. `#grid-fixed` shows the same
 * tree with fixed-height rows.
 *
 * Fixture: `test/playwright/component/apps/grid-tree-content-sized`.
 */
const ROW = 32;

/**
 * Page-side read, installed before the app boots: `treeRows(gridId)` lists the displayed rows of a grid's body in
 * visual order, each named by the first word of its tree label (unique in the fixture), with its height and top, the
 * height its wrapped texts need (`natural`), and whether its tree label is cut off (`labelClipped`).
 * @param {Number} floor The grids' rowHeight
 */
function defineReads(floor) {
    const chrome = cell => {
        const style = getComputedStyle(cell);

        return ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
            .reduce((sum, property) => sum + parseFloat(style.getPropertyValue(property)), 0)
    };

    window.treeRows = gridId => [...document.querySelectorAll(`#${gridId} .neo-grid-body .neo-grid-row`)]
        // A row of the visible pool, not an idle or a hidden measuring one
        .filter(row => row.style.display !== 'none' && row.dataset.recordId && getComputedStyle(row).visibility !== 'hidden')
        .map(row => {
            const rect  = row.getBoundingClientRect(),
                  label = row.querySelector('.neo-tree-content'),
                  needs = [...row.querySelectorAll('.neo-grid-cell')].map(cell => {
                      // A text cell wraps in its text block, a wrapText tree cell in its label
                      const text = cell.querySelector(':scope > .neo-grid-cell-text') ||
                          (cell.classList.contains('neo-wrap-text') ? cell.querySelector(':scope > .neo-grid-tree-cell > .neo-tree-content') : null);

                      return text ? Math.ceil(text.getBoundingClientRect().height + chrome(cell)) : 0
                  });

            return {
                height      : Math.round(rect.height),
                id          : label?.textContent.trim().split(' ')[0],
                labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : null,
                natural     : Math.max(floor, ...needs),
                top         : Math.round(rect.top)
            }
        })
        .sort((a, b) => a.top - b.top)
}

/**
 * Asserts the content-sized invariants of `#grid-sized` until they hold: every row as tall as its tallest wrapped
 * text, rows stacked without gaps, no tree label cut off, and `ids` shown in this order.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} ids
 * @returns {Promise<Object[]>} The settled rows
 */
async function expectSized(page, ids) {
    let rows;

    await expect(async () => {
        rows = await page.evaluate(() => window.treeRows('grid-sized'));

        expect(rows.map(row => row.id)).toEqual(ids);

        rows.forEach(row => {
            expect(Math.abs(row.height - row.natural), `${row.id}: height ${row.height}, its text needs ${row.natural}`).toBeLessThanOrEqual(1);
            expect(row.labelClipped, `${row.id}: the tree label is cut off`).toBe(false)
        });

        rows.slice(1).forEach((row, index) => {
            expect(Math.abs(row.top - (rows[index].top + rows[index].height)), `${row.id} stacks on ${rows[index].id}`).toBeLessThanOrEqual(1)
        })
    }).toPass({timeout: 15000});

    return rows
}

test.describe('grid.column.Tree — wrapText in content-sized rows', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1200, height: 900});
        await page.addInitScript(defineReads, ROW);
        await page.goto('/test/playwright/component/apps/grid-tree-content-sized/index.html');
        await expect(page.locator('#grid-sized .neo-tree-content', {hasText: 'Container.mjs'})).toBeVisible({timeout: 30000})
    });

    test('a long tree label wraps, and its row grows to fit it', async ({page}) => {
        const rows      = await expectSized(page, ['src', 'component', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']),
              container = rows.find(row => row.id === 'Container.mjs');

        expect(container.height, 'the wrapped label makes its row taller than rowHeight').toBeGreaterThan(ROW)
    });

    test('expand, collapse and re-expand keep every row fitted and stacked', async ({page}) => {
        const toggle = label => page.locator('#grid-sized .neo-grid-row', {has: page.locator('.neo-tree-content', {hasText: new RegExp(`^${label}$`)})})
            .locator('.neo-tree-toggle').click();

        const before = await expectSized(page, ['src', 'component', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);

        await toggle('component');
        await expectSized(page, ['src', 'component', 'Base.mjs', 'Button.mjs', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);

        await toggle('grid');
        await expectSized(page, ['src', 'component', 'Base.mjs', 'Button.mjs', 'grid', 'README.md']);

        await toggle('grid');
        const after = await expectSized(page, ['src', 'component', 'Base.mjs', 'Button.mjs', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);

        expect(after.find(row => row.id === 'Container.mjs').height, 'the re-expanded label keeps its height')
            .toBe(before.find(row => row.id === 'Container.mjs').height)
    });

    test('the tree column\'s header filter keeps the matches with their ancestors, and the rows refit', async ({page}) => {
        const filter = page.locator('#grid-sized .neo-grid-header-button', {hasText: 'Name'}).locator('input');

        await expectSized(page, ['src', 'component', 'grid', 'Container.mjs', 'Row.mjs', 'README.md']);

        // The match sits in the collapsed `component` folder, which expands to show it
        await filter.fill('button');
        await expectSized(page, ['src', 'component', 'Button.mjs']);

        await filter.fill('container');
        await expectSized(page, ['src', 'grid', 'Container.mjs']);

        // The cleared filter shows every node again, `component` now expanded
        await filter.fill('');
        await expectSized(page, ['src', 'component', 'Base.mjs', 'Button.mjs', 'grid', 'Container.mjs', 'Row.mjs', 'README.md'])
    });

    test('a fixed-height grid keeps the tree label on one line with an ellipsis', async ({page}) => {
        await expect(async () => {
            const rows      = await page.evaluate(() => window.treeRows('grid-fixed')),
                  container = rows.find(row => row.id === 'Container.mjs');

            expect(rows.every(row => row.height === ROW), 'every fixed row is rowHeight tall').toBe(true);
            expect(container.labelClipped, 'the long label is cut off with an ellipsis').toBe(true)
        }).toPass({timeout: 15000})
    })
});
