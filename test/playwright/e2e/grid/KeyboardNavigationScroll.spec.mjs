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

test.describe('Grid keyboard navigation scrolls the selection into sight', () => {
    test.use({viewport: {width: 1400, height: 900}});

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
