import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

/**
 * @summary A grid cell edit is one logical session over pooled cells: its editor is embodied in whichever cell
 * currently renders the record and column, leaves when pooling rebinds that cell, and comes back with the draft.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing-pooled` — 40 columns of
 * 150px and 400 rows, `c0` locked to the start and `c39` to the end. A horizontal scroll moves the mounted column
 * window, so a pool slot changes the column it renders; a vertical scroll rebinds pooled rows to other records.
 *
 * Two planes. The DOM shows where the editor is embodied, and whether focus is in it. Whether a scroll committed
 * or cancelled the draft cannot be read off a cell that is not rendered, so every arm ends by pressing Escape on
 * the reprojected editor: a draft that survived the round trip, and an original value after Escape, prove the
 * scroll did neither.
 *
 * Scroll arms wait for the rendered cells to change rather than for time: a column leaving the mounted window
 * leaves the DOM with its `data-field`, and a rebound row carries another `data-record-id`.
 */
const GRID                                                      = '#grid-cell-editing-pooled',
      {EDITOR, INPUT, cell, editingIn, embodiment, recordLeaks} = gridCellEditing(GRID);

let driverCalls = 0,
    pageErrors;

/**
 * Runs one action of the fixture's `gridDriver.mjs` inside the App Worker; the counter makes every call a new module.
 * @returns {Promise<void>}
 */
const drive = async (page, action) => {
    const {success} = await page.evaluate(path => Neo.worker.App.loadModule({path}),
        `../../test/playwright/component/apps/grid-cell-editing/gridDriver.mjs?action=${action}&n=${++driverCalls}`);

    expect(success, `the ${action} driver ran`).toBe(true)
};

/**
 * The record id of the third rendered row — row 3, a row the initial window always renders.
 * @returns {Promise<String>}
 */
const thirdRecordId = page => page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText('r3c3', {exact: true})
    .getAttribute('data-record-id');

