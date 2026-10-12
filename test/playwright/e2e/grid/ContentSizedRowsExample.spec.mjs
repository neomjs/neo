import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/contentSizedRows`, 10k records whose wrapped texts size their rows in three bodies,
 * passes the ten acceptance examples of content-sized rows, one named test each, plus a wheel-throughput
 * measurement. In every example, each row ends up as tall as its tallest wrapped text, and the bodies agree.
 *
 * The oracle is the browser's layout: a row needs its tallest `.neo-grid-cell-text` plus the cell's padding and
 * borders, and never less than `rowHeight` (as in `WrapTextMeasure`). A viewport of 1400px mounts every column, so
 * the oracle sees every text. Only the first test narrows the viewport, to keep the tallest column unmounted.
 *
 * Positions are exact: the example's extent stays far below 2^23 px, past which Chrome rounds scroll offsets to 2px.
 *
 * Fixture for two views: `test/playwright/component/apps/grid-two-views`, grids `#grid-narrow` and `#grid-wide`,
 * which show one store at 400px and 900px.
 */
const COUNT = 10000,
      GRID  = '.neo-grid-container',
      // The grid's default rowHeight: the floor of every row, and the fixed-height control's height
      ROW   = 32,
      // Less than the rows a body renders above its first visible row (`bufferRowRange` 3, rows of 62px or
      // more at 1400px): a wheel step up lands on rows that are mounted
      STEP  = 100,
      WIDE  = {width: 1400, height: 900};

/**
 * Page-side reads, installed before the app boots. Each takes the grid's selector.
 * - `gridState(grid)`: the view's scroll state and the rows of the start body, which holds the `id` column. Each
 *   row has its record `id`, its height, its top inside the body (`content`) and relative to the view (`screen`).
 * - `rowReport(grid)`: per rendered record, its row height in each body and the height its texts need
 *   (`natural`), also per field (`fields`).
 * - `trackRow(grid, id)` / `stopTracking()`: a row's `screen` in every animation frame.
 * - `startSampling(grid, classify)` / `stopSampling()`: the throughput sampler, see {@link measureWheel}.
 * @param {Number} floor The grid's rowHeight
 */
