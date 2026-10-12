import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Content-sized height corrections in a real browser. A height change above the visible rows moves the
 * scroll offset with them, so the row at the top edge of the view holds still in every frame. At the end of the
 * list, growth needs the grown extent before the offset can follow, and shrinking must not move the offset twice.
 * Scrolling up over rows measured on the way shows no jump. A thumb drag holds the extent until its release, the
 * release keeps the row at the top edge still, and the final row stays reachable before and after. A row that
 * keyboard navigation jumped to keeps its edge instead, while the rows around it are learned.
 *
 * Fixture: `test/playwright/component/apps/grid-anchor`, grid `#grid-anchor`: 300 rows whose heights repeat
 * {@link HEIGHTS}, learned after the render that first shows a row, as measurement does. `#grid-anchor-grow`
 * doubles the heights of the first 20 rows, `#grid-anchor-shrink` halves them, `#grid-anchor-jump` scrolls row 250
 * into view the way keyboard navigation does.
 */
const GRID  = '#grid-anchor',
      COUNT = 300,
      // Mirrors the fixture. Any three consecutive rows span at least 128px.
      HEIGHTS = [32, 96, 48, 240, 32, 64],
      // Less than the rows a body renders above its first visible row (`bufferRowRange` 3): a wheel step lands
      // on rows the grid has already learned
      STEP    = 100;

/**
 * Defines `window.gridState()`: the view's scroll state and the rows it renders, each with its record id, its
 * height, its top inside the body (`content`) and its top relative to the view's top edge (`screen`), in px.
 * `window.trackRow(id, edge)` records a row's top (`screen`) or bottom on every animation frame, `null` while it is
 * not rendered, until `window.stopTracking()` returns the records.
 * @param {String} grid
 */
function defineGridState(grid) {
    let tracking = null;

    window.trackRow = (id, edge = 'top') => {
        const tops = [],
              read = () => {
                  const row = window.gridState().rows.find(row => row.id === id);

                  tops.push(!row ? null : edge === 'top' ? row.screen : row.screen + row.height);
                  tracking = {frame: requestAnimationFrame(read), tops}
              };

        read()
    };

    window.stopTracking = () => {
        cancelAnimationFrame(tracking.frame);
        return tracking.tops
    };

    window.gridState = () => {
        const view    = document.querySelector(`${grid} .neo-grid-view`),
              body    = document.querySelector(`${grid} .neo-grid-body`),
              bodyTop = body.getBoundingClientRect().top,
              viewTop = view.getBoundingClientRect().top;

        return {
            clientHeight: view.clientHeight,
            extent      : parseFloat(document.querySelector(`${grid} .neo-grid-scrollbar-content`).style.height),
            maxScroll   : view.scrollHeight - view.clientHeight,
            rows        : [...body.querySelectorAll('.neo-grid-row')]
                .filter(row => row.style.display !== 'none' && row.dataset.recordId)
                .map(row => {
                    const rect = row.getBoundingClientRect();

                    return {
                        content: Math.round(rect.top - bodyTop),
                        height : Math.round(rect.height),
                        id     : Number(row.querySelector('[data-field="id"]').textContent),
                        screen : Math.round(rect.top - viewTop)
                    }
                })
                .sort((a, b) => a.content - b.content),
            scrollTop   : view.scrollTop
        }
    }
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} The current grid state
 */
const gridState = page => page.evaluate(() => window.gridState());

/**
 * Waits until the grid state holds still for ten animation frames: the worker rendered the rows, the grid
 * learned their heights, and the corrections landed
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} The settled grid state
 */
async function settle(page) {
    const {settled, state} = await page.evaluate(async () => {
        let last   = JSON.stringify(window.gridState()),
            stable = 0;

        for (let frame = 0; frame < 600 && stable < 10; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));

            const next = JSON.stringify(window.gridState());

            stable = next === last ? stable + 1 : 0;
            last   = next
        }

        return {settled: stable >= 10, state: JSON.parse(last)}
    });

    expect(settled, 'the grid settles within 600 frames').toBe(true);
    return state
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Number} scrollTop
 * @returns {Promise<Object>} The settled grid state
 */
async function scrollTo(page, scrollTop) {
    await page.evaluate(({grid, scrollTop}) => {
        document.querySelector(`${grid} .neo-grid-view`).scrollTop = scrollTop
    }, {grid: GRID, scrollTop});

    return settle(page)
}

/**
 * Scrolls to the end until it stays there: the rows learned at the end grow the extent
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} The settled grid state, at the end
 */
async function scrollToEnd(page) {
    let state;

    for (let attempt = 0; attempt < 10; attempt++) {
        state = await scrollTo(page, 1e7);

        if (state.scrollTop === state.maxScroll) {
            return state
        }
    }

    throw new Error(`the view does not stay at its end: ${JSON.stringify(state)}`)
}

/**
 * @param {Object} state
 * @returns {Object} The row under the view's top edge
 */
const edgeRow = state => state.rows.find(row => row.screen <= 0 && row.screen + row.height > 0);

/**
 * @param {Object} state
 * @param {Number} id
 * @returns {Object|undefined} The rendered row of a record
 */
