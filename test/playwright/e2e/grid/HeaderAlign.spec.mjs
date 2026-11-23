import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `headerAlign` in `examples/grid/export`: verifies label positioning, center alignment, header filter
 * coexistence, default left alignment, sorting, and column-menu coexistence.
 *
 * AC-1: `headerAlign: 'right'` puts the label's right edge within header padding of the column's right edge.
 *       With `showHeaderFilter: true`, the label still stays at the right edge with the filter field ordered before it.
 * AC-2: `headerAlign: 'center'` centers the label within the hidden glyph's width of the header's center.
 * AC-4: A column without `headerAlign` renders exactly as on dev (label x is at the left edge).
 * AC-5: With label aligned right, sort glyph, column menu trigger, and showHeaderFilter stay inside header and keep working.
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
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThan(200)
    });

    /**
     * With showHeaderFilter: true, the field sits before the label (order: -1)
     * and the label stays within padding of the column's right edge.
     */
    test('a right-aligned header with showHeaderFilter keeps its label at the right edge', async ({page, neo}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header   = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Amount'});
        const headerId = await header.getAttribute('id');
        await neo.setConfig(headerId, {showHeaderFilter: true});

        const filterField = header.locator('.neo-textfield');
        await expect(filterField).toBeVisible({timeout: 5000});

        const label     = header.locator('.neo-button-text');
        const headerBox = await header.boundingBox();
        const labelBox  = await label.boundingBox();

        // Label right edge remains within 20 px of the column right edge
        const gap = headerBox.x + headerBox.width - (labelBox.x + labelBox.width);
        expect(gap).toBeLessThanOrEqual(20);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThan(200)
    });

    /**
     * AC-2: Centered label — label center sits within the glyph width of the header center.
     */
    test('a centered header puts its label center within the glyph width of the header center', async ({page, neo}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header   = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Customer'});
        const headerId = await header.getAttribute('id');
        await neo.setConfig(headerId, {headerAlign: 'center'});

        await expect(header).toHaveClass(/neo-header-align-center/);

        const label     = header.locator('.neo-button-text');
        const glyph     = header.locator('.neo-button-glyph');

        const headerBox = await header.boundingBox();
        const labelBox  = await label.boundingBox();
        const glyphBox  = await glyph.boundingBox();

        const headerCenter = headerBox.x + headerBox.width / 2;
        const labelCenter  = labelBox.x + labelBox.width / 2;

        // Label's center sits within the hidden glyph's width + margin of the header's center
        const glyphAllowance = glyphBox ? glyphBox.width + 8 : 18;
        expect(Math.abs(headerCenter - labelCenter)).toBeLessThanOrEqual(glyphAllowance)
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
    });

    /**
     * A right-aligned header with columnMenu keeps trigger in place and opens menu.
     */
    test('a right-aligned header with columnMenu keeps trigger in place and opens menu', async ({page, neo}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await ready(page);

        const header   = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: 'Amount'});
        const headerId = await header.getAttribute('id');
        await neo.setConfig(headerId, {columnMenu: true});

        const wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'Amount'});
        const trigger = wrapper.locator('.neo-grid-menu-trigger');
        await expect(trigger).toBeVisible({timeout: 5000});

        const label      = header.locator('.neo-button-text');
        const triggerBox = await trigger.boundingBox();
        const labelBox   = await label.boundingBox();

        // Trigger is positioned after the label (to the right of it)
        expect(triggerBox.x).toBeGreaterThan(labelBox.x + labelBox.width);

        // Clicking the trigger opens the column menu
        await trigger.click();
        await expect(page.locator('.neo-grid-column-menu')).toBeVisible({timeout: 5000})
    })
});
