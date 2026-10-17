import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Content-sized rows sized by a locked column. A row's height covers the tallest wrapped text in any of its
 * three bodies, and each body knows it: a row whose tallest text is locked to the start or the end is as tall in the
 * center as in its own region.
 *
 * Fixture: `test/playwright/component/apps/grid-locked-wrap`, grid `#grid-locked-wrap`: 120 records whose long text
 * rotates through a wrapped column locked to the start, a wrapped center column and a wrapped column locked to the
 * end. Without the per-region check, a fit check would pass on a grid whose locked bodies never size a row.
 */
const GRID = '#grid-locked-wrap',
      // The grid's default rowHeight: the floor of every row
      ROW     = 32,
      REGIONS = ['start', 'center', 'end'];

/**
 * Per rendered record: each body's row height, the height its tallest wrapped text needs, and the region that
 * holds that text when it is taller than every other region's by at least 1px
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

            const entry = report.get(recordId) ?? {heights: [], needs: {start: 0, center: 0, end: 0}};

            entry.heights.push(row.getBoundingClientRect().height);

            row.querySelectorAll('.neo-grid-cell-text').forEach(text => {
                const cell   = text.parentElement,
                      style  = getComputedStyle(cell),
                      chrome = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
                          .reduce((sum, property) => sum + parseFloat(style.getPropertyValue(property)), 0),
                      region = cell.classList.contains('neo-locked-start') ? 'start' : cell.classList.contains('neo-locked-end') ? 'end' : 'center';

                entry.needs[region] = Math.max(entry.needs[region], text.getBoundingClientRect().height + chrome)
            });

            report.set(recordId, entry)
        })
    });

    return [...report.entries()].map(([recordId, {heights, needs}]) => {
        const sorted = Object.entries(needs).sort((a, b) => b[1] - a[1]);

        return {
            heights,
            natural: Math.max(floor, sorted[0][1]),
            recordId,
            tallest: sorted[0][1] - sorted[1][1] >= 1 ? sorted[0][0] : null
        }
    })
}, {grid: GRID, floor: ROW});

/**
 * Every rendered row is as tall as its tallest wrapped text in all three bodies, and each region holds the tallest
 * text of at least one rendered row
 * @param {import('@playwright/test').Page} page
 */
async function expectEveryRegionSizesRows(page) {
    await expect(async () => {
        let report = await rowReport(page);

        expect(report.length).toBeGreaterThan(5);

        REGIONS.forEach(region => {
            expect(report.some(entry => entry.tallest === region), `a rendered row takes its height from the ${region} region`).toBe(true)
        });

        report.forEach(({heights, natural, recordId, tallest}) => {
            expect(heights, `record ${recordId}: a row in each of the three bodies`).toHaveLength(3);
            heights.forEach(height => expect(Math.abs(height - natural), `record ${recordId} (tallest: ${tallest}): ${height} vs ${natural}`).toBeLessThan(1))
        })
    }).toPass({timeout: 5000})
}

test.describe('Grid content-sized rows sized by a locked column', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-locked-wrap/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell-text`, {state: 'visible', timeout: 30000})
    });

    test('a row is as tall as its tallest wrapped text in any region, in all three bodies', async ({page}) => {
        await expectEveryRegionSizesRows(page)
    });

    test('rows that mount on a scroll are sized the same way', async ({page}) => {
        await expectEveryRegionSizesRows(page);

        await page.evaluate(grid => {
            document.querySelector(`${grid} .neo-grid-view`).scrollTop = 3000
        }, GRID);

        await expect.poll(() => page.evaluate(grid =>
            Math.min(...[...document.querySelectorAll(`${grid} .neo-grid-row [data-field="id"]`)]
                .filter(cell => cell.closest('.neo-grid-row').style.display !== 'none')
                .map(cell => Number(cell.textContent) || Infinity))
        , GRID), {message: 'the grid shows rows further down'}).toBeGreaterThan(10);

        await expectEveryRegionSizesRows(page)
    })
});
