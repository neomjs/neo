import {expect, test} from '../../fixtures.mjs';

test.describe('Contextual Command Palette across Workstation and Web Desktop', () => {
    test('Workstation: keyboard open, unavailable action refusal, arrangement switch + Undo, pane focus jump, theme toggle, and focus restoration', async ({neuralLink, page}) => {
        test.setTimeout(90000);

        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play');

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId = workspaces[0].id,
              themeButton = page.getByRole('button', {name: 'Light mode', exact: true}),
              commandsBtn = page.getByRole('button', {name: 'Commands', exact: true}),
              dialog      = page.getByRole('dialog', {name: 'Workstation Commands'}),
              combobox    = dialog.getByRole('combobox', {name: 'Workstation Commands'}),
              status      = dialog.locator('[role="status"]');

        await expect(commandsBtn).toBeVisible();
        await themeButton.focus();
        await expect(themeButton).toBeFocused();

        // Open by keyboard shortcut (Control+k) and verify combobox receives focus
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await expect(combobox).toBeFocused();

        // Unavailable actions remain visible with explicit reason and refuse Enter invocation
        await combobox.fill('Undo layout');
        const undoOption = dialog.getByRole('option', {name: /Undo layout change/});
        await expect(undoOption).toHaveAttribute('aria-disabled', 'true');
        await expect(undoOption).toContainText('Nothing to undo');

        await page.keyboard.press('Enter');
        await expect(dialog, 'unavailable command must not close or invoke').toBeVisible();
        await expect(status).toHaveText('Undo layout change is unavailable: Nothing to undo.');

        // Escape dismisses and restores focus to the origin control (Light mode button)
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(themeButton).toBeFocused();

        // Re-open via F1, filter to Planning arrangement, and execute via Enter
        await page.keyboard.press('F1');
        await expect(dialog).toBeVisible();
        await combobox.fill('Planning arrangement');
        await expect(dialog.getByRole('option', {name: /Switch to Planning arrangement/})).toHaveAttribute('aria-disabled', 'false');
        await page.keyboard.press('Enter');

        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => (await app.getComponent(workspaceId, ['activePerspective'])).activePerspective).toBe('planning');
        await expect(themeButton, 'origin toolbar control stays mounted and regains focus').toBeFocused();

        // Re-open via Commands button and run Undo layout change (now available after arrangement switch)
        await commandsBtn.click();
        await expect(dialog).toBeVisible();
        await combobox.fill('Undo layout');
        await expect(dialog.getByRole('option', {name: /Undo layout change/})).toHaveAttribute('aria-disabled', 'false');
        await page.keyboard.press('Enter');

        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => (await app.getComponent(workspaceId, ['activePerspective'])).activePerspective).toBe('shipped');
        await expect(commandsBtn).toBeFocused();

        // Pane focus jump (managesFocus: true) activates background Audit tab and places DOM focus on its tab button
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await combobox.fill('Focus Audit');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        const auditTab = page.getByRole('tab', {name: 'Audit'});
        await expect(auditTab).toHaveAttribute('aria-selected', 'true');
        await expect(auditTab).toBeFocused();

        // Theme switch via command palette updates both workspace and palette theme tokens
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await combobox.fill('Light mode');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect.poll(async () => (await app.getComponent(workspaceId, ['theme'])).theme).toBe('neo-theme-neo-light');
        await expect(page.getByRole('button', {name: 'Dark mode', exact: true})).toBeVisible();

        expect(pageErrors).toEqual([])
    });

    test('Web Desktop: exercises the same palette interface across signed-out lock screen, restricted RBAC grants, app launch, theme switch, and sign-out', async ({page}) => {
        test.setTimeout(90000);

        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/apps/webdesktop/index.html');
        await expect(page.getByText('Robin Chen', {exact: true})).toBeVisible();

        const dialog   = page.getByRole('dialog', {name: 'Web Desktop Commands'}),
              combobox = dialog.getByRole('combobox', {name: 'Web Desktop Commands'}),
              status   = dialog.locator('[role="status"]');

        // Open on the signed-out lock screen via F1; desktop apps explain they require signing in first
        await page.keyboard.press('F1');
        await expect(dialog).toBeVisible();
        await expect(combobox).toBeFocused();

        await combobox.fill('Open Mail');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        const mailWhileSignedOut = dialog.getByRole('option', {name: /Open Mail/});
        await expect(mailWhileSignedOut).toHaveAttribute('aria-disabled', 'true');
        await expect(mailWhileSignedOut).toContainText('Sign in to an account first');
        const signedOutBox = await mailWhileSignedOut.boundingBox();
        await page.mouse.click(signedOutBox.x + signedOutBox.width / 2, signedOutBox.y + signedOutBox.height / 2);
        await expect(dialog).toBeVisible();
        await expect(status).toHaveText('Open Mail is unavailable: Sign in to an account first.');

        // Sign in as Robin Chen (Guest: view-help only) via the command palette
        await combobox.fill('Robin Chen');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await dialog.getByRole('option', {name: /Sign in as Robin Chen/}).click();
        await expect(dialog).toHaveCount(0);

        // Sign-In screen unmounted, so fallbackFocusId lands focus cleanly on the Taskbar Commands button
        const taskbarCommands = page.getByRole('button', {name: 'Commands', exact: true});
        await expect(taskbarCommands).toBeVisible();
        await expect(taskbarCommands).toBeFocused();

        // Under Guest permissions, Open Mail is refused with exact permission key, while Open Help launches
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await combobox.fill('Open Mail');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        const mailForGuest = dialog.getByRole('option', {name: /Open Mail/});
        await expect(mailForGuest).toHaveAttribute('aria-disabled', 'true');
        await expect(mailForGuest).toContainText('Requires view-mail permission');
        await page.keyboard.press('Enter');
        await expect(status).toHaveText('Open Mail is unavailable: Requires view-mail permission.');
        await expect(page.locator('.neo-dialog.neo-desktop-app-window')).toHaveCount(0);

        await combobox.fill('Open Help');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await expect(dialog.getByRole('option', {name: /Open Help/})).toHaveAttribute('aria-disabled', 'false');
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('.neo-dialog.neo-desktop-app-window').filter({hasText: 'Help'})).toBeVisible();

        // Switch theme to light and verify viewport + reopened palette carry neo-theme-neo-light
        await taskbarCommands.click();
        await expect(dialog).toBeVisible();
        await combobox.fill('Light theme');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('.webdesktop-viewport')).toHaveClass(/neo-theme-neo-light/);

        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await expect(page.locator('.neo-command-palette-backdrop')).toHaveClass(/neo-theme-neo-light/);

        // Sign out via palette closes desktop windows and returns to lock screen without page errors
        await combobox.fill('Sign out');
        await expect(dialog.getByRole('option')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText('Robin Chen', {exact: true})).toBeVisible();
        await expect(page.locator('.neo-dialog.neo-desktop-app-window')).toHaveCount(0);

        expect(pageErrors).toEqual([])
    })
});
