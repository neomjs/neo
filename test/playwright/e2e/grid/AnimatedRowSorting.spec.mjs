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

const FIRSTNAME_ASC = [
    'Alex', 'Amanda', 'Ananya', 'Carol', 'Chloe', 'Daniel', 'Elena', 'Fatima',
    'Gabriel', 'Kenji', 'Liam', 'Lucas', 'Mateo', 'Max', 'Mei', 'Noah',
    'Olivia', 'Paul', 'Sam', 'Sarah', 'Sofia', 'Tariq', 'William', 'Zara'
];
/**
 * Opens the example and waits until its center body animates. The body imports AnimateRows on demand, and the
 * plugin's `neo-animate-rows` class reaches the DOM only with its stylesheet, while the rows can render before both: a
 * sort or filter made in between renders without a transition. So the module arrives only after the rows show, the
 * order a cold load can produce, and the tests wait for the class.
 * @param {import('@playwright/test').Page} page
 */
async function openExample(page, {pause = true} = {}) {
    let rowsShown;
    const shown = new Promise(resolve => {rowsShown = resolve});

    await page.route('**/grid/plugin/AnimateRows.mjs*', async route => {
        await shown;
        await new Promise(resolve => setTimeout(resolve, 500)); // wall-clock-under-test: the plugin arrives after the rows
        await route.continue()
    });

    await page.goto(APP);
    await expect.poll(async () => (await displayedRows(page)).length).toBeGreaterThanOrEqual(20);
    rowsShown();
    await expect(page.locator('.neo-grid-body.neo-animate-rows', {has: page.locator('[data-field="firstname"]')})).toHaveCount(1)
      if (pause) {
        await page.locator('.neo-button', {hasText: /^\s*Pause\s*$/}).click();
        await expect(page.locator('.neo-button', {hasText: /^\s*Resume\s*$/})).toHaveCount(1);
        await expect.poll(async () => (await displayedRows(page)).every(row => row.transitions === '0s')).toBe(true)
    }
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
// async function expectSettled(page, names, rowHeight) {
//     await expect.poll(async () => (await displayedRows(page)).map(({name, offset}) => [name, offset]))
//         .toEqual(names.map((name, index) => [name, index * rowHeight]))
// }
async function expectSettled(page, names, rowHeight) {
    if (names.length < 20) {
        await expect.poll(async () => (await displayedRows(page)).map(({name, offset}) => [name, offset]))
            .toEqual(names.map((name, index) => [name, index * rowHeight]))
    } else {
        await expect.poll(async () => {
            const rows = await displayedRows(page);
            return rows.length < 20
                ? rows.length
                : rows.map(({name, offset}, i) => [name, offset, names[i], i * rowHeight])
                    .filter(([n, o, en, eo]) => n !== en || o !== eo)
        }).toEqual([])
    }
}

test.describe('grid: AnimateRows on the pooled body', () => {
    test('a header sort moves each record from its old offset to its new one', async ({page}) => {
        await openExample(page);

        const before      = await displayedRows(page),
              rowHeight   = before[1].offset - before[0].offset,
              startOffset = before.find(row => row.name === 'Max').offset,
              endOffset   = FIRSTNAME_ASC.indexOf('Max') * rowHeight;

        await startSampling(page, 'Max');
        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, FIRSTNAME_ASC, rowHeight);

        const offsets = await stopSampling(page);

        expect(offsets[0], 'the record starts where it was').toBe(startOffset);
        expect(offsets.some(offset => offset > startOffset && offset < endOffset),
            `a frame between the two offsets: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(endOffset)
    });

    test('a sort moves each row of the locked Id column with its center row', async ({page}) => {
        await openExample(page);

        const before      = await displayedRows(page),
              rowHeight   = before[1].offset - before[0].offset,
              startOffset = before.find(row => row.name === 'Max').offset,
              endOffset   = FIRSTNAME_ASC.indexOf('Max') * rowHeight;

        await startSampling(page, 'Max');
        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, FIRSTNAME_ASC, rowHeight);

        const center = await stopSampling(page),
              locked = await page.evaluate(() => window.__lockedOffsets);

        expect(locked, 'the locked row is displayed in every frame').not.toContain(null);
        expect(locked.some(offset => offset > startOffset && offset < endOffset),
            `the locked row passes between the two offsets: ${locked.join(', ')}`).toBe(true);
        expect(locked.filter((offset, index) => Math.abs(offset - center[index]) > rowHeight / 2),
            `the locked row keeps up with the center row (locked/center): ${locked.map((offset, index) => `${offset}/${center[index]}`).join(', ')}`).toEqual([]);
        expect([locked[0], locked.at(-1)]).toEqual([startOffset, endOffset])
    });

    test('a filter moves the remaining records up and drops the others', async ({page}) => {
        await openExample(page);

        const before      = await displayedRows(page),
              rowHeight   = before[1].offset - before[0].offset,
              remaining   = before.filter(row => row.name.toLowerCase().includes('am')).map(row => row.name),
              startOffset = before.find(row => row.name === 'Liam').offset,
              endOffset   = remaining.indexOf('Liam') * rowHeight;

        await startSampling(page, 'Liam');
        await page.locator('input').first().fill('am');
        await expectSettled(page, remaining, rowHeight);

        const offsets = await stopSampling(page);

        expect(offsets[0]).toBe(startOffset);
        expect(offsets.some(offset => offset > endOffset && offset < startOffset),
            `a frame between the two offsets: ${offsets.join(', ')}`).toBe(true);
        expect(offsets.at(-1)).toBe(endOffset)
    });

    test('a filter refined after a header sort keeps the rows in the sorted order', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset,
              field     = page.locator('input').first();

        await field.fill('a');
        await page.locator('.neo-grid-header-button', {hasText: /^\s*Firstname\s*$/}).click();
        await expectSettled(page, FIRSTNAME_ASC.filter(name => name.toLowerCase().includes('a')), rowHeight);

        await field.fill('am');
        await expectSettled(page, ['Amanda', 'Liam', 'Sam', 'William'], rowHeight);

        await field.fill('');
        await expectSettled(page, FIRSTNAME_ASC, rowHeight)
    });

    test('outside a sort or filter, the rows carry no transition', async ({page}) => {
        await openExample(page);

        expect((await displayedRows(page)).every(row => row.transitions === '0s')).toBe(true);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        await page.locator('.neo-grid-header-button', {hasText: /^\s*Lastname\s*$/}).click();
        await expectSettled(page, [
            'Zara', 'Sam', 'Mei', 'Chloe', 'Noah', 'Carol', 'Max', 'Daniel',
            'Amanda', 'Tariq', 'Lucas', 'Liam', 'Alex', 'Sofia', 'Elena', 'Gabriel',
            'Kenji', 'Sarah', 'Ananya', 'Mateo', 'Olivia', 'Paul', 'William', 'Fatima'
        ], rowHeight);
        await expect.poll(async () => (await displayedRows(page)).every(row => row.transitions === '0s')).toBe(true)
    });

    test('the Transition Duration field sets every body\'s duration, and a sort moves both bodies with it', async ({page}) => {
        await openExample(page);

        const before    = await displayedRows(page),
              rowHeight = before[1].offset - before[0].offset;

        for (let step = 0; step < 3; step++) {
            await page.locator('.neo-spin-button.neo-up').click()
        }

        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.neo-grid-body')]
            .map(body => getComputedStyle(body).getPropertyValue('--neo-grid-animate-rows-transition-duration').trim()))).toEqual(['800ms', '800ms']);

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
        await expectSettled(page, FIRSTNAME_ASC, rowHeight);

        const durations = await page.evaluate(() => {
            window.__sampling = false;
            return window.__durations
        });

        expect(durations, 'the locked and the center body').toEqual([['0.8s, 0.8s, 0.8s'], ['0.8s, 0.8s, 0.8s']])
    });

    test('without input, at least one row changes position within five seconds and keeps doing so', async ({page}) => {
        await openExample(page, {pause: false});

        const initialOrder = (await displayedRows(page)).map(row => row.name);
        expect(initialOrder.length).toBeGreaterThanOrEqual(20);

        await expect.poll(
            async () => (await displayedRows(page)).map(row => row.name),
            {timeout: 5000}
        ).not.toEqual(initialOrder);

        const afterFirstMove = (await displayedRows(page)).map(row => row.name);

        await expect.poll(
            async () => (await displayedRows(page)).map(row => row.name),
            {timeout: 5000}
        ).not.toEqual(afterFirstMove)
    });

    test('Pause stops automatic updates and a second press resumes them', async ({page}) => {
        await openExample(page, {pause: false});

        const pauseButton  = page.locator('.neo-button', {hasText: /^\s*Pause\s*$/}),
              resumeButton = page.locator('.neo-button', {hasText: /^\s*Resume\s*$/});

        await pauseButton.click();
        await expect(resumeButton).toHaveCount(1);
        await expect.poll(async () => (await displayedRows(page)).every(row => row.transitions === '0s')).toBe(true);

        const pausedOrder = (await displayedRows(page)).map(row => row.name);
        // out-waits: MainStore 1500ms ranking update interval to verify Pause freezes updates
        await page.waitForTimeout(2200);
        expect((await displayedRows(page)).map(row => row.name)).toEqual(pausedOrder);

        await resumeButton.focus();
        await page.keyboard.press('Enter');
        await expect(pauseButton).toHaveCount(1);

        await expect.poll(
            async () => (await displayedRows(page)).map(row => row.name),
            {timeout: 5000}
        ).not.toEqual(pausedOrder)
    })
});