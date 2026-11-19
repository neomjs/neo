import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/contentSizedRows`, 10k records whose wrapped texts size their rows in three bodies,
 * passes the ten acceptance examples of content-sized rows, one named test each, plus a wheel-throughput
 * measurement. In every example, each row ends up as tall as its tallest wrapped text, and the bodies agree.
 *
 * The oracle is the browser's layout: a row needs its tallest `.neo-grid-cell-text` plus the cell's padding and
 * borders, and never less than `rowHeight` (as in `WrapTextMeasure`). A viewport of 1440px mounts every column, so
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
      // more at 1440px): a wheel step up lands on rows that are mounted
      STEP  = 100,
      WIDE  = {width: 1440, height: 900};

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

    window.armJumpMeasurement = (grid, target) => {
        if (window.jumpMeasurement?.cleanup) {
            window.jumpMeasurement.cleanup();
        }

        const input = document.querySelector('.neo-numberfield input');
        const data  = {
            paintedTime    : null,
            startTime      : null,
            verifiedRowId  : null,
            verifiedVisible: false,
            visibleTime    : null
        };

        let   active      = true;
        const pendingRafs = new Set();

        const scheduleRaf = callback => {
            if (!active) {
                return null;
            }
            const id = requestAnimationFrame(timestamp => {
                pendingRafs.delete(id);
                if (active) {
                    callback(timestamp);
                }
            });
            pendingRafs.add(id);
            return id;
        };

        // Poll each animation frame until the target row is fully within the viewport.
        const checkVisible = () => {
            if (!active) {
                return;
            }
            const state = window.gridState(grid),
                  row   = state.rows.find(r => r.id === target);

            if (row && row.screen >= 0 && row.screen + row.height <= state.clientHeight) {
                // Record the first frame at which the target is fully visible
                if (data.visibleTime === null) {
                    data.visibleTime = performance.now();
                }

                // Double-rAF as a paint-opportunity proxy, not compositor-presentation proof.
                // Nested callbacks are scheduled through scheduleRaf so cleanup cancels every pending frame
                // and prevents inactive callbacks from continuing measurement work.
                scheduleRaf(() => {
                    scheduleRaf(() => {
                        if (!active) {
                            return;
                        }
                        const currentState = window.gridState(grid),
                              currentRow   = currentState.rows.find(r => r.id === target);

                        if (currentRow && currentRow.screen >= 0 && currentRow.screen + currentRow.height <= currentState.clientHeight) {
                            data.verifiedRowId   = currentRow.id;
                            data.verifiedVisible = true;
                            data.paintedTime     = performance.now();
                        } else {
                            // Row shifted (layout still settling); resume polling
                            scheduleRaf(checkVisible);
                        }
                    });
                });
                return;
            }
            scheduleRaf(checkVisible);
        };

        const onInput = event => {
            if (!active) {
                return;
            }
            // Start timing on the capture-phase input event that carries the exact target value.
            // This excludes Playwright CDP fill() latency: timing begins at the browser input event,
            // not at the Playwright call site.
            if (data.startTime === null && String(event.target?.value) === String(target)) {
                data.startTime = performance.now();
                input?.removeEventListener('input', onInput, true);
                scheduleRaf(checkVisible);
            }
        };

        if (input) {
            input.addEventListener('input', onInput, true);
        }

        const cleanup = () => {
            active = false;
            if (input) {
                input.removeEventListener('input', onInput, true);
            }
            pendingRafs.forEach(id => cancelAnimationFrame(id));
            pendingRafs.clear();
        };

        window.jumpMeasurement = {
            cleanup,
            data
        };
    };

    window.getJumpMeasurement = () => window.jumpMeasurement?.data;

    window.cleanupJumpMeasurement = () => {
        if (window.jumpMeasurement?.cleanup) {
            window.jumpMeasurement.cleanup();
        }
    };

    /**
     * Records the frame times, the time the main thread spends in the batched `getLayoutRect` reads that
     * measure rows, and the records that newly mount and newly enter the view, each with the absolute time of
     * that frame. Rows already mounted or visible when sampling starts are not arrivals. With `classify`, it
     * also checks each arriving record's visual fit: whether its row is as tall as its text needs. Classifying
     * forces a layout in the frame, so a timing run does not classify.
     */
    window.startSampling = (grid, classify) => {
        const domAccess = Neo.main.DomAccess,
              original  = domAccess.getLayoutRect,
              view      = document.querySelector(`${grid} .neo-grid-view`),
              misfit    = recordId => window.rowReport(grid, recordId)
                  .some(entry => entry.heights.some(height => Math.abs(height - entry.natural) >= 1)),
              {bottom: viewBottom, top: viewTop} = view.getBoundingClientRect();

        sampling = {classify, frames: [], measuring: 0, original, records: new Map(), start: performance.now()};

        // The population present at the start: mounted rows are no arrivals, nor are rows already visible
        document.querySelector(`${grid} .neo-grid-body`).querySelectorAll('.neo-grid-row').forEach(row => {
            if (displayed(row)) {
                const rect = row.getBoundingClientRect();

                sampling.records.set(row.dataset.recordId, {present: true, ...(rect.bottom > viewTop && rect.top < viewBottom ? {visibleAt: null} : {})})
            }
        });

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

            // Absolute time, comparable with the App Worker's clock
            const {bottom, top} = view.getBoundingClientRect(),
                  at            = performance.timeOrigin + now;

            document.querySelector(`${grid} .neo-grid-body`).querySelectorAll('.neo-grid-row').forEach(row => {
                if (!displayed(row)) {
                    return
                }

                const {recordId} = row.dataset,
                      rect       = row.getBoundingClientRect();

                let entry = sampling.records.get(recordId);

                if (!entry) {
                    entry = {mountedAt: at, ...(classify ? {mountedMisfit: misfit(recordId)} : {})};
                    sampling.records.set(recordId, entry)
                }

                if (!('visibleAt' in entry) && rect.bottom > top && rect.top < bottom) {
                    entry.visibleAt = at;
                    classify && (entry.visibleMisfit = misfit(recordId))
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
              records  = [...sampling.records.entries()],
              mounted  = records.filter(([, entry]) => entry.mountedAt),
              visible  = records.filter(([, entry]) => entry.visibleAt),
              numbers  = {
                  arrivals          : {
                      mounted: mounted.map(([recordId, entry]) => [recordId, entry.mountedAt]),
                      visible: visible.map(([recordId, entry]) => [recordId, entry.visibleAt])
                  },
                  duration,
                  longFrames        : frames.filter(frame => frame > 20).length,
                  maxFrame          : Math.round(Math.max(...frames)),
                  measuringPerSecond: Math.round(sampling.measuring / duration),
                  mounted           : mounted.length,
                  rowsPerSecond     : Math.round(visible.length / duration),
                  visible           : visible.length
              };

        // Only a classifying run knows which arriving rows missed their text height
        if (sampling.classify) {
            numbers.mountedMisfit = mounted.filter(([, entry]) => entry.mountedMisfit).length;
            numbers.visibleMisfit = visible.filter(([, entry]) => entry.visibleMisfit).length
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
 * The App Worker, which owns the grid's row geometry. The example runs dedicated workers.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Worker>}
 */
async function appWorker(page) {
    const isApp = worker => worker.url().includes('/worker/App');

    await expect.poll(() => page.workers().some(isApp)).toBe(true);
    return page.workers().find(isApp)
}

/**
 * Records in the App Worker, as absolute time, when each record's height first becomes known to a view's
 * geometry: `RowGeometry#setHeights` is the only writer of known heights, and `clearHeights` forgets them. A
 * height known before the clock started reads as known since forever.
 * @param {import('@playwright/test').Worker} worker
 */
