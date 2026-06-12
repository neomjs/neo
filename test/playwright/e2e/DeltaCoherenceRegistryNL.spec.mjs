import {test, expect} from '../fixtures.mjs';

/**
 * @summary The coherence-registry falsification run against the REAL multi-threaded pipeline.
 *
 * The defect family the registry exists for (two-nodes-one-id, stale-baseline insert births)
 * only exists across the VDom-worker → Main boundary — single-threaded unit specs cover the
 * ledger structure, but falsification evidence must come from here: a live app, real workers,
 * real serialized delta batches, the registry enabled observe-mode.
 *
 * The lockedColumns example is the purpose-built whitebox fixture for exactly the producer
 * shapes the grammar census proved hardest: pooled row recycling (permanent-resident ids,
 * updateNode-shaped reuse) and the locked-region seam (the lock-flip `attributes.id` identity
 * migration rides scrolling here). ANY `Delta coherence findings` console warning during this
 * run is a false positive by definition — the engine's own output is the correctness baseline —
 * and therefore blocks the observe→throw promotion decision.
 *
 * The registry enables through the runtime-flip path on purpose (`Neo.config` assignment +
 * explicit `importDeltaInstruments()` await in the Main realm): it exercises the dynamic-import
 * wiring exactly the way a Neural-Link-driven session would enable it.
 */
test.describe('DeltaCoherenceRegistry falsification (locked grid, real pipeline)', () => {
    test.setTimeout(90000);

    test('observe-mode over pooled scrolling, seam scrolling and sorting: active ledger, zero findings', async ({page, neuralLink}) => {
        const coherenceWarnings = [];

        page.on('console', msg => {
            const text = msg.text();

            if (text.includes('Delta coherence findings')) {
                coherenceWarnings.push(text.slice(0, 500))
            }
        });

        await page.goto('/examples/grid/lockedColumns/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});
        await page.waitForTimeout(1000); // settle the initial mount traffic

        // Enable the instrument in the MAIN realm via the runtime-flip path and await its
        // dynamic load — before this point the flag is off and zero instrument bytes loaded.
        await page.evaluate(async () => {
            Neo.config.useDeltaCoherenceRegistry = true;
            await Neo.main.DeltaUpdates.importDeltaInstruments()
        });

        const baseline = await page.evaluate(() => ({
            batches: Neo.main.DeltaUpdates.coherenceRegistry.batchCount,
            loaded : !!Neo.main.DeltaUpdates.coherenceRegistry
        }));

        expect(baseline.loaded).toBe(true);

        const wheel = async (x, y, dy, dx, times) => {
            await page.mouse.move(x, y);

            for (let i = 0; i < times; i++) {
                await page.mouse.wheel(dx, dy);
                await page.waitForTimeout(120)
            }
        };

        // Vertical pooling churn: row recycling rewrites permanent-resident ids in place.
        await wheel(960, 500, 400, 0, 12);
        await wheel(960, 500, -400, 0, 6);

        // Horizontal centre scrolling across the locked-region seam (the lock-flip surface).
        await wheel(960, 500, 0, 300, 8);
        await wheel(960, 500, 0, -300, 8);

        // Sort flips: structural reorder traffic (moveNode-shaped) over live ids.
        const headers = page.locator('.neo-grid-header-button');
        const headerCount = await headers.count();

        if (headerCount > 0) {
            await headers.nth(0).click();
            await page.waitForTimeout(400);
            await headers.nth(0).click();
            await page.waitForTimeout(400);

            if (headerCount > 4) {
                await headers.nth(4).click();
                await page.waitForTimeout(400)
            }
        }

        // Post-sort pooling churn: recycled rows over the new sort order.
        await wheel(960, 500, 500, 0, 10);

        const state = await page.evaluate(() => {
            const registry = Neo.main.DeltaUpdates.coherenceRegistry;

            return {
                batches : registry.batchCount,
                live    : registry.liveSnapshot.size,
                retired : registry.retiredSnapshot.size,
                windowId: registry.windowId
            }
        });

        // Activity proof: zero findings from an idle ledger would be vacuous — the ledger must
        // have witnessed substantial real batch traffic for the falsification to mean anything.
        expect(state.batches - baseline.batches).toBeGreaterThan(10);
        expect(state.live).toBeGreaterThan(50);

        // THE falsification assertion: the engine's own output produced zero coherence findings.
        expect(coherenceWarnings).toEqual([]);

        // Whitebox engine-truth anchor: the app-worker grid survived the interaction battery
        // with consistent state (the run exercised a healthy app, not a wedged one).
        const grids = await app.queryComponent({ntype: 'grid-container'}, ['mounted']);

        expect(grids.length).toBeGreaterThan(0);
        expect(grids[0].properties?.mounted ?? grids[0].mounted).toBe(true);

        console.log(`[DeltaCoherenceRegistryNL] batches: ${state.batches - baseline.batches}, live ids: ${state.live}, retired: ${state.retired}, findings: ${coherenceWarnings.length}`)
    });
});
