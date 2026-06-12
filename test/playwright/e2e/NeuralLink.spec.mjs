import { test, expect } from '../fixtures.mjs';

test.describe('Neural Link Driven Playwright Integration', () => {
    // Shared Worker environments can take time to spin up
    test.setTimeout(90000);

    test('God Mode access to internal worker state', async ({ page, neuralLink }) => {
        console.log('[NeuralLink.spec.mjs] Loading Portal App...');
        // 1. Setup - Let Playwright load the actual App UI
        await page.goto('/apps/portal/');

        // 2. Connect via Neural Link SDK (bypassing normal DOM observation)
        console.log('[NeuralLink.spec.mjs] Requesting SDK connection...');
        const app = await neuralLink.connectToApp('Portal');
        
        console.log(`[NeuralLink.spec.mjs] Connected to App Session ID: ${app.sessionId}`);

        // Get the dynamic ID of the Viewport to avoid guessing "neo-viewport-1"
        await page.waitForSelector('.neo-viewport', { timeout: 30000 });
        const viewportId = await page.evaluate(() => document.querySelector('.neo-viewport').id);

        // 3. Inspect internal structural state directly from worker memory
        const rootProps = await app.getComponent(viewportId);
        
        // Assertions against the internal truth, not the DOM snapshot
        expect(rootProps).toBeTruthy();
        expect(rootProps.ntype).toBe('viewport');
        expect(rootProps.windowId).toBeDefined();

        // 4. Test Mutations (Write Access)
        // Adjust the app internal configuration values live and instantly assert Playwright recognizes the DOM change
        await app.setProperties(viewportId, { style: { backgroundColor: 'rgb(123, 12, 123)' } });

        // Verify the reactive system pumped the virtual DOM update instantly
        await expect(page.locator('.neo-viewport').first()).toHaveCSS('background-color', 'rgb(123, 12, 123)');
    });
});
