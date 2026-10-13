import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A content-sized grid whose body animates its rows. The animation plugin stands aside: it takes its row
 * transitions off the body, and a sort renders every row at the summed height of the rows above it in the new
 * order, without throwing.
 *
 * Fixture: `test/playwright/component/apps/grid-animated-content-sized`, grid `#grid-animated-content-sized`: the
 * 300 rows of `grid-content-sized`, whose heights repeat {@link HEIGHTS}, with `animatedRowSorting` on.
 */
const GRID  = '#grid-animated-content-sized',
      COUNT = 300,
      // Mirrors the content-sized fixture
      HEIGHTS = [32, 96, 48, 240, 32, 64];

/**
 * @param {Number} id
 * @returns {Number} The height of a record's row
 */
const heightOf = id => HEIGHTS[(id - 1) % HEIGHTS.length];

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
}, GRID);

test.describe('Grid content-sized rows with animatedRowSorting', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test('a sort renders the rows at their offsets in the new order, without row transitions', async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-animated-content-sized/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});

        expect(await page.evaluate(grid =>
            document.querySelector(`${grid} .neo-grid-body`).classList.contains('neo-animate-rows'), GRID)).toBe(false);

        // Ascending, then descending by id
        const header = page.locator(`${GRID} .neo-grid-header-button`, {hasText: '#'}).first();

        await header.click();
        await header.click();

        await expect(async () => {
            let rows = await renderedRows(page);

            expect(rows.find(row => row.top === 0)?.id, 'the top row after the sort').toBe(COUNT);

            rows.forEach(row => {
                let top = 0;

                // The records above it in the new order: the larger ids
                for (let id = COUNT; id > row.id; id--) {
                    top += heightOf(id)
                }

                expect(row, `row ${row.id}`).toEqual({height: heightOf(row.id), id: row.id, top})
            })
        }).toPass({timeout: 5000})
    })
});
