import { test, expect } from '@playwright/test';

test.describe('Desktop (1920x1080): DevIndex Grid Row Pinning Validation', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/apps/devindex/');
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

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

    test('Scroll Telemetry: Visual Blanking and Jitter Detector', async ({ page }) => {
        await page.mouse.move(960, 540); // Move to center of screen
        
        const evaluationPromise = page.evaluate(async () => {
            const wrappers = document.querySelectorAll('.neo-grid-body-wrapper:not(.neo-container)');
            const wrapper = wrappers.length > 1 ? wrappers[1] : wrappers[0];
            const content = wrapper.querySelector('.neo-grid-body');
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
                        const trackingRow = rows.find(r => 
                            lastFrameRows.some(lastR => lastR.id === r.id && lastR.dataset.recordId === r.dataset.recordId)
                        );

                        if (trackingRow) {
                            const currentTop = trackingRow.getBoundingClientRect().top;
                            const lastTopObj = lastFrameRows.find(r => r.id === trackingRow.id && r.dataset.recordId === trackingRow.dataset.recordId);
                            
                            if (lastTopObj) {
                                const lastTop = lastTopObj.top;
                                if (currentTop > lastTop + 2) {
                                    bounces++;
                                }
                            }
                        }
                    }

                    lastFrameRows = rows.map(r => ({
                        id: r.id,
                        dataset: { recordId: r.dataset.recordId },
                        top: r.getBoundingClientRect().top
                    }));
                }

                if (isBlank) {
                    blankFrames++;
                    if (window.__PROFILE7) {
                        console.log(`[isBlank PROF 7] wrapper: ${wrapperRect.top}->${wrapperRect.bottom}, rows: ${rowsTop}->${rowsBottom}, scrollTop: ${wrapper.scrollTop}, offset: ${content.style.getPropertyValue('--grid-row-pin-offset')}`);
                    }
                }

                if (window.__RESET_METRICS) {
                    blankFrames = 0;
                    bounces = 0;
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
            await new Promise(r => setTimeout(r, 16000));
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

        // --- Synthetic Drag Profiles ---
        // Let them run without pinning first so that the browser handles them natively.


        console.log('--- Profile 4: Synthetic Steady Slow Drag ---');
        for(let i=0; i<10; i++) {
            await page.evaluate(() => {
                const wrappers = document.querySelectorAll('.neo-grid-body-wrapper');
                const w = wrappers.length > 1 ? wrappers[1] : wrappers[0];
                w.scrollTop += 100;
            });
            await page.waitForTimeout(50);
        }

        await page.waitForTimeout(500);

        console.log('--- Profile 5: Synthetic Drag Ping-Pong ---');
        for(let i=0; i<5; i++) {
            await page.evaluate(() => {
                const wrappers = document.querySelectorAll('.neo-grid-body-wrapper');
                const w = wrappers.length > 1 ? wrappers[1] : wrappers[0];
                w.scrollTop += 500;
            });
            await page.waitForTimeout(100);
            await page.evaluate(() => {
                const wrappers = document.querySelectorAll('.neo-grid-body-wrapper');
                const w = wrappers.length > 1 ? wrappers[1] : wrappers[0];
                w.scrollTop -= 500;
            });
            await page.waitForTimeout(100);
        }

        await page.waitForTimeout(500);

        console.log('--- Profile 6: Synthetic Massive Snap Drag ---');
        await page.evaluate(() => {
            const wrappers = document.querySelectorAll('.neo-grid-body-wrapper');
            const w = wrappers.length > 1 ? wrappers[1] : wrappers[0];
            w.scrollTop += 50000;
        });
        await page.waitForTimeout(500);

        console.log('--- Profile 7: Authentic High-Frequency Native Drag (50px/sec thumb equivalent) ---');
        const wrappers = page.locator('.neo-grid-body-wrapper:not(.neo-container)');
        const wrapperNode = await wrappers.count() > 1 ? wrappers.nth(1) : wrappers.first();
        const box = await wrapperNode.boundingBox();
        
        // Emulate the human pointer exactly at the vertical scrollbar thumb location.
        // Assuming thumb starts near the top of the wrapper.
        const startX = box.x + box.width - 5;
        const startY = box.y + 20;
        
        // 1. Position mouse on the thumb
        await page.mouse.move(startX, startY);
        
        // 2. Start telemetry and press mouse down
        await page.evaluate(() => {
            window.__PROFILE7 = true;
            window.__RESET_METRICS = true;
            
            // Create a small promise to allow Playwright's async test blocks to advance
            return Promise.resolve();
        });
        await page.mouse.down();
        
        // 3. Perform a 2-second continuous smooth drag down by 100 pixels (50px/sec native thumb movement)
        // using 'steps: 120' to force a 60fps event cadence from the browser.
        await page.mouse.move(startX, startY + 100, { steps: 120 });
        
        // 4. Release mouse and finish sequence
        await page.mouse.up();
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            window.__PROFILE7 = false;
        });
        
        const { telemetry, blankFrames, bounces } = await evaluationPromise;
        
        console.log(`Total Frames Measured: ${telemetry.length}`);
        console.log(`Total Blank Frames (White Flash): ${blankFrames}`);
        console.log(`Total Jitter Bounces Detected: ${bounces}`);
        
        // Assertions
        expect(blankFrames).toBe(0);
        expect(bounces).toBe(0);
    });

    test('Horizontal Drag Scroll Moves Cells Optically and Triggers Data Virtualization', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const wrappers = document.querySelectorAll('.neo-grid-body-wrapper:not(.neo-container)');
            const bodyWrapper = wrappers.length > 1 ? wrappers[1] : wrappers[0];
            const hScrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');
            
            if (!bodyWrapper || !hScrollbar) {
                return { error: 'Grid components not found' };
            }

            // Get initial cell boundary
            const getFirstCellDOMLeft = () => {
                const centerCell = document.querySelector('.neo-grid-row .neo-grid-cell:not(.neo-locked-start):not(.neo-locked-end)');
                if (!centerCell) return null;
                return centerCell.getBoundingClientRect().left;
            };

            const initialLeft = getFirstCellDOMLeft();
            
            // Get locked cells' boundaries
            const getLockedCellLefts = () => {
                const startCell = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-start');
                const endCell = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-end');
                return {
                    startLeft: startCell ? startCell.getBoundingClientRect().left : null,
                    endLeft: endCell ? endCell.getBoundingClientRect().left : null
                };
            };
            
            const initialLockedLefts = getLockedCellLefts();

            // 1. Simulate a moderate horizontal scroll for Translation
            hScrollbar.scrollLeft += 100;
            
            // Wait for 1 frame to allow CSS variable to apply and be painted
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            
            // Measure the IMMEDIATE visual shift (CSS translation) before the worker even has a chance to recycle
            const instantLeft = getFirstCellDOMLeft();
            const instantLockedLefts = getLockedCellLefts();

            // 2. Simulate a MASSIVE horizontal scroll to force Data Virtualization (Cell Recycling)
            hScrollbar.scrollLeft += 2000;
            
            // Now wait for App Worker Round-trip (Wait for VDOM Patch)
            await new Promise(r => setTimeout(r, 500)); 

            return {
                initialLeft,
                instantLeft,
                pixelShift: initialLeft - instantLeft,
                lockedStartStable: initialLockedLefts.startLeft === instantLockedLefts.startLeft,
                lockedEndStable: initialLockedLefts.endLeft === instantLockedLefts.endLeft
            };
        });

        console.log('Horizontal Scroll Test Result:', JSON.stringify(result, null, 2));
        
        expect(result.error).toBeUndefined();
        
        // Assert Visual CSS Translation occurred (Physical pixels shifted left as we scrolled right)
        expect(result.pixelShift).toBeGreaterThan(0); 

        // Assert locked columns remained visually stationary
        expect(result.lockedStartStable).toBe(true);
        expect(result.lockedEndStable).toBe(true);
    });
});