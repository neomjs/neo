import {test, expect} from '@playwright/test';

/**
 * @summary A grid column's trailing edge shows across unused width, and never doubles where two regions meet.
 *
 * The last column of a region draws its edge just outside its own box — a cell box-shadow, a header `::after` — so
 * the region's own clip decides: a row's paint containment and a header toolbar's `overflow-x` hide the edge
 * wherever the column reaches the region's end, and nothing hides it across unused width.
 *
 * Both are paint, not layout, so the arms read screen pixels: every edge is compared with an inner column's divider
 * in the same row. Fixtures:
 * - `apps/grid-cell-editing`: `#grid-cell-editing` (fixed widths, `note` locked to the end) leaves 608px unused at
 *   1400px, and a narrower viewport makes its center meet or overflow the end region. Unlocking `note` leaves a
 *   fixed-width grid with no locked end.
 *   `#grid-cell-editing-pooled` (40 pooled columns) meets its end region when scrolled to the end.
 * - `apps/grid-focus`: `#grid-focus-short` has a flex column and no locked regions, so its last column meets the
 *   grid's own edge.
 */
const CELL_EDITING = 'test/playwright/component/apps/grid-cell-editing/index.html',
      GRID         = '#grid-cell-editing',
      POOLED       = '#grid-cell-editing-pooled';

test.use({viewport: {width: 1400, height: 900}});

/**
 * One screen pixel per point, as `r,g,b`, decoded in the page from a real screenshot.
 * @param {import('@playwright/test').Page} page
 * @param {{x: Number, y: Number}[]} points
 * @returns {Promise<String[]>}
 */
const pixels = async (page, points) => {
    const png = (await page.screenshot()).toString('base64');

    return page.evaluate(async ({png, points}) => {
        const image = new Image();

        image.src = `data:image/png;base64,${png}`;
        await image.decode();

        const context = new OffscreenCanvas(image.width, image.height).getContext('2d');

        context.drawImage(image, 0, 0);

        return points.map(({x, y}) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)].join())
    }, {png, points})
};

/**
 * A column's header button box in page pixels, and the vertical middle of the header and of its visible cells.
 * @param {import('@playwright/test').Page} page
 * @param {String} grid
 * @param {String} text The header text
 * @param {String} field The cells' `data-field`
 * @returns {Promise<{cellWidths: Number[], cellYs: Number[], headerY: Number, left: Number, right: Number}>}
 */
const column = (page, grid, text, field) => page.evaluate(({grid, text, field}) => {
    const node   = document.querySelector(grid),
          button = [...node.querySelectorAll('.neo-grid-header-button')].find(item => item.textContent.trim() === text),
          header = button.getBoundingClientRect(),
          cells  = [...node.querySelectorAll(`.neo-grid-cell[data-field="${field}"]`)].map(cell => cell.getBoundingClientRect())
              .filter(rect => rect.top > header.bottom && rect.bottom < node.getBoundingClientRect().bottom);

    return {
        cellWidths: cells.map(rect => Math.round(rect.width)),
        cellYs    : cells.map(rect => Math.round(rect.top + rect.height / 2)),
        headerY   : Math.round(header.top + header.height / 2),
        left      : Math.round(header.left),
        right     : Math.round(header.right)
    }
}, {grid, text, field});

/**
 * The divider colour of an inner column in the header row and in a cell row: what an edge must look like.
 * @param {import('@playwright/test').Page} page
 * @param {Object} inner A {@link column} result for a column that is not its region's last
 * @param {Number} cellY
 * @returns {Promise<{cell: String, header: String}>}
 */
const dividers = async (page, inner, cellY) => {
    const [header, cell] = await pixels(page, [{x: inner.right - 1, y: inner.headerY}, {x: inner.right - 1, y: cellY}]);

    return {cell, header}
};

/**
 * Asserts the column's edge shows just outside it in the header and in every visible cell, and the unused width
 * beyond stays empty.
 * @param {import('@playwright/test').Page} page
 * @param {Object} last A {@link column} result for the region's last column
 * @param {Object} inner A {@link column} result for an inner column of the same grid
 */
