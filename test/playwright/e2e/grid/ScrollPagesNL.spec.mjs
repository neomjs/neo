import {test, expect} from '../../fixtures.mjs';

/**
 * @summary 2,000,000 rows reach past the browser's scroll extent cap, and still scroll to their last row.
 *
 * The BigData example's store generates its rows lazily. At 2,000,000 rows of 32 px the logical extent is about twice
 * what Blink lays out, so the grid view scrolls in pages (`Neo.grid.ScrollPages`). A drag of the vertical scrollbar's
 * thumb to its bottom and a keyboard jump to the last row both have to render the last record inside the viewport.
 *
 * Headless Chrome hides scrollbars, so the drag is the two halves the engine sees of a real one: a `mousedown` on the
 * scrollbar, which `GridRowScrollPinning` turns into a thumb drag, and the scroll offset the thumb sets.
 *
 * @see Neo.grid.View#syncBodies
 */
test.describe('Grid scroll pages: 2,000,000 rows (Neural Link)', () => {
    test.setTimeout(180000);

    const count = 2000000;

    /**
     * The last record's row is rendered inside the view's box. One header row precedes the body rows, and
     * `aria-rowindex` is 1-based.
     * @param {import('@playwright/test').Page} page
     * @param {String} viewId
     * @returns {Promise<Boolean>}
     */
    const lastRowVisible = (page, viewId) => page.evaluate(({count, viewId}) => {
        let view = document.getElementById(viewId),
            row  = view?.querySelector(`.neo-grid-row[aria-rowindex="${count + 1}"]`);

        if (!row) return false;

        let rowRect  = row.getBoundingClientRect(),
            viewRect = view.getBoundingClientRect();

        return rowRect.top >= viewRect.top - 1 && rowRect.bottom <= viewRect.bottom + 1
    }, {count, viewId});

    test('a thumb drag and a keyboard jump both reach the last row', async ({page, neuralLink}) => {
        await page.goto('/examples/grid/bigData/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.grid.bigData');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});

        const [grid] = await app.queryComponent(
                  {className: 'Neo.examples.grid.bigData.GridContainer'},
                  ['id', 'rowHeight', 'store.id', 'verticalScrollbar.id', 'view.id']
              ),
              {properties} = grid,
              storeId      = properties['store.id'],
              scrollbarId  = properties['verticalScrollbar.id'],
              viewId       = properties['view.id'],
              view         = props => app.getComponent(viewId, props);

        // Fewer columns first, so 2,000,000 rows generate in seconds
        await app.setProperties(grid.id, {amountColumns: 10});
        await app.setProperties(storeId, {amountRows: count});

        await expect.poll(async () => (await view(['paged'])).paged, {timeout: 60000, message: 'the rows reach past the cap'}).toBe(true);

        const {maxScrollHeight} = await view(['maxScrollHeight']),
              extent            = (count + 1) * properties.rowHeight;

        expect(maxScrollHeight, 'the cap Blink lays out, less 1%').toBeGreaterThan(30000000);
        expect(extent).toBeGreaterThan(maxScrollHeight);

        // --- The thumb, dragged to the bottom of the scrollbar ---
        const box = await page.locator(`#${scrollbarId}`).boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + 4);
        await page.mouse.down();
        await expect.poll(async () => (await view(['isThumbDragging'])).isThumbDragging, {message: 'the view knows the drag'}).toBe(true);

        // The browser clamps the offset to the bottom of the range
        await page.evaluate(id => {
            let node = document.getElementById(id);
            node.scrollTop = node.scrollHeight
        }, scrollbarId);

        await expect.poll(() => lastRowVisible(page, viewId), {timeout: 30000, message: 'the drag reaches the last row'}).toBe(true);
        await page.mouse.up();

        expect((await view(['pageOffset'])).pageOffset, 'the last page').toBe(extent - maxScrollHeight);

        // --- Back to the top, then ArrowUp from the first row wraps to the last one ---
        await page.evaluate(id => {document.getElementById(id).scrollTop = 0}, viewId);
        await expect.poll(async () => (await view(['scrollTop'])).scrollTop, {timeout: 30000}).toBe(0);
        expect((await view(['pageOffset'])).pageOffset, 'the top is the first page').toBe(0);

        await page.locator(`#${viewId} .neo-grid-row[aria-rowindex="2"] .neo-grid-cell`).first().click();
        await page.keyboard.press('ArrowUp');

        await expect.poll(() => lastRowVisible(page, viewId), {timeout: 30000, message: 'the keyboard reaches the last row'}).toBe(true);
        expect((await view(['pageOffset'])).pageOffset, 'the last page').toBe(extent - maxScrollHeight)
    })
});
