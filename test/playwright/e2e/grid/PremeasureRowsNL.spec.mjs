import {test, expect} from '../../fixtures.mjs';

const GRID = '#grid-wrap-text';

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
        const lastCell = page.locator(`${GRID} .neo-grid-row-measure [data-measure-index="299"] .neo-grid-cell[data-field="text"]`);
        await lastCell.waitFor({state: 'attached'});
        const lastId = await lastCell.getAttribute('data-record-id');
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId])).toBe(true);
        await page.evaluate(async grid => {
            let face = new FontFace('GridFontArrival', 'local("Courier New"), local("DejaVu Sans Mono"), local("Liberation Mono")');
            document.fonts.add(face);
            let style = document.createElement('style');
            style.textContent = `${grid} .neo-grid-cell {font-family: GridFontArrival, monospace}`;
            document.head.append(style);
            await face.load();
            await document.fonts.ready
        }, GRID);
        // Record 299 is outside the viewport: only clearing the retained cache can make it unknown.
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId])).toBe(false);
        await expect.poll(() => app.callMethod(geometryId, 'hasHeight', [lastId]), {timeout: 10000}).toBe(true)
    });

    test('ordinary reverse wheel scrolling records the share first mounted at the estimate', async ({page}) => {
        // The far jump is a separate allowed estimate-first case. The steady reverse wheel sample starts after it.
        await app.callMethod(viewId, 'scrollByRows', [0, 250]);
        await expect.poll(() => page.locator(`${GRID} .neo-grid-view`).evaluate(node => node.scrollTop)).toBeGreaterThan(5000);
        await expect.poll(() => page.locator(`${GRID} .neo-grid-row[data-height-source="measured"]`).count()).toBeGreaterThan(3);
        await page.evaluate(grid => {
            let seen    = new Set([...document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`)].map(row => row.dataset.recordId));
            let started = false;
            window.__gridHeightSample = {jump: {measured: 0, estimated: 0}, wheel: {measured: 0, estimated: 0}};
            document.querySelector(`${grid} .neo-grid-view`).addEventListener('wheel', () => {started = true},
                {capture: true, once: true, passive: true});
            window.__gridHeightObserver = new MutationObserver(() => {
                document.querySelectorAll(`${grid} .neo-grid-row[data-record-id]`).forEach(row => {
                    let id = row.dataset.recordId, source = row.dataset.heightSource;
                    if (row.style.display === 'none' || seen.has(id) || !['measured', 'estimated'].includes(source)) return;
                    seen.add(id);
                    window.__gridHeightSample[started ? 'wheel' : 'jump'][source]++
                })
            });
            window.__gridHeightObserver.observe(document.querySelector(grid), {attributes: true, childList: true, subtree: true})
        }, GRID);
        await page.locator(`${GRID} .neo-grid-view`).hover();
        for (let step = 0; step < 25; step++) {
            await page.mouse.wheel(0, -120);
            // Input cadence is the measured ~50 rows/s workload, not a readiness wait.
            await page.waitForTimeout(32)
        }
        const sample = await page.evaluate(() => {
            window.__gridHeightObserver.disconnect();
            return window.__gridHeightSample
        });
        console.log('premeasurement wheel coverage', JSON.stringify(sample));
        expect(sample.wheel.measured + sample.wheel.estimated).toBeGreaterThan(15);
        expect(sample.wheel.estimated).toBe(0)
    })
});
