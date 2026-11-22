import {expect, test} from '../../fixtures.mjs';

const
    url        = '/examples/dashboard/sortable/index.html?theme=neo-theme-neo-dark',
    tiles      = '.sortable-kpi-tile',
    titles     = '.sortable-kpi-tile .neo-panel-header-text',
    handles    = '.sortable-kpi-tile .sortable-kpi-header',
    startOrder = ['Revenue today', 'Orders', 'Conversion rate', 'Average basket', 'Visitors now', 'Refund rate'];

/**
 * @summary Waits one animation frame, so the main thread can forward the last pointer move.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
function frame(page) {
    return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())))
}

/**
 * @summary Presses a tile's title and moves the pointer a few pixels, which arms the dashboard's drag.
 * @param {import('@playwright/test').Page} page
 * @param {Number} index The tile's position on the board
 * @returns {Promise<{x: Number, y: Number}>} The press point
 */
async function pressTitle(page, index) {
    const box = await page.locator(handles).nth(index).boundingBox(),
          x   = box.x + 60,
          y   = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 10, {steps: 3});

    return {x, y}
}

/**
 * @summary The sortable dashboard example: six live key-figure tiles in a `Neo.dashboard.Container`, a drag that
 * reorders them, and a drag out of the window, or a tile's window button, that opens a tile in a window of its own,
 * still live, which a drag back or the same button returns. Headless runs prove the wiring; where an OS window lands
 * stays with the headed tear-out suite
 * (`test/playwright/e2e/colors/tearOutMatrix.spec.mjs`).
 */
test.describe('Sortable dashboard example', () => {
    test.setTimeout(60000);

    test('opens on six live tiles, and a drag reorders them', async ({page}) => {
        await page.goto(url);

        await expect(page.locator(tiles)).toHaveCount(6);
        await expect(page.locator(titles)).toHaveText(startOrder);
        await expect(page.locator('.sortable-hint')).toContainText('or out of the window');

        // The feed extends every figure once a second
        const revenue = page.locator('.sortable-kpi-value').first();
        await expect(revenue).toHaveText(/^\$\d/);
        const opening = await revenue.textContent();
        await expect.poll(() => revenue.textContent(), {timeout: 5000}).not.toBe(opening);

        // Orders, pressed by its title, moves down past Average basket
        const {x}    = await pressTitle(page, 1),
              target = await page.locator(tiles).nth(3).boundingBox();

        await page.mouse.move(x, target.y + target.height * 0.75, {steps: 25});
        await frame(page);
        await page.mouse.up();

        await expect.poll(async () => (await page.locator(titles).allTextContents()).indexOf('Orders')).toBeGreaterThan(2);
        await expect(page.locator(tiles)).toHaveCount(6)
    });

    test('a tile dragged out opens in its own window, live, and a drag back returns it', async ({context, page}) => {
        await page.goto(url);
        await expect(page.locator(titles)).toHaveText(startOrder);

        const popupOpened = context.waitForEvent('page', {timeout: 30000}),
              {x, y}      = await pressTitle(page, 0);

        // Out: the proxy leaves most of the window, which detaches the tile into a popup
        for (let step = 1; step <= 40; step++) {
            await page.mouse.move(x + step * 34, y + step * 6);
            await frame(page)
        }

        const popup = await popupOpened;

        await expect(popup.locator(titles)).toHaveText(['Revenue today'], {timeout: 15000});

        // The tile keeps its feed in the other window
        const value   = popup.locator('.sortable-kpi-value'),
              opening = await value.textContent();
        await expect.poll(() => value.textContent(), {timeout: 5000}).not.toBe(opening);

        // Back: the same gesture returns over the board, which closes the popup and re-inserts the tile
        for (let step = 40; step >= 0; step--) {
            await page.mouse.move(x + step * 34, y + step * 6);
            await frame(page)
        }

        await page.mouse.up();

        await expect.poll(() => popup.isClosed(), {timeout: 10000}).toBe(true);
        await expect(page.locator(titles)).toHaveText(startOrder)
    });

    test('a tile\'s window button opens it in its own window, and the same button there brings it back', async ({context, page}) => {
        await page.goto(url);
        await expect(page.locator(titles)).toHaveText(startOrder);

        const button      = page.locator('.sortable-kpi-window-button').nth(1),
              popupOpened = context.waitForEvent('page', {timeout: 30000});

        await expect(button).toHaveAttribute('aria-label', 'Open in its own window');
        await button.click();

        const popup = await popupOpened;

        await expect(popup.locator(titles)).toHaveText(['Orders'], {timeout: 15000});
        await expect(page.locator(titles)).toHaveText(startOrder.filter(title => title !== 'Orders'));

        const back = popup.locator('.sortable-kpi-window-button');

        await expect(back).toHaveAttribute('aria-label', 'Return to the dashboard');
        await back.click();

        await expect.poll(() => popup.isClosed(), {timeout: 10000}).toBe(true);
        await expect(page.locator(titles)).toHaveText(startOrder);
        await expect(button).toHaveAttribute('aria-label', 'Open in its own window')
    })
});