const rowOf = (state, id) => state.rows.find(row => row.id === id);

/**
 * @param {Object} state
 * @returns {Boolean} The final row lies fully inside the view
 */
function finalRowVisible(state) {
    const row = rowOf(state, COUNT);

    return !!row && row.screen >= 0 && row.screen + row.height <= state.clientHeight
}

/**
 * Presses or releases the scrollbar thumb the way the engine sees it. Chrome paints the thumb in the compositor,
 * so a synthetic press never hit-tests to it; `GridRowScrollPinning` listens on the scrollbar node for the press
 * and on the window for the release.
 * @param {import('@playwright/test').Page} page
 * @param {Boolean} pressed
 */
const thumb = (page, pressed) => page.evaluate(({grid, pressed}) => {
    const scrollbar = document.querySelector(`${grid} .neo-grid-vertical-scrollbar`),
          box       = scrollbar.getBoundingClientRect(),
          target    = pressed ? scrollbar : window;

    target.dispatchEvent(new MouseEvent(pressed ? 'mousedown' : 'mouseup', {
        bubbles: true, cancelable: true, clientX: box.right - 5, clientY: box.top + 40
    }))
}, {grid: GRID, pressed});

test.describe('Grid content-sized height corrections', () => {
    test.use({viewport: {width: 1200, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.addInitScript(defineGridState, GRID);
        await page.goto('/test/playwright/component/apps/grid-anchor/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});

        // The first rows learned their heights
        await expect.poll(async () => rowOf(await gridState(page), 4)?.height).toBe(HEIGHTS[3])
    });

    for (const change of ['grow', 'shrink']) {
        for (const where of ['mid-list', 'at the end of the list']) {
            test(`rows that ${change} above the view keep the row at its top edge still, ${where}`, async ({page}) => {
                let before = where === 'mid-list' ? await scrollTo(page, 6000) : await scrollToEnd(page),
                    anchor = edgeRow(before),
                    after;

                expect(anchor.id, 'the rows that change lie above the view').toBeGreaterThan(20);

                await page.evaluate(id => window.trackRow(id), anchor.id);
                await page.locator(`#grid-anchor-${change}`).click();

                // The changed rows rendered: every row below them moved inside the body by the change
                await expect.poll(async () => {
                    after = await gridState(page);
                    return after.extent !== before.extent && rowOf(after, anchor.id)?.content - anchor.content === after.extent - before.extent
                }).toBe(true);

                await settle(page);

                expect([...new Set(await page.evaluate(() => window.stopTracking()))], `row ${anchor.id} in every frame`)
                    .toEqual([anchor.screen])
            })
        }
    }

    test('scrolling up over rows learned on the way shows no jump at the top edge', async ({page}) => {
        // Rows the grid has not seen: only the rows of the view and its buffer get learned
        let state  = await scrollTo(page, 6000),
            anchor = edgeRow(state),
            box    = await page.locator(`${GRID} .neo-grid-view`).boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        for (let step = 1; step <= 5; step++) {
            await page.mouse.wheel(0, -STEP);
            state = await settle(page);

            // The rows learned above the view moved the scroll offset with them, so the rows in view moved by
            // the wheel distance alone
            expect(rowOf(state, anchor.id)?.screen, `row ${anchor.id} after step ${step}`).toBe(anchor.screen + step * STEP)
        }
    });

    test('a thumb drag holds the extent until its release, and the final row stays reachable', async ({page}) => {
        let {extent} = await settle(page),
            anchor, state;

        await thumb(page, true);

        // The drag reaches rows the grid has not seen: it learns their heights and holds them
        state = await scrollTo(page, 5000);
        expect(state.extent, 'the extent holds during the drag').toBe(extent);

        state = await scrollToEnd(page);
        expect(state.extent, 'the extent holds at the end of the drag').toBe(extent);
        expect(finalRowVisible(state), 'the final row is reachable during the drag').toBe(true);

        anchor = edgeRow(state);

        await thumb(page, false);

        // The held heights apply, mostly above the view: the extent grows past the end the drag reached
        state = await settle(page);
        expect(state.extent, 'the held heights apply at the release').toBeGreaterThan(extent);
        expect(rowOf(state, anchor.id)?.screen, `row ${anchor.id} holds its place at the release`).toBe(anchor.screen);

        state = await scrollToEnd(page);
        expect(finalRowVisible(state), 'the final row is reachable after the release').toBe(true)
    });

    test('a jump down to an unseen row keeps it at the bottom edge while the rows around it are learned', async ({page}) => {
        let bottoms, row, state;

        await page.evaluate(() => window.trackRow(250, 'bottom'));
        await page.locator('#grid-anchor-jump').click();

        state = await settle(page);
        row   = rowOf(state, 250);

        expect(row && row.screen + row.height, 'row 250 meets the bottom edge').toBe(state.clientHeight);

        // From its first frame on screen, the row never left the view
        bottoms = (await page.evaluate(() => window.stopTracking())).filter(bottom => bottom !== null);

        expect(bottoms.length).toBeGreaterThan(0);
        bottoms.forEach((bottom, i) => expect(bottom, `frame ${i}`).toBeLessThanOrEqual(state.clientHeight))
    })
});
