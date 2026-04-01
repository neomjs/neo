import { test, expect } from '@playwright/test';

test.describe('Grid Scroll Pinning Timeout Pause', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/apps/devindex/index.html');
        // Wait for the grid rows to stabilize
        await page.waitForSelector('.neo-grid-row', { state: 'attached' });
        await page.waitForTimeout(1000);
    });

    test('Pausing during thumb drag clears pinning state', async ({ page }) => {
        const wrapperNode = await page.locator('.neo-grid-body-wrapper:not(.neo-container)');
        const box = await wrapperNode.boundingBox();
        
        const startX = box.x + box.width - 5;
        const startY = box.y + 20;
        
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        
        // Emulate a pause of 2500ms
        await page.waitForTimeout(2500);
        
        // Emulate a massive snap drag after the pause
        // Since pinning was cleared, this should result in blank visual rows
        await page.evaluate(() => {
            window.__BLANK = false;
            const wrapper = document.querySelector('.neo-grid-body-wrapper');
            wrapper.addEventListener('scroll', () => {
                const rows = Array.from(wrapper.querySelectorAll('.neo-grid-row'));
                const wrapperRect = wrapper.getBoundingClientRect();
                const rowsTop = Math.min(...rows.map(r => r.getBoundingClientRect().top));
                const rowsBottom = Math.max(...rows.map(r => r.getBoundingClientRect().bottom));
                if (rowsBottom < wrapperRect.top || rowsTop > wrapperRect.bottom) {
                    window.__BLANK = true;
                }
            });
        });
        
        await page.mouse.move(startX, startY + 50000);
        await page.mouse.move(startX, startY + 100000);

        const isBlank = await page.evaluate(() => window.__BLANK);
        await page.mouse.up();
        expect(isBlank).toBe(true); // Expected to BE blank because pinning was cleared!
    });
});
