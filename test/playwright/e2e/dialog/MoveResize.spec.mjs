import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A real pointer moves the dialog of `examples/dialog` by its header and resizes it by its right handle, in
 * both orders: the later gesture's geometry wins, and the resize preview follows the pointer.
 *
 * A unit spec cannot see this: the move reads the drag proxy's rect from the main thread, and which of `style` and
 * `wrapperStyle` wins shows only in the rendered node.
 */

const near = (actual, expected, tolerance = 2) => Math.abs(actual - expected) <= tolerance;

/**
 * Opens the example's dialog and waits until its show animation has landed
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openDialog(page) {
    await page.goto('/examples/dialog/index.html');

    const dialog = page.locator('.neo-dialog').first();

    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.x ?? -1).toBeGreaterThan(0);
    await page.waitForTimeout(400);

    return dialog
}

/**
 * Drags the dialog by its title
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {Number} dx
 * @param {Number} dy
 */
async function moveBy(page, dialog, dx, dy) {
    const title = await dialog.locator('.neo-header-toolbar .neo-panel-header-text').boundingBox(),
          x     = title.x + title.width / 2,
          y     = title.y + title.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, {steps: 16});
    await page.mouse.up();
    await page.waitForTimeout(300)
}

/**
 * Presses the dialog's right resize handle
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @returns {Promise<{hx: Number, hy: Number}>} Where the pointer went down
 */
async function pressRightHandle(page, dialog) {
    const box    = await dialog.boundingBox(),
          x      = box.x + box.width - 3,
          y      = box.y + box.height / 2,
          handle = dialog.locator('.neo-resizable-right');

    // The plugin loads lazily and adds its handle on a mousemove near the edge: hover until it is there
    await expect(async () => {
        await page.mouse.move(x - 30, y);
        await page.mouse.move(x, y, {steps: 4});
        await expect(handle).toHaveCount(1, {timeout: 250})
    }).toPass();

    const hb = await handle.boundingBox(),
          hx = hb.x + hb.width / 2,
          hy = hb.y + hb.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();

    return {hx, hy}
}

/**
 * Drags the dialog's right resize handle, and measures the drag proxy halfway through
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {Number} dx
 * @returns {Promise<Object>} The proxy's box halfway through the gesture
 */
async function resizeRightBy(page, dialog, dx) {
    const {hx, hy} = await pressRightHandle(page, dialog);

    await page.mouse.move(hx + dx / 2, hy, {steps: 8});
    await page.waitForTimeout(100);

    const halfway = await page.locator('.neo-dragproxy').first().boundingBox();

    await page.mouse.move(hx + dx, hy, {steps: 8});
    await page.mouse.up();
    await page.waitForTimeout(300);

    return halfway
}

