import {test, expect} from '../../fixtures.mjs';

const GRID = '#grid-wrap-text';

/**
 * @summary Waits for ten identical frames of displayed records and their viewport-relative boxes.
 * Idle refinement may keep changing the estimated extent; the settled jump is the visible anchor and rows.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function settleGrid(page) {
    const settled = await page.evaluate(async grid => {
        const state = () => {
            let   view = document.querySelector(`${grid} .neo-grid-view`);
            const top  = view.getBoundingClientRect().top;
            return JSON.stringify([...view.querySelectorAll('.neo-grid-row[data-record-id]')]
                    .filter(row => row.style.display !== 'none')
                    .map(row => [row.dataset.recordId, row.getBoundingClientRect().top - top,
                        row.getBoundingClientRect().height, row.dataset.heightSource]))
        };
        let last = state(), stable = 0;
        for (let frame = 0; frame < 600 && stable < 10; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            let next = state();
            stable = next === last ? stable + 1 : 0;
            last = next
        }
        return stable === 10
    }, GRID);
    expect(settled, 'the scroll and its geometry correction settle before the next input').toBe(true)
}

/**
 * @summary Compares hidden text boxes to the matching displayed text and rows, by record and field identity.
 * This reads real CSS layout, independently of the worker's measured cache.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
const layoutReport = page => page.evaluate(grid => {
    let visible = new Map(), rows = new Map(), pairs = [], driven = [];
    document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`).forEach(row => {
        if (row.closest('.neo-grid-row-measure') || row.style.display === 'none') return;
        rows.set(row.dataset.recordId, row.getBoundingClientRect().height);
        row.querySelectorAll('.neo-grid-cell-text').forEach(text => {
            let cell = text.parentElement;
            visible.set(`${cell.dataset.recordId}:${cell.dataset.field}`, text.getBoundingClientRect())
        })
    });
    document.querySelectorAll(`${grid} .neo-grid-row-measure .neo-grid-cell-text`).forEach(text => {
        let cell   = text.parentElement, rect = text.getBoundingClientRect(),
            actual = visible.get(`${cell.dataset.recordId}:${cell.dataset.field}`),
            style  = getComputedStyle(cell),
            chrome = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
                .reduce((sum, name) => sum + (parseFloat(style.getPropertyValue(name)) || 0), 0);
        actual && pairs.push({hidden: rect.height, displayed: actual.height, width: cell.getBoundingClientRect().width});
        if (cell.dataset.field === 'text' && rows.has(cell.dataset.recordId) && rect.height + chrome > 40) {
            driven.push({needed: rect.height + chrome, row: rows.get(cell.dataset.recordId)})
        }
    });
    return {pairs, driven}
}, GRID);

test.describe('Grid native hidden premeasurement', () => {
    test.use({viewport: {width: 1200, height: 800}});
    let app, viewId, geometryId, textColumnId, idColumnId;

    test.beforeEach(async ({page, neuralLink}) => {
        await page.goto('/test/playwright/component/apps/grid-wrap-text/index.html');
        await page.locator(`${GRID} .neo-grid-cell-text`).first().waitFor({state: 'visible'});
        app = await neuralLink.connectToApp('Test.Playwright.GridWrapText');
        viewId = (await app.queryComponent({ntype: 'grid-view'}, ['id']))[0].id;
        geometryId = (await app.findInstances({className: 'Neo.grid.RowGeometry'}, ['id']))[0].id;
        textColumnId = (await app.queryComponent({ntype: 'grid-header-button', dataField: 'text'}, ['id']))[0].id;
        idColumnId = (await app.queryComponent({ntype: 'grid-header-button', dataField: 'id'}, ['id']))[0].id
    });

    test('hidden and displayed text agree at actual fractional column widths', async ({page}) => {
        await app.setProperties(textColumnId, {width: 213.5});
        await expect.poll(() => page.locator(`${GRID} .neo-grid-cell[data-field="text"]`).filter({visible: true})
            .first().evaluate(cell => cell.getBoundingClientRect().width)).toBe(213.5);
        await app.callMethod(viewId, 'resetRowHeights');
        const hidden = page.locator(`${GRID} .neo-grid-row-measure .neo-grid-cell[data-field="text"] .neo-grid-cell-text`).first();
        await hidden.waitFor({state: 'attached'});
        await expect.poll(() => hidden.evaluate(text => text.parentElement.getBoundingClientRect().width)).toBe(213.5);
        const sample = await hidden.evaluate(text => ({
            index   : Number(text.closest('.neo-grid-row').dataset.measureIndex),
            recordId: text.parentElement.dataset.recordId,
            height  : text.getBoundingClientRect().height,
            width   : text.parentElement.getBoundingClientRect().width,
            html    : text.innerHTML
        }));
        expect(Number.isFinite(sample.index)).toBe(true);
        expect(sample.width).toBe(213.5);
        // Attachment precedes the main-thread read and its acceptance by the geometry.
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [sample.recordId])).toBe(true);
        await app.callMethod(viewId, 'promiseUpdate');
        // Known mounted fields are deliberately omitted from the hidden pass. Display this same hidden record next.
        await app.callMethod(viewId, 'scrollByRows', [0, sample.index]);
        const displayed = page.locator(`${GRID} .neo-grid-cell[data-record-id="${sample.recordId}"][data-field="text"] .neo-grid-cell-text`)
            .filter({visible: true});
        await displayed.waitFor({state: 'visible'});
        expect(await displayed.evaluate(text => text.innerHTML)).toBe(sample.html);
        expect(await displayed.evaluate(text => text.parentElement.getBoundingClientRect().width)).toBe(sample.width);
        expect(Math.abs(await displayed.evaluate(text => text.getBoundingClientRect().height) - sample.height)).toBeLessThan(0.01)
    });

    test('the horizontally unmounted text column still determines visible row heights', async ({page}) => {
        await app.setProperties(idColumnId, {width: 1400});
        await expect.poll(() => page.locator(`${GRID} .neo-grid-cell[data-field="id"]`).filter({visible: true})
            .first().evaluate(cell => cell.getBoundingClientRect().width)).toBe(1400);
        await expect.poll(() => page.locator(`${GRID} .neo-grid-cell[data-field="text"]`).filter({visible: true}).count()).toBe(0);
        await app.callMethod(viewId, 'resetRowHeights');
        await expect(async () => {
            let {driven} = await layoutReport(page);
            expect(driven.length).toBeGreaterThan(2);
            driven.forEach(item => expect(Math.abs(item.row - item.needed)).toBeLessThan(1))
        }).toPass({timeout: 5000})
    });

    test('a real font arrival replaces the fallback-font height cache', async ({page}) => {
        await app.callMethod(viewId, 'promiseUpdate');
        await settleGrid(page);
        await app.callMethod(viewId, 'measureAheadRows');
        await app.callMethod(viewId, 'promiseUpdate');
        await page.locator(`${GRID} .neo-grid-view`).hover();
        for (let step = 0; step < 32; step++) {
            await page.mouse.wheel(0, 200);
            await settleGrid(page)
        }
        const lastCell = page.locator(`${GRID} .neo-grid-row[data-record-id] .neo-grid-cell[data-field="text"]`).filter({visible: true}).first();
        expect(await lastCell.evaluate(cell => Number(cell.closest('.neo-grid-row').dataset.rowId))).toBeGreaterThan(40);
        const lastId = await lastCell.getAttribute('data-record-id');
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId])).toBe(true);
        await page.locator(`${GRID} .neo-grid-view`).evaluate(view => {view.scrollTop = 0});
        await expect.poll(() => page.locator(`${GRID} .neo-grid-row[data-record-id]`).first()
            .evaluate(row => Number(row.dataset.rowId))).toBe(0);
        await settleGrid(page);
        await page.evaluate(async grid => {
            let face = new FontFace('GridFontArrival', 'local("Courier New"), local("DejaVu Sans Mono"), local("Liberation Mono")');
            document.fonts.add(face);
            let style = document.createElement('style');
            style.textContent = `${grid} .neo-grid-cell {font-family: GridFontArrival, monospace}`;
            document.head.append(style);
            await face.load();
            await document.fonts.ready
        }, GRID);
        // The previously visited record is outside the measurement window: invalidation must retire its height.
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId])).toBe(false);
        const firstId = await page.locator(`${GRID} .neo-grid-row[data-record-id]`).first().getAttribute('data-record-id');
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [firstId])).toBe(true);
        await app.callMethod(viewId, 'promiseUpdate');
        await settleGrid(page);
        await app.callMethod(viewId, 'measureAheadRows');
        await app.callMethod(viewId, 'promiseUpdate');
        for (let step = 0; step < 100 && !(await app.callMethod(geometryId, 'hasHeight', [lastId])); step++) {
            await page.mouse.wheel(0, 200);
            await settleGrid(page)
        }
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId]), {timeout: 10000}).toBe(true)
    });

    test('without input the bounded nearby measurements settle and keep the viewport and extent still', async ({page}) => {
        await page.evaluate(() => document.fonts.ready);
        await app.setProperties('grid-wrap-text', {useInternalId: false});
        await page.evaluate(() => {
            const access = Neo.main.DomAccess, original = access.getLayoutRect,
                witness  = window.__gridIdleWitness = {measurements: 0, updates: 0, original};
            access.getLayoutRect = function(...args) {witness.measurements++; return original.apply(this, args)};
            witness.onUpdated = () => {witness.updates++};
            Neo.main.DeltaUpdates.on('updated', witness.onUpdated)
        });
        // A real reset supplies positive controls for both main-thread counters through the production transport.
        await app.callMethod(viewId, 'resetRowHeights');
        await expect.poll(() => page.evaluate(() => window.__gridIdleWitness.measurements)).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => window.__gridIdleWitness.updates)).toBeGreaterThan(0);
        await app.callMethod(viewId, 'measureAheadRows');
        await app.callMethod(viewId, 'promiseUpdate');
        await settleGrid(page);
        const settledTraffic = await page.evaluate(async () => {
            const witness = window.__gridIdleWitness;
            let   last    = `${witness.measurements}/${witness.updates}`, stable = 0;
            for (let frame = 0; frame < 600 && stable < 10; frame++) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const next = `${witness.measurements}/${witness.updates}`;
                stable = next === last ? stable + 1 : 0;
                last = next
            }
            return stable === 10
        });
        expect(settledTraffic, 'the reset and its hidden measurement traffic finish before idle begins').toBe(true);
        expect(await app.callMethod(geometryId, 'hasHeight', [300]), 'settlement does not scan the distant store').toBe(false);
        const quiet = await page.evaluate(async grid => {
            const view = document.querySelector(`${grid} .neo-grid-view`), states = new Set(), witness = window.__gridIdleWitness;
            witness.measurements = witness.updates = 0;
            try {
                for (let frame = 0; frame < 60; frame++) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    states.add(JSON.stringify([view.scrollTop, view.scrollHeight,
                        [...view.querySelectorAll('.neo-grid-row[data-record-id]')].filter(row => row.style.display !== 'none')
                            .map(row => [row.dataset.recordId, row.getBoundingClientRect().top, row.getBoundingClientRect().height])]))
                }
                return {states: states.size, measurements: witness.measurements, updates: witness.updates}
            } finally {
                Neo.main.DomAccess.getLayoutRect = witness.original;
                Neo.main.DeltaUpdates.un('updated', witness.onUpdated)
            }
        }, GRID);
        expect(quiet, 'idle has no measurement traffic, renderer updates, estimate changes or visible twitches')
            .toEqual({states: 1, measurements: 0, updates: 0})
    });

    for (const direction of [-1, 1]) for (const paced of [true, false]) {
    test(`${direction < 0 ? 'reverse' : 'forward'} wheel ${paced ? 'coverage' : 'throughput'} records the share first mounted at the estimate`, async ({page}) => {
        // A bounded idle scan must not make this witness vacuous by learning the whole store before input.
        const storeId = (await app.findInstances({className: 'Neo.test.playwright.GridWrapTextStore'}, ['id']))[0].id;
        await app.setProperties('grid-wrap-text', {useInternalId: false});
        await app.setProperties(storeId, {data: Array.from({length: 5000}, (_, index) => ({
            id: index + 1, tag: 'wrapped tag', text: Array.from({length: 1 + (index * 7) % 40}, () => 'row').join(' ')
        }))});
        await expect.poll(async () => (await app.getComponent(storeId, ['count'])).count).toBe(5000);
        await app.callMethod(viewId, 'resetRowHeights');
        // Store load includes a detached scroll-to-top dispatch; settle it before the intentional jump.
        await app.callMethod(viewId, 'promiseUpdate');
        await settleGrid(page);
        // The far jump is a separate allowed estimate-first case. The steady reverse wheel sample starts after it.
        await app.callMethod(viewId, 'scrollByRows', [0, 2000]);
        await expect.poll(() => page.locator(`${GRID} .neo-grid-view`).evaluate(node => node.scrollTop)).toBeGreaterThan(5000);
        await expect.poll(() => page.locator(`${GRID} .neo-grid-row[data-record-id]`).first()
            .evaluate(row => Number(row.dataset.recordId))).toBeGreaterThan(1900);
        await page.locator(`${GRID} .neo-grid-view`).hover();
        await settleGrid(page);
        const unknownId = await page.evaluate(({grid, direction}) => {
            const ids = [...document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`)]
                .filter(row => row.style.display !== 'none').map(row => Number(row.dataset.recordId));
            return (direction < 0 ? Math.min(...ids) : Math.max(...ids)) + direction * 20
        }, {grid: GRID, direction});
        expect(unknownId).toBeGreaterThan(1);
        expect(await app.callMethod(geometryId, 'hasHeight', [unknownId]), 'the wheel path still contains unseen records').toBe(false);
        await page.evaluate(({grid, unknownId}) => {
            let seen      = new Set([...document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`)].map(row => row.dataset.recordId));
            let frameSeen = new Set();
            let started   = false;
            window.__gridHeightSample = {jump: {measured: 0, estimated: 0}, wheel: {measured: 0, estimated: 0},
                visible: {measured: 0, estimated: 0}, unseenRecordArrived: false, unseenRecordVisible: false};
            document.querySelector(`${grid} .neo-grid-view`).addEventListener('wheel', () => {started = true},
                {capture: true, once: true, passive: true});
            window.__gridHeightObserver = new MutationObserver(() => {
                document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`).forEach(row => {
                    let id = row.dataset.recordId, source = row.dataset.heightSource;
                    if (row.style.display === 'none' || seen.has(id) || !['measured', 'estimated'].includes(source)) return;
                    seen.add(id);
                    started && Number(id) === unknownId && (window.__gridHeightSample.unseenRecordArrived = true);
                    window.__gridHeightSample[started ? 'wheel' : 'jump'][source]++
                })
            });
            window.__gridHeightObserver.observe(document.querySelector(grid), {attributes: true, childList: true, subtree: true})
            const frame = () => {
                const viewport = document.querySelector(`${grid} .neo-grid-view`).getBoundingClientRect();
                document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`).forEach(row => {
                    let id = row.dataset.recordId, source = row.dataset.heightSource, rect = row.getBoundingClientRect();
                    if (row.style.display === 'none' || frameSeen.has(id) || !['measured', 'estimated'].includes(source) ||
                        rect.bottom <= viewport.top || rect.top >= viewport.bottom ||
                        rect.right <= viewport.left || rect.left >= viewport.right) return;
                    frameSeen.add(id);
                    if (started) {
                        window.__gridHeightSample.visible[source]++;
                        Number(id) === unknownId && (window.__gridHeightSample.unseenRecordVisible = true)
                    }
                });
                window.__gridHeightFrame = requestAnimationFrame(frame)
            };
            window.__gridHeightFrame = requestAnimationFrame(frame)
        }, {grid: GRID, unknownId});
        for (let step = 0; step < 25; step++) {
            await page.mouse.wheel(0, direction * 120);
            if (paced) {
                await settleGrid(page)
            } else {
                // Input cadence is the measured ~50 rows/s workload, not a readiness wait.
                await page.waitForTimeout(32)
            }
        }
        const sample = await page.evaluate(() => {
            window.__gridHeightObserver.disconnect();
            cancelAnimationFrame(window.__gridHeightFrame);
            return window.__gridHeightSample
        });
        console.log('premeasurement wheel coverage', JSON.stringify({direction, paced, ...sample}));
        expect(sample.visible.measured + sample.visible.estimated).toBeGreaterThan(15);
        expect(sample.visible.estimated).toBe(0);
        expect(sample.unseenRecordVisible, 'the sample displays a record proven unknown before wheel input').toBe(true)
    })
    }
});