const expectEdgeShown = async (page, last, inner) => {
    const {cell, header} = await dividers(page, inner, last.cellYs[0]),
          ys             = [last.headerY, ...last.cellYs],
          edge           = await pixels(page, ys.map(y => ({x: last.right, y}))),
          beyond         = await pixels(page, [last.headerY, last.cellYs[0]].map(y => ({x: last.right + 8, y})));

    expect(last.cellYs.length, 'the column renders cells to read').toBeGreaterThan(0);
    expect(edge, 'the header and every cell close the column').toEqual([header, ...last.cellYs.map(() => cell)]);
    expect(beyond, 'the unused width stays empty').toEqual([expect.not.stringMatching(`^${header}$`), expect.not.stringMatching(`^${cell}$`)])
};

/**
 * Asserts exactly one divider where a column meets the next region at `x`: the pixel column before `x` is the
 * column's own paint, in the header and in every cell, and the next region draws the divider at `x`.
 * @param {import('@playwright/test').Page} page
 * @param {Object} last A {@link column} result for the column that meets the region's end
 * @param {Object} inner A {@link column} result for an inner column
 * @param {Number} x The first pixel column past the meeting point
 * @param {Boolean} [neighbourDivider=true] False where the grid's own edge, not a region, follows
 */
const expectSingleDivider = async (page, last, inner, x, neighbourDivider=true) => {
    const {cell, header} = await dividers(page, inner, last.cellYs[0]),
          ys             = [last.headerY, ...last.cellYs],
          inside         = await pixels(page, ys.map(y => ({x: x - 1, y})));

    expect(last.cellYs.length, 'the column renders cells to read').toBeGreaterThan(0);
    expect(inside[0], 'the header draws no second divider').not.toBe(header);
    inside.slice(1).forEach(pixel => expect(pixel, 'no cell draws a second divider').not.toBe(cell));

    if (neighbourDivider) {
        expect(await pixels(page, ys.map(y => ({x, y}))), 'the next region draws the one divider, header and cells alike')
            .toEqual([header, ...last.cellYs.map(() => cell)])
    }
};

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} url
 * @param {String} grid
 */
const open = async (page, url, grid) => {
    await page.goto(url);
    await page.waitForSelector(`${grid} .neo-grid-row .neo-grid-cell`, {state: 'visible'})
};

/**
 * Scrolls a grid's horizontal scrollbar, the grid's one scroll source, to its end.
 * @param {import('@playwright/test').Page} page
 * @param {String} grid
 */
const scrollToEnd = (page, grid) => page.evaluate(grid => {
    const scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);

    scrollbar.scrollLeft = scrollbar.scrollWidth
}, grid);

test.describe('grid column trailing edge — shown across unused width (#18969)', () => {
    test('the last center column closes its edge in the header and in every cell', async ({page}) => {
        await open(page, CELL_EDITING, GRID);

        const city  = await column(page, GRID, 'City', 'city'),
              note  = await column(page, GRID, 'Note', 'note'),
              score = await column(page, GRID, 'Score', 'score');

        expect(note.left - city.right, 'the fixture leaves unused center width').toBeGreaterThan(100);

        await expectEdgeShown(page, city, score)
    });

    test('a lock change moves the edge to the column that is now last', async ({page}) => {
        await open(page, CELL_EDITING, GRID);
        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-city', locked: 'start'}));

        await expect.poll(() => page.evaluate(grid => document.querySelector(grid)
            .querySelectorAll('.neo-grid-header-toolbar')[1].lastElementChild.textContent.trim(), GRID)).toBe('Score');

        await expectEdgeShown(page, await column(page, GRID, 'Score', 'score'), await column(page, GRID, 'Name', 'name'))
    });

    test('a fixed-width grid without a locked end keeps its declared widths and dividers, and closes its last column', async ({page}) => {
        await open(page, CELL_EDITING, GRID);
        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-note', locked: null}));

        // the end region is gone, and Note is the center's last column
        await expect.poll(() => page.evaluate(grid => [...document.querySelector(grid).querySelectorAll('.neo-grid-header-toolbar')]
            .map(toolbar => toolbar.lastElementChild.textContent.trim()), GRID)).toEqual(['#', 'Note']);

        const center = await Promise.all([['Name', 'name'], ['Score', 'score'], ['City', 'city'], ['Note', 'note']]
            .map(([text, field]) => column(page, GRID, text, field)));

        const [name, score, city, note] = center,
              {cell, header}            = await dividers(page, name, note.cellYs[0]);

        expect(center.map(({left, right}) => right - left), 'the declared widths, in the header').toEqual([200, 100, 160, 160]);
        expect(center.map(({cellWidths}) => [...new Set(cellWidths)]), 'and in every cell').toEqual([[200], [100], [160], [160]]);

        for (const inner of [score, city]) {
            expect(await pixels(page, [inner.headerY, ...inner.cellYs].map(y => ({x: inner.right - 1, y}))), 'an inner column keeps its divider')
                .toEqual([header, ...inner.cellYs.map(() => cell)])
        }

        await expectEdgeShown(page, note, name)
    });
});