const installHeightClock = worker => worker.evaluate(() => {
    if (globalThis.heightClock) {
        return
    }

    const clock                      = globalThis.heightClock = new Map(),
          proto                      = Neo.grid.RowGeometry.prototype,
          {clearHeights, setHeights} = proto;

    proto.setHeights = function(heights) {
        const at = performance.timeOrigin + performance.now();

        heights.forEach((height, recordId) => {
            const key = `${this.id}|${recordId}`;
            clock.has(key) || clock.set(key, this.hasHeight(recordId) ? -Infinity : at)
        });

        return setHeights.apply(this, arguments)
    };

    proto.clearHeights = function() {
        clock.forEach((at, key) => key.startsWith(`${this.id}|`) && clock.delete(key));
        return clearHeights.apply(this, arguments)
    }
});

/**
 * Counts the arrivals the view's geometry had no height for yet when they arrived: rows at the estimate
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Worker} worker
 * @param {Object} arrivals `{mounted, visible}`, each a list of `[recordId, absolute time]`
 * @returns {Promise<Object>} `{mounted, visible}` counts
 */
async function countAtEstimate(page, worker, arrivals) {
    const viewId = await page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).id, GRID);

    return worker.evaluate(({arrivals, viewId}) => {
        const geometry = Neo.getComponent(viewId).rowGeometry,
              knownAt  = recordId => globalThis.heightClock.get(`${geometry.id}|${recordId}`) ??
                  (geometry.hasHeight(recordId) ? -Infinity : Infinity);

        return Object.fromEntries(Object.entries(arrivals).map(([kind, list]) =>
            [kind, list.filter(([recordId, at]) => knownAt(recordId) > at).length]))
    }, {arrivals, viewId})
}

