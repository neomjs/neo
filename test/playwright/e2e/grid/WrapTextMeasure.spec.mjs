import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Measured content-sized rows in a real browser. Every row is as tall as the tallest wrapped text of its
 * `wrapText` columns plus the cell's padding and borders, never less than `rowHeight`, in each body alike. A word
 * longer than its column breaks inside the cell. Rows that mount on a scroll are measured the same way.
 *
 * Fixture: `test/playwright/component/apps/grid-wrap-text`, grid `#grid-wrap-text` — 300 records with a wrapped
 * `tag` column locked to the start and a wrapped `text` column in the center; every tenth text holds a word wider
 * than its column.
 */
const GRID = '#grid-wrap-text',
      // The grid's default rowHeight: the floor of every row
      ROW  = 32;

/**
 * Per record the bodies render: each body's row height, and the height its wrapped texts need
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object[]>}
 */
const rowReport = page => page.evaluate(({grid, floor}) => {
    const report = new Map();

    document.querySelectorAll(`${grid} .neo-grid-body`).forEach(body => {
        body.querySelectorAll('.neo-grid-row').forEach(row => {
            const {recordId} = row.dataset;

            if (!recordId || row.style.display === 'none') {
                return
            }

            const entry = report.get(recordId) ?? {heights: [], natural: floor};

            entry.heights.push(row.getBoundingClientRect().height);

            row.querySelectorAll('.neo-grid-cell-text').forEach(text => {
                const style  = getComputedStyle(text.parentElement),
                      chrome = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
                          .reduce((sum, property) => sum + parseFloat(style.getPropertyValue(property)), 0);

                entry.natural = Math.max(entry.natural, text.getBoundingClientRect().height + chrome)
            });

            report.set(recordId, entry)
        })
    });

    return [...report.entries()].map(([recordId, entry]) => ({recordId, ...entry}))
}, {grid: GRID, floor: ROW});

/**
 * Every rendered row matches the height its wrapped texts need, in each body
 * @param {import('@playwright/test').Page} page
 */
async function expectRowsFitTheirText(page) {
    await expect(async () => {
        let report = await rowReport(page);

        expect(report.length).toBeGreaterThan(5);

        report.forEach(({heights, natural, recordId}) => {
            heights.forEach(height => expect(Math.abs(height - natural), `record ${recordId}: ${height} vs ${natural}`).toBeLessThan(1))
        })
    }).toPass({timeout: 5000})
}

test.describe('Grid content-sized rows measure their wrapped text', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-wrap-text/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell-text`, {state: 'visible', timeout: 30000})
    });

    test('every row is as tall as its tallest wrapped text, in each body', async ({page}) => {
        await expectRowsFitTheirText(page);

        // The texts differ in length, so the rows have to differ in height
        let heights = new Set((await rowReport(page)).map(entry => Math.round(entry.heights[0])));
        expect(heights.size).toBeGreaterThan(2)
    });

    test('a word longer than its column breaks inside the cell', async ({page}) => {
        await page.evaluate(grid => {
            document.querySelector(`${grid} .neo-grid-view`).scrollTop = 0
        }, GRID);

        await expect(async () => {
            // Rendered containers only: a pooled row out of use keeps its last cells, hidden
            let texts = await page.evaluate(grid => [...document.querySelectorAll(`${grid} .neo-grid-cell-text`)]
                .filter(text => text.textContent.includes('Pneumono') && text.getClientRects().length > 0)
                .map(text => {
                    const cell  = text.parentElement.getBoundingClientRect(),
                          style = getComputedStyle(text.parentElement),
                          right = cell.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);

                    return {fits: text.scrollWidth <= text.clientWidth + 1, inside: text.getBoundingClientRect().right <= right + 1}
                }), GRID);

            expect(texts.length).toBeGreaterThan(0);
            texts.forEach(text => expect(text).toEqual({fits: true, inside: true}))
        }).toPass({timeout: 5000})
    });

    test('rows that mount on a scroll are measured the same way', async ({page}) => {
        await expectRowsFitTheirText(page);

        await page.evaluate(grid => {
            document.querySelector(`${grid} .neo-grid-view`).scrollTop = 6000
        }, GRID);

        await expect.poll(() => page.evaluate(grid =>
            Number(document.querySelector(`${grid} .neo-grid-body:not(.neo-locked-start) .neo-grid-row [data-field="id"]`)?.textContent || 0)
        , GRID), {message: 'the grid shows rows further down'}).not.toBe(1);

        await expectRowsFitTheirText(page)
    })
});
