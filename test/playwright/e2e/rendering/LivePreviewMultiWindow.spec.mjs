import {expect, test} from '../../fixtures.mjs';

// Use matrix testing over environments
const environments = [
    { name: 'Dev', path: '/apps/portal/' },
    { name: 'Dist Dev', path: '/dist/development/apps/portal/' },
    { name: 'Dist Prod', path: '/dist/production/apps/portal/' }
];

const formsEngineRoute = '#/learn/benefits/body/FormsEngine';

async function verifyLivePreviewPopout(page, livePreviewLocatorOptions = undefined) {
    const livePreview = page.locator('.neo-code-live-preview', livePreviewLocatorOptions).first();
    await expect(livePreview).toBeVisible({ timeout: 30000 });

    // Wait a moment for UI to settle
    await page.waitForTimeout(1000);

    // Switch to Preview tab
    const previewTab = livePreview.getByText('Preview', { exact: true });
    await previewTab.waitFor({ state: 'visible', timeout: 10000 });
    await previewTab.click();

    // Wait for the Preview activeIndex change to spawn the component
    await page.waitForTimeout(1000);

    // Click the popout button
    const popoutBtn = livePreview.locator('.fa-window-maximize');
    await popoutBtn.waitFor({ state: 'visible' });

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        popoutBtn.click()
    ]);

    const errors = []; // Initialize an array to collect errors

    popup.on('console', msg => {
        if (msg.type() === 'error') {
            // ignore favicon and 404s for images/fonts/etc unless it's a script
            if (msg.text().includes('favicon') || msg.text().includes('404')) return;

            errors.push(msg.text());
            console.error(`[Popup Console ERROR] ${msg.text()}`);
        }
    });
    popup.on('pageerror', err => {
        errors.push(err.message);
        console.error(`[Popup PageError] ${err.message}`);
    });
    popup.on('response', response => {
        if (response.status() === 404 && response.url().endsWith('.js')) {
            errors.push(`404 script: ${response.url()}`);
            console.error(`[Popup Response 404 ERROR] ${response.statusText()} - ${response.url()}`);
        }
    });

    // Verification: Wait for domcontentloaded
    await popup.waitForLoadState('domcontentloaded');

    // There may be multiple viewports, we just need to ensure at least one renders
    const popupViewport = popup.locator('.neo-viewport').last();
    await expect(popupViewport).toBeAttached({ timeout: 15000 });

    // Wait for any potential async errors to surface
    await popup.waitForTimeout(2000);

    // Ensure LivePreview didn't throw the 'Invalid remote namespace' error
    expect(errors).toHaveLength(0);

    await popup.close();
}