/**
 * Wheels the view `steps` times by `delta` px, `interval` ms apart, while the page samples, and returns the
 * sampler's numbers. Five unsampled steps warm the wheel path first: the first wheel step after a jump pays a
 * one-time cost of about 33ms. The rows at the estimate come from the App Worker's geometry, not from pixels.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {Boolean} options.classify
 * @param {Number} options.delta
 * @param {Number} options.interval
 * @param {Number} options.steps
 * @returns {Promise<Object>}
 */
async function measureWheel(page, {classify, delta, interval, steps}) {
    const worker = await appWorker(page);

    await installHeightClock(worker);

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

    const {arrivals, ...numbers} = await page.evaluate(() => window.stopSampling()),
          atEstimate             = await countAtEstimate(page, worker, arrivals);

    return {...numbers, mountedAtEstimate: atEstimate.mounted, visibleAtEstimate: atEstimate.visible}
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

    test.describe('at 1440px, where every column is mounted', () => {
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
            await page.locator(`${GRID} .neo-grid-editor input`).fill(
                'Comprehensive diagnostics and root cause investigation revealed severe worker thread message serialization overhead under high-frequency transaction volumes. ' +
                'Profiling memory allocations confirmed that rapid JSON payload encoding across the web worker boundary causes substantial latency spikes and garbage collection pauses. ' +
                'To resolve this issue, the data streaming pipeline was refactored to utilize shared array buffers with atomic synchronization flags. ' +
                'Benchmarking across simulated multi-threaded workloads demonstrates a seventy percent reduction in transfer latency and consistent sixty frames per second rendering. ' +
                'All regression test suites executed cleanly across desktop and mobile browsers with zero reported regressions or layout anomalies.'
            );
            await page.keyboard.press('Enter');

            await expect(cell).toContainText('seventy percent reduction in transfer latency');

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

            await page.locator('.neo-textfield', {hasText: 'Filter summary'}).locator('input').fill('pipeline');

            await expect.poll(async () => (await gridState(page)).extent, {message: 'the filter shrank the extent'})
                .toBeLessThan(extent * 0.8);

            state = await settle(page);
            await expectRowsFitTheirText(page);

            let summaries = await page.evaluate(grid => [...document.querySelectorAll(`${grid} [data-field="summary"]`)]
                .filter(cell => cell.getClientRects().length > 0 && cell.closest('.neo-grid-row').style.display !== 'none' &&
                    !cell.closest('.neo-grid-row-measure'))
                .map(cell => cell.textContent), GRID);

            expect(summaries.length).toBeGreaterThan(5);
            summaries.forEach(summary => expect(summary.toLowerCase()).toContain('pipeline'));
            expect(state.rows.length).toBeGreaterThan(5)
        });

        test('4. delayed responses for recycled rows never size a row with another record\'s text', async ({page}) => {
            // Holds the next read of displayed rows, the in-place measurement, until the test releases it. The
            // read then happens on the recycled rows, so its texts belong to the records that took them over.
            await page.evaluate(() => {
                const domAccess = Neo.main.DomAccess,
                      original  = domAccess.getLayoutRect,
                      recordOf  = id => document.getElementById(id)?.closest('.neo-grid-row')?.dataset.recordId;

                window.held = null;

                domAccess.getLayoutRect = function(data) {
                    // Cell text boxes of the visible pool, not the hidden ones measured ahead
                    if (window.holdArmed && !window.held && Array.isArray(data.id) &&
                        data.id.every(id => id.endsWith('__text') && !id.includes('__measure_'))) {
                        let release;
                        const gate = new Promise(resolve => {release = resolve});

                        window.held = {release, records: data.id.map(recordOf), recordsNow: () => data.id.map(recordOf)};
                        return gate.then(() => original.call(this, data))
                    }

                    return original.call(this, data)
                }
            });

            const worker = await appWorker(page),
                  viewId = await page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).id, GRID),
                  // The heights the view's geometry knows for these records, null where it knows none
                  known  = recordIds => worker.evaluate(({recordIds, viewId}) => {
                      const view = Neo.getComponent(viewId), {rowGeometry, store} = view;

                      return recordIds.map(recordId => rowGeometry.hasHeight(recordId) ?
                          rowGeometry.heightAt(store.items.findIndex(record => view.getRecordId(record) === recordId)) : null)
                  }, {recordIds, viewId});

            // Rows the grid has not seen get measured in place: the first such read after this jump is held
            await page.evaluate(grid => {
                document.querySelector(`${grid} .neo-grid-view`).scrollTop = 300000;
                window.holdArmed = true
            }, GRID);
            await expect.poll(() => page.evaluate(() => !!window.held), {message: 'a measurement read is held'}).toBe(true);
            await settle(page);

            // Another jump recycles the rows the held read addresses
            await scrollTo(page, 600000);

            const {before, now} = await page.evaluate(() => ({before: window.held.records, now: window.held.recordsNow()})),
                  recycled      = [...new Set(before.filter((recordId, index) => recordId && recordId !== now[index]))];

            expect(recycled.length, 'the held read now addresses rows that show other records').toBeGreaterThan(0);

            // Released, the read measures the texts of the records that took the rows over. Their sizes must not
            // reach the records the read was asked for.
            const heights = await known(recycled);

            await page.evaluate(() => window.held.release());
            await page.waitForTimeout(300);
            await settle(page);

            expect(await known(recycled), 'the recycled records keep the heights they had').toEqual(heights);
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

            state = await scrollToEnd(page);
            expect(state.extent, 'the extent holds at the end of the drag').toBe(extent);
            expect(fullyVisible(state, COUNT), 'the final row is reachable during the drag').toBe(true);

            // At the end of the list, rows from the top edge down that shrink at the release move that edge's row
            // down, since the view cannot scroll past its end. Mid-list, the row can always hold its place.
            state = await scrollTo(page, 120000);
            expect(state.extent, 'the extent holds during the drag').toBe(extent);

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

        test('10. the fixed-height control keeps the row under the top edge, switched off and on again', async ({page}) => {
            // Mid-list, where content-sized offsets run far ahead of `index × rowHeight`
            const reading = edgeRow(await scrollTo(page, 300000)).id;

            await page.getByText('Content-sized rows', {exact: true}).click();
            await expect.poll(async () => (await gridState(page)).extent, {message: 'the fixed extent'}).toBe((COUNT + 1) * ROW);
            expect(edgeRow(await settle(page)).id, 'switched to fixed rows').toBe(reading);

            await page.getByText('Content-sized rows', {exact: true}).click();
            expect(edgeRow(await settle(page)).id, 'switched back to content-sized rows').toBe(reading)
        });

        test('10b. fixed-height mode applies ellipsis and clipping to wrapped columns and preserves editing', async ({page}) => {
            // Viewport carries the example-scoped class
            const viewportCls = await page.evaluate(() => document.querySelector('.neo-viewport')?.className);
            expect(viewportCls, 'viewport carries example class').toContain('neo-examples-grid-content-sized-rows');

            // Caption displays content-sized proof line in default state
            const caption = page.locator('.content-sized-rows-caption');
            await expect(caption, 'caption is visible in content-sized mode').toBeVisible();
            await expect(caption, 'content-sized caption text').toHaveText('10,000 rows, each as tall as its text.');

            // Switch to fixed-height mode
            await page.getByText('Content-sized rows', {exact: true}).click();
            await expect.poll(async () => (await gridState(page)).extent, {message: 'the fixed extent'}).toBe((COUNT + 1) * ROW);

            // Caption updates to fixed-height proof line
            await expect(caption, 'fixed-height caption text').toHaveText('Fixed-height rows clip overflowing text.');

            // Grid container carries the fixed-rows class
            const gridCls = await page.evaluate(grid => document.querySelector(grid)?.className, GRID);
            expect(gridCls, 'grid carries fixed-rows class').toContain('content-sized-rows-fixed');

            // Check the 4 wrapped columns for ellipsis, nowrap, hidden overflow, and vertical containment
            const wrappedFields = ['title', 'summary', 'details', 'notes'];
            for (const field of wrappedFields) {
                const cellStyles = await page.evaluate(({grid, field}) => {
                    const cell = document.querySelector(`${grid} .neo-grid-cell[data-field="${field}"]`);
                    if (!cell) return null;
                    const style = getComputedStyle(cell);
                    return {
                        display     : style.display,
                        overflow    : style.overflow,
                        textOverflow: style.textOverflow,
                        whiteSpace  : style.whiteSpace,
                        lineHeight  : style.lineHeight,
                        scrollHeight: cell.scrollHeight,
                        clientHeight: cell.clientHeight
                    };
                }, {grid: GRID, field});

                expect(cellStyles, `styles for [data-field="${field}"]`).not.toBeNull();
                expect(cellStyles.display, `${field} display`).toBe('block');
                expect(cellStyles.overflow, `${field} overflow`).toBe('hidden');
                expect(cellStyles.textOverflow, `${field} text-overflow`).toBe('ellipsis');
                expect(cellStyles.whiteSpace, `${field} white-space`).toBe('nowrap');
                expect(cellStyles.lineHeight, `${field} line-height`).toBe('27px');
                expect(cellStyles.scrollHeight, `${field} scrollHeight <= clientHeight`).toBeLessThanOrEqual(cellStyles.clientHeight);
            }

            // Pinned columns verification: title is in locked start, notes is in locked end
            const titleLocked = await page.locator(`${GRID} .neo-grid-cell[data-field="title"]`).first().evaluate(el => el.classList.contains('neo-locked-start'));
            const notesLocked = await page.locator(`${GRID} .neo-grid-cell[data-field="notes"]`).first().evaluate(el => el.classList.contains('neo-locked-end'));
            expect(titleLocked, 'title is pinned start').toBe(true);
            expect(notesLocked, 'notes is pinned end').toBe(true);

            // Verify summary editing in fixed-height mode
            const targetCell = page.locator(`${GRID} .neo-grid-cell[data-field="summary"]`).first();
            await targetCell.dblclick();

            const editor = page.locator(`${GRID} .neo-grid-editor input`);
            await expect(editor, 'editor input is visible in fixed-height mode').toBeVisible();
            await editor.fill('Fixed-height edited summary value');
            await page.keyboard.press('Enter');

            await expect(targetCell).toContainText('Fixed-height edited summary value');

            // Switch back to content-sized mode: fixed-rows class leaves and natural heights return
            await page.getByText('Content-sized rows', {exact: true}).click();
            await settle(page);

            const gridClsRestored = await page.evaluate(grid => document.querySelector(grid)?.className, GRID);
            expect(gridClsRestored, 'fixed-rows class removed').not.toContain('content-sized-rows-fixed');
            await expect(caption, 'restored caption text').toHaveText('10,000 rows, each as tall as its text.');
            await expectRowsFitTheirText(page);
        });

        test('wheel throughput at ordinary and fast speeds', async ({page}) => {
            // The control: a view at rest has no arrivals
            await page.evaluate(grid => window.startSampling(grid, false), GRID);
            await page.waitForTimeout(500);

            const {mounted, visible} = await page.evaluate(() => window.stopSampling());
            expect({mounted, visible}, 'a view at rest has no arrivals').toEqual({mounted: 0, visible: 0});

            for (const [speed, interval] of [['ordinary', 50], ['fast', 16]]) {
                for (const classify of [false, true]) {
                    // Rows the grid has not seen, a different stretch per run
                    await scrollTo(page, (classify ? 100000 : 200000) + interval * 1000);

                    let numbers = await measureWheel(page, {classify, delta: STEP, interval, steps: 40});

                    test.info().annotations.push({type: `${speed}${classify ? ', classified' : ''}`, description: JSON.stringify(numbers)});
                    expect(numbers.visible, 'rows entered the view').toBeGreaterThan(10)
                }
            }
        });

        test('the dataset contains 10,000 deterministic records and reloading produces identical rows', async ({page}) => {
            // Verify count in the App Worker where the store lives
            const worker = await appWorker(page),
                  viewId = await page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).id, GRID),
                  count  = await worker.evaluate(viewId => Neo.getComponent(viewId).store.getCount(), viewId);

            expect(count, 'dataset contains 10,000 records').toBe(COUNT);

            // Sample 8 indices spread across the full dataset + build a fingerprint hash covering all
            // generated text fields: id, title, summary, details, notes, country, owner, status, score.
            const SAMPLE_INDICES = [0, 49, 499, 2499, 4999, 7499, 8999, 9999];

            const buildSnapshot = async (w, vid) => w.evaluate(({viewId, indices}) => {
                const store = Neo.getComponent(viewId).store,
                      count = store.getCount();

                const sentenceEnd    = /[.!?]$/,
                      invalidRecords = [];

                let hash = 0;

                // Worker-side full dataset traversal validating all 10,000 records
                for (let i = 0; i < count; i++) {
                    const r = store.getAt(i);
                    if (!r) {
                        invalidRecords.push({index: i, reason: 'missing record'});
                        continue;
                    }

                    // Full-dataset fingerprint — every field that generateData produces
                    const str = `${r.id}|${r.title}|${r.summary}|${r.details}|${r.notes}|${r.country}|${r.owner}|${r.status}|${r.score}`;
                    for (let j = 0; j < str.length; j++) {
                        hash = (Math.imul(31, hash) + str.charCodeAt(j)) | 0;
                    }

                    // 1. Scalar field validation
                    if (r.id !== i + 1 || typeof r.country !== 'string' || r.country.length === 0 ||
                        typeof r.owner !== 'string' || r.owner.length === 0 ||
                        typeof r.status !== 'string' || r.status.length === 0 ||
                        typeof r.score !== 'number' || r.score < 0 || r.score >= 100) {
                        invalidRecords.push({id: r.id, index: i, reason: 'invalid scalar values'});
                    }

                    // 2. Non-empty readable text fields without placeholder fragments
                    for (const field of ['title', 'summary', 'details', 'notes']) {
                        const val = r[field];
                        if (!val || typeof val !== 'string' || val.length <= 10 || !/^[A-Z]/.test(val) ||
                            val.toLowerCase().includes('lorem ipsum') || /word\d+/i.test(val) ||
                            (field !== 'title' && !sentenceEnd.test(val.trim()))) {
                            invalidRecords.push({field, index: i, reason: 'text validation failure'});
                        }
                    }

                    // 3. Each record must carry a non-empty title
                    if (typeof r.title !== 'string' || r.title.length === 0) {
                        invalidRecords.push({index: i, reason: 'missing or empty title'});
                    }

                    // Cap error array to prevent large transfer payload over CDP on systemic failure
                    if (invalidRecords.length >= 20) {
                        break;
                    }
                }

                // Sampled records for detailed field comparison (all generated fields)
                const sampled = indices.map(i => {
                    const r = store.getAt(i);
                    return r
                        ? {
                            country: r.country,
                            details: r.details,
                            id     : r.id,
                            notes  : r.notes,
                            owner  : r.owner,
                            score  : r.score,
                            status : r.status,
                            summary: r.summary,
                            title  : r.title
                        }
                        : null
                });

                return {count, hash, invalidRecords, sampled}
            }, {indices: SAMPLE_INDICES, viewId: vid});

            const before = await buildSnapshot(worker, viewId);

            // Assert that all 10,000 records pass scenario coherence and field validation
            expect(before.invalidRecords, 'all 10,000 records pass scenario coherence and field validation').toEqual([]);
            expect(before.count, 'full dataset count is 10,000').toBe(COUNT);

            // Detailed assertions on sampled records
            before.sampled.forEach((r, i) => {
                const idx = SAMPLE_INDICES[i];
                expect(r, `record at index ${idx} is present`).not.toBeNull();
                expect(r.id, `record ${idx} id is positive`).toBeGreaterThan(0);
            });

            await page.reload();
            await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});
            await settle(page);

            // Re-acquire worker reference after reload
            const workerAfter = await appWorker(page),
                  viewIdAfter = await page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).id, GRID),
                  after       = await buildSnapshot(workerAfter, viewIdAfter);

            expect(after.count, 'record count matches after reload').toBe(COUNT);
            expect(after.hash, 'full-dataset fingerprint (all fields) matches after reload').toBe(before.hash);
            expect(after.invalidRecords, 'all 10,000 records remain valid after reload').toEqual([]);
            expect(after.sampled, 'sampled records across full dataset match after reload').toEqual(before.sampled)
        });

        test('every wrapped text cell contains readable human sentences and paragraphs', async ({page}) => {
            const cells = await page.evaluate(grid => {
                const results = [];
                document.querySelectorAll(`${grid} .neo-grid-body`).forEach(body => {
                    body.querySelectorAll('.neo-grid-row').forEach(row => {
                        if (row.style.display !== 'none' && row.dataset.recordId && !row.closest('.neo-grid-row-measure')) {
                            row.querySelectorAll('.neo-grid-cell-text').forEach(cellText => {
                                const field = cellText.parentElement?.dataset.field;
                                if (['title', 'summary', 'details', 'notes'].includes(field)) {
                                    results.push({field, text: cellText.textContent.trim()})
                                }
                            })
                        }
                    })
                });
                return results
            }, GRID);

            // Sentence-ending punctuation pattern
            const sentenceEnd = /[.!?]$/;

            expect(cells.length).toBeGreaterThan(15);
            cells.forEach(({field, text}) => {
                expect(text.length, `${field} text is non-empty`).toBeGreaterThan(10);
                expect(text, `${field} starts with a capital letter`).toMatch(/^[A-Z]/);
                expect(text.toLowerCase()).not.toContain('lorem ipsum');
                expect(text).not.toMatch(/word\d+/);

                // Multi-sentence fields must end with sentence-terminating punctuation
                if (['summary', 'details', 'notes'].includes(field)) {
                    expect(text, `${field} ends with sentence punctuation`).toMatch(sentenceEnd)
                }
            })
        });

        test('initial viewport demonstrates at least three distinct row heights at both desktop and mobile widths', async ({page}) => {
            const caption = page.locator('.content-sized-rows-caption');
            await expect(caption, 'caption is visible on desktop').toBeVisible();
            await expect(caption, 'desktop caption text').toHaveText('10,000 rows, each as tall as its text.');

            let desktopState   = await settle(page),
                desktopHeights = new Set(desktopState.rows.slice(0, 10).map(r => r.height));

            expect(desktopHeights.size, 'at least 3 distinct row heights on desktop').toBeGreaterThanOrEqual(3);

            // Switch to mobile viewport
            await page.setViewportSize({width: 390, height: 844});
            await settle(page);

            await expect(caption, 'caption is visible on mobile').toBeVisible();
            await expect(caption, 'mobile caption text').toHaveText('10,000 rows, each as tall as its text.');

            const captionBox = await caption.boundingBox();
            expect(captionBox.width, 'caption width fits mobile viewport without overflow').toBeLessThanOrEqual(390);

            const overflowMetrics = await page.evaluate(() => {
                const captionEl = document.querySelector('.content-sized-rows-caption');
                return {
                    captionScrollWidth: captionEl?.scrollWidth ?? 0,
                    captionClientWidth: captionEl?.clientWidth ?? 0,
                    docScrollWidth    : document.documentElement.scrollWidth,
                    winInnerWidth     : window.innerWidth
                };
            });

            expect(overflowMetrics.captionScrollWidth, 'caption scrollWidth <= clientWidth').toBeLessThanOrEqual(overflowMetrics.captionClientWidth);
            expect(overflowMetrics.docScrollWidth, 'document scrollWidth <= innerWidth').toBeLessThanOrEqual(overflowMetrics.winInnerWidth);

            let mobileState   = await settle(page),
                mobileHeights = new Set(mobileState.rows.slice(0, 10).map(r => r.height));

            expect(mobileHeights.size, 'at least 3 distinct row heights on mobile').toBeGreaterThanOrEqual(3)
        });

        test('jumping to row 9,000 renders, paints, and stays in view with performance measurement', async ({page}) => {
            const target = 9000;

            // Browser-side measurement boundaries:
            // • Start: the capture-phase 'input' event fires in the browser carrying the exact value "9000".
            //   This excludes Playwright CDP fill() automation latency entirely.
            // • End: second requestAnimationFrame after row 9,000 is fully in-view and re-verified in the
            //   second frame. This is a paint-opportunity proxy, not proof of compositor presentation.
            await page.evaluate(({grid, target}) => window.armJumpMeasurement(grid, target), {grid: GRID, target});

            let measurement;

            try {
                await jumpToRow(page, target);

                await expect.poll(async () => {
                    const data = await page.evaluate(() => window.getJumpMeasurement());
                    return Number.isFinite(data?.paintedTime) && data?.verifiedVisible === true
                }, {message: `row ${target} rendered, painted, and re-verified visible`, timeout: 15000}).toBe(true);

                measurement = await page.evaluate(() => window.getJumpMeasurement());
            } finally {
                // Always release the browser-side input listener and animation frame, even on failure/timeout
                await page.evaluate(() => window.cleanupJumpMeasurement()).catch(() => {/* ignore if page is gone */})
            }

            // Verify startTime, visibleTime, and paintedTime are finite and chronologically ordered
            expect(Number.isFinite(measurement.startTime), 'startTime is finite').toBe(true);
            expect(Number.isFinite(measurement.visibleTime), 'visibleTime is finite').toBe(true);
            expect(Number.isFinite(measurement.paintedTime), 'paintedTime is finite').toBe(true);
            expect(measurement.startTime, 'startTime <= visibleTime').toBeLessThanOrEqual(measurement.visibleTime);
            expect(measurement.visibleTime, 'visibleTime <= paintedTime').toBeLessThanOrEqual(measurement.paintedTime);

            const jumpDurationMs = measurement.paintedTime - measurement.startTime;

            let state = await settle(page);
            expect(fullyVisible(state, target), `row ${target} is fully visible`).toBe(true);
            expect(measurement.verifiedRowId, 'verified row id matches target').toBe(target);
            await expectRowsFitTheirText(page);

            test.info().annotations.push({
                type       : 'jump-to-row-9000-paint-opportunity-ms',
                description: `${jumpDurationMs.toFixed(2)}ms (capture-phase input event → double-rAF paint proxy)`
            });
            console.log(
                `Measured jump to row 9,000 paint-opportunity time: ${jumpDurationMs.toFixed(2)}ms` +
                ` (visible: ${(measurement.visibleTime - measurement.startTime).toFixed(2)}ms,` +
                ` start boundary: browser capture-phase input event carrying value "${target}")`
            )
        })
    })
});

