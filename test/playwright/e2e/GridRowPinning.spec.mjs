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
        test.setTimeout(120000);
        await page.mouse.move(960, 540); // Move to center of screen
        
        const evaluationPromise = page.evaluate(async () => {
            const wrapper = document.querySelector('.neo-grid-view');
            const content = document.querySelector('.neo-grid-body');
            let telemetry = [];
            let blankFrames = 0;
            let bounces = 0;
            let isRunning = true;
            let lastFrameRows = [];
            window.__TELEMETRY = [];

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
                    
                    if (rowsBottom < wrapperRect.top || rowsTop > wrapperRect.bottom) {
                        isBlank = true;
                    } else {
                        // Detect holes/blank areas
                        let topGap = rowsTop - wrapperRect.top;
                        let bottomGap = wrapperRect.bottom - rowsBottom;
                        if (topGap > 100 || bottomGap > 100) {
                            isBlank = true;
                        }
                    }

                    if (lastFrameRows.length > 0) {
                        const trackingRow = rows.find(r => 
                            lastFrameRows.some(lastR => lastR.id === r.id && lastR.dataset.recordId === r.dataset.recordId)
                        );

                        if (trackingRow && trackingRow.id && window.__TELEMETRY && window.__TELEMETRY.length > 1) {
                            const currentTop = trackingRow.getBoundingClientRect().top;
                            const lastFrameData = window.__TELEMETRY[window.__TELEMETRY.length - 2] || {};
                            const lastTopObj = (lastFrameData.rows || []).find(r => r.id === trackingRow.id);
                            
                            if (lastTopObj) {
                                const lastTop = lastTopObj.top;
                                const lastScrollTop = lastFrameData.wrapperScrollTop || wrapper.scrollTop;
                                const scrollDelta = wrapper.scrollTop - lastScrollTop;
                                const moveDelta = currentTop - lastTop;
                                
                                let isBounce = false;
                                // If scrolling down (scrollDelta > 0), row should move up visually (moveDelta <= 0).
                                // If scrolling up (scrollDelta < 0), row should move down visually (moveDelta >= 0).
                                if (scrollDelta > 0 && moveDelta > 2) {
                                    isBounce = true;
                                } else if (scrollDelta < 0 && moveDelta < -2) {
                                    isBounce = true;
                                }

                                if (isBounce) {
                                    bounces++;
                                    const myBody = trackingRow.closest('.neo-grid-body');
                                    window.__DEBUG_BOUNCES = window.__DEBUG_BOUNCES || [];
                                    window.__DEBUG_BOUNCES.push(`Row ${trackingRow.id}: currentTop=${currentTop}, lastTop=${lastTop}, moveDelta=${moveDelta}, wrapperScrollTop=${wrapper.scrollTop}, scrollDelta=${scrollDelta}, bodyId=${myBody ? myBody.id : '?'}, offset=${myBody ? myBody.style.getPropertyValue('--grid-row-pin-offset') : '?'}, transform=${trackingRow.style.transform}`);
                                }
                            }
                        }
                    }

                    lastFrameRows = rows.map(r => ({
                        id: r.id,
                        dataset: { recordId: r.dataset.recordId },
                        top: r.getBoundingClientRect().top
                    }));
                    window.__TELEMETRY.push({ rows: lastFrameRows, wrapperScrollTop: wrapper.scrollTop });
                }

                if (isBlank) {
                    blankFrames++;
                    window.__DEBUG_BLANKS = window.__DEBUG_BLANKS || [];
                    window.__DEBUG_BLANKS.push({
                        time: performance.now(),
                        scrollTop: wrapper.scrollTop,
                        offset: content.style.getPropertyValue('--grid-row-pin-offset'),
                        rowsTop, rowsBottom,
                        wrapperTop: wrapperRect.top, wrapperBottom: wrapperRect.bottom,
                        numRows: rows.length
                    });
                }

                if (window.__RESET_METRICS) {
                    blankFrames = 0;
                    bounces = 0;
                    window.__DEBUG_BLANKS = [];
                    window.__DEBUG_BOUNCES = [];
                    window.__RESET_METRICS = false;
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

            return { telemetry, blankFrames, bounces, debugBounces: window.__DEBUG_BOUNCES, debugBlanks: window.__DEBUG_BLANKS };
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

        // --- Authentic Drag Profiles ---
        
        console.log('--- Profile 4: Authentic High-Frequency Native Drag (100px/sec thumb equivalent) ---');
        const wrappers = page.locator('.neo-grid-view');
        // If there are multiple grid views for any reason, grab the right one
        const wrapperNode = await wrappers.count() > 1 ? wrappers.nth(1) : wrappers.first();
        const box = await wrapperNode.boundingBox();
        
        // Emulate the human pointer exactly at the vertical scrollbar thumb location.
        const startX = box.x + box.width - 5;
        const startY = box.y + 40;
        
        // 1. Position mouse on the thumb
        await page.mouse.move(startX, startY);
        
        // 2. Start telemetry and press mouse down
        await page.evaluate(() => {
            window.__RESET_METRICS = true;
            return Promise.resolve();
        });
        await page.mouse.down();
        
        // 3. Perform a 2.5-second continuous smooth drag down by 500 pixels
        await page.mouse.move(startX, startY + 500, { steps: 150 });
        
        // 4. Ping-Pong back up by 300 pixels
        await page.mouse.move(startX, startY + 200, { steps: 90 });
        
        // 5. Massive snap drag down to force massive deltaY
        await page.mouse.move(startX, startY + 900, { steps: 20 });
        
        // 6. Release mouse and finish sequence
        await page.mouse.up();
        await page.waitForTimeout(500);

        console.log('--- Profile 5: OS Compositor Saturation (Raw ScrollTop Flood) ---');
        const saturationMetrics = await page.evaluate(async () => {
            const wrapper = document.querySelector('.neo-grid-view');
            if(!wrapper) return null;
            
            window.__RESET_METRICS = true;
            const box = wrapper.getBoundingClientRect();
            // Trick the GridRowScrollPinning addon into thinking the thumb is being dragged
            const evt = new MouseEvent('mousedown', {
                clientX: box.right - 5,
                clientY: box.top + 40,
                bubbles: true,
                cancelable: true
            });
            wrapper.dispatchEvent(evt);
            
            let currentScroll = wrapper.scrollTop;
            for (let i = 0; i < 90; i++) {
                currentScroll += 4000;
                wrapper.scrollTop = currentScroll;
                wrapper.dispatchEvent(new Event('scroll'));
                await new Promise(r => requestAnimationFrame(r));
            }
            
            for (let i = 0; i < 90; i++) {
                currentScroll -= 4000;
                wrapper.scrollTop = Math.max(0, currentScroll);
                wrapper.dispatchEvent(new Event('scroll'));
                await new Promise(r => requestAnimationFrame(r));
            }

            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        
        await page.waitForTimeout(1000);
        
        const { telemetry, blankFrames, bounces, debugBounces, debugBlanks } = await evaluationPromise;
        
        console.log(`Total Frames Measured: ${telemetry.length}`);
        console.log(`Total Blank Frames (White Flash): ${blankFrames}`);
        console.log(`Total Jitter Bounces Detected: ${bounces}`);
        if (debugBounces && debugBounces.length > 0) {
            console.log('--- DEBUG BOUNCES ---');
            debugBounces.forEach(b => console.log(b));
            console.log('---------------------');
        }
        if (debugBlanks && debugBlanks.length > 0) {
            console.log('--- DEBUG BLANKS ---');
            debugBlanks.forEach(b => console.log(JSON.stringify(b)));
            console.log('---------------------');
        }
        // Assertions
        expect(blankFrames).toBe(0);
        expect(bounces).toBe(0);
    });
});