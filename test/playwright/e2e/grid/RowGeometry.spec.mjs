import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Grid row geometry in a real browser. Content-sized rows sit at the summed height of the rows above
 * them, the scroll extent is the summed height of all rows, no row of the viewport stays unrendered at any scroll
 * position, and keyboard navigation brings each row fully into view, the final one included. Fixed-height rows
 * are the control for keyboard scrolling: both modes align a row against the view's visible height.
 *
 * Fixtures:
 * - `test/playwright/component/apps/grid-content-sized`, grid `#grid-content-sized`: 300 rows whose heights
 *   repeat {@link HEIGHTS}, handed to `grid.View#setRowHeights` in place of measurement.
 * - `test/playwright/component/apps/grid-focus`, grid `#grid-focus-long`: 400 rows of the fixed 32px height.
 */
const CONTENT_SIZED = '#grid-content-sized',
      FIXED         = '#grid-focus-long',
      // Mirrors the content-sized fixture
      HEIGHTS       = [32, 96, 48, 240, 32, 64],
      COUNT         = 300,
      // The estimate: the extent keeps one estimated row below the last one, as a fixed-height grid does
      ROW           = 32,
      offsets       = [0];

for (let i = 0; i < COUNT; i++) {
    offsets.push(offsets[i] + HEIGHTS[i % HEIGHTS.length])
}

/**
 * The rows the body renders, by record id (the `#` cell), with their top and height in px relative to the body
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object[]>}
 */
const renderedRows = page => page.evaluate(grid => {
    const body = document.querySelector(`${grid} .neo-grid-body`),
          top  = body.getBoundingClientRect().top;

    return [...body.querySelectorAll('.neo-grid-row')]
        .filter(row => row.style.display !== 'none' && row.dataset.recordId)
        .map(row => {
            const rect = row.getBoundingClientRect();

            return {
                height: Math.round(rect.height),
                id    : Number(row.querySelector('[data-field="id"]').textContent),
                top   : Math.round(rect.top - top)
            }
        })
}, CONTENT_SIZED);

/**
 * The scroll position and the visible height of a grid view
 * @param {import('@playwright/test').Page} page
 * @param {String} grid
 * @returns {Promise<{clientHeight: Number, scrollTop: Number}>}
 */
const viewport = (page, grid) => page.evaluate(grid => {
    const view = document.querySelector(`${grid} .neo-grid-view`);

    return {clientHeight: view.clientHeight, scrollTop: view.scrollTop}
}, grid);

/**
 * The selected row's record id, and whether the row lies fully inside the view
 * @param {import('@playwright/test').Page} page
 * @param {String} grid
 * @returns {Promise<{id: Number, visible: Boolean}|null>}
 */
const selectedRow = (page, grid) => page.evaluate(grid => {
    const row  = document.querySelector(`${grid} .neo-grid-row.neo-selected`),
          view = document.querySelector(`${grid} .neo-grid-view`);

    if (!row) {
        return null
    }

    const r = row.getBoundingClientRect(),
          v = view.getBoundingClientRect();

    return {id: Number(row.querySelector('[data-field="id"]').textContent), visible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1}
}, grid);

/**
 * Every pixel row of the visible part of the body is covered by a rendered row
 * @param {Object[]} rows
 * @param {{clientHeight: Number, scrollTop: Number}} view
 */
function expectViewportCovered(rows, {clientHeight, scrollTop}) {
    let bottom = Math.min(scrollTop + clientHeight, offsets[COUNT]),
        cursor = scrollTop;

    rows.sort((a, b) => a.top - b.top).forEach(row => {
        if (row.top <= cursor && row.top + row.height > cursor) {
            cursor = row.top + row.height
        }
    });

    expect(cursor, `rows cover the viewport from ${scrollTop} to ${bottom}`).toBeGreaterThanOrEqual(bottom)
}

