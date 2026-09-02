import {test, expect} from '@playwright/test';

/**
 * A native HTML5 drag out of a grid must end the drag-to-scroll gesture the grid was tracking.
 * `Neo.main.addon.GridDragScroll` arms a monitor on every left press over a registered body and
 * waits for `mousemove` / `mouseup` to decide whether the press becomes a drag-scroll. When the
 * pressed row is a native drag source (`nativeDragZone`), the browser starts an HTML5 drag a few
 * pixels later and, from `dragstart` on, delivers no mouse events at all for that gesture — the
 * release the monitor waits for never arrives. Left armed, the monitor qualifies on the next
 * button-less pointer move (elapsed time and distance from the original press both pass) and starts
 * a drag-scroll nobody is holding: the grabbing cursor sticks to the body and the grid scrolls under
 * a plain move until some later click ends it. The fix ends the monitor on the document's
 * `dragstart`, so these arms measure the addon's gesture state, not the drop.
 *
 * The fixture (`apps/grid-focus`) makes the long grid's first three rows native drag sources and
 * leaves the rest plain, so the control — ordinary drag-to-scroll on the same body — stays reachable
 * beside the native arms. The outside button is the drop target: nothing handles the drop, which is
 * the consumer's case as well when a frame refuses the payload.
 */
const readAddon = page => page.evaluate(() => {
    const addon = Neo.main?.addon?.GridDragScroll;

    return {
        activeDrag : Boolean(addon?.activeDrag),
        monitorDrag: Boolean(addon?.monitorDrag),
        bodyCursor : document.body.style.cursor
    }
});

const viewIdOf = (page, gridId) => page.locator(`#${gridId} .neo-grid-view`).first().getAttribute('id');

const maxScrollTop = (page, gridId) => page.evaluate(id =>
    Math.max(0, ...Array.from(document.querySelectorAll(`#${id}, #${id} *`)).map(el => el.scrollTop || 0)), gridId);

/**
 * Presses on the long grid's first row, holds past the addon's activation delay, drags onto the
 * outside button and releases there. Returns the drag lifecycle events the document saw, so an arm
 * can prove the browser really ran a native drag before it reads the addon.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
const nativeRowDrag = async page => {
    await page.evaluate(() => {
        globalThis.__dragEvents = [];
        ['dragstart', 'dragend', 'mouseup'].forEach(type =>
            document.addEventListener(type, () => globalThis.__dragEvents.push(type), {capture: true}))
    });

    const row    = await page.locator('#grid-focus-long .neo-grid-row:visible').first().boundingBox(),
          target = await page.locator('#grid-focus-outside').boundingBox(),
          from   = {x: row.x + 40, y: row.y + row.height / 2},
          to     = {x: target.x + target.width / 2, y: target.y + target.height / 2};

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(150); // past the addon's delay: the monitor is fully armed

    for (let i = 1; i <= 15; i++) {
        await page.mouse.move(from.x + (to.x - from.x) * i / 15, from.y + (to.y - from.y) * i / 15);
        await page.waitForTimeout(30)
    }

    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(100);

    return page.evaluate(() => globalThis.__dragEvents)
};

/**
 * A plain pointer drag in steps, held past the activation delay — the sibling spec's control.
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
        .toBeGreaterThanOrEqual(2);
    // and the native drag source addon is up, or the row press below never becomes a browser drag
    await expect.poll(() => page.evaluate(() => Boolean(Neo.main?.addon?.NativeDragSource)), {timeout: 15000}).toBe(true)
});

test.describe('grid drag-to-scroll — a native drag out of the grid ends the tracked gesture', () => {
    test('after a native row drag is dropped, the addon holds no gesture and the body cursor is restored', async ({page}) => {
        const events = await nativeRowDrag(page);

        expect(events, 'the press became a browser drag').toContain('dragstart');
        expect(events, 'the browser reported the drop').toContain('dragend');
        expect(events, 'a native drag ends without a mouseup — the event the monitor was waiting for').not.toContain('mouseup');

        await expect.poll(() => readAddon(page), {message: 'no monitor, no active drag, no cursor override survive the drop'})
            .toEqual({activeDrag: false, monitorDrag: false, bodyCursor: ''})
    });

    test('a button-less pointer move over the grid after the drop neither starts a drag-scroll nor scrolls the view', async ({page}) => {
        const events = await nativeRowDrag(page);

        expect(events, 'the press became a browser drag').toContain('dragstart');

        const viewId = await viewIdOf(page, 'grid-focus-long'),
              box    = await page.locator(`#${viewId}`).boundingBox(),
              before = await maxScrollTop(page, 'grid-focus-long'),
              centre = {x: box.x + box.width / 2, y: box.y + box.height / 2};

        // the pointer comes back over the grid with no button held — the operator's "move back"
        await page.mouse.move(centre.x, centre.y);
        await page.waitForTimeout(100);

        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(centre.x, centre.y - i * 20);
            await page.waitForTimeout(40)
        }

        await page.waitForTimeout(200);

        expect(await readAddon(page), 'a plain move starts no drag-scroll and sticks no cursor').toEqual({activeDrag: false, monitorDrag: false, bodyCursor: ''});
        expect(await maxScrollTop(page, 'grid-focus-long'), 'the view did not scroll under a button-less move').toBe(before)
    });

    test('control: an ordinary drag on a plain row of the same grid still scrolls it', async ({page}) => {
        // rows below the third are not drag sources — a press there is a drag-scroll, not a browser drag
        const viewId = await viewIdOf(page, 'grid-focus-long'),
              box    = await page.locator(`#${viewId}`).boundingBox(),
              before = await maxScrollTop(page, 'grid-focus-long'),
              from   = {x: box.x + box.width / 2, y: box.y + box.height * 0.75};

        await drag(page, from, {x: from.x, y: from.y - 160});

        await expect.poll(() => maxScrollTop(page, 'grid-focus-long'), {message: 'the drag scrolled the long grid'}).toBeGreaterThan(before);
        // a real release restores the cursor, retires the monitor, and once the kinetic tail has
        // died the addon holds no drag state at all — the poll outlives the tail
        await expect.poll(() => readAddon(page), {message: 'the release ended the gesture cleanly'})
            .toEqual({activeDrag: false, monitorDrag: false, bodyCursor: ''})
    })
});
