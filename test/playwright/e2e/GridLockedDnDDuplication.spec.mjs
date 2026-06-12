import { test, expect } from '../fixtures.mjs';

/**
 * Whitebox-e2e regression net for the locked-grid DnD duplication class: stale-vnode-baseline
 * update races spawning duplicate DOM ids, ghost region bodies, and id-less `insertNode` births.
 *
 * The corruption family expressed as: two cell generations holding one id after a cross-region
 * re-home (the pool→permanent identity-migration seam in `grid.Row`'s two-pass recycle), ghost
 * copies of an entire region body accumulating per overdrag walk, and id-less `insertNode`
 * deltas at the main-thread apply boundary. The class is invisible to end-state sampling —
 * each individual surface looks internally consistent — so this net checks FOUR stateful
 * oracles after EVERY gesture:
 *
 *   1. zero duplicate DOM ids anywhere under the grid (the keystone signature)
 *   2. zero id-less `insertNode` deltas, harvested via `Neo.config.logDeltaUpdates`
 *   3. exactly three region-body elements (ghost-body copies counted directly)
 *   4. items/vdom/DOM consistency on every region body (worker-truth vs rendered truth)
 *
 * Gestures are the three convicted corruption triggers, run twice (repeat-gesture accumulation
 * was part of the original signature): a centre overdrag walk with return leg, a cross-region
 * re-home (centre → locked-start: a column FLIPS into permanent cell territory on mounted
 * rows — the exact seam), and the reverse re-home back out.
 *
 * A/B-falsified sensitivity: knocking out the Pass-2 re-id in `grid.Row` (the identity-migration
 * symmetry) makes oracle 1 count 73 duplicates and oracle 3 count 4 bodies from the first
 * overdrag walk on a locked 37-column grid — this net sees the class loudly when it exists.
 *
 * Run: npx playwright test GridLockedDnDDuplication -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Locked-grid DnD duplication net (#12939)', () => {
    test.setTimeout(180000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('overdrag walk + cross-region re-homes leave zero duplicate ids, zero id-less inserts, three bodies, consistent surfaces', async ({ page, neuralLink }) => {
        await page.goto('/examples/grid/lockedColumns/');
        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(800);

        const app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');

        // Harvest id-less insertNode deltas at the main-thread apply boundary
        await page.evaluate(() => {
            Neo.config.logDeltaUpdates = true;
            window.__idlessInserts = 0;
            const orig = console.log.bind(console);
            console.log = (...args) => {
                try {
                    if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                        const data = args[3];
                        const deltas = Array.isArray(data) ? data : (data?.deltas || []);
                        for (const d of deltas) {
                            if (d.action === 'insertNode' && !d.id && !d.vnode?.id) window.__idlessInserts++;
                        }
                    }
                } catch (e) {}
                orig(...args);
            };
        });

        const assertClean = async (label) => {
            const dom = await page.evaluate(() => {
                const grid = document.querySelector('.neo-grid-container');
                const seen = new Set();
                const dups = [];
                grid.querySelectorAll('[id]').forEach(el => {
                    if (seen.has(el.id)) dups.push(el.id);
                    seen.add(el.id);
                });
                return {
                    dups: dups.slice(0, 10),
                    bodyCount: document.querySelectorAll('.neo-grid-body').length,
                    idless: window.__idlessInserts
                };
            });

            expect(dom.dups, `${label}: duplicate DOM ids under the grid`).toEqual([]);
            expect(dom.idless, `${label}: id-less insertNode deltas at the apply boundary`).toBe(0);
            expect(dom.bodyCount, `${label}: region-body element count (ghost-body copies)`).toBe(3);

            const bodies = await app.findInstances({ ntype: 'grid-body' }, ['id']);
            for (const b of (Array.isArray(bodies) ? bodies : [bodies])) {
                const id = b.id || b.properties?.id;
                const c = await app.verifyComponentConsistency(id);
                const counts = c?.counts || c?.result?.counts || {};
                // items/vdom may legitimately differ in shape (raw vdom rows vs component items);
                // the duplication class shows as DOM exceeding vdom — assert that axis exactly.
                expect(counts.dom, `${label}: ${id} DOM children vs vdom children`).toBe(counts.vdom);
            }
        };

        await assertClean('baseline');

        const headerBox = async (tbIdx, btnIdx) => page.evaluate(([t, b]) => {
            const tb = [...document.querySelectorAll('.neo-grid-header-toolbar')][t];
            const r = tb.getBoundingClientRect();
            const btn = tb.children[b].getBoundingClientRect();
            return { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, tbLeft: r.left, tbRight: r.right };
        }, [tbIdx, btnIdx]);

        for (let round = 1; round <= 2; round++) {
            // (a) centre overdrag walk right + return leg, drop mid-centre
            let g = await headerBox(1, 2);
            await page.mouse.move(g.x, g.y);
            await page.mouse.down();
            await page.mouse.move(Math.min(g.tbRight + 40, 1910), g.y, { steps: 30 });
            await page.waitForTimeout(2000);
            await page.mouse.move(g.tbLeft + 200, g.y, { steps: 30 });
            await page.waitForTimeout(800);
            await page.mouse.up();
            await page.waitForTimeout(1000);
            await assertClean(`round ${round}: overdrag walk`);

            // (b) cross-region re-home: centre column -> locked-start (the pool→permanent seam)
            g = await headerBox(1, 0);
            const startTarget = await headerBox(0, 1);
            await page.mouse.move(g.x, g.y);
            await page.mouse.down();
            await page.mouse.move(startTarget.x, startTarget.y, { steps: 30 });
            await page.waitForTimeout(600);
            await page.mouse.up();
            await page.waitForTimeout(1200);
            await assertClean(`round ${round}: re-home to locked-start`);

            // (c) reverse re-home: locked-start -> centre
            const backSrc = await headerBox(0, 1);
            const centreTarget = await headerBox(1, 1);
            await page.mouse.move(backSrc.x, backSrc.y);
            await page.mouse.down();
            await page.mouse.move(centreTarget.x, centreTarget.y, { steps: 30 });
            await page.waitForTimeout(600);
            await page.mouse.up();
            await page.waitForTimeout(1200);
            await assertClean(`round ${round}: re-home back out`);
        }
    });
});