const scrollHorizontally = (page, left) => page.evaluate(({grid, left}) => {
    document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`).scrollLeft = left
}, {grid: GRID, left});

const scrollVertically = (page, top) => page.evaluate(({grid, top}) => {
    document.querySelector(`${grid} .neo-grid-view`).scrollTop = top
}, {grid: GRID, top});

const viewScrollTop = page => page.evaluate(grid => document.querySelector(`${grid} .neo-grid-view`).scrollTop, GRID);

/**
 * Per rendered cell of a column, whether it carries `aria-readonly="true"`.
 * @returns {Promise<Boolean[]>}
 */
const readonlyCells = (page, field) => page.evaluate(({grid, field}) => [...document.querySelectorAll(`${grid} .neo-grid-cell[data-field="${field}"]`)]
    .map(node => node.getAttribute('aria-readonly') === 'true'), {grid: GRID, field});

test.describe('Grid cell editing across row and cell pooling', () => {
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

    for (const [field, body] of [['c0', 'locked-start'], ['c3', 'center'], ['c39', 'locked-end']]) {
        test(`a double-click embodies the editor in a pooled grid's ${body} cell`, async ({page}) => {
            const recordId = await thirdRecordId(page);

            await cell(page, field, recordId).dblclick();

            await expect.poll(() => editingIn(page, field, recordId)).toBe(true);
            expect((await embodiment(page)).count).toBe(1)
        })
    }

    test('horizontal: an in-range remap keeps the editor and its focus; leaving the window suspends; returning restores the draft', async ({page}) => {
        const recordId = await thirdRecordId(page);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.type('draft');
        await recordLeaks(page, 'c3', recordId);

        // Two columns: c1 leaves the mounted window, c3 stays in it
        await scrollHorizontally(page, 300);
        await expect(page.locator(`${GRID} .neo-grid-cell[data-field="c1"]`), 'the column window moved').toHaveCount(0);
        await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'the remap kept embodiment and focus'}).toBe(true);

        await scrollHorizontally(page, 3000);
        await expect(page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`), 'c3 left the mounted window').toHaveCount(0);
        await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

        await scrollHorizontally(page, 0);
        await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});
        await expect(page.locator(INPUT), 'the draft survived').toHaveValue('draft');

        expect(await page.evaluate(() => window.__leaks), 'no other cell ever showed the editor').toEqual([]);

        await page.locator(INPUT).focus();
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c3', recordId), 'the scrolls wrote nothing').toHaveText('r3c3')
    });

    test('vertical: rebinding the row suspends the editor, returning reprojects it with the draft', async ({page}) => {
        const recordId = await thirdRecordId(page);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
        await page.keyboard.type('draft');
        await recordLeaks(page, 'c3', recordId);

        await scrollVertically(page, 4000);
        await expect(page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`), 'the row slot was rebound').toHaveCount(0);
        await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

        await scrollVertically(page, 0);
        await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});
        await expect(page.locator(INPUT)).toHaveValue('draft');

        expect(await page.evaluate(() => window.__leaks), 'no rebound slot ever showed the editor').toEqual([]);

        await page.locator(INPUT).focus();
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c3', recordId), 'the scrolls wrote nothing').toHaveText('r3c3')
    });

    // `c7` opts out of suspension. The arm above is its control: the same scroll on `c3` suspends and restores
    test('a column that cannot suspend cancels its edit when the row leaves the pool, and the grid says so', async ({page}) => {
        const recordId = await thirdRecordId(page);

        await cell(page, 'c7', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c7', recordId)).toBe(true);
        await page.keyboard.type('draft');
        await expect(page.locator(INPUT)).toHaveValue('draft');

        await scrollVertically(page, 4000);

        // The fixture writes the `cellEditCancel` event onto the grid's node
        await expect(page.locator(GRID), 'the cancel is announced, with its reason').toHaveClass(/edit-cancelled-c7-projectionLoss/);

        await scrollVertically(page, 0);
        await expect(cell(page, 'c7', recordId), 'the row is back, and the draft is gone').toHaveText('r3c7');
        await expect(page.locator(EDITOR), 'nothing is reprojected').toHaveCount(0)
    });

    // Only an embodiment that existed can be lost. Tab from a suspended edit starts the next one suspended too, on its
    // way into sight. The bodies render one after another, so while the center body reports its pass the locked `c39`
    // has not been rendered yet — which must not read as a loss
    test('an edit born suspended on a locked column that cannot suspend is embodied, not cancelled', async ({page}) => {
        const recordId = await thirdRecordId(page),
              bodyId   = await page.locator(`${GRID} .neo-grid-body`).nth(1).getAttribute('id'),
              config   = async (id, name) => (await page.evaluate(({id, name}) => Neo.worker.App.getConfigs({id, keys: [name]}), {id, name}))[0];

        // The fixture's locked columns suspend, as the locked-body arms need them to: this arm opts `c39` out itself
        await drive(page, 'optOutEnd');

        // A double-click while the App Worker still re-slots cells hands Playwright a moving target
        await scrollHorizontally(page, 10000);
        await expect(cell(page, 'c38', recordId)).toBeVisible();
        await expect.poll(() => config(bodyId, 'isScrolling'), {message: 'the scroll has settled'}).toBe(false);

        await cell(page, 'c38', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c38', recordId)).toBe(true);

        await scrollVertically(page, 4000);
        await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

        await page.keyboard.press('Tab');

        await expect.poll(() => editingIn(page, 'c39', recordId), {message: 'the grid scrolled back and edits c39'}).toBe(true);
        await expect(page.locator(GRID), 'no cancel was announced').not.toHaveClass(/edit-cancelled/)
    });

    // An IME composes text the browser has not committed yet. Every composing `input` still reaches the App Worker, so
    // the draft holds the composition when the node goes; no `compositionend` ever arrives, and none is needed. What
    // is lost is the IME's own conversion state, never text — which is why pooling does not have to wait for it.
    test('a composition in flight when the row leaves the pool survives as the draft', async ({page}) => {
        const recordId = await thirdRecordId(page),
              client   = await page.context().newCDPSession(page);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);

        // Activation selected the value; the composition replaces it
        await client.send('Input.imeSetComposition', {selectionEnd: 1, selectionStart: 1, text: 'に'});
        await client.send('Input.imeSetComposition', {selectionEnd: 2, selectionStart: 2, text: 'にほ'});
        await expect(page.locator(INPUT)).toHaveValue('にほ');

        await scrollVertically(page, 4000);
        await expect.poll(() => embodiment(page), {message: 'no cell embodies the suspended editor'}).toEqual({count: 0, field: null, recordId: null});

        await scrollVertically(page, 0);
        await expect.poll(() => embodiment(page), {message: 'the editor is reprojected into its cell'}).toEqual({count: 1, field: 'c3', recordId});
        await expect(page.locator(INPUT), 'the composed text is the draft').toHaveValue('にほ');

        await page.locator(INPUT).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'c3', recordId)).toHaveText('にほ')
    });

    test('a column turned non-editable is read-only in every row, the rows the pool rebinds afterwards included', async ({page}) => {
        const recordId = await thirdRecordId(page),
              marks    = async () => ({c3: await readonlyCells(page, 'c3'), c4: await readonlyCells(page, 'c4')}),
              state    = ({c3, c4}) => ({c3: c3.length > 0 && c3.every(Boolean), c4: c4.some(Boolean)});

        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-pooled-c3', editable: false}));
        await expect.poll(async () => state(await marks()), {message: 'the mounted rows repaint'}).toEqual({c3: true, c4: false});

        // Rebound rows render other records, which no repaint touched
        await scrollVertically(page, 4000);
        await expect(page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`), 'the row slot was rebound').toHaveCount(0);
        await expect.poll(async () => state(await marks()), {message: 'the rebound rows render the mark'}).toEqual({c3: true, c4: false})
    });

    for (const key of ['Escape', 'Enter']) {
        test(`${key} while a body render is in the air leaves that render no destroyed editor to resolve`, async ({page}) => {
            const recordId = await thirdRecordId(page),
                  bodyId   = await page.locator(`${GRID} .neo-grid-body`).nth(1).getAttribute('id'),
                  config   = async (id, name) => (await page.evaluate(({id, name}) => Neo.worker.App.getConfigs({id, keys: [name]}), {id, name}))[0];

            await cell(page, 'c3', recordId).dblclick();
            await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);
            await page.keyboard.type('draft');

            // A 1px scroll re-renders the body without rebinding the row, and the key ends the edit while that render
            // is in the air. The render lands naming the editor, which the fixture's worker-error gate would report.
            await scrollVertically(page, 1);
            await page.keyboard.press(key);

            await expect(page.locator(EDITOR)).toHaveCount(0);
            await expect(cell(page, 'c3', recordId)).toHaveText(key === 'Enter' ? 'draft' : 'r3c3');
            await expect.poll(() => config(bodyId, 'isScrolling'), {message: 'the scroll has settled'}).toBe(false)
        })
    }

    test('a drag inside the editor selects text instead of drag-scrolling the grid', async ({page}) => {
        const recordId = await thirdRecordId(page),
              view     = page.locator(`${GRID} .neo-grid-view`).first();

        /**
         * A pointer drag from `from`, held past GridDragScroll's activation delay, moving 160px up in steps.
         * @param {{x: Number, y: Number}} from
         */
        const drag = async from => {
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            // out-waits: GridDragScroll#delay (100ms) — the addon only starts a drag after it
            await page.waitForTimeout(150);

            for (let i = 1; i <= 8; i++) {
                await page.mouse.move(from.x - i * 4, from.y - i * 20)
            }

            await page.mouse.up()
        };

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);

        const input = await page.locator(INPUT).boundingBox();

        await drag({x: input.x + input.width - 6, y: input.y + input.height / 2});

        expect(await viewScrollTop(page), 'the grid did not scroll').toBe(0);
        await expect.poll(() => editingIn(page, 'c3', recordId), {message: 'the editor kept its cell and focus'}).toBe(true);

        // Positive control: the same gesture from a plain cell does scroll, so the gesture is a real drag
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        const box = await view.boundingBox();

        await drag({x: box.x + box.width / 2, y: box.y + box.height * 0.8});
        await expect.poll(() => viewScrollTop(page), {message: 'a drag from a cell scrolls'}).toBeGreaterThan(0)
    });

    test('navigation keys pressed inside the editor never scroll the View', async ({page}) => {
        // Scrolled down, so PageUp and Home have somewhere to scroll back to; row 10 stays fully visible there
        const recordId = await page.locator(`${GRID} .neo-grid-cell[data-field="c3"]`).getByText('r10c3', {exact: true})
            .getAttribute('data-record-id');

        const viewId = await page.locator(`${GRID} .neo-grid-view`).first().getAttribute('id'),
              bodyId = await page.locator(`${GRID} .neo-grid-body`).nth(1).getAttribute('id'),
              config = async (id, key) => (await page.evaluate(({id, key}) => Neo.worker.App.getConfigs({id, keys: [key]}), {id, key}))[0];

        await scrollVertically(page, 160);

        // Clicking while the App Worker still re-slots rows hands Playwright a moving target, and its scroll-into-view
        // retries move the View themselves: wait for the scroll to arrive, then for the grid to end it
        await expect.poll(() => config(viewId, 'scrollTop')).toBe(160);
        await expect.poll(() => config(bodyId, 'isScrolling')).toBe(false);

        await cell(page, 'c3', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'c3', recordId)).toBe(true);

        // Read after activation: focusing the input may scroll it into view, which is not what this arm is about
        const scrollTop = await viewScrollTop(page);

        expect(scrollTop, 'precondition: the View is scrolled').toBeGreaterThan(0);

        // Home and End are caret keys except under macOS key bindings, where the platform scrolls instead. Bindings
        // follow the host OS, which `navigator.platform` reports even under user-agent emulation.
        const macBindings = await page.evaluate(() => /Mac/.test(navigator.platform));

        for (const key of ['PageDown', 'PageUp', 'End', 'Home']) {
            await page.evaluate(() => {
                const input = document.activeElement;
                input.setSelectionRange(2, 2)
            });

            await page.keyboard.press(key);

            // Ordered round trip: typing a character is handled after the key, and lands in the input only if
            // the editor is still embodied and focused
            await page.keyboard.type('#');
            await expect(page.locator(INPUT)).toHaveValue(/#/);

            // One marker on every platform. A stale value written back over the previous removal shows as a second
            // one, which the caret assertions below only catch where End and Home move the caret
            expect((await page.locator(INPUT).inputValue()).split('#').length - 1, `${key} typed into the value the editor holds`).toBe(1);

            expect(await viewScrollTop(page), `${key} left the View where it was`).toBe(scrollTop);

            const caret = await page.evaluate(() => document.activeElement.value.indexOf('#'));

            if (!macBindings && key === 'Home') {
                expect(caret, 'Home still moves the caret to the start').toBe(0)
            } else if (!macBindings && key === 'End') {
                expect(caret, 'End still moves the caret to the end').toBe((await page.locator(INPUT).inputValue()).length - 1)
            }

            // Remove the marker so the next key starts from the same value
            await page.evaluate(() => {
                const input = document.activeElement;
                input.value = input.value.replace('#', '');
                input.dispatchEvent(new Event('input', {bubbles: true}))
            })
        }
    })
});
