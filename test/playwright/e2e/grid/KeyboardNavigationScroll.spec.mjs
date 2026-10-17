import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Arrow-key navigation keeps the selected cell in sight: walking past the visible columns scrolls the grid.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled` — 40 columns of
 * 150px, `c0` locked to the start and `c39` to the end, so twelve steps to the right leave both the viewport and the
 * mounted column window. A selection that outran the scroll is not rendered at all, so "the selected cell exists,
 * inside the center body's visible width" is the whole contract, in either direction.
 */
const GRID     = '#grid-cell-editing-pooled',
      SELECTED = `${GRID} .neo-grid-cell.neo-selected`;

/**
 * Where the selected cell sits against the visible width of the center body: `{text, inside}`, or null while no
 * selected cell is rendered.
 * @returns {Promise<Object|null>}
 */
const selectedCell = page => page.evaluate(({grid, selected}) => {
    const cell = document.querySelector(selected),
          // Start-locked, center, end-locked: the center body's box is what it shows between the two others
          body = document.querySelectorAll(`${grid} .neo-grid-body`)[1];

    if (!cell || !body) {
        return null
    }

    const c = cell.getBoundingClientRect(),
          b = body.getBoundingClientRect();

    // 3px: the App Worker knows the container's width, not its borders
    return {inside: c.left >= b.left - 3 && c.right <= b.right + 3, text: cell.textContent}
}, {grid: GRID, selected: SELECTED});

const scrollLeft = page => page.evaluate(grid => document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft, GRID);

/**
 * @summary Captures a failed navigation's DOM before reading the worker, without changing the key sequence.
 * The View's selectedCells getter reads its selection model's items. Row VDOM and adopted VNodes are separate
 * projections; their reads happen after the DOM snapshot, not atomically with it. A deadline or missing instance
 * is recorded as diagnostic evidence and never replaces the original test failure.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @returns {Promise<void>}
 */
async function attachSelectionFailure(page, testInfo) {
    const snapshot = {grid: GRID};
    let deadline;

    try {
        await Promise.race([
            (async () => {
                snapshot.dom = await page.evaluate(grid => {
                    const root = document.querySelector(grid);

                    if (!root) return {capturedAt: performance.now(), missingGrid: true};

                    const id       = node => node?.id || node?.getAttribute('data-neo-id') || null,
                          cells    = [...root.querySelectorAll('.neo-grid-cell')],
                          recordId = cells.find(cell => cell.textContent === 'r3c0')?.dataset.recordId,
                          selected = cell => cell.classList.contains('neo-selected') || cell.getAttribute('aria-selected') === 'true',
                          readCell = cell => ({
                              id          : id(cell), field: cell.dataset.field, recordId: cell.dataset.recordId,
                              text        : cell.textContent, cls: [...cell.classList],
                              ariaSelected: cell.getAttribute('aria-selected'), left: cell.style.left
                          });

                    return {
                        capturedAt     : performance.now(),
                        gridId         : id(root), viewId: id(root.querySelector('.neo-grid-view')),
                        activeElementId: id(document.activeElement),
                        scrollLeft     : root.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft,
                        selectedCells  : cells.filter(selected).map(readCell),
                        bodies         : [...root.querySelectorAll('.neo-grid-body')].map(body => ({
                            id: id(body), scrollLeft: body.style.getPropertyValue('--grid-scroll-left')
                        })),
                        rows: [...root.querySelectorAll('.neo-grid-row')]
                            .filter(row => row.dataset.recordId === recordId || [...row.querySelectorAll('.neo-grid-cell')].some(selected))
                            .map(row => ({
                                id   : id(row), recordId: row.dataset.recordId,
                                cells: [...row.querySelectorAll('.neo-grid-cell')].map(readCell)
                            }))
                    }
                }, GRID);

                if (snapshot.dom.missingGrid) return;

                snapshot.worker = await page.evaluate(async ({gridId, viewId, bodies, rows}) => {
                    const startedAt = performance.now(),
                          flags     = ['isVdomUpdating', 'needsVdomUpdate', 'isVnodeInitializing'],
                          read      = async (id, keys) => {
                              const values = await Neo.worker.App.getConfigs({id, keys});
                              return values === false ? {id, missingInstance: true} :
                                  {id, ...Object.fromEntries(keys.map((key, index) => [key, values[index]]))}
                          },
                          [container, view, bodyStates, rowStates] = await Promise.all([
                              read(gridId, flags),
                              read(viewId, ['selectedCells', ...flags]),
                              Promise.all(bodies.map(body => read(body.id, ['scrollLeft', 'mountedColumns', ...flags]))),
                              Promise.all(rows.map(row => read(row.id, ['rowIndex', 'vdom', 'vnode', ...flags])))
                          ]);

                    for (const row of rowStates) {
                        row.vdom = row.vdom?.cn?.map(cell => ({
                            id  : cell.id, field: cell.data?.field, recordId: cell.data?.recordId,
                            text: cell.html, cls: cell.cls, ariaSelected: cell['aria-selected'], left: cell.style?.left
                        }));
                        row.vnode = row.vnode?.childNodes?.map(cell => ({
                            id  : cell.id, field: cell.attributes?.['data-field'], recordId: cell.attributes?.['data-record-id'],
                            text: cell.innerHTML, cls: cell.className, ariaSelected: cell.attributes?.['aria-selected'], left: cell.style?.left
                        }))
                    }

                    return {startedAt, finishedAt: performance.now(), container, view, bodies: bodyStates, rows: rowStates}
                }, snapshot.dom)
            })(),
            new Promise((resolve, reject) => {
                deadline = setTimeout(() => reject(new Error('Grid selection diagnostic did not finish within 3 seconds')), 3000)
            })
        ])
    } catch (error) {
        snapshot.diagnosticError = String(error)
    } finally {
        clearTimeout(deadline)
    }

    try {
        await testInfo.attach('grid-selection-state', {body: JSON.stringify(snapshot, null, 2), contentType: 'application/json'})
    } catch (error) {
        console.warn('Could not attach grid selection diagnostic:', String(error))
    }
}

test.describe('Grid keyboard navigation scrolls the selection into sight', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.afterEach(async ({page}, testInfo) => {
        if (testInfo.status !== testInfo.expectedStatus) {
            await attachSelectionFailure(page, testInfo)
        }
    });

    test('arrowing right past the visible columns, and back left, keeps the selected cell rendered and visible', async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="c39"]`, {state: 'visible', timeout: 30000});

        await page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText('r3c3', {exact: true}).click();
        await expect(page.locator(SELECTED)).toHaveText('r3c3');
        expect(await scrollLeft(page), 'precondition: the grid starts unscrolled').toBe(0);

        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('ArrowRight')
        }

        await expect.poll(() => selectedCell(page), {message: 'c15 is selected, rendered and inside the visible width'})
            .toEqual({inside: true, text: 'r3c15'});
        expect(await scrollLeft(page), 'the horizontal scrollbar moved').toBeGreaterThan(0);

        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('ArrowLeft')
        }

        await expect.poll(() => selectedCell(page), {message: 'back on c3, rendered and inside the visible width'})
            .toEqual({inside: true, text: 'r3c3'})
    })
});