test.describe('grid column trailing edge — one divider where regions meet (#18969)', () => {
    test('the locked start meets the center with its last column\'s divider, in the header as in the cells', async ({page}) => {
        await open(page, CELL_EDITING, GRID);

        const id             = await column(page, GRID, '#', 'id'),
              ys             = [id.headerY, ...id.cellYs],
              {cell, header} = await dividers(page, await column(page, GRID, 'Score', 'score'), id.cellYs[0]);

        expect(await pixels(page, ys.map(y => ({x: id.right - 1, y}))), 'the locked start closes its last column')
            .toEqual([header, ...id.cellYs.map(() => cell)]);
        expect(await pixels(page, ys.map(y => ({x: id.right, y}))), 'the center adds no second divider')
            .toEqual(ys.map(() => expect.not.stringMatching(`^(${header}|${cell})$`)))
    });

    test('a center that exactly fills its region meets the locked end with the end region\'s divider alone', async ({page}) => {
        await open(page, CELL_EDITING, GRID);

        const {left, right} = {left: (await column(page, GRID, 'City', 'city')).right, right: (await column(page, GRID, 'Note', 'note')).left};

        await page.setViewportSize({width: 1400 - (right - left), height: 900});
        await expect.poll(async () => (await column(page, GRID, 'Note', 'note')).left - (await column(page, GRID, 'City', 'city')).right).toBe(0);

        const note = await column(page, GRID, 'Note', 'note');

        await expectSingleDivider(page, await column(page, GRID, 'City', 'city'), await column(page, GRID, 'Score', 'score'), note.left)
    });

    test('an overflowing center scrolled to its end meets the locked end with one divider', async ({page}) => {
        await open(page, CELL_EDITING, GRID);

        const {left, right} = {left: (await column(page, GRID, 'City', 'city')).right, right: (await column(page, GRID, 'Note', 'note')).left};

        await page.setViewportSize({width: 1400 - (right - left) - 120, height: 900});
        await expect.poll(async () => (await column(page, GRID, 'Note', 'note')).left - (await column(page, GRID, 'City', 'city')).right).toBeLessThan(0);

        await scrollToEnd(page, GRID);
        await expect.poll(async () => (await column(page, GRID, 'Note', 'note')).left - (await column(page, GRID, 'City', 'city')).right).toBe(0);

        const note = await column(page, GRID, 'Note', 'note');

        await expectSingleDivider(page, await column(page, GRID, 'City', 'city'), await column(page, GRID, 'Name', 'name'), note.left)
    });

    test('pooled columns scrolled to the end meet the locked end with one divider', async ({page}) => {
        await open(page, CELL_EDITING, POOLED);
        await scrollToEnd(page, POOLED);

        await expect.poll(async () => (await column(page, POOLED, 'C39', 'c39')).left - (await column(page, POOLED, 'C38', 'c38')).right).toBe(0);
        // the header scrolls in-frame; the pooled cells follow once the mounted column window moves
        await expect.poll(async () => (await column(page, POOLED, 'C38', 'c38')).cellYs.length).toBeGreaterThan(0);

        const c39 = await column(page, POOLED, 'C39', 'c39');

        await expectSingleDivider(page, await column(page, POOLED, 'C38', 'c38'), await column(page, POOLED, 'C37', 'c37'), c39.left)
    });

    test('a flex column fills the grid: its declared widths hold, and the last column meets the grid\'s own edge', async ({page}) => {
        await open(page, 'test/playwright/component/apps/grid-focus/index.html', '#grid-focus-short');

        const grid  = '#grid-focus-short',
              id    = await column(page, grid, '#', 'id'),
              city  = await column(page, grid, 'City', 'city'),
              score = await column(page, grid, 'Score', 'score');

        expect([id.right - id.left, city.right - city.left, score.right - score.left], 'the declared widths').toEqual([60, 140, 90]);
        await expectSingleDivider(page, score, city, score.right, false)
    });
});
