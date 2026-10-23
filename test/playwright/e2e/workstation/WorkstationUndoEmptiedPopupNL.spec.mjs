import {test, expect} from '../../fixtures.mjs';

/**
 * @summary An undo that empties a popup closes its window, and the redo shows the pane in a window again.
 *
 * Undoing a pop-out sends the pane home and leaves the popup with nothing in it. A window kept open for the redo
 * would sit on screen blank, so the replay closes it and the redo embodies a window again. The second arm is the
 * gate-3 walk's sequence: two pop-outs, the first window closed without unloading (a bare target close, which the
 * worker never sees), then the undo: it reverts the second pop-out and must not leave that window blank either.
 */
const
    ACTION  = '.neo-toolbar-action',
    HEADER  = '.neo-tab-header-toolbar',
    POP_OUT = 'window-restore',
    TAB     = '.neo-tab-header-button';

test.describe('Workstation — an undo that empties a popup', () => {
    test.setTimeout(150000);
    test.use({viewport: {height: 900, width: 1600}});

    /**
     * Pops a pane out through its header action and waits for it in the new window.
     * @param {Object} fixtures `{page, context}`
     * @param {String} title The pane's tab title
     * @returns {Promise<Object>} The popup page
     */
    async function popOut({page, context}, title) {
        const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: title})}).first();
        await expect(header).toBeVisible({timeout: 60000});
        await header.locator(TAB, {hasText: title}).click();

        const popupPromise = context.waitForEvent('page', {timeout: 45000});
        await header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first().click();
        const popup = await popupPromise;
        await expect(popup.locator(TAB, {hasText: title})).toBeVisible({timeout: 45000});
        return popup
    }

    /**
     * @param {Object} page
     * @param {String} name 'Undo' or 'Redo'
     */
    async function history(page, name) {
        await page.locator('.workstation-topologybar').getByRole('button', {name}).click()
    }

    test('undoing a pop-out closes the emptied window; the redo shows the pane in a window again', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await neuralLink.connectToApp('Workstation');

        const vessel = await popOut({page, context}, 'Metrics');

        await history(page, 'Undo');
        await expect(page.locator(TAB, {hasText: 'Metrics'}).filter({visible: true}), 'the pane is home').toHaveCount(1, {timeout: 15000});
        await expect.poll(() => vessel.isClosed(), {message: 'the emptied popup does not stay on screen blank', timeout: 5000}).toBe(true);

        const reopened = context.waitForEvent('page', {timeout: 45000});
        await history(page, 'Redo');
        await expect((await reopened).locator(TAB, {hasText: 'Metrics'}), 'the redo shows the pane in a window again').toBeVisible({timeout: 45000});
        await expect(page.locator(TAB, {hasText: 'Metrics'}).filter({visible: true})).toHaveCount(0)
    });

    test('after a window vanished unseen, the undo that empties the other popup closes it too', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await neuralLink.connectToApp('Workstation');

        const first  = await popOut({page, context}, 'Metrics'),
              second = await popOut({page, context}, 'Audit');

        // A bare target close never unloads, so its close is no history row and the undo reverts the second pop-out
        await first.close();
        await history(page, 'Undo');

        await expect(page.locator(TAB, {hasText: 'Audit'}).filter({visible: true}), 'the second pane is home').toHaveCount(1, {timeout: 15000});
        await expect.poll(() => second.isClosed(), {message: 'its emptied window does not stay on screen blank', timeout: 5000}).toBe(true)
    })
});