function defineGridReads(floor) {
    let sampling = null,
        tracking = null;

    const chrome = cell => {
        const style = getComputedStyle(cell);

        return ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
            .reduce((sum, property) => sum + parseFloat(style.getPropertyValue(property)), 0)
    };

    // A row of the visible pool, not one the grid renders hidden to measure ahead
    const displayed = row => row.style.display !== 'none' && !!row.dataset.recordId && !row.closest('.neo-grid-row-measure');

    window.gridState = grid => {
        const view    = document.querySelector(`${grid} .neo-grid-view`),
              body    = document.querySelector(`${grid} .neo-grid-body`),
              bodyTop = body.getBoundingClientRect().top,
              viewTop = view.getBoundingClientRect().top;

        return {
            clientHeight: view.clientHeight,
            extent      : view.scrollHeight,
            maxScroll   : view.scrollHeight - view.clientHeight,
            rows        : [...body.querySelectorAll('.neo-grid-row')].filter(displayed)
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
    };

    window.rowReport = (grid, recordId) => {
        const report = new Map(),
              rows   = recordId ? `.neo-grid-row[data-record-id="${recordId}"]` : '.neo-grid-row';

        document.querySelectorAll(`${grid} .neo-grid-body`).forEach(body => {
            body.querySelectorAll(rows).forEach(row => {
                if (!displayed(row)) {
                    return
                }

                const entry = report.get(row.dataset.recordId) ?? {fields: {}, heights: [], natural: floor};

                entry.heights.push(row.getBoundingClientRect().height);

                row.querySelectorAll('.neo-grid-cell-text').forEach(text => {
                    // A pooled cell out of use has no box
                    if (text.getClientRects().length > 0) {
                        const natural = text.getBoundingClientRect().height + chrome(text.parentElement);

                        entry.fields[text.parentElement.dataset.field] = natural;
                        entry.natural = Math.max(entry.natural, natural)
                    }
                });

                report.set(row.dataset.recordId, entry)
            })
        });

        return [...report.entries()].map(([recordId, entry]) => ({recordId, ...entry}))
    };

    window.trackRow = (grid, id) => {
        const tops = [],
              read = () => {
                  tops.push(window.gridState(grid).rows.find(row => row.id === id)?.screen ?? null);
                  tracking = {frame: requestAnimationFrame(read), tops}
              };

        read()
    };

    window.stopTracking = () => {
        cancelAnimationFrame(tracking.frame);
        return tracking.tops
    };

    /**
     * Records the frame times, the time the main thread spends in the batched `getLayoutRect` reads that
     * measure rows, and the records that enter the view. With `classify`, it also checks each record the first
     * time it is mounted and the first time it is visible: a row that does not fit its text then was rendered
     * at the estimate. Classifying forces a layout in the frame, so a timing run does not classify.
     */
    window.startSampling = (grid, classify) => {
        const domAccess = Neo.main.DomAccess,
              original  = domAccess.getLayoutRect,
              view      = document.querySelector(`${grid} .neo-grid-view`),
              misfit    = recordId => window.rowReport(grid, recordId)
                  .some(entry => entry.heights.some(height => Math.abs(height - entry.natural) >= 1));

        sampling = {classify, frames: [], measuring: 0, original, records: new Map(), start: performance.now()};

        domAccess.getLayoutRect = function(data) {
            if (!Array.isArray(data.id)) {
                return original.call(this, data)
            }

            const start = performance.now();

            try {
                return original.call(this, data)
            } finally {
                sampling.measuring += performance.now() - start
            }
        };

        let last = performance.now();

        const sample = now => {
            sampling.frames.push(now - last);
            last = now;

            const {bottom, top} = view.getBoundingClientRect();

            document.querySelector(`${grid} .neo-grid-body`).querySelectorAll('.neo-grid-row').forEach(row => {
                if (!displayed(row)) {
                    return
                }

                const {recordId} = row.dataset,
                      rect       = row.getBoundingClientRect(),
                      entry      = sampling.records.get(recordId) ?? {};

                if (!sampling.records.has(recordId)) {
                    entry.mounted = classify ? misfit(recordId) : null;
                    sampling.records.set(recordId, entry)
                }

                if (!('visible' in entry) && rect.bottom > top && rect.top < bottom) {
                    entry.visible = classify ? misfit(recordId) : null
                }
            });

            sampling.frame = requestAnimationFrame(sample)
        };

        sampling.frame = requestAnimationFrame(sample)
    };

    window.stopSampling = () => {
        cancelAnimationFrame(sampling.frame);
        Neo.main.DomAccess.getLayoutRect = sampling.original;

        const duration = (performance.now() - sampling.start) / 1000,
              frames   = sampling.frames.slice(1),
              records  = [...sampling.records.values()],
              visible  = records.filter(entry => 'visible' in entry),
              numbers  = {
                  duration,
                  longFrames        : frames.filter(frame => frame > 20).length,
                  maxFrame          : Math.round(Math.max(...frames)),
                  measuringPerSecond: Math.round(sampling.measuring / duration),
                  mounted           : records.length,
                  rowsPerSecond     : Math.round(visible.length / duration),
                  visible           : visible.length
              };

        // Only a classifying run knows which rows were at the estimate
        if (sampling.classify) {
            numbers.mountedAtEstimate = records.filter(entry => entry.mounted).length;
            numbers.visibleAtEstimate = visible.filter(entry => entry.visible).length
        }

        return numbers
    }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} [grid=GRID]
 * @returns {Promise<Object>} The current grid state
 */
const gridState = (page, grid = GRID) => page.evaluate(grid => window.gridState(grid), grid);

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} [grid=GRID]
 * @returns {Promise<Object[]>}
 */
const rowReport = (page, grid = GRID) => page.evaluate(grid => window.rowReport(grid), grid);

/**
 * Waits until the grid state holds still for ten animation frames while a rendered row covers the view's top edge:
 * the worker rendered the rows for the scroll offset, the grid measured them, and the corrections landed. Ten still
 * frames alone can pass before the first render for a new offset, while the previous rows still show.
 * @param {import('@playwright/test').Page} page
 * @param {String} [grid=GRID]
 * @returns {Promise<Object>} The settled grid state
 */
async function settle(page, grid = GRID) {
    const {settled, state} = await page.evaluate(async grid => {
        let last   = JSON.stringify(window.gridState(grid)),
            stable = 0;

        for (let frame = 0; frame < 600 && stable < 10; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));

            const current = window.gridState(grid),
                  next    = JSON.stringify(current),
                  covered = current.rows.some(row => row.screen <= 0 && row.screen + row.height > 0);

            stable = covered && next === last ? stable + 1 : 0;
            last   = next
        }

        return {settled: stable >= 10, state: JSON.parse(last)}
    }, grid);

    expect(settled, 'the grid settles within 600 frames').toBe(true);
    return state
}