test.describe('Grid content-sized rows', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-content-sized/index.html');
        await page.waitForSelector(`${CONTENT_SIZED} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000})
    });

    test('rows sit at the summed heights of the rows above them, and the extent is the summed height', async ({page}) => {
        let rows = await renderedRows(page);

        expect(rows.length).toBeGreaterThan(5);

        rows.forEach(row => {
            expect(row, `row ${row.id}`).toEqual({
                height: HEIGHTS[(row.id - 1) % HEIGHTS.length],
                id    : row.id,
                top   : offsets[row.id - 1]
            })
        });

        expect(await page.evaluate(grid => ({
            body     : parseFloat(document.querySelector(`${grid} .neo-grid-body`).style.height),
            scrollbar: parseFloat(document.querySelector(`${grid} .neo-grid-scrollbar-content`).style.height)
        }), CONTENT_SIZED)).toEqual({body: offsets[COUNT] + ROW, scrollbar: offsets[COUNT] + ROW})
    });

    test('no row of the viewport stays unrendered while a tall row scrolls out of view', async ({page}) => {
        // Inside the 240px row 4 with 40px of it left, mid-list, and close to the end
        for (const scrollTop of [offsets[3] + 200, offsets[150] + 10, offsets[COUNT - 10]]) {
            await page.evaluate(({grid, scrollTop}) => {
                document.querySelector(`${grid} .neo-grid-view`).scrollTop = scrollTop
            }, {grid: CONTENT_SIZED, scrollTop});

            await expect(async () => {
                let view = await viewport(page, CONTENT_SIZED),
                    rows = await renderedRows(page);

                rows.forEach(row => expect(row.top, `row ${row.id}`).toBe(offsets[row.id - 1]));
                expectViewportCovered(rows, view)
            }).toPass({timeout: 5000})
        }
    });

    test('arrow keys bring each row fully into view, and wrap to the final row and back', async ({page}) => {
        await page.locator(`${CONTENT_SIZED} .neo-grid-row[data-record-id] [data-field="name"]`).getByText('Row 1', {exact: true}).click();
        await expect.poll(() => selectedRow(page, CONTENT_SIZED)).toEqual({id: 1, visible: true});

        // Down through two cycles of the heights, the 240px rows included, and back up
        for (let id = 2; id <= 14; id++) {
            await page.keyboard.press('ArrowDown');
            await expect.poll(() => selectedRow(page, CONTENT_SIZED), `row ${id}`).toEqual({id, visible: true})
        }

        for (let id = 13; id >= 1; id--) {
            await page.keyboard.press('ArrowUp');
            await expect.poll(() => selectedRow(page, CONTENT_SIZED), `row ${id}`).toEqual({id, visible: true})
        }

        // Up from the first row wraps to the final row, which has to end up fully visible
        await page.keyboard.press('ArrowUp');
        await expect.poll(() => selectedRow(page, CONTENT_SIZED)).toEqual({id: COUNT, visible: true});

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => selectedRow(page, CONTENT_SIZED)).toEqual({id: 1, visible: true});
        expect((await viewport(page, CONTENT_SIZED)).scrollTop).toBe(0)
    })
});

test.describe('Grid fixed-height rows', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test('arrowing down past the visible rows brings each row fully into view', async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-focus/index.html');
        await page.waitForSelector(`${FIXED} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});

        await page.locator(`${FIXED} .neo-grid-row[data-record-id] [data-field="id"]`).getByText('1', {exact: true}).click();
        await expect.poll(() => selectedRow(page, FIXED)).toEqual({id: 1, visible: true});

        // The grid shows about eleven rows, so the later presses scroll it
        for (let id = 2; id <= 16; id++) {
            await page.keyboard.press('ArrowDown');
            await expect.poll(() => selectedRow(page, FIXED), `row ${id}`).toEqual({id, visible: true})
        }

        expect((await viewport(page, FIXED)).scrollTop, 'the grid scrolled').toBeGreaterThan(0)
    })
});
