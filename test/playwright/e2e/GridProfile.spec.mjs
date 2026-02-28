import { test } from '@playwright/test';

const viewports = [
    { name: 'Mobile',  width: 375,  height: 667 },
    { name: 'Laptop',  width: 1366, height: 768 },
    { name: 'Desktop', width: 1920, height: 1080 }
];

viewports.forEach(({ name, width, height }) => {
    test.describe(`${name} (${width}x${height}): Grid Profiler`, () => {
        test.use({ viewport: { width, height } });

        test('Profile Main Thread during Scroll', async ({ page }) => {
            // Increase timeout for profiling
            test.setTimeout(120000);

            await page.goto('/apps/devindex/');
            await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
            
            // Wait for streaming to finish
            const stopButton = page.locator('.devindex-stop-stream-button');
            await stopButton.waitFor({ state: 'visible', timeout: 5000 });
            await stopButton.waitFor({ state: 'hidden', timeout: 60000 });
            await page.waitForTimeout(2000);

            // Setup CDP Session for Tracing
            const client = await page.context().newCDPSession(page);
            await client.send('Tracing.start', {
                traceConfig: {
                    includedCategories: [
                        'devtools.timeline', 
                        'v8.execute', 
                        'disabled-by-default-devtools.timeline',
                        'disabled-by-default-devtools.timeline.frame',
                        'toplevel',
                        'blink.console',
                        'blink.user_timing',
                        'latencyInfo',
                        'disabled-by-default-devtools.timeline.stack'
                    ]
                }
            });

            console.log(`[${name}] --- Profiling Started ---`);

            // --- SCROLL ACTION ---
            await page.evaluate(async () => {
                const scrollable = document.querySelector('.neo-grid-container');
                if (!scrollable) throw new Error('Scroll container not found');
                
                const maxScroll = scrollable.scrollWidth - scrollable.clientWidth;
                const steps = 40;
                const delay = 32; // ~30 FPS cadence

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
            });
            // ---------------------

            console.log(`[${name}] --- Profiling Ended ---`);

            const traceEvents = [];
            client.on('Tracing.dataCollected', (event) => {
                traceEvents.push(...event.value);
            });

            await new Promise(resolve => {
                client.on('Tracing.tracingComplete', resolve);
                client.send('Tracing.end');
            });

            // --- ANALYSIS ---
            // Simple bucket aggregation
            const categories = {
                'Scripting': ['RunTask', 'FunctionCall', 'EvaluateScript', 'v8.execute'],
                'Layout': ['UpdateLayoutTree', 'Layout', 'HitTest'],
                'Painting': ['UpdateLayerTree', 'Paint', 'CompositeLayers'],
                'System': []
            };

            const stats = {
                'Scripting': 0,
                'Layout': 0,
                'Painting': 0,
                'Other': 0
            };

            // Helper to find category
            const getCategory = (name) => {
                if (categories.Scripting.includes(name)) return 'Scripting';
                if (categories.Layout.includes(name)) return 'Layout';
                if (categories.Painting.includes(name)) return 'Painting';
                return 'Other';
            };

            traceEvents.forEach(e => {
                if (e.ph === 'X') { // Complete Event
                    const duration = e.dur / 1000; // microseconds to ms
                    const cat = getCategory(e.name);
                    stats[cat] += duration;
                }
            });

            console.log(`\n[${name}] --- CPU Time Breakdown (ms) ---`);
            console.table(stats);
        });
    });
});