/**
 * Every rendered row is as tall as its texts need, in each body
 * @param {import('@playwright/test').Page} page
 * @param {String} [grid=GRID]
 */
async function expectRowsFitTheirText(page, grid = GRID) {
    await expect(async () => {
        let report = await rowReport(page, grid);

        expect(report.length).toBeGreaterThan(5);

        report.forEach(({heights, natural, recordId}) => {
            heights.forEach(height => expect(Math.abs(height - natural), `${recordId}: ${height} vs ${natural}`).toBeLessThan(1))
        })
    }).toPass({timeout: 5000})
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
 * Scrolls to the end until it stays there: the rows measured at the end change the extent
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>} The settled grid state, at the end
 */
async function scrollToEnd(page) {
    let state;

    for (let attempt = 0; attempt < 10; attempt++) {
        state = await scrollTo(page, 1e8);

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
 * @param {Number} id
 * @returns {Boolean} The row of the record lies fully inside the view
 */
function fullyVisible(state, id) {
    const row = rowOf(state, id);

    return !!row && row.screen >= 0 && row.screen + row.height <= state.clientHeight
}

/**
 * The start body's row heights, by record id
 * @param {Object} state
 * @returns {Object<Number, Number>}
 */
const heightsOf = state => Object.fromEntries(state.rows.map(row => [row.id, row.height]));

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

/**
 * Types a row number into the toolbar's "Jump to row" field
 * @param {import('@playwright/test').Page} page
 * @param {Number} row
 */
const jumpToRow = (page, row) => page.locator('.neo-numberfield', {hasText: 'Jump to row'}).locator('input').fill(String(row));

/**
 * Wheels the view `steps` times by `delta` px, `interval` ms apart, while the page samples, and returns the
 * sampler's numbers. Five unsampled steps warm the wheel path first: the first wheel step after a jump pays a
 * one-time cost of about 33ms.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {Boolean} options.classify
 * @param {Number} options.delta
 * @param {Number} options.interval
 * @param {Number} options.steps
 * @returns {Promise<Object>}
 */
async function measureWheel(page, {classify, delta, interval, steps}) {
    let box = await page.locator(`${GRID} .neo-grid-view`).boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    for (let step = 0; step < 5; step++) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(interval)
    }

    await settle(page);
    await page.evaluate(({grid, classify}) => window.startSampling(grid, classify), {grid: GRID, classify});

    for (let step = 0; step < steps; step++) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(interval)
    }

    await settle(page);
    return page.evaluate(() => window.stopSampling())
}

