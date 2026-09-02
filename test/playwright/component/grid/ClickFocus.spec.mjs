import {test, expect} from '@playwright/test';

/**
 * A click on a grid must land DOM focus on the grid View — the single focus anchor (`tabIndex -1`)
 * behind focus-gated dock header actions, the rail reveal's focus-leave dismissal and the cell
 * editing key registry. `Neo.main.addon.GridDragScroll` cancelled the mousedown default on every
 * registered grid body "to prevent text selection", which also cancels the browser's focus move:
 * after a click, focus stayed wherever it was before. Selection suppression is owned by
 * `.neo-grid-body.neo-mouse-drag-scroll {user-select: none}`, so the positive control here proves a
 * real drag still scrolls and still selects nothing once the cancel is gone.
 *
 * The fixture (`apps/grid-focus`) mounts a short grid, whose viewport has empty space below its last
 * row, and a long one, whose viewport scrolls. Every arm waits for the addon to have registered both
 * bodies, so the red on the unfixed engine is the addon's doing and not a race with its import.
 *
 * Which arm is the witness matters: a click ON A ROW is focused programmatically by the grid's own
 * row-click handler, so the cell arms pass even with the cancel in place — they are the controls that
 * pin the programmatic path. The empty-viewport arm has no row under the pointer, so only the
 * browser's mousedown default can focus the View; that arm is red on the unfixed engine.
 */
const readConfigs = async (page, id, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

const activeElementId = page => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

const viewIdOf = (page, gridId) => page.locator(`#${gridId} .neo-grid-view`).first().getAttribute('id');

const maxScrollTop = (page, gridId) => page.evaluate(id =>
    Math.max(0, ...Array.from(document.querySelectorAll(`#${id}, #${id} *`)).map(el => el.scrollTop || 0)), gridId);

/**
 * A real pointer drag in steps, held past the addon's activation delay before the first move.
 * @param {import('@playwright/test').Page} page
 * @param {{x: Number, y: Number}} from
 * @param {{x: Number, y: Number}} to
 * @returns {Promise<void>}
 */
const drag = async (page, from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(150);

    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
        await page.waitForTimeout(25)
    }

    await page.mouse.up()
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-focus/index.html');
    await page.waitForSelector('#grid-focus-long .neo-grid-row', {state: 'visible'});
    await page.waitForSelector('#grid-focus-short .neo-grid-row', {state: 'visible'});
    // both bodies registered with the drag-scroll addon — the subject of the contract is in place
    await expect.poll(() => page.evaluate(() => Neo.main?.addon?.GridDragScroll?.registrations?.size ?? 0), {timeout: 15000})
        .toBeGreaterThanOrEqual(2)
});

test.describe('grid click focus — the mousedown default reaches the View anchor (#18065)', () => {
    test('a click on a cell focuses the grid view and the view reports containsFocus', async ({page}) => {
        const viewId = await viewIdOf(page, 'grid-focus-short');

        expect(viewId, 'the short grid projects a view').toBeTruthy();

        await page.locator('#grid-focus-short .neo-grid-cell').first().click();

        await expect.poll(() => activeElementId(page), {message: 'DOM focus lands on the grid view'}).toBe(viewId);
        await expect.poll(async () => (await readConfigs(page, viewId, ['containsFocus']))[0],
            {message: 'the App Worker sees the focus enter'}).toBe(true)
    });

    test('a click on the empty body below the last row focuses the grid view', async ({page}) => {
        // the View is the scroll viewport; the body element is as tall as its data, so viewport
        // geometry has to be read from the View, never from the body
        const viewId = await viewIdOf(page, 'grid-focus-short'),
              view   = page.locator(`#${viewId}`),
              box    = await view.boundingBox(),
              rows   = page.locator('#grid-focus-short .neo-grid-row:visible'),
              last   = await rows.last().boundingBox();

        // park focus outside first, so this arm does not inherit the cell arm's focus
        await page.locator('#grid-focus-outside').click();
        await expect.poll(() => activeElementId(page)).toBe('grid-focus-outside');

        expect(last.y + last.height + 20, 'the short store leaves empty viewport below its last row').toBeLessThan(box.y + box.height);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height - 10);

        await expect.poll(() => activeElementId(page), {message: 'a click on the empty body focuses the view'}).toBe(viewId);
        await expect.poll(async () => (await readConfigs(page, viewId, ['containsFocus']))[0]).toBe(true)
    });

    test('positive control: a real drag still scrolls the body and selects no text', async ({page}) => {
        // drag inside the View's viewport (the body element is 400 rows tall — its centre is off-screen)
        const viewId = await viewIdOf(page, 'grid-focus-long'),
              box    = await page.locator(`#${viewId}`).boundingBox(),
              before = await maxScrollTop(page, 'grid-focus-long'),
              from   = {x: box.x + box.width / 2, y: box.y + box.height * 0.75};

        await drag(page, from, {x: from.x, y: from.y - 160});

        await expect.poll(() => maxScrollTop(page, 'grid-focus-long'), {message: 'the drag scrolled the long grid'}).toBeGreaterThan(before);
        expect(await page.evaluate(() => window.getSelection().toString()), 'the drag selected no text').toBe('')
    });

    test('focus leaving to an outside control clears containsFocus again', async ({page}) => {
        const viewId = await viewIdOf(page, 'grid-focus-short');

        await page.locator('#grid-focus-short .neo-grid-cell').first().click();
        await expect.poll(async () => (await readConfigs(page, viewId, ['containsFocus']))[0]).toBe(true);

        await page.locator('#grid-focus-outside').click();
        await expect.poll(async () => (await readConfigs(page, viewId, ['containsFocus']))[0], {message: 'the leave path is untouched'}).toBe(false)
    })
});
