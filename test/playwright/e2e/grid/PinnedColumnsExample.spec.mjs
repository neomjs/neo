import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/pinnedColumns`: product and region pinned at the start, the total at the end, 36 months
 * between them. Scrolling the centre moves the months and no pinned column; the first frame draws the centre's
 * scrollbar; a phone still shows a whole month between the pinned ones; the arrow keys move the selection.
 */
const GRID = '.neo-grid-container',
      URL  = '/examples/grid/pinnedColumns/index.html';

// Draw scrollbars the way a visitor's browser does: the default headless flag hides every one of them
test.use({launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});

/**
 * @param {Object} page
 * @param {String} text The header text
 * @returns {Promise<{left: Number, right: Number}>}
 */
const header = (page, text) => page.locator('.neo-grid-header-button', {hasText: text}).first().evaluate(node => {
    const {left, right} = node.getBoundingClientRect();
    return {left: Math.round(left), right: Math.round(right)}
});

/**
 * A month's first-row cell: month headers repeat under each year group, a data field does not
 * @param {Object} page
 * @param {String} field e.g. 'm5' for Jun 2026
 * @returns {Promise<{left: Number, right: Number}>}
 */
const cell = (page, field) => page.locator(`${GRID} .neo-grid-cell[data-field='${field}']`).first().evaluate(node => {
    const {left, right} = node.getBoundingClientRect();
    return {left: Math.round(left), right: Math.round(right)}
});

/**
 * @param {Object} page
 */
const ready = async page => {
    await page.goto(URL);
    await expect(page.locator(`${GRID} .neo-grid-cell[data-field='product']`).first()).toHaveText('Aurora Desk', {timeout: 30000})
};

test.describe('Pinned columns example', () => {
    test('scrolling the centre moves the months and no pinned column', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const product = await header(page, 'Product'),
              total   = await header(page, 'Total'),
              june    = await cell(page, 'm5'),
              room    = await page.evaluate(grid => {
                  const scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);
                  return scrollbar.scrollWidth - scrollbar.clientWidth
              }, GRID);

        expect(room, 'the centre is wider than its viewport').toBeGreaterThan(0);

        await page.evaluate(grid => {document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = 360}, GRID);

        await expect.poll(async () => (await cell(page, 'm5')).left).toBe(june.left - 360);
        expect(await header(page, 'Product')).toEqual(product);
        expect(await header(page, 'Total')).toEqual(total)
    });

    test('the first frame draws the centre scrollbar', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        // An overlay scrollbar (macOS) takes no layout space and stays hidden until the visitor scrolls
        const drawn = await page.evaluate(grid => {
            const scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);
            return scrollbar.offsetHeight - scrollbar.clientHeight
        }, GRID);

        expect(drawn, 'the example draws its own 16px scrollbar').toBe(16)
    });

    test('a phone shows a whole month between the pinned columns', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await ready(page);

        const region  = await header(page, 'Region'),
              january = await cell(page, 'm0'),
              total   = await header(page, 'Total');

        expect(january.left).toBeGreaterThanOrEqual(region.right - 1);
        expect(january.right).toBeLessThanOrEqual(total.left + 1)
    });

    test('the arrow keys move the selection', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        await page.locator(`${GRID} .neo-grid-cell[data-field='region']`).first().click();
        await expect(page.locator(`${GRID} .neo-grid-row.neo-selected .neo-grid-cell[data-field='region']`).first()).toHaveText('Americas');

        await page.keyboard.press('ArrowDown');
        await expect(page.locator(`${GRID} .neo-grid-row.neo-selected .neo-grid-cell[data-field='region']`).first()).toHaveText('Europe')
    });
});
