import {expect, test} from '../../fixtures.mjs';

/**
 * CDP moves Chrome's outer popup frame. From that movement onward the real window-position
 * observer, the desktop's hit test and the coordinator's dwell own the return.
 */
test('a committed Mail popup returns only after its native window dwells over the desktop workspace', async ({page}) => {
    const workspace = page.locator('.neo-desktop-workspace'),
          taskbar   = page.locator('.neo-desktop-taskbar'),
          tasks     = page.locator('.neo-desktop-task-list .neo-list-item'),
          dialog    = page.locator('.neo-desktop-app-window'),
          dwell     = page.locator('.neo-desktop-window-dwelling'),
          subject   = 'Guest access to the help pages';

    // Headless Chrome can create a popup at (0, 0). Put that spot inside the source workspace,
    // so the stationary-birth check exercises an eligible return area.
    const sourceSession = await page.context().newCDPSession(page),
          sourceWindow  = await sourceSession.send('Browser.getWindowForTarget');
    await sourceSession.send('Browser.setWindowBounds', {windowId: sourceWindow.windowId, bounds: {left: -160, top: -180, windowState: 'normal'}});
    await sourceSession.detach();
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.goto('/apps/webdesktop/index.html');
    await page.getByText('Alex Morgan', {exact: true}).click();
    await page.locator('.neo-desktop-launcher .neo-list-item').filter({hasText: 'Mail'}).dblclick();
    await expect(dialog.locator('.webdesktop-mail')).toBeVisible();
    await expect(tasks).toHaveCount(1);
    const dialogId = await dialog.getAttribute('id'),
          taskId   = await tasks.getAttribute('id');

    // Sample the opener's actual content origin using the button press that opens the popup.
    // Browser chrome and other non-content insets need no estimate.
    const origin = page.evaluate(() => new Promise(resolve => {
        window.addEventListener('pointerdown', e => resolve({
            x: e.screenX - e.clientX,
            y: e.screenY - e.clientY
        }), {capture: true, once: true})
    }));
    const [popup, offset] = await Promise.all([
        page.waitForEvent('popup'), origin, dialog.getByRole('button', {name: 'Pop out window'}).click()
    ]);

    await expect(popup.getByRole('button', {name: 'Back to desktop'})).toBeVisible();
    await popup.locator('.webdesktop-mail-inbox').getByText('Robin Chen', {exact: true}).click();
    await expect(popup.locator('.webdesktop-mail-message h2')).toHaveText(subject);

    const cdp = await page.context().newCDPSession(popup);
    try {
        const {windowId} = await cdp.send('Browser.getWindowForTarget'),
              inside     = await workspace.boundingBox(),
              outside    = await taskbar.boundingBox();

        async function moveFrameOver(box) {
            const left = Math.round(offset.x + box.x + box.width / 2),
                  top  = Math.round(offset.y + box.y + box.height / 2);

            await cdp.send('Browser.setWindowBounds', {windowId, bounds: {left, top, windowState: 'normal'}});
            await expect.poll(() => popup.evaluate(() => [screenX, screenY])).toEqual([left, top])
        }

        async function expectIdleWorkspace() {
            await expect(dwell).toHaveCount(0);
            await expect(workspace).toHaveCSS('--desktop-return-dwell', '0ms');
            await expect(workspace).toHaveCSS('--desktop-return-offset', '0ms')
        }

        // A missing event is the observation: allow a whole 1200 ms native dwell plus its
        // 250 ms settle interval and scheduling margin for an erroneous return to manifest.
        async function expectDetached(message) {
            await expect(popup.waitForEvent('close', {timeout: 2000}), message).rejects.toThrow(/Timeout.*close/);
            await expectIdleWorkspace()
        }

        const corner = await popup.evaluate(() => ({x: screenX + 8, y: screenY + 8}));
        expect(corner.x - offset.x).toBeGreaterThanOrEqual(inside.x);
        expect(corner.x - offset.x).toBeLessThan(inside.x + inside.width);
        expect(corner.y - offset.y).toBeGreaterThanOrEqual(inside.y);
        expect(corner.y - offset.y).toBeLessThan(inside.y + inside.height);
        await expectDetached('birth over the workspace and its first stationary sample keep the popup detached');
        await moveFrameOver(outside);
        await moveFrameOver(inside);
        await expect(dwell).toBeVisible();
        expect(await dwell.evaluate(node => {
            const fill = getComputedStyle(node, '::after');
            return fill.animationName !== 'none' && parseFloat(fill.animationDuration) > 0 && parseFloat(fill.height) > 0
        }), 'the workspace paints the running dwell indicator').toBe(true);
        await moveFrameOver(outside);
        await expect(dwell).toHaveCount(0);
        await expectDetached('leaving for the taskbar cancels the armed return');

        await popup.reload();
        await expect(popup.getByRole('button', {name: 'Back to desktop'})).toBeVisible();
        await expect(popup.locator('.webdesktop-mail-message h2')).toHaveText(subject);
        await moveFrameOver(inside);
        await expect(dwell).toBeVisible();
        await expect.poll(() => popup.isClosed(), {message: 'native dwell retires this popup', timeout: 10000}).toBe(true);

        await expectIdleWorkspace();
        await expect(dialog).toHaveCount(1);
        await expect(dialog).toHaveAttribute('id', dialogId);
        await expect(dialog.locator('.webdesktop-mail-message h2')).toHaveText(subject);
        await expect(tasks).toHaveCount(1);
        await expect(tasks).toHaveAttribute('id', taskId);
        expect(page.context().pages()).toHaveLength(1)
    } finally {
        if (!popup.isClosed()) await popup.close()
    }
});