test.describe('Content-sized rows example', () => {
    test.beforeEach(async ({page}) => {
        await page.addInitScript(defineGridReads, ROW);
        await page.goto('/examples/grid/contentSizedRows/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});
        await settle(page)
    });

    test.describe('at 700px, where the tallest column is unmounted', () => {
        test.use({viewport: {width: 700, height: 800}});

        test('1. an initially unmounted tallest column sizes its rows before it mounts', async ({page}) => {
            // A details cell in a row of the visible pool: measuring ahead renders hidden ones
            const hasDetails = () => page.evaluate(grid => [...document.querySelectorAll(`${grid} [data-field="details"]`)]
                .some(cell => cell.getClientRects().length > 0 && !cell.closest('.neo-grid-row-measure')), GRID);

            expect(await hasDetails(), 'the details column starts unmounted').toBe(false);

            let before = heightsOf(await settle(page)),
                after;

            await expect.poll(async () => {
                await page.evaluate(() => {
                    let scrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');
                    scrollbar.scrollLeft = scrollbar.scrollWidth
                });

                return hasDetails()
            }, {message: 'scrolling right mounts the details column'}).toBe(true);

            after = heightsOf(await settle(page));
            await expectRowsFitTheirText(page);

            // The test means something only if the details column drives some rows
            let report = await rowReport(page);
            expect(report.filter(entry => entry.fields.details > Math.max(ROW, ...Object.entries(entry.fields)
                .filter(([field]) => field !== 'details').map(([, natural]) => natural)) + 1).length,
            'rows the details column makes taller').toBeGreaterThan(3);

            Object.entries(after).forEach(([id, height]) => {
                id in before && expect(height, `row ${id} kept its height when details mounted`).toBe(before[id])
            })
        })
    });

    test.describe('at 1400px, where every column is mounted', () => {
        test.use({viewport: WIDE});

        test('2. a column width change re-measures the rows', async ({page}) => {
            const header = page.locator('.neo-grid-header-button', {hasText: 'Summary'}).first();

            let before = heightsOf(await settle(page)),
                box    = await header.boundingBox(),
                x      = box.x + box.width - 3,
                y      = box.y + box.height / 2,
                after;

            await page.mouse.move(x, y);
            await expect(header.locator('.neo-resizable-right')).toBeAttached({timeout: 5000});
            await page.mouse.down();
            await page.mouse.move(x - 120, y, {steps: 30});
            await page.mouse.up();

            await expect.poll(async () => Math.round((await header.boundingBox()).width), {message: 'the column narrowed'})
                .toBeLessThan(Math.round(box.width) - 100);

            after = heightsOf(await settle(page));
            await expectRowsFitTheirText(page);

            expect(Object.keys(after).filter(id => id in before && after[id] > before[id]).length,
                'rows that grew as the summary wraps to more lines').toBeGreaterThan(3)
        });

        test('2. a font that arrives after the first measurement re-measures the rows', async ({page}) => {
            const family = await page.evaluate(grid => getComputedStyle(document.querySelector(`${grid} .neo-grid-cell-text`))
                .fontFamily.split(',')[0].trim().replace(/["']/g, ''), GRID);

            let before = heightsOf(await settle(page)),
                after;

            // A monospace face under the name the cells already ask for: the browser swaps it in when it loads
            await page.addStyleTag({content: `@font-face {font-family: "${family}"; ` +
                'src: url(/node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff2) format("woff2")}'});

            await expect.poll(() => page.evaluate(family => document.fonts.load(`16px "${family}"`)
                .then(faces => faces.some(face => face.status === 'loaded')), family), {message: 'the font arrived'}).toBe(true);

            after = heightsOf(await settle(page));
            await expectRowsFitTheirText(page);

            expect(Object.keys(after).filter(id => id in before && after[id] !== before[id]).length,
                'rows the wider font re-wrapped').toBeGreaterThan(3)
        });

        test('3. an edit that adds lines grows its row', async ({page}) => {
            let state    = await settle(page),
                target   = state.rows[2],
                anchor   = edgeRow(state),
                recordId = await page.locator(`${GRID} .neo-grid-cell[data-field="id"]`, {hasText: new RegExp(`^${target.id}$`)})
                    .getAttribute('data-record-id'),
                // The visible cell, not a copy measured hidden
                cell     = page.locator(`${GRID} .neo-grid-cell[data-field="summary"][data-record-id="${recordId}"]:not(.neo-grid-row-measure *)`);

            await cell.dblclick();
            await page.locator(`${GRID} .neo-grid-editor input`).fill(Array.from({length: 40}, (_, i) => `word${i}`).join(' '));
            await page.keyboard.press('Enter');

            await expect(cell).toContainText('word39');

            state = await settle(page);
            await expectRowsFitTheirText(page);

            expect(rowOf(state, target.id).height, `row ${target.id} grew`).toBeGreaterThan(target.height);
            expect(rowOf(state, anchor.id)?.screen, `row ${anchor.id} at the top edge held still`).toBe(anchor.screen)
        });

        test('3. a sort re-measures the rows it brings into view', async ({page}) => {
            let first = (await settle(page)).rows[0].id,
                state;

            await page.locator('.neo-grid-header-button', {hasText: 'Score'}).first().click();

            await expect.poll(async () => (await gridState(page)).rows[0]?.id, {message: 'the sort changed the first row'})
                .not.toBe(first);

            await settle(page);
            await expectRowsFitTheirText(page);

            // In row order, top to bottom
            let scores = await page.evaluate(grid => [...document.querySelectorAll(`${grid} [data-field="score"]`)]
                .filter(cell => cell.getClientRects().length > 0 && cell.closest('.neo-grid-row').style.display !== 'none' &&
                    !cell.closest('.neo-grid-row-measure'))
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
                .map(cell => Number(cell.textContent)), GRID);

            expect(scores.length).toBeGreaterThan(5);
            scores.forEach((score, i) => i > 0 && expect(score, `row ${i}`).toBeGreaterThanOrEqual(scores[i - 1]))
        });

        test('3. a filter re-measures the rows and shrinks the extent', async ({page}) => {
            let {extent} = await settle(page),
                state;

            await page.locator('.neo-textfield', {hasText: 'Filter summary'}).locator('input').fill('anchor');

            await expect.poll(async () => (await gridState(page)).extent, {message: 'the filter shrank the extent'})
                .toBeLessThan(extent * 0.8);

            state = await settle(page);
            await expectRowsFitTheirText(page);

            let summaries = await page.evaluate(grid => [...document.querySelectorAll(`${grid} [data-field="summary"]`)]
                .filter(cell => cell.getClientRects().length > 0 && cell.closest('.neo-grid-row').style.display !== 'none' &&
                    !cell.closest('.neo-grid-row-measure'))
                .map(cell => cell.textContent), GRID);

            expect(summaries.length).toBeGreaterThan(5);
            summaries.forEach(summary => expect(summary).toContain('anchor'));
            expect(state.rows.length).toBeGreaterThan(5)
        });

        test('4. delayed responses for recycled rows never size a row with another record\'s text', async ({page}) => {
            // Jumps faster than a measurement's round trip: replies arrive for rows recycled since they were asked
            await page.evaluate(async grid => {
                const view = document.querySelector(`${grid} .neo-grid-view`);

                for (const share of [0.1, 0.7, 0.3, 0.9, 0.5, 0.2, 0.8, 0.4]) {
                    view.scrollTop = share * view.scrollHeight;
                    await new Promise(resolve => setTimeout(resolve, 16))
                }
            }, GRID);

            await settle(page);
            await expectRowsFitTheirText(page)
        });

        test('5. reverse wheel scrolling over unseen rows shows no jump at the top edge', async ({page}) => {
            // Rows the grid has not seen: only the rows of the view and its buffer get measured
            let state  = await scrollTo(page, 160000),
                anchor = edgeRow(state),
                box    = await page.locator(`${GRID} .neo-grid-view`).boundingBox();

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.evaluate(({grid, id}) => window.trackRow(grid, id), {grid: GRID, id: anchor.id});

            for (let step = 1; step <= 5; step++) {
                await page.mouse.wheel(0, -STEP);
                state = await settle(page);

                // Rows measured above the view moved the scroll offset with them, so the rows in view moved by the
                // wheel distance alone
                expect(rowOf(state, anchor.id)?.screen, `row ${anchor.id} after step ${step}`).toBe(anchor.screen + step * STEP)
            }

            // Between the steps too: the row only ever moved down
            let tops = (await page.evaluate(() => window.stopTracking())).filter(top => top !== null);
            tops.forEach((top, i) => i > 0 && expect(top, `frame ${i}`).toBeGreaterThanOrEqual(tops[i - 1]));

            await expectRowsFitTheirText(page)
        });

        test('6. a thumb drag holds the extent until its release, then fits the rows to their text', async ({page}) => {
            let {extent} = await settle(page),
                anchor, state;

            await thumb(page, true);

            state = await scrollTo(page, 120000);
            expect(state.extent, 'the extent holds during the drag').toBe(extent);

            state = await scrollToEnd(page);
            expect(state.extent, 'the extent holds at the end of the drag').toBe(extent);
            expect(fullyVisible(state, COUNT), 'the final row is reachable during the drag').toBe(true);

            anchor = edgeRow(state);

            await thumb(page, false);

            state = await settle(page);
            expect(state.extent, 'the held heights apply at the release').not.toBe(extent);
            expect(rowOf(state, anchor.id)?.screen, `row ${anchor.id} holds its place at the release`).toBe(anchor.screen);
            await expectRowsFitTheirText(page);

            state = await scrollToEnd(page);
            expect(fullyVisible(state, COUNT), 'the final row is reachable after the release').toBe(true)
        });

        test('7. jump-to-row brings the row into view and keeps it there', async ({page}) => {
            const target = 5000;

            await page.evaluate(({grid, id}) => window.trackRow(grid, id), {grid: GRID, id: target});
            await jumpToRow(page, target);

            await expect.poll(async () => !!rowOf(await gridState(page), target), {message: `row ${target} rendered`}).toBe(true);

            let state = await settle(page),
                tops  = (await page.evaluate(() => window.stopTracking())).filter(top => top !== null);

            expect(fullyVisible(state, target), `row ${target} is fully visible`).toBe(true);
            await expectRowsFitTheirText(page);

            // The landing rows are measured in place: how far the target moved before it settled
            test.info().annotations.push({type: 'jump-landing-shift', description: `${Math.max(...tops) - Math.min(...tops)}px`})
        });

        test('8. the final row is reachable and fully visible, by scrolling and by keyboard', async ({page}) => {
            let state = await scrollToEnd(page);

            expect(fullyVisible(state, COUNT), 'the final row is fully visible at the end').toBe(true);
            await expectRowsFitTheirText(page);

            await scrollTo(page, 0);
            await jumpToRow(page, COUNT - 4);
            await expect.poll(async () => fullyVisible(await settle(page), COUNT - 4), {message: `row ${COUNT - 4} in view`}).toBe(true);

            await page.locator(`${GRID} .neo-grid-cell[data-field="id"]`, {hasText: new RegExp(`^${COUNT - 4}$`)}).click();

            for (let step = 0; step < 4; step++) {
                await page.keyboard.press('ArrowDown')
            }

            await expect.poll(async () => fullyVisible(await settle(page), COUNT), {message: 'the keyboard reaches the final row'}).toBe(true);
            await expectRowsFitTheirText(page)
        });

        test('10. the fixed-height control keeps every row at rowHeight', async ({page}) => {
            await page.getByText('Content-sized rows', {exact: true}).click();

            await expect.poll(async () => (await gridState(page)).extent, {message: 'the fixed extent'}).toBe((COUNT + 1) * ROW);

            for (const scrollTop of [0, 160000]) {
                let state = await scrollTo(page, scrollTop);

                state.rows.forEach(row => {
                    expect(row.height, `row ${row.id}`).toBe(ROW);
                    expect(row.content, `row ${row.id} sits at its index`).toBe((row.id - 1) * ROW)
                })
            }

            await page.getByText('Content-sized rows', {exact: true}).click();
            await settle(page);
            await expectRowsFitTheirText(page)
        });

        test('wheel throughput at ordinary and fast speeds', async ({page}) => {
            for (const [speed, interval] of [['ordinary', 50], ['fast', 16]]) {
                for (const classify of [false, true]) {
                    // Rows the grid has not seen, a different stretch per run
                    await scrollTo(page, (classify ? 100000 : 200000) + interval * 1000);

                    let numbers = await measureWheel(page, {classify, delta: STEP, interval, steps: 40});

                    test.info().annotations.push({type: `${speed}${classify ? ', classified' : ''}`, description: JSON.stringify(numbers)});
                    expect(numbers.visible, 'rows entered the view').toBeGreaterThan(10)
                }
            }
        })
    })
});

test.describe('Two content-sized views of one store', () => {
    test.use({viewport: {width: 1400, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.addInitScript(defineGridReads, ROW);
        await page.goto('/test/playwright/component/apps/grid-two-views/index.html');
        await page.waitForSelector('#grid-wide .neo-grid-row[data-record-id]', {state: 'visible', timeout: 30000})
    });

    test('9. two views at different widths size the same records independently', async ({page}) => {
        await settle(page, '#grid-narrow');
        await settle(page, '#grid-wide');
        await expectRowsFitTheirText(page, '#grid-narrow');
        await expectRowsFitTheirText(page, '#grid-wide');

        let narrow = heightsOf(await gridState(page, '#grid-narrow')),
            wide   = heightsOf(await gridState(page, '#grid-wide')),
            shared = Object.keys(narrow).filter(id => id in wide);

        expect(shared.length).toBeGreaterThan(5);
        shared.forEach(id => expect(narrow[id], `record ${id}`).toBeGreaterThanOrEqual(wide[id]));
        expect(shared.filter(id => narrow[id] > wide[id]).length, 'records the narrow view wraps to more lines').toBeGreaterThan(3);

        // Measuring one view leaves the other as it is
        await page.evaluate(() => {
            document.querySelector('#grid-narrow .neo-grid-view').scrollTop = 3000
        });

        await settle(page, '#grid-narrow');
        await expectRowsFitTheirText(page, '#grid-narrow');
        expect(heightsOf(await settle(page, '#grid-wide'))).toEqual(wide);
        await expectRowsFitTheirText(page, '#grid-wide')
    })
});
