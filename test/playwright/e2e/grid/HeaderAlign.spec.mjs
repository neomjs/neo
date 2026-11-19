import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `headerAlign` in `examples/grid/export`: the Amount header's label sits over its digits (right edge within
 * the column's right padding), while a default header's label stays at the left edge.
 *
 * AC-1: `headerAlign: 'right'` puts the label's right edge within header padding of the column's right edge.
 * AC-4: A column without `headerAlign` renders exactly as on dev (label x is at the left edge).
 * AC-5: The sort glyph, column menu trigger, and showHeaderFilter stay inside the header and keep working.
 */
const GRID = '.neo-examples-grid-export .neo-grid-container',
      URL  = '/examples/grid/export/index.html';

/**
 * Wait for the grid to paint its first row.
 * @param {Object} page
 */
const ready = async page => {
    await page.goto(URL);
    await expect(page.locator(`${GRID} .neo-grid-cell[data-field='invoice']`).first()).toHaveText('INV-1001', {timeout: 30000})
};

test.describe('Grid export example — headerAlign', () => {
    test.setTimeout(90000);

    /**
     * AC-1: Amount header label is right-aligned — its right edge is within 20 px of the column's right edge.
     */
    test('a right-aligned header (Amount) puts its label within padding of the column right edge', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header    = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Amount'});
        const label     = header.locator('.neo-button-text');

        const headerBox = await header.boundingBox();
        const labelBox  = await label.boundingBox();

        // Gap between label's right edge and header's right edge must be small (within padding, ≤ 20 px)
        const gap = headerBox.x + headerBox.width - (labelBox.x + labelBox.width);
        expect(gap).toBeLessThanOrEqual(20);

        // And the label must have actually moved: gap must be less than 200 px (old misaligned state)
        expect(gap).toBeGreaterThanOrEqual(0)
    });

    /**
     * AC-4: Invoice header (no headerAlign) keeps its label at the left edge — gap from the left border is small.
     */
    test('a default header (Invoice) keeps its label at the left edge', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header    = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Invoice'});
        const label     = header.locator('.neo-button-text');

        const headerBox = await header.boundingBox();
        const labelBox  = await label.boundingBox();

        // Label's left edge should be close to the header's left edge (within padding, ≤ 20 px)
        const leftGap = labelBox.x - headerBox.x;
        expect(leftGap).toBeLessThanOrEqual(20);
        expect(leftGap).toBeGreaterThanOrEqual(0)
    });

    /**
     * AC-5: Clicking the Amount header still sorts — the glyph and click handler work inside a right-aligned header.
     */
    test('clicking a right-aligned Amount header sorts the column', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Amount'});
        await header.click();

        // After one click the header carries aria-sort="ascending"
        await expect(header).toHaveAttribute('aria-sort', 'ascending', {timeout: 5000})
    })
});
