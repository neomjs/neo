import { test, expect } from '@playwright/test';

test.describe('Desktop (1920x1080): BigData Grid Row Pinning Validation', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/bigData/index.html');

        // Wait for the grid to be visible
        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        
        // Wait for initial data generation
        await page.waitForTimeout(1000);
        
        // Open the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        // Increase scale to 100k rows via the ComboBox
        // The Neo.mjs ComboBox has an input hint and the actual input. We want the interactive one.
        const rowsInput = page.locator('label:has-text("Amount Rows")').locator('..').locator('.neo-textfield-input').last();
        
        // Click to open the dropdown
        await rowsInput.click({ force: true });
        
        // Wait for the list to appear and click the 100000 option
        await page.locator('.neo-list-item:has-text("100000")').click({ force: true });
        
        // Wait for the massive data generation to complete
        await page.waitForTimeout(5000);
        
        // Close the settings panel
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);
    });

    test('Scroll Telemetry: Visual Blanking and Jitter Detector', async ({ page }) => {
        await page.mouse.move(960, 540); // Move to center of screen
        
        const evaluationPromise = page.evaluate(async () => {
            const wrapper = document.querySelector('.neo-grid-body-wrapper');
            const content = document.querySelector('.neo-grid-body');
            let telemetry = [];
            let blankFrames = 0;
            let bounces = 0;
            let isRunning = true;
            let lastFrameRows = [];

            const monitor = () => {
                if (!isRunning) return;
                
                const wrapperRect = wrapper.getBoundingClientRect();
                const rows = Array.from(document.querySelectorAll('.neo-grid-row'));
                
                let isBlank = false;
                let rowsTop = 0;
                let rowsBottom = 0;

                if (rows.length === 0) {
                    isBlank = true;
                } else {
                    const rowRects = rows.map(r => r.getBoundingClientRect());
                    rowsTop = Math.min(...rowRects.map(r => r.top));
                    rowsBottom = Math.max(...rowRects.map(r => r.bottom));
                    
                    // Check if the entire block of rows is physically outside the visible wrapper bounds
                    if (rowsBottom < wrapperRect.top || rowsTop > wrapperRect.bottom) {
                        isBlank = true;
                    }

                    // Detect visual bouncing/jitter (rows moving down while we scroll down)
                    if (lastFrameRows.length > 0) {
                        // Find a row that exists in both frames to track its physical movement
                        const trackingRow = rows.find(r => 
                            lastFrameRows.some(lastR => lastR.id === r.id && lastR.dataset.recordId === r.dataset.recordId)
                        );

                        if (trackingRow) {
                            const currentTop = trackingRow.getBoundingClientRect().top;
                            const lastTopObj = lastFrameRows.find(r => r.id === trackingRow.id && r.dataset.recordId === trackingRow.dataset.recordId);
                            
                            if (lastTopObj) {
                                const lastTop = lastTopObj.top;
                                // We are scrolling down. Content should natively move UP (top decreases).
                                // If currentTop > lastTop + 2px tolerance, the content visually bounced DOWN.
                                // This happens when the pinning addon kicks in and fights the native scroll,
                                // or when it clears the transform and snaps.
                                if (currentTop > lastTop + 2) {
                                    bounces++;
                                }
                            }
                        }
                    }

                    // Save state for next frame comparison
                    lastFrameRows = rows.map(r => ({
                        id: r.id,
                        dataset: { recordId: r.dataset.recordId },
                        top: r.getBoundingClientRect().top
                    }));
                }

                if (isBlank) {
                    blankFrames++;
                }

                telemetry.push({
                    time: performance.now(),
                    scrollTop: wrapper.scrollTop,
                    transform: content.style.getPropertyValue('--grid-row-pin-offset'),
                    isBlank,
                    bounces
                });
                
                requestAnimationFrame(monitor);
            };
            
            requestAnimationFrame(monitor);

            // Let it run while playwright scrolls
            await new Promise(r => setTimeout(r, 12000));
            isRunning = false;

            return { telemetry, blankFrames, bounces };
        });

        console.log('--- Profile 1: Slow Wheel (2-3 rows) ---');
        for(let i=0; i<10; i++) {
            await page.mouse.wheel(0, 100);
            await page.waitForTimeout(100);
        }
        
        await page.waitForTimeout(500);

        console.log('--- Profile 2: Up/Down Ping-Pong ---');
        for(let i=0; i<5; i++) {
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(100);
            await page.mouse.wheel(0, -500);
            await page.waitForTimeout(100);
        }

        await page.waitForTimeout(500);

        console.log('--- Profile 3: Accelerated Wheel ---');
        let delta = 100;
        for(let i=0; i<8; i++) {
            await page.mouse.wheel(0, delta);
            delta *= 1.5;
            await page.waitForTimeout(100);
        }
        
        await page.waitForTimeout(500);

        // --- Synthetic Thumb Drag Profiles ---

        const scrollbar = await page.locator('.neo-grid-vertical-scrollbar');
        await scrollbar.evaluate(node => node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));

        console.log('--- Profile 4: Synthetic Steady Slow Drag ---');
        for(let i=0; i<10; i++) {
            await page.evaluate(() => document.querySelector('.neo-grid-body-wrapper').scrollTop += 100);
            await page.waitForTimeout(50);
        }

        await page.waitForTimeout(500);

        console.log('--- Profile 5: Synthetic Drag Ping-Pong ---');
        for(let i=0; i<5; i++) {
            await page.evaluate(() => document.querySelector('.neo-grid-body-wrapper').scrollTop += 500);
            await page.waitForTimeout(100);
            await page.evaluate(() => document.querySelector('.neo-grid-body-wrapper').scrollTop -= 500);
            await page.waitForTimeout(100);
        }

        await page.waitForTimeout(500);

        console.log('--- Profile 6: Synthetic Massive Snap Drag ---');
        await page.evaluate(() => document.querySelector('.neo-grid-body-wrapper').scrollTop += 50000);
        await page.waitForTimeout(500);

        await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
        await page.waitForTimeout(1000);
        
        const { telemetry, blankFrames, bounces } = await evaluationPromise;
        
        console.log(`Total Frames Measured: ${telemetry.length}`);
        console.log(`Total Blank Frames (White Flash): ${blankFrames}`);
        console.log(`Total Jitter Bounces Detected: ${bounces}`);
        
        // Assertions
        expect(blankFrames).toBe(0);
        expect(bounces).toBe(0);
    });
});