import { test, expect } from '@playwright/test';
import { measureJankInBrowser } from './utils/browser-test-helpers.mjs';

const viewports = [
    { name: 'Mobile',  width: 375,  height: 667 },
    { name: 'Laptop',  width: 1366, height: 768 },
    { name: 'Desktop', width: 1920, height: 1080 }
];

viewports.forEach(({ name, width, height }) => {
    test.describe(`${name} (${width}x${height}): DevIndex Native Scroll Benchmarks`, () => {

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

            // 5. CRITICAL: Disconnect Neo's Mutation Observer to remove test artifact overhead
            await page.evaluate(() => {
                if (Neo.main.DomAccess.documentMutationObserver) {
                    Neo.main.DomAccess.documentMutationObserver.disconnect();
                    console.log('Neo.main.DomAccess.documentMutationObserver disconnected for benchmark.');
                } else {
                    console.warn('Neo.main.DomAccess.documentMutationObserver was not found.');
                }
            });
        });

        test('Horizontal Scroll (Native Smooth)', async ({ page }) => {
            const scrollResult = await page.evaluate(async () => {
                // Horizontal scroll is on the neo-grid-container
                const scrollable = document.querySelector('.neo-grid-container');
                if (!scrollable) throw new Error('Horizontal scroll container not found');

                const maxScroll = scrollable.scrollWidth - scrollable.clientWidth;
                if (maxScroll <= 0) return { skipped: true, reason: 'Not scrollable' };

                const performScroll = async () => {
                    // Trigger native smooth scroll
                    scrollable.scrollTo({
                        left: maxScroll,
                        behavior: 'smooth'
                    });

                    // Wait for the scroll to complete. 
                    // Since 'scrollend' event support is spotty in some environments or might be flaky in tests,
                    // we use a simple polling or fixed timeout. 
                    // A full width scroll takes time, let's give it 2.5s matching measurement window.
                    await new Promise(r => setTimeout(r, 2500));

                    // Verify scroll actually happened
                    if (scrollable.scrollLeft < 100) {
                        throw new Error(`Scroll failed! Expected scrollLeft > 100, got ${scrollable.scrollLeft}`);
                    }
                    
                    // Scroll back
                    scrollable.scrollTo({
                        left: 0,
                        behavior: 'smooth'
                    });
                    
                    await new Promise(r => setTimeout(r, 2500));
                };

                // Measure over 5 seconds (2.5s out, 2.5s back)
                // const measurementPromise = window.measureJankInBrowser(5000);
                await performScroll(); 
                return { success: true }; // await measurementPromise;
            });

            console.log(`[${name}] Native Horizontal:`, scrollResult);
            test.info().annotations.push({
                type: 'benchmark-native-horizontal',
                description: JSON.stringify({ viewport: name, ...scrollResult })
            });
        });
    });
});
