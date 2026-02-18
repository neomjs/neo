import { test, expect } from '@playwright/test';
import { measureJankInBrowser } from './utils/browser-test-helpers.mjs';

const viewports = [
    { name: 'Mobile',  width: 375,  height: 667 },
    { name: 'Laptop',  width: 1366, height: 768 },
    { name: 'Desktop', width: 1920, height: 1080 }
];

viewports.forEach(({ name, width, height }) => {
    test.describe(`${name} (${width}x${height}): DevIndex Scroll Benchmarks`, () => {

        test.use({ viewport: { width, height } });

        test.beforeEach(async ({ page }) => {
            // Inject helpers
            await page.addInitScript({
                content: `
                    window.measureJankInBrowser = ${measureJankInBrowser.toString()};
                `
            });

            await page.goto('/apps/devindex/');

            // 1. Wait for the grid to be visible
            await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });

            // 2. Wait for the streaming to start (Stop button visible)
            const stopButton = page.locator('.devindex-stop-stream-button');
            await expect(stopButton).toBeVisible({ timeout: 5000 });

            console.log(`[${name}] Streaming started...`);

            // 3. Wait for the streaming to finish (Stop button hidden)
            await expect(stopButton).toBeHidden({ timeout: 60000 });

            console.log(`[${name}] Streaming finished.`);

            // 4. Wait for the UI to settle (buffer time)
            await page.waitForTimeout(1000);

            // 5. Measure DOM Complexity
            const domCounts = await page.evaluate(() => {
                const grid = document.querySelector('[role="grid"]');
                return {
                    totalNodes: document.getElementsByTagName('*').length,
                    gridNodes: grid ? grid.getElementsByTagName('*').length : 0,
                    gridRows: grid ? grid.querySelectorAll('[role="row"]').length : 0,
                    gridCells: grid ? grid.querySelectorAll('[role="gridcell"]').length : 0
                };
            });

            console.log(`[${name}] DOM Counts:`, domCounts);
            test.info().annotations.push({
                type: 'dom-counts',
                description: JSON.stringify({ viewport: name, ...domCounts })
            });
        });

        test('Horizontal Scroll', async ({ page }) => {
            const scrollResult = await page.evaluate(async () => {
                // Horizontal scroll is on the neo-grid-container
                const scrollable = document.querySelector('.neo-grid-container');
                if (!scrollable) throw new Error('Horizontal scroll container not found');

                const maxScroll = scrollable.scrollWidth - scrollable.clientWidth;
                if (maxScroll <= 0) return { skipped: true, reason: 'Not scrollable' };

                const performScroll = async () => {
                    const steps = 30;
                    const delay = 33; // ~30fps drive
                    
                    // Scroll Right
                    for (let i = 0; i <= steps; i++) {
                        scrollable.scrollLeft = (maxScroll / steps) * i;
                        await new Promise(r => setTimeout(r, delay));
                    }
                    // Scroll Left
                    for (let i = steps; i >= 0; i--) {
                        scrollable.scrollLeft = (maxScroll / steps) * i;
                        await new Promise(r => setTimeout(r, delay));
                    }
                };

                const measurementPromise = window.measureJankInBrowser(2500);
                await performScroll();
                return await measurementPromise;
            });

            console.log(`[${name}] Horizontal:`, scrollResult);
            test.info().annotations.push({
                type: 'benchmark-horizontal',
                description: JSON.stringify({ viewport: name, ...scrollResult })
            });
        });

        test('Vertical Scroll', async ({ page }) => {
            const scrollResult = await page.evaluate(async () => {
                // Vertical scroll is on the neo-grid-body-wrapper
                const scrollable = document.querySelector('.neo-grid-body-wrapper');
                if (!scrollable) throw new Error('Vertical scroll container not found');

                // Scroll 5000px down (approx 100 rows)
                const targetScroll = 5000;

                const performScroll = async () => {
                    const steps = 30;
                    const delay = 33; 
                    
                    // Scroll Down
                    for (let i = 0; i <= steps; i++) {
                        scrollable.scrollTop = (targetScroll / steps) * i;
                        await new Promise(r => setTimeout(r, delay));
                    }
                    // Scroll Up
                    for (let i = steps; i >= 0; i--) {
                        scrollable.scrollTop = (targetScroll / steps) * i;
                        await new Promise(r => setTimeout(r, delay));
                    }
                };

                const measurementPromise = window.measureJankInBrowser(2500);
                await performScroll();
                return await measurementPromise;
            });

            console.log(`[${name}] Vertical:`, scrollResult);
            test.info().annotations.push({
                type: 'benchmark-vertical',
                description: JSON.stringify({ viewport: name, ...scrollResult })
            });
        });

        test('Diagonal Drag Scroll', async ({ page }) => {
            // Setup for measurement
            const measurementPromise = page.evaluate(() => window.measureJankInBrowser(2500));

            // Get grid body bounding box to know where to drag
            const gridBody = page.locator('.neo-grid-body');
            const box = await gridBody.boundingBox();
            if (!box) throw new Error('Grid body not found');

            // Start in the center
            const startX = box.x + box.width / 2;
            const startY = box.y + box.height / 2;

            // Perform Drag interactions using Playwright Mouse API
            // This triggers the GridDragScroll addon on the Main Thread
            await page.mouse.move(startX, startY);
            await page.mouse.down();

            // Drag diagonally: Up-Left (scrolls content down-right)
            // We move the mouse slowly to generate continuous scroll events
            const steps = 20;
            const deltaX = 200;
            const deltaY = 200;

            for (let i = 0; i < steps; i++) {
                await page.mouse.move(startX - (deltaX/steps)*i, startY - (deltaY/steps)*i);
                await page.waitForTimeout(50); // wait a bit to let the scroll happen
            }
            
            // Move back
            for (let i = 0; i < steps; i++) {
                await page.mouse.move(startX - deltaX + (deltaX/steps)*i, startY - deltaY + (deltaY/steps)*i);
                await page.waitForTimeout(50);
            }

            await page.mouse.up();

            const scrollResult = await measurementPromise;

            console.log(`[${name}] Diagonal:`, scrollResult);
            test.info().annotations.push({
                type: 'benchmark-diagonal',
                description: JSON.stringify({ viewport: name, ...scrollResult })
            });
        });

    });
});
