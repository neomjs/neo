import { test, expect } from '../../fixtures.mjs';

test.describe('Playwright Fixtures', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test('neo fixture exposes RmaHelpers', async ({ neo }) => {
        await neo.waitForReady();
        
        // The empty-viewport app creates a Viewport. Get its component ID from the DOM.
        const viewportId = await neo.page.evaluate(() => {
            return document.querySelector('.neo-viewport')?.id;
        });
        
        expect(viewportId).toBeTruthy();

        // Use the fixture to get config from the worker
        const cls = await neo.getConfig(viewportId, 'className');
        expect(cls).toContain('Viewport');
        
        // Verify fragment helper existence (no crash)
        await neo.getFragmentAnchors('non-existent');
    });
});
