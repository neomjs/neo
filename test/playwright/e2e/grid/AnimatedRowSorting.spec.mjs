import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/animatedRowSorting`: a header sort and a filter move each row to its record's new offset
 * through a transition, and outside that window the rows carry no transition, so scrolling never animates.
 *
 * The body's rows are a fixed pool whose slots take new records
 * (`learn/guides/datahandling/PooledGridAnimation.md`), so the spec follows a record by its Firstname cell, never
 * by a row element. A per-frame sampler records one record's offset while the store sorts or filters.
 */
const APP = 'examples/grid/animatedRowSorting/index.html',
      ROW = '.neo-grid-body .neo-grid-row';

/**
 * Opens the example and waits until its body animates. The body imports AnimateRows on demand, and the plugin's
 * `neo-animate-rows` class reaches the DOM only with its stylesheet, while the rows can render before both: a sort or
 * filter made in between renders without a transition. So the module arrives only after the rows show, the order a
 * cold load can produce, and the tests wait for the class.
 * @param {import('@playwright/test').Page} page
 */
async function openExample(page) {
    let rowsShown;
    const shown = new Promise(resolve => {rowsShown = resolve});

    await page.route('**/grid/plugin/AnimateRows.mjs*', async route => {
        await shown;
        await new Promise(resolve => setTimeout(resolve, 500)); // wall-clock-under-test: the plugin arrives after the rows
        await route.continue()
    });

    await page.goto(APP);
    await expect.poll(async () => (await displayedRows(page)).length).toBe(7);
    rowsShown();
    await expect(page.locator('.neo-grid-body.neo-animate-rows')).toHaveCount(1)
}

/**
 * The displayed records, top to bottom: Firstname, offset and the row's computed transition durations.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{name: String, offset: Number, transitions: String}[]>}
 */
async function displayedRows(page) {
    return page.evaluate(selector => [...document.querySelectorAll(selector)]
        .filter(row => row.style.display !== 'none' && row.dataset.recordId)
        .map(row => {
            const style = getComputedStyle(row);

            return {
                name       : row.querySelector('[data-field="firstname"]')?.textContent.trim(),
                offset     : Math.round(new DOMMatrixReadOnly(style.transform).m42),
                transitions: style.transitionDuration
            }
        })
        .sort((a, b) => a.offset - b.offset), ROW)
}

/**
 * Samples, once per frame, the offset of the row that shows `name`, until `stopSampling()` runs.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 */
async function startSampling(page, name) {
    await page.evaluate(({name, selector}) => {
        window.__offsets  = [];
        window.__sampling = true;

        const read = () => {
            const row = [...document.querySelectorAll(selector)].find(row => row.style.display !== 'none' &&
                row.querySelector('[data-field="firstname"]')?.textContent.trim() === name);

            row && window.__offsets.push(Math.round(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42));
            window.__sampling && requestAnimationFrame(read)
        };

        requestAnimationFrame(read)
    }, {name, selector: ROW})
}

async function stopSampling(page) {
    return page.evaluate(() => {
        window.__sampling = false;
        return window.__offsets
    })
}

/**
 * Waits until the displayed records read `names`, top to bottom, at whole multiples of the row height.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} names
 * @param {Number} rowHeight
 */
async function expectSettled(page, names, rowHeight) {
    await expect.poll(async () => (await displayedRows(page)).map(({name, offset}) => [name, offset]))
        .toEqual(names.map((name, index) => [name, index * rowHeight]))
}

test.describe('grid: AnimateRows on the pooled body', () => {
    test('a header sort moves each record from its old offset to its new one', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        expect(before.map(row => row.name)).toEqual(['Max', 'Paul', 'Sam', 'William', 'Carol', 'Amanda', 'Sarah']);

        // Amanda moves from the last offset to the first
        await startSampling(page, 'Amanda');
        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, ['Amanda', 'Carol', 'Max', 'Paul', 'Sam', 'Sarah', 'William'], rowHeight);

        const offsets = await stopSampling(page);

        expect(offsets[0], 'the record starts where it was').toBe(5 * rowHeight);
        expect(offsets.some(offset => offset > 0 && offset < 5 * rowHeight),
            `a frame between the two offsets: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(0)
    });

    test('a filter moves the remaining records up and drops the others', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        // Carol moves from the fifth offset to the third
        await startSampling(page, 'Carol');
        await page.locator('input').first().fill('l');
        await expectSettled(page, ['Paul', 'William', 'Carol'], rowHeight);

        const offsets = await stopSampling(page);

        expect(offsets[0]).toBe(4 * rowHeight);
        expect(offsets.some(offset => offset > 2 * rowHeight && offset < 4 * rowHeight),
            `a frame between the two offsets: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(2 * rowHeight)
    });

    test('outside a sort or filter, the rows carry no transition', async ({page}) => {
        await openExample(page);

        // Before any store change, and again once a sort has settled
        expect((await displayedRows(page)).map(row => row.transitions)).toEqual(Array(7).fill('0s'));

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        await page.locator('.neo-grid-header-button', {hasText: /^\s*Lastname\s*$/}).click();
        await expectSettled(page, ['Sam', 'Carol', 'Max', 'Amanda', 'Sarah', 'Paul', 'William'], rowHeight);
        await expect.poll(async () => (await displayedRows(page)).map(row => row.transitions)).toEqual(Array(7).fill('0s'))
    })
});
