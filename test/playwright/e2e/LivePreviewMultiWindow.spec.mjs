import { test, expect } from '@playwright/test';

// Use matrix testing over environments
const environments = [
    { name: 'Dev', path: '/apps/portal/' },
    { name: 'Dist Dev', path: '/dist/development/apps/portal/' },
    { name: 'Dist Prod', path: '/dist/production/apps/portal/' }
];

test.describe('LivePreview Multi-Window Functionality (Issue #9586)', () => {
    // Shared Worker environments inherently involve background processes that may take time to spool up
    test.setTimeout(60000);

    for (const env of environments) {
        test.describe(`Environment: ${env.name}`, () => {
            
            test('Popout LivePreview from Home Route (Helix)', async ({ page }) => {
                await page.goto(env.path);
                
                // Wait for the app to hydrate and the LivePreview to appear
                const livePreview = page.locator('.neo-code-live-preview').first();
                await expect(livePreview).toBeVisible({ timeout: 30000 });

                // Wait a moment for UI to settle
                await page.waitForTimeout(1000);

                // Switch to Preview tab (using Playwright's robust text locator)
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
                    } else if (msg.type() === 'warning') {
                        // ignore
                    } else {
                        // console.log(`[Popup Console LOG] ${msg.text()}`);
                    }
                });
                popup.on('pageerror', err => {
                    errors.push(err.message);
                    console.error(`[Popup PageError] ${err.message}`);
                });
                popup.on('requestfailed', request => {
                    // console.log(`[Popup Request Failed] ${request.url()} - ${request.failure()?.errorText || 'Unknown'}`);
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

                // Assert that no unhandled errors occurred in the popup
                expect(errors).toHaveLength(0);

                await popup.close();
            });

            test('Popout LivePreview from Learn Route (FormsEngine)', async ({ page }) => {
                await page.goto(`${env.path}#/learn/benefits/FormsEngine`);
                
                // Wait for the learning content and LivePreviews to render
                const livePreview = page.locator('.neo-code-live-preview').first();
                await expect(livePreview).toBeVisible({ timeout: 30000 });

                await page.waitForTimeout(1000);

                // Switch to Preview tab
                const previewTab = livePreview.getByText('Preview', { exact: true });
                await previewTab.waitFor({ state: 'visible', timeout: 10000 });
                await previewTab.click();

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
                    } else if (msg.type() === 'warning') {
                        // ignore
                    } else {
                        // console.log(`[Popup Console LOG] ${msg.text()}`);
                    }
                });
                popup.on('pageerror', err => {
                    errors.push(err.message);
                    console.error(`[Popup PageError] ${err.message}`);
                });
                popup.on('requestfailed', request => {
                    // console.log(`[Popup Request Failed] ${request.url()} - ${request.failure()?.errorText || 'Unknown'}`);
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
            });
        });
    }
});
