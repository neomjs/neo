import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const GRID_ID = 'grid-locked-wrap',
      RULE    = 'rgb(250, 1, 90)',
      ROW     = 'rgb(30, 140, 70)',
      COLUMN  = 'rgb(25, 130, 250)',
      FRAME   = 'rgb(31, 47, 63)',
      CLEAR   = 'rgba(0, 0, 0, 0)';

async function openGrid(page, scheme = 'dark') {
    await page.goto('/test/playwright/component/apps/grid-locked-wrap/index.html');
    const grid = page.locator(`#${GRID_ID}`),
          view = grid.locator('.neo-grid-view'),
          cell = field => view.locator(`.neo-grid-cell[data-field="${field}"]`).first(),
          row  = id => view.locator('.neo-grid-cell[data-field="id"]').getByText(String(id), {exact: true});

    await expect(cell('id')).toBeVisible();
    const worker = page.workers().find(item => item.url().includes('/worker/App'));

    await worker.evaluate(({id, scheme}) => {Neo.get(id).theme = 'neo-theme-neo-' + scheme}, {id: GRID_ID, scheme});
    await expect(view).toHaveCSS('color-scheme', scheme);

    const configure = ({count, pitch, sized = false, cap}) => worker.evaluate(({id, count, pitch, sized, cap}) => {
        const grid = Neo.get(id);

        grid.set({contentSizedRows: sized, rowHeight: pitch});
        if (cap !== undefined) grid.view.maxScrollHeight = cap;
        grid.store.data = Array.from({length: count}, (_, index) => ({
            id  : index + 1,
            lead: 'locked start',
            note: 'locked end',
            text: ('wrapped text '.repeat(sized ? index * 18 + 1 : 1)).trim()
        }))
    }, {id: GRID_ID, count, pitch, sized, cap});

    const paint = ({bottom, right, empty}) => worker.evaluate(({id, frame, bottom, right, empty}) => {
        const grid = Neo.get(id);

        grid.style = {...grid.style,
            '--neo-grid-container-border-color'  : frame,
            '--neo-grid-cell-border-bottom-color': bottom,
            '--neo-grid-cell-border-right-color' : right,
            '--neo-grid-empty-row-border-color'  : empty
        }
    }, {id: GRID_ID, frame: FRAME, bottom, right, empty});

    const workerState = () => worker.evaluate(id => {
        const {store, view} = Neo.get(id);

        return {count: store.count, paged: view.paged, pageOffset: view.pageOffset}
    }, GRID_ID);

    const geometry = () => view.evaluate(node => {
        const rule = getComputedStyle(node, '::before');

        return {
            clientHeight : node.clientHeight,
            scrollHeight : node.scrollHeight,
            scrollTop    : node.scrollTop,
            start        : parseFloat(rule.top),
            size         : parseFloat(rule.height),
            pitch        : parseFloat(rule.getPropertyValue('--neo-grid-empty-row-height')),
            pointerEvents: rule.pointerEvents
        }
    });

    const lastRowBottom = id => row(id).evaluate(node =>
        node.closest('.neo-grid-row').getBoundingClientRect().bottom -
        node.closest('.neo-grid-view').getBoundingClientRect().top
    );

    const scrollTo = offset => worker.evaluate(({id, offset}) => Neo.get(id).view.scrollToOffset(offset), {id: GRID_ID, offset}),
          setPitch = pitch  => worker.evaluate(({id, pitch})  => {Neo.get(id).rowHeight = pitch}, {id: GRID_ID, pitch});

    return {grid, view, cell, row, configure, paint, workerState, geometry, lastRowBottom, scrollTo, setPitch}
}

/**
 * @summary Samples actual painted rule pixels in the center region, away from text and region borders.
 * @param {import('@playwright/test').Locator} view
 * @returns {Promise<Number[]>} Y offsets relative to the visible View.
 */
async function ruledLines(view) {
    const {channels, pixels, width, height} = decodePng(await view.screenshot()),
          lines                             = [];

    for (let y = 0; y < height; y++) {
        const offset = (y * width + 200) * channels;

        if (pixels[offset] === 250 && pixels[offset + 1] === 1 && pixels[offset + 2] === 90) {
            lines.push(y)
        }
    }

    return lines
}

const interactiveSurface = view => view.evaluate(node => {
    const {left, top} = node.getBoundingClientRect(),
          hit         = document.elementFromPoint(left + 200, top + 145);

    return {
        descendants: node.querySelectorAll('[role="row"], [role="gridcell"], [tabindex], button, input').length,
        focused    : document.activeElement?.id,
        target     : hit?.id,
        rowTarget  : Boolean(hit?.closest('[role="row"], [role="gridcell"]'))
    }
});

