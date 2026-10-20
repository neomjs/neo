import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/animatedRowSorting`: a header sort and a filter move each row to its record's new offset
 * through a transition, the locked Id column's rows move with them, and outside that window the rows carry no
 * transition, so scrolling never animates. The example's Transition Duration field sets that transition on every body.
 *
 * The body's rows are a fixed pool whose slots take new records
 * (`learn/guides/datahandling/PooledGridAnimation.md`), so the spec follows a record by its Firstname cell, never
 * by a row element, and finds its locked row by the same record id. A per-frame sampler records both offsets while
 * the store sorts or filters.
 */
const APP = 'examples/grid/animatedRowSorting/index.html',
      ROW = '.neo-grid-body .neo-grid-row';

/**
 * Opens the example and waits until its center body animates. The body imports AnimateRows on demand, and the
 * plugin's `neo-animate-rows` class reaches the DOM only with its stylesheet, while the rows can render before both: a
 * sort or filter made in between renders without a transition. So the module arrives only after the rows show, the
 * order a cold load can produce, and the tests wait for the class.
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
    await expect(page.locator('.neo-grid-body.neo-animate-rows', {has: page.locator('[data-field="firstname"]')})).toHaveCount(1)
}

/**
 * The center body's displayed records, top to bottom: Firstname, offset and the row's computed transition durations.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{name: String, offset: Number, transitions: String}[]>}
 */
async function displayedRows(page) {
    return page.evaluate(selector => [...document.querySelectorAll(selector)]
        .filter(row => row.style.display !== 'none' && row.querySelector('[data-field="firstname"]'))
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
 * Samples, once per frame, the offset of the center row that shows `name`, and of its locked row (the other row with
 * its record id, `null` while none is displayed), until `stopSampling()` runs.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 */
async function startSampling(page, name) {
    await page.evaluate(({name, selector}) => {
        window.__offsets       = [];
        window.__lockedOffsets = [];
        window.__sampling      = true;

        const offsetOf = row => Math.round(new DOMMatrixReadOnly(getComputedStyle(row).transform).m42);

        const read = () => {
            const rows   = [...document.querySelectorAll(selector)].filter(row => row.style.display !== 'none'),
                  row    = rows.find(row => row.querySelector('[data-field="firstname"]')?.textContent.trim() === name),
                  locked = row && rows.find(item => item !== row && item.dataset.recordId === row.dataset.recordId);

            if (row) {
                window.__offsets.push(offsetOf(row));
                window.__lockedOffsets.push(locked ? offsetOf(locked) : null)
            }

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

    test('a sort moves each row of the locked Id column with its center row', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        // Amanda's Id cell lives in the locked body, the rest of her record in the center body
        await startSampling(page, 'Amanda');
        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, ['Amanda', 'Carol', 'Max', 'Paul', 'Sam', 'Sarah', 'William'], rowHeight);

        const center = await stopSampling(page),
              locked = await page.evaluate(() => window.__lockedOffsets);

        expect(locked, 'the locked row is displayed in every frame').not.toContain(null);
        expect(locked.some(offset => offset > 0 && offset < 5 * rowHeight),
            `the locked row passes between the two offsets: ${locked.join(', ')}`).toBe(true);
        expect(locked.filter((offset, index) => Math.abs(offset - center[index]) > rowHeight / 2),
            `the locked row keeps up with the center row (locked/center): ${locked.map((offset, index) => `${offset}/${center[index]}`).join(', ')}`).toEqual([]);
        expect([locked[0], locked.at(-1)]).toEqual([5 * rowHeight, 0])
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
    });

    test('the Transition Duration field sets every body\'s duration, and a sort moves both bodies with it', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        // 500 ms, three steps of 100 up
        for (let step = 0; step < 3; step++) {
            await page.locator('.neo-spin-button.neo-up').click()
        }

        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.neo-grid-body')]
            .map(body => getComputedStyle(body).getPropertyValue('--neo-duration').trim()))).toEqual(['800ms', '800ms']);

        // Per body, every transition duration its rows carry while the sort runs
        await page.evaluate(() => {
            window.__durations = [];
            window.__sampling  = true;

            const read = () => {
                document.querySelectorAll('.neo-grid-body').forEach((body, index) => {
                    const seen = window.__durations[index] ??= [];

                    body.querySelectorAll('.neo-grid-row').forEach(row => {
                        const {transitionDuration} = getComputedStyle(row);
                        transitionDuration !== '0s' && !seen.includes(transitionDuration) && seen.push(transitionDuration)
                    })
                });

                window.__sampling && requestAnimationFrame(read)
            };

            requestAnimationFrame(read)
        });

        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, ['Amanda', 'Carol', 'Max', 'Paul', 'Sam', 'Sarah', 'William'], rowHeight);

        const durations = await page.evaluate(() => {
            window.__sampling = false;
            return window.__durations
        });

        expect(durations, 'the locked and the center body').toEqual([['0.8s, 0.8s, 0.8s'], ['0.8s, 0.8s, 0.8s']])
    })
});
