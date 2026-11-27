import {test, expect} from '../../fixtures.mjs';

const ENTRY = '/examples/stateProvider/advanced/index.html';

/**
 * @summary Whitebox E2E witness for `examples/stateProvider/advanced` ("One state, every surface"):
 * verifies one `Neo.data.Record` bound through `Neo.state.Provider` across the live header, profile form,
 * nested StateProvider override panel, floating dialog, and SharedWorker second window at 1440x900 and 390x844.
 */
test.describe('One state, every surface (stateProvider/advanced)', () => {
    test.setTimeout(90000);

    test('form, dialog, nested provider override, and second window stay synchronized in both themes at 1440x900', async ({page, neuralLink}) => {
        const consoleErrors = [];
        page.on('console', msg => msg.type() === 'error' && consoleErrors.push(msg.text()));
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${ENTRY}?theme=neo-theme-neo-dark`);

        const app = await neuralLink.connectToApp('Neo.examples.stateProvider.advanced');

        await expect(page.locator('.sp-hero-name')).toHaveText('Maya Lin', {timeout: 30000});
        await expect(page.locator('.sp-try-line')).toContainText('launch a second window');
        await expect(page.locator('.sp-scope-row-override .sp-scope-value')).toHaveText('Compact');

        const openDialogBtn = page.getByRole('button', {name: 'Edit in dialog'}),
              openWindowBtn = page.getByRole('button', {name: 'Open second window'});

        await expect(openDialogBtn).toBeVisible();
        await expect(openWindowBtn).toBeVisible();

        // Open both the dialog and the companion browser window
        await openDialogBtn.click();
        const dialog = page.locator('.sp-profile-dialog');
        await expect(dialog).toBeVisible();
        const dialogBox = await dialog.boundingBox();
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(1440);
        expect(dialogBox.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(900);

        const [companion] = await Promise.all([
            page.waitForEvent('popup'),
            openWindowBtn.click()
        ]);

        companion.on('console', msg => msg.type() === 'error' && consoleErrors.push(`companion: ${msg.text()}`));
        companion.on('pageerror', err => consoleErrors.push(`companion: ${err.message}`));

        await expect(companion.locator('.sp-companion-member-name')).toHaveText('Maya Lin', {timeout: 30000});

        try {
            // 1. Edit in the main form -> updates header, nested panel, open dialog, and second window
            const formName = page.locator('input[name="form-name"]');
            await formName.fill('Zara Vance');

            await expect(page.locator('.sp-hero-name')).toHaveText('Zara Vance');
            await expect(page.locator('.sp-hero .sp-avatar')).toHaveText('ZV');
            await expect(page.locator('.sp-nested-card .sp-preview-name')).toHaveText('Zara Vance');
            await expect(dialog.locator('input[name="dialog-name"]')).toHaveValue('Zara Vance');
            await expect(companion.locator('.sp-companion-member-name')).toHaveText('Zara Vance');
            await expect(companion.locator('input[name="window-name"]')).toHaveValue('Zara Vance');

            // 2. Edit in the open dialog -> updates main form, header, and second window
            await dialog.locator('input[name="dialog-role"]').fill('Principal Runtime Architect');

            await expect(page.locator('input[name="form-role"]')).toHaveValue('Principal Runtime Architect');
            await expect(page.locator('.sp-hero-meta')).toContainText('Principal Runtime Architect');
            await expect(companion.locator('input[name="window-role"]')).toHaveValue('Principal Runtime Architect');

            // 3. Edit in the second window -> updates main form, header, and open dialog, backed by App Worker Store truth
            await companion.locator('input[name="window-statusNote"]').fill('Shipping Engine 14 live');

            await expect(page.locator('.sp-pill-accent')).toHaveText('Shipping Engine 14 live');
            await expect(page.locator('input[name="form-statusNote"]')).toHaveValue('Shipping Engine 14 live');
            await expect(dialog.locator('input[name="dialog-statusNote"]')).toHaveValue('Shipping Engine 14 live');

            const [listInfo] = await app.queryComponent({className: 'Neo.examples.stateProvider.advanced.MemberList'}, ['store']);
            const storeData  = await app.inspectStore(listInfo.properties.store.id, 5, 0);
            const mayaRow    = storeData.items.map(r => r.data || r).find(r => r.id === 'maya');
            expect(mayaRow).toMatchObject({
                name      : 'Zara Vance',
                role      : 'Principal Runtime Architect',
                statusNote: 'Shipping Engine 14 live'
            });

            // 4. Nested override button flips only the nested panel while root workspace density stays Comfortable
            await page.getByRole('button', {name: 'Override panel to Comfortable'}).click();
            await expect(page.locator('.sp-scope-row-override .sp-scope-value')).toHaveText('Comfortable');
            await expect(page.locator('.sp-hero-pills')).toContainText('Workspace density: Comfortable');

            // 5. Switch theme -> both windows switch cleanly with zero console errors
            await page.locator('.sp-hero .neo-themeswitcher').click();
            await expect(page.locator('.sp-advanced-viewport')).toHaveClass(/neo-theme-neo-light/);
            await expect(companion.locator('.sp-companion-viewport')).toHaveClass(/neo-theme-neo-light/);

            // 6. Repeat focus preserves the companion document (sentinel + timeOrigin unchanged)
            const beforeFocus = await companion.evaluate(() => {
                window.__companionSentinel = 'alive-single-primary';
                return performance.timeOrigin
            });
            await page.bringToFront();
            const focusWindowBtn = page.getByRole('button', {name: 'Focus second window'});
            await expect(focusWindowBtn).toBeVisible();
            await focusWindowBtn.click();
            const afterFocus = await companion.evaluate(() => ({
                sentinel  : window.__companionSentinel,
                timeOrigin: performance.timeOrigin
            }));
            expect(afterFocus).toEqual({sentinel: 'alive-single-primary', timeOrigin: beforeFocus});

            // 7. Reset member button visibly restores Maya Lin across every open surface
            await companion.getByRole('button', {name: 'Reset member'}).click();
            await expect(page.locator('.sp-hero-name')).toHaveText('Maya Lin');
            await expect(dialog.locator('input[name="dialog-name"]')).toHaveValue('Maya Lin');
        } finally {
            await companion.close({runBeforeUnload: true})
        }

        expect(consoleErrors).toEqual([])
    });

    test('companion opened from Primary B keeps its document on repeat focus, stays bound to B across reload, and never adopts Primary A', async ({page}) => {
        const consoleErrors = [],
              context       = page.context();

        page.on('console', msg => msg.type() === 'error' && consoleErrors.push(`primaryA: ${msg.text()}`));
        page.on('pageerror', err => consoleErrors.push(`primaryA: ${err.message}`));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${ENTRY}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.sp-hero-name')).toHaveText('Maya Lin', {timeout: 30000});
        await page.locator('input[name="form-name"]').fill('First Primary');
        await expect(page.locator('.sp-hero-name')).toHaveText('First Primary');

        const pageB = await context.newPage();
        pageB.on('console', msg => msg.type() === 'error' && consoleErrors.push(`primaryB: ${msg.text()}`));
        pageB.on('pageerror', err => consoleErrors.push(`primaryB: ${err.message}`));

        let companionB      = null,
            directCompanion = null;

        try {
            await pageB.setViewportSize({width: 1440, height: 900});
            await pageB.goto(`${ENTRY}?theme=neo-theme-neo-dark`);
            await expect(pageB.locator('.sp-hero-name')).toHaveText('Maya Lin', {timeout: 30000});

            await pageB.locator('input[name="form-name"]').fill('Second Primary');
            await expect(pageB.locator('.sp-hero-name')).toHaveText('Second Primary');
            await expect(page.locator('.sp-hero-name')).toHaveText('First Primary');

            // Open companion from Primary B while Primary A is also open in the same SharedWorker
            [companionB] = await Promise.all([
                pageB.waitForEvent('popup'),
                pageB.getByRole('button', {name: 'Open second window'}).click()
            ]);
            companionB.on('console', msg => msg.type() === 'error' && consoleErrors.push(`companionB: ${msg.text()}`));
            companionB.on('pageerror', err => consoleErrors.push(`companionB: ${err.message}`));

            await expect(companionB.locator('.sp-companion-member-name')).toHaveText('Second Primary', {timeout: 30000});

            // 1. Repeat focus from Primary B preserves companionB's document sentinel and performance.timeOrigin
            const originBeforeFocus = await companionB.evaluate(() => {
                window.__companionSentinel = 'sentinel-b-1';
                return performance.timeOrigin
            });
            await pageB.bringToFront();
            const focusBtnB = pageB.getByRole('button', {name: 'Focus second window'});
            await expect(focusBtnB).toBeVisible();
            await focusBtnB.click();

            expect(await companionB.evaluate(() => ({
                sentinel  : window.__companionSentinel,
                timeOrigin: performance.timeOrigin
            }))).toEqual({sentinel: 'sentinel-b-1', timeOrigin: originBeforeFocus});

            // 2. Reloading companionB keeps it connected to Primary B (never switches to Primary A)
            await companionB.reload();
            await expect(companionB.locator('.sp-companion-member-name')).toHaveText('Second Primary', {timeout: 30000});
            await expect(page.locator('.sp-hero-name')).toHaveText('First Primary');

            await companionB.locator('input[name="window-name"]').fill('Second Primary After Reload');
            await expect(pageB.locator('.sp-hero-name')).toHaveText('Second Primary After Reload');
            await expect(page.locator('.sp-hero-name')).toHaveText('First Primary');

            // Repeat focus after reload still preserves the reloaded document
            const originAfterReload = await companionB.evaluate(() => {
                window.__companionSentinel = 'sentinel-b-after-reload';
                return performance.timeOrigin
            });
            await pageB.bringToFront();
            await expect(focusBtnB).toBeVisible();
            await focusBtnB.click();
            expect(await companionB.evaluate(() => ({
                sentinel  : window.__companionSentinel,
                timeOrigin: performance.timeOrigin
            }))).toEqual({sentinel: 'sentinel-b-after-reload', timeOrigin: originAfterReload});

            // 3. Direct unowned ?companion=1 navigation shows disconnected state rather than adopting Primary A or B
            directCompanion = await context.newPage();
            directCompanion.on('console', msg => msg.type() === 'error' && consoleErrors.push(`direct: ${msg.text()}`));
            directCompanion.on('pageerror', err => consoleErrors.push(`direct: ${err.message}`));

            await directCompanion.goto(`${ENTRY}?companion=1&theme=neo-theme-neo-dark`);
            await expect(directCompanion.locator('.sp-companion-member-name')).toHaveText('Primary window closed', {timeout: 30000});
            await expect(directCompanion.getByRole('button', {name: 'Reset member'})).toBeDisabled();
            for (const key of ['name', 'role', 'location', 'statusNote']) {
                await expect(directCompanion.locator(`input[name="window-${key}"]`)).toBeDisabled()
            }
            await directCompanion.keyboard.press('Tab');
            await directCompanion.keyboard.press('Tab');
            await expect(directCompanion.locator('input[name="window-name"]')).not.toBeFocused();
            await directCompanion.keyboard.type('Detached edit attempt');
            await expect(directCompanion.locator('input[name="window-name"]')).toHaveValue('Primary window closed');

            // 4. Closing Primary B detaches companionB cleanly; reloading companionB afterwards stays disconnected (never adopts A)
            await pageB.close({runBeforeUnload: true});
            await expect(companionB.locator('.sp-companion-member-name')).toHaveText('Primary window closed');
            for (const key of ['name', 'role', 'location', 'statusNote']) {
                await expect(companionB.locator(`input[name="window-${key}"]`)).toBeDisabled()
            }
            await companionB.keyboard.press('Tab');
            await companionB.keyboard.press('Tab');
            await expect(companionB.locator('input[name="window-name"]')).not.toBeFocused();
            await companionB.keyboard.type('Closed owner edit attempt');
            await expect(companionB.locator('input[name="window-name"]')).toHaveValue('Primary window closed');
            await companionB.reload();
            await expect(companionB.locator('.sp-companion-member-name')).toHaveText('Primary window closed', {timeout: 30000});
            await expect(companionB.locator('input[name="window-name"]')).toBeDisabled();
            await expect(page.locator('.sp-hero-name')).toHaveText('First Primary')
        } finally {
            if (directCompanion && !directCompanion.isClosed()) {
                await directCompanion.close({runBeforeUnload: true})
            }
            if (companionB && !companionB.isClosed()) {
                await companionB.close({runBeforeUnload: true})
            }
            if (!pageB.isClosed()) {
                await pageB.close({runBeforeUnload: true})
            }
        }

        expect(consoleErrors).toEqual([])
    });

    test('390x844 fits without horizontal overflow in both themes and omits the desktop popup button', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => msg.type() === 'error' && consoleErrors.push(msg.text()));
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${ENTRY}?theme=neo-theme-neo-dark`);

        await expect(page.locator('.sp-hero-name')).toHaveText('Maya Lin', {timeout: 30000});
        await expect(page.locator('.neo-button').filter({hasText: /second window/i})).toBeHidden();
        await expect(page.locator('.sp-try-line')).not.toContainText('second window');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        await page.locator('.sp-hero .neo-themeswitcher').click();
        await expect(page.locator('.sp-advanced-viewport')).toHaveClass(/neo-theme-neo-light/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        expect(consoleErrors).toEqual([])
    })
});
