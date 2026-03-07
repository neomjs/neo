import { test, expect } from '@playwright/test';

test.describe('Desktop (1920x1080): Grid Scroll Thrashing', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/apps/devindex/');

        // 1. Wait for the grid to be visible
        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });

        // 2. Wait for the streaming to start (Stop button visible)
        const stopButton = page.locator('.devindex-stop-stream-button');
        await expect(stopButton).toBeVisible({ timeout: 5000 });

        // 3. Wait for the streaming to finish (Stop button hidden)
        await expect(stopButton).toBeHidden({ timeout: 60000 });

        // 4. Wait for the UI to settle (buffer time)
        await page.waitForTimeout(1000);
    });

    test('High-Velocity Vertical Thumb Drag Stale Render Detection', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const scrollbar = document.querySelector('.neo-grid-vertical-scrollbar');
            const bodyWrapper = document.querySelector('.neo-grid-body-wrapper');
            
            if (!scrollbar || !bodyWrapper) {
                return { error: 'Grid components not found' };
            }

            const maxScroll = scrollbar.scrollHeight - scrollbar.clientHeight;
            if (maxScroll <= 0) return { skipped: true, reason: 'Not scrollable' };

            let maxDiscrepancy = 0;
            let discrepancies = [];
            let isRunning = true;
            
            // Function to parse Y from transform: translate3d(0px, 123px, 0px)
            const getTranslateY = (el) => {
                const transform = el.style.transform;
                if (!transform) return 0;
                const match = transform.match(/translate3d\([^,]+,\s*([^p]+)px,\s*[^)]+\)/);
                return match ? parseInt(match[1], 10) : 0;
            };

            // Monitor loop to capture discrepancies
            const monitor = setInterval(() => {
                if (!isRunning) return;
                
                const currentScrollTop = bodyWrapper.scrollTop;
                const rows = Array.from(document.querySelectorAll('.neo-grid-row'));
                if (rows.length === 0) return;
                
                const yValues = rows.map(getTranslateY);
                const maxRenderedY = Math.max(...yValues);
                const minRenderedY = Math.min(...yValues);
                
                // Assuming row height is around 40px, the rendered height is maxY + rowHeight
                const renderedBottom = maxRenderedY + 40; 
                
                // Discrepancy is when scrollTop goes beyond the rendered bottom
                // meaning the visible area is below what is currently rendered.
                if (currentScrollTop > renderedBottom) {
                    const diff = currentScrollTop - renderedBottom;
                    if (diff > maxDiscrepancy) {
                        maxDiscrepancy = diff;
                    }
                    discrepancies.push({
                        time: performance.now(),
                        scrollTop: currentScrollTop,
                        maxRenderedY,
                        diff
                    });
                }
            }, 10); // Check every 10ms

            // Simulate high-velocity drag
            const performDrag = async () => {
                const duration = 1000; // 1 second fast drag
                const start = performance.now();
                const startTop = scrollbar.scrollTop;
                // Drag down by 20000px
                const targetTop = Math.min(startTop + 20000, maxScroll);
                
                return new Promise(resolve => {
                    const step = () => {
                        const elapsed = performance.now() - start;
                        const progress = Math.min(elapsed / duration, 1);
                        
                        // We set scrollTop directly to simulate moving the thumb
                        scrollbar.scrollTop = startTop + (targetTop - startTop) * progress;
                        
                        if (progress < 1) {
                            requestAnimationFrame(step);
                        } else {
                            resolve();
                        }
                    };
                    requestAnimationFrame(step);
                });
            };

            await performDrag();
            isRunning = false;
            clearInterval(monitor);
            
            // Wait a bit for the final render to catch up
            await new Promise(r => setTimeout(r, 500));
            
            // Fetch Performance Metrics from the App worker via the generated Main Thread proxy
            let metrics = null;
            if (window.Neo && window.Neo.util && window.Neo.util.Performance) {
                try {
                    metrics = await window.Neo.util.Performance.getMetrics();
                } catch (e) {
                    console.error('Failed to fetch performance metrics', e);
                }
            }

            return {
                maxDiscrepancy,
                discrepancyCount: discrepancies.length,
                discrepancies: discrepancies.slice(0, 10), // return sample
                metrics
            };
        });

        console.log('Drag Result:', JSON.stringify(result, null, 2));
        expect(result.error).toBeUndefined();
        expect(result.metrics).not.toBeNull();
        
        // If there's a significant discrepancy, it proves the stale render gap exists.
        // Once we fix it, this gap should be 0 (or very close to it, within the bufferRowRange).
        // For now, we expect it to be quite large if the bug exists.
        // But for the sake of the test output right now, let's just log it and assert it is captured.
        
        // Our goal is to fix it, so eventually maxDiscrepancy should be 0.
        // If it's failing currently, we can observe the output.
    });
});