test.describe('LivePreview Multi-Window Functionality (Issue #9586)', () => {
    // Shared Worker environments inherently involve background processes that may take time to spool up
    test.setTimeout(90000); // Increased timeout for sequential tests

    /**
     * @summary A Mermaid preview keeps its window's renderer while Source edits cross the shared worker,
     * then returns the latest diagram to the parent. This is a Dev-only consumer witness.
     */
    test('Mermaid Dev: Source typing updates the real popup and closing restores its latest diagram', async ({page, neo}) => {
        const rendered = '.neo-mermaid svg:not([aria-roledescription="error"])',
              errors   = {parent: [], child: []};
        let popup;

        page.on('pageerror', error => errors.parent.push(error.message));
        try {
            await page.goto('/apps/portal/index.html#/home');
            const candidate = page.locator('.neo-code-live-preview').first();

            await expect(candidate).toBeVisible({timeout: 30000});
            const id   = await candidate.getAttribute('id'),
                  live = page.locator(`#${id}`);

            expect(await page.evaluate(() => Neo.config.useSharedWorkers)).toBe(true);
            await neo.setConfig(id, {language: 'mermaid', value: 'flowchart TD\n A[Before popout] --> B[Initial]'});
            await live.getByText('Preview', {exact: true}).click();
            await expect(live.locator(rendered)).toHaveCount(1);
            await expect(live.locator(rendered)).toContainText('Before popout');

            const opened = page.waitForEvent('popup');
            await live.getByRole('button', {name: 'Open preview in a separate window'}).click();
            popup = await opened;
            popup.on('pageerror', error => errors.child.push(error.message));
            await popup.waitForURL(/\/apps\/portal\/childapps\/preview\/index.html\?id=/);
            await expect(popup.locator(rendered)).toBeVisible({timeout: 15000});
            await expect(popup.locator(rendered)).toContainText('Before popout');

            const holder   = live.locator('.neo-monaco-editor'),
                  editorId = await holder.getAttribute('id');

            await page.bringToFront();
            await expect(holder.locator('.monaco-editor')).toBeVisible();
            await expect.poll(() => page.evaluate(id => Boolean(Neo.main.addon.MonacoEditor.map[id]?.getModel()), editorId)).toBe(true);
            expect(await page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getModel().getLanguageId(), editorId)).toBe('mermaid');
            await page.evaluate(id => {
                const editor = Neo.main.addon.MonacoEditor.map[id];

                editor.setValue('flowchart TD\n A[Updated in Source] --> B[Live child]');
                editor.focus();
                editor.setPosition({lineNumber: 2, column: editor.getModel().getLineMaxColumn(2)})
            }, editorId);
            await expect.poll(() => page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].hasTextFocus(), editorId)).toBe(true);
            await page.keyboard.insertText('\n B --> C[Typed in Source]');
            await expect.poll(() => page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getValue(), editorId)).toContain('C[Typed in Source]');
            const edited = await page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getValue(), editorId);

            await expect.poll(() => neo.getConfig(id, ['value'])).toEqual([edited]);
            await expect(popup.locator(rendered)).toContainText('Updated in Source', {timeout: 15000});
            await expect(popup.locator(rendered)).toContainText('Typed in Source');

            await popup.close();
            await expect.poll(() => neo.getConfig(id, ['connectedWindowId'])).toEqual([null]);
            await expect(live.locator(rendered)).toBeVisible({timeout: 15000});
            await expect(live.locator(rendered)).toContainText('Updated in Source');
            await expect(live.locator(rendered)).toContainText('Typed in Source');
            expect(errors).toEqual({parent: [], child: []})
        } finally {
            popup && !popup.isClosed() && await popup.close()
        }
    });

    for (const env of environments) {
        test.describe(`Environment: ${env.name}`, () => {

            test('Popout LivePreview from Home Route (Helix)', async ({ page }) => {
                await page.goto(env.path);
                await verifyLivePreviewPopout(page);
            });

            test('Popout LivePreview from Learn Route (FormsEngine)', async ({ page }) => {
                await page.goto(`${env.path}${formsEngineRoute}`);
                await verifyLivePreviewPopout(page);
            });

            test('Sequential Route: Home -> Learn -> Popout', async ({ page }) => {
                await page.goto(env.path);

                // 1. Verify on Home Route
                await verifyLivePreviewPopout(page);

                // 2. Navigate to Learn Route via hash
                await page.evaluate(route => window.location.hash = route, formsEngineRoute);

                // Wait for the new route to render and DOM to update
                await page.waitForTimeout(3000);

                // Validate popout for FormsEngine
                await verifyLivePreviewPopout(page);
            });

            test('Sequential Route: Learn -> Home -> Popout', async ({ page }) => {
                await page.goto(`${env.path}${formsEngineRoute}`);

                // 1. Verify on Learn Route
                await verifyLivePreviewPopout(page);

                // 2. Navigate back to Home Route via hash
                await page.evaluate(() => window.location.hash = '#/home');

                // Wait for the new route to render and DOM to update
                await page.waitForTimeout(3000);

                // Validate popout for Helix
                await verifyLivePreviewPopout(page);
            });
        });
    }
});