test.describe('dialog move and resize', () => {
    test('a dialog moved by its header still resizes', async ({page}) => {
        const dialog = await openDialog(page);

        await moveBy(page, dialog, -120, 60);

        const moved = await dialog.boundingBox();

        await resizeRightBy(page, dialog, 150);

        const resized = await dialog.boundingBox();

        expect(near(resized.width, moved.width + 150, 6), `the dialog is ${resized.width} px wide after a +150 px resize from ${moved.width} px`).toBe(true);
        expect(near(resized.x, moved.x), 'the left edge stays').toBe(true)
    });

    test('the resize preview follows the pointer', async ({page}) => {
        const dialog  = await openDialog(page),
              before  = await dialog.boundingBox(),
              halfway = await resizeRightBy(page, dialog, 150);

        expect(near(halfway.width, before.width + 75, 6), `the preview is ${halfway.width} px wide halfway, the dialog ${before.width} px`).toBe(true)
    });

    test('a resized dialog keeps its size through a move', async ({page}) => {
        const dialog = await openDialog(page),
              before = await dialog.boundingBox();

        await resizeRightBy(page, dialog, 150);

        const resized = await dialog.boundingBox();

        expect(near(resized.width, before.width + 150, 6)).toBe(true);

        await moveBy(page, dialog, -100, 40);

        const moved = await dialog.boundingBox();

        expect(near(moved.width, resized.width), `${moved.width} px after the move, ${resized.width} px before`).toBe(true);
        expect(near(moved.x, resized.x - 100, 4), 'the move landed').toBe(true)
    });

    test('Escape cancels a resize: the moved dialog keeps its size and its opacity once the preview is gone', async ({page}) => {
        const dialog  = await openDialog(page),
              opacity = () => dialog.evaluate(node => getComputedStyle(node).opacity);

        await moveBy(page, dialog, -120, 60);

        const before   = await dialog.boundingBox(),
              initial  = await opacity(),
              {hx, hy} = await pressRightHandle(page, dialog);

        await page.mouse.move(hx + 150, hy, {steps: 16});
        await expect.poll(async () => (await page.locator('.neo-dragproxy').first().boundingBox())?.width ?? 0,
            'the preview grows').toBeGreaterThan(before.width + 100);
        expect(await opacity(), 'the gesture dims the dialog').toBe('0.3');

        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await page.waitForTimeout(300);

        const after = await dialog.boundingBox();

        expect(near(after.width, before.width) && near(after.x, before.x), `${after.width} px wide at ${after.x}, ${before.width} px at ${before.x} before`).toBe(true);
        expect(await opacity(), 'the dialog is as opaque as before the gesture').toBe(initial)
    });

    // A dialog that never moved has no opacity in its style, which is the case the move above hides
    test('Escape cancels a resize of a dialog that never moved, and its opacity comes back', async ({page}) => {
        const dialog   = await openDialog(page),
              opacity  = () => dialog.evaluate(node => getComputedStyle(node).opacity),
              initial  = await opacity(),
              {hx, hy} = await pressRightHandle(page, dialog);

        await page.mouse.move(hx + 150, hy, {steps: 16});
        await expect.poll(opacity, 'the gesture dims the dialog').toBe('0.3');

        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect.poll(opacity, 'the dialog is as opaque as before the gesture').toBe(initial)
    });

    test('a resize of a dialog that never moved ends at its opacity', async ({page}) => {
        const dialog  = await openDialog(page),
              opacity = () => dialog.evaluate(node => getComputedStyle(node).opacity),
              initial = await opacity();

        await resizeRightBy(page, dialog, 150);
        await expect.poll(opacity, 'the dialog is as opaque as before the gesture').toBe(initial)
    });

    test('a platform-cancelled touch drag on the header keeps the dialog at its initial position and restores opacity 1 (#21765)', async ({page}) => {
        const cdp   = await page.context().newCDPSession(page),
              touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});

        await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'maxTouchPoints', {configurable: true, get: () => 1})
        });

        const dialog  = await openDialog(page),
              opacity = () => dialog.evaluate(node => getComputedStyle(node).opacity),
              proxy   = page.locator('.neo-dragproxy'),
              before  = await dialog.boundingBox(),
              initial = await opacity(),
              title   = await dialog.locator('.neo-header-toolbar .neo-panel-header-text').boundingBox(),
              startX  = Math.round(title.x + title.width / 2),
              startY  = Math.round(title.y + title.height / 2);

        await touch('touchStart', [{x: startX, y: startY}]);
        await expect(proxy, 'header long-press arms the touch drag').toHaveCount(1);
        await expect.poll(opacity, 'engaged drag dims the dialog').toBe('0.7');

        for (let step = 1; step <= 8; step++) {
            await touch('touchMove', [{
                x: Math.round(startX + (120 * step) / 8),
                y: Math.round(startY + (60 * step) / 8)
            }])
        }

        await touch('touchCancel', []);
        await expect(proxy, 'touchCancel removes the drag proxy').toHaveCount(0);

        await expect.poll(opacity, 'touchCancel restores pre-drag opacity 1').toBe(initial);

        const after = await dialog.boundingBox();

        expect(near(after.x, before.x) && near(after.y, before.y),
            `dialog stays at (${after.x}, ${after.y}), was (${before.x}, ${before.y})`).toBe(true)
    })
});