test.describe('Grid separators and ruled empty rows', () => {
    test.use({viewport: {width: 910, height: 620}, deviceScaleFactor: 1});

    for (const scheme of ['light', 'dark']) {
        test(`${scheme}: independent rules preserve locked seams and fill only the unused viewport`, async ({page}) => {
            const {grid, view, cell, row, configure, paint, workerState, geometry, lastRowBottom, setPitch} = await openGrid(page, scheme);

            await configure({count: 3, pitch: 28});
            await expect(row(3)).toBeVisible();
            await expect.poll(async () => (await geometry()).start).toBe(84);

            const ordinary  = cell('id'),
                  firstEnd  = cell('note'),
                  lastStart = cell('lead'),
                  trailing  = cell('text');

            await paint({bottom: '', right: '', empty: ''});
            await expect(ordinary).toHaveCSS('border-bottom-color', FRAME);
            await expect(ordinary).toHaveCSS('border-right-color', FRAME);
            const before            = await geometry(),
                  beforeInteraction = await interactiveSurface(view),
                  beforeAriaCount   = await grid.getAttribute('aria-rowcount');
            expect(beforeInteraction.rowTarget).toBe(false);
            expect(await ruledLines(view)).toEqual([]);

            await paint({bottom: ROW, right: CLEAR, empty: RULE});
            await expect(ordinary).toHaveCSS('border-bottom-color', ROW);
            await expect(ordinary).toHaveCSS('border-right-color', CLEAR);
            await expect(lastStart).toHaveCSS('border-right-color', FRAME);
            await expect(firstEnd).toHaveCSS('border-left-color', FRAME);
            await expect(trailing).toHaveCSS('border-right-width', '0px');
            await expect(trailing).toHaveCSS('box-shadow', /rgb\(31, 47, 63\) 1px 0px/);
            const lines = await ruledLines(view);

            expect(lines.length).toBeGreaterThan(3);
            expect(lines[0]).toBe(111);
            expect(lines.every((line, index) => line === 111 + index * 28)).toBe(true);
            expect(await geometry()).toEqual(before);
            expect(before.pointerEvents).toBe('none');
            expect(await interactiveSurface(view)).toEqual(beforeInteraction);
            expect(await grid.getAttribute('aria-rowcount')).toBe(beforeAriaCount);

            await ordinary.click();
            for (const firstCell of [lastStart, ordinary, firstEnd]) {
                await expect(firstCell.locator('..')).toHaveClass(/neo-selected/)
            }

            await paint({bottom: CLEAR, right: COLUMN, empty: ''});
            await expect(ordinary).toHaveCSS('border-bottom-color', CLEAR);
            await expect(ordinary).toHaveCSS('border-right-color', COLUMN);
            await expect(lastStart).toHaveCSS('border-right-color', FRAME);
            await expect(firstEnd).toHaveCSS('border-left-color', FRAME);
            expect(await ruledLines(view)).toEqual([]);

            await paint({bottom: ROW, right: CLEAR, empty: RULE});
            await setPitch(36);
            await expect.poll(async () => {
                const state = await geometry();
                return [state.start, state.pitch]
            }).toEqual([108, 36]);
            await expect.poll(async () => Math.abs(await lastRowBottom(3) - 108)).toBeLessThan(0.5);
            expect((await ruledLines(view))[0]).toBe(143);

            await configure({count: 0, pitch: 36});
            await expect.poll(async () => (await workerState()).count).toBe(0);
            await expect(view.locator('.neo-grid-cell[data-field="id"]:visible')).toHaveCount(0);
            await expect.poll(async () => {
                const state = await geometry();
                return [state.start, state.pitch]
            }).toEqual([0, 36]);
            expect((await ruledLines(view))[0]).toBe(35);

            await page.setViewportSize({width: 910, height: 701});
            await expect.poll(async () => (await geometry()).clientHeight).toBeGreaterThan(before.clientHeight);
            const resized = await geometry();
            expect(resized.size).toBe(resized.clientHeight);
            expect(resized.scrollHeight).toBe(resized.clientHeight);
            expect((await ruledLines(view)).length).toBe(Math.floor(resized.clientHeight / 36));

            await configure({count: 3, pitch: 36, sized: true});
            await expect(row(3)).toBeVisible();
            await expect.poll(async () => {
                const {start} = await geometry();
                return start > 3 * 36 && Math.abs(start - await lastRowBottom(3)) < 1
            }).toBe(true);
            const variable = await geometry();

            expect(variable.pitch).toBe(36);
            expect((await ruledLines(view))[0]).toBe(Math.round(variable.start) + 35)
        })
    }

    for (const paged of [false, true]) {
        test(`rule phase follows the last record through ${paged ? 'paged' : 'ordinary'} scrolling`, async ({page}) => {
            const {view, row, configure, paint, workerState, geometry, lastRowBottom, scrollTo} = await openGrid(page),
                  count                                                                         = 80,
                  pitch                                                                         = 28,
                  extent                                                                        = (count + 1) * pitch,
                  cap                                                                           = paged ? 1200 : undefined;

            await configure({count, pitch, cap});
            await expect(row(1)).toBeVisible();
            await expect.poll(workerState).toEqual({count, paged, pageOffset: 0});
            await paint({bottom: ROW, right: CLEAR, empty: RULE});
            expect(await ruledLines(view)).toEqual([]);

            await scrollTo(extent);
            await expect(row(1)).toHaveCount(0);
            await expect(row(count)).toBeInViewport();
            await expect.poll(workerState).toEqual({count, paged, pageOffset: paged ? extent - cap : 0});
            await expect.poll(async () => {
                const state = await geometry();
                return Math.abs(state.start - state.scrollTop - await lastRowBottom(count))
            }).toBeLessThan(1);
            expect(await ruledLines(view)).toEqual([Math.round(await lastRowBottom(count)) + pitch - 1]);

            await scrollTo(0);
            await expect(row(1)).toBeVisible();
            await expect.poll(workerState).toEqual({count, paged, pageOffset: 0});
            expect(await ruledLines(view)).toEqual([])
        })
    }
});