test.describe('Theme selection via URL query parameter', () => {
    test.use({viewport: WIDE});

    for (const [theme, expectedBg] of [
        ['neo-theme-dark',  'rgb(50, 50, 50)'],
        ['neo-theme-light', 'rgb(250, 250, 250)']
    ]) {
        test(`loads and applies ${theme} with correct body background`, async ({page}) => {
            await page.goto(`/examples/grid/contentSizedRows/index.html?theme=${theme}`);
            await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});

            const bodyClass = await page.evaluate(() => document.body.className);
            expect(bodyClass, `body carries ${theme}`).toContain(theme);

            const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            expect(bg, `computed background for ${theme}`).toBe(expectedBg);
        });
    }

    test('dark and light themes produce distinct computed background colors', async ({page}) => {
        await page.goto('/examples/grid/contentSizedRows/index.html?theme=neo-theme-dark');
        await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});
        const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

        await page.goto('/examples/grid/contentSizedRows/index.html?theme=neo-theme-light');
        await page.waitForSelector(`${GRID} .neo-grid-row[data-record-id]`, {state: 'visible', timeout: 30000});
        const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

        expect(darkBg, 'dark and light body backgrounds differ').not.toBe(lightBg);
        expect(darkBg).toBe('rgb(50, 50, 50)');
        expect(lightBg).toBe('rgb(250, 250, 250)');
    });
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
