import {expect, test} from '../../fixtures.mjs';
import {driveGrid}    from '../utils/gridCellEditing.mjs';

/**
 * @summary A locked region that loses its last column at runtime: the column moves to the center, with its header
 * button and its cells, and locking it again brings the region back.
 *
 * The header of an emptied region is torn down. The column that just left it still had its button in that toolbar,
 * and the button went with it: the column kept its instance and lost its header and every cell.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled`, whose locked regions
 * hold one column each — `c0` at the start, `c39` at the end. `gridDriver.mjs`'s `setLocked` writes the config inside
 * the App Worker.
 */
const GRID = '#grid-cell-editing-pooled';

let pageErrors;

/**
 * Writes `locked` on a column in the App Worker; `null` unlocks it.
 * @returns {Promise<void>}
 */
const setLocked = (page, field, locked) => driveGrid(page, 'setLocked', {field, locked: locked ?? ''});

/**
 * What the grid shows of one column: the ids of its header buttons, its cells, and how many of them a locked region
 * renders.
 * @returns {Promise<{bodies: Number, buttonIds: String[], cells: Number, lockedCells: Number}>}
 */
const column = (page, field) => page.evaluate(({grid, field}) => {
    const cells = [...document.querySelectorAll(`${grid} .neo-grid-cell[data-field="${field}"]`)];

    return {
        bodies   : document.querySelectorAll(`${grid} .neo-grid-body`).length,
        buttonIds: [...document.querySelectorAll(`${grid} .neo-grid-header-button`)]
            .filter(node => node.textContent.trim() === field.toUpperCase()).map(node => node.id),
        cells      : cells.length,
        lockedCells: cells.filter(node => /neo-locked-(start|end)/.test(node.className)).length
    }
}, {field, grid: GRID});

const scrollHorizontally = (page, left) => page.evaluate(({grid, left}) => {
    document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = left
}, {grid: GRID, left});

test.describe('A locked grid region that loses its last column', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="c39"]`, {state: 'visible', timeout: 30000})
    });

    test.afterEach(() => {
        expect(pageErrors, 'no page error in the arm').toEqual([])
    });

    for (const [field, region, scrollLeft] of [['c39', 'end', 100000], ['c0', 'start', 0]]) {
        test(`unlocking the only locked-${region} column moves it to the center, and locking it again brings the region back`, async ({page}) => {
            const before = await column(page, field);

            expect(before, 'precondition: one button, every cell in its locked region, three bodies')
                .toMatchObject({bodies: 3, lockedCells: before.cells});
            expect(before.buttonIds).toHaveLength(1);
            expect(before.cells).toBeGreaterThan(0);

            await setLocked(page, field, null);

            await expect.poll(() => column(page, field), {message: 'the column is in the center: its button, no locked region left for it'})
                .toMatchObject({bodies: 2, buttonIds: before.buttonIds, lockedCells: 0});

            // The center pools its columns, and `c39` is its last one: the scroll range only reaches it once the
            // unlock has widened the center, so the scroll is part of what is polled
            await expect.poll(async () => {
                await scrollHorizontally(page, scrollLeft);
                return (await column(page, field)).cells
            }, {message: 'the center body renders its cells'}).toBeGreaterThan(0);

            await setLocked(page, field, region);

            await expect.poll(() => column(page, field), {message: 'the region is back, with the same button'})
                .toMatchObject({bodies: 3, buttonIds: before.buttonIds});

            const after = await column(page, field);

            expect(after.cells, 'and its cells').toBeGreaterThan(0);
            expect(after.lockedCells, 'all of them in the locked region').toBe(after.cells)
        })
    }
});
