import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a committed splitter resize paints no visible double-take —
 * in EITHER presentation mode.
 *
 * The guarded property is the user-visible discontinuity around the commit, and it has two
 * legitimate green shapes:
 *
 * - **A FLIP plays** (deferred presentation, or any future path that moves pixels at commit):
 *   the committed layout may sit exposed without its inverse transform for at most ~2 rAF
 *   frames. The historic red state burned ~15 frames — the marker nodes of a same-node commit
 *   survive in place with unchanged lineage, `hasPreservedMarkerSet()` could never classify
 *   the set, and the replacement-tree branch exhausted its bounded detach poll before the
 *   inverse snapped the panes back and played forward: a double-take on every committed drag,
 *   and the window in which async gBCR readers ingest scaled fiction. The landed-in-place
 *   discriminator (`hasLandedInPlace()`) closes that window.
 * - **No FLIP plays** (the live boundary preview): the pane reaches the committed width UNDER
 *   the pointer and release changes no pixels (terminal parity), so there is nothing to
 *   invert — no transform ever appearing is the ideal, PROVIDED no untransformed frame leaves
 *   the landed width again. That reversal is the double-take's visible signature, and the
 *   witness stays failing-capable through it.
 *
 * Witness method: a page-side rAF sampler records the visual (computed, transform-inclusive)
 * width of the pane left of the dragged splitter across the whole gesture. When an inverse
 * appears, the exposed-window assertion is time-based, not frame-count-based: the close-target
 * AC's "within 2 rAF frames" phrasing assumes a 60Hz cadence (~34ms); this host samples at
 * 120Hz, where a frame count would misread by 2x. Without an inverse, the reversal scan owns
 * the verdict. Out of scope by design: a hypothetical jump-cut-without-flip (motion absence)
 * belongs to the DockMotion specs, not this discontinuity witness.
 *
 * CDP page.mouse is REQUIRED: the commit must ride the trusted-input path (the app-side
 * synthetic path does not exercise the real drag lifecycle — measured in the drag-selection lane).
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test workstation/WorkstationDockFlipResizeNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --headed
 */
test.describe('Workstation — DockFlip classifies a committed splitter resize as landed-in-place', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 900, width: 1440}
    });

    test('a committed splitter resize paints no double-take: bounded inverse when a FLIP plays, no untransformed reversal when live parity needs none', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        // resizable edge zones share the orientation class — only the SPLIT container's own child
        // commits resizeSplit and plays the landed-in-place FLIP this journey measures
        const app           = await neuralLink.connectToApp('Workstation'),
              splitterDomId = await page.evaluate(() =>
                  document.querySelector('.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal')?.id);

        expect(splitterDomId, 'the main split splitter must exist in the rendered projection').toBeTruthy();

        const [rect] = await app.getDomRect(splitterDomId),
              cx     = rect.x + rect.width / 2,
              cy     = rect.y + rect.height / 2;

        // The pane immediately left of the splitter carries a `workstation-pane-<itemId>` marker
        // class; the sampler tracks its full marker class (stable across the same-node commit).
        const markerCls = await page.evaluate(({sx, sy}) => {
            const splitter = document.elementFromPoint(sx, sy),
                  panes    = [...document.querySelectorAll('[class*="workstation-pane-"]')]
                      .filter(el => el.getClientRects().length > 0);

            let best = null, bestGap = Infinity;

            panes.forEach(el => {
                const r   = el.getBoundingClientRect(),
                      cls = [...el.classList].find(c => c.startsWith('workstation-pane-')),
                      gap = splitter.getBoundingClientRect().left - r.right;

                if (cls && gap >= -2 && gap < bestGap) {
                    best    = cls;
                    bestGap = gap
                }
            });

            return best
        }, {sx: cx, sy: cy});

        expect(markerCls, 'a workstation pane marker element must sit immediately left of the splitter').toBeTruthy();

        // Sampler: one record per rAF for the whole gesture + settlement window. `transformed`
        // reads the COMPUTED transform, so it stays true from the invert through the entire
        // play (the inline style alone is released after one frame and would be racy).
        const sampling = page.evaluate(({markerCls, durationMs}) => new Promise(resolve => {
            const pane    = document.getElementsByClassName(markerCls)[0],
                  samples = [],
                  t0      = performance.now();

            (function tick() {
                const rect = pane.getBoundingClientRect();

                samples.push({
                    t          : Math.round(performance.now() - t0),
                    transformed: globalThis.getComputedStyle(pane).transform !== 'none',
                    w          : Math.round(rect.width * 10) / 10
                });

                performance.now() - t0 < durationMs
                    ? requestAnimationFrame(tick)
                    : resolve(samples)
            })()
        }), {durationMs: 3000, markerCls});

        await page.mouse.move(cx, cy);
        await page.mouse.down();
        // the Mouse sensor arms once delay AND minDistance are both satisfied — evaluated at
        // move events and once more when the delay timer re-enters with the latest coords. A
        // drive that moves and releases inside the delay window clears that timer on mouseup,
        // so no drag session ever opens, nothing commits, and nothing can flip
        await page.waitForTimeout(130);
        await page.mouse.move(cx + 40, cy, {steps: 4});
        await page.mouse.move(cx + 160, cy, {steps: 8});
        await page.mouse.up();

        const samples = await sampling,
              median  = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
              w0      = median(samples.slice(0, 10).map(s => s.w)),
              w1      = median(samples.slice(-10).map(s => s.w));

        const landedIdx  = samples.findIndex(s => Math.abs(s.w - w1) <= 2),
              inverseIdx = landedIdx < 0 ? -1 : samples.findIndex((s, i) => i >= landedIdx && s.transformed),
              // a reversal = an UNTRANSFORMED sample leaving the landed width again — the
              // double-take's visible snap-back without the motion system owning the frame
              reversalIdx = landedIdx < 0 ? -1 : samples.findIndex((s, i) => i > landedIdx && !s.transformed && Math.abs(s.w - w1) > 2),
              exposed     = landedIdx < 0 || inverseIdx < 0 ? 0 : inverseIdx - landedIdx,
              exposedMs   = landedIdx < 0 || inverseIdx < 0 ? 0 : samples[inverseIdx].t - samples[landedIdx].t;

        console.log('[flip-diag] w0:', w0, 'w1:', w1, 'landedIdx:', landedIdx, 'inverseIdx:', inverseIdx, 'reversalIdx:', reversalIdx, 'exposedFrames:', exposed, 'exposedMs:', exposedMs, 'samples:', samples.length);
        console.log('[flip-diag] window:', JSON.stringify(samples.slice(Math.max(0, (landedIdx < 0 ? 0 : landedIdx) - 3), (landedIdx < 0 ? 0 : landedIdx) + 20)));

        expect(Math.abs(w1 - w0), 'the drag must have committed a real resize (~+160px on the left pane)').toBeGreaterThan(100);

        // AC1/AC2, mode-aware. The double-take needs a DISCONTINUITY: the committed layout
        // painting displaced frames the motion system does not own.
        // - When a FLIP plays (a transform appears), the committed layout may sit exposed
        //   without its inverse for at most ~2 rAF frames — asserted as 34ms because rAF
        //   cadence is host-dependent (the red state's stage-A burn measured ~150-300ms here).
        // - Under the live boundary preview there is nothing to invert: the pane reaches the
        //   committed width UNDER THE POINTER and release changes no pixels (terminal parity),
        //   so no transform ever appearing is the ideal — provided no untransformed frame
        //   leaves the landed width again (that reversal IS the double-take's signature).
        if (inverseIdx >= 0) {
            expect(
                exposedMs,
                `the committed layout sat exposed for ${exposed} frames / ${exposedMs}ms before the inverse installed (red state: ~15 frames / 150-300ms)`
            ).toBeLessThanOrEqual(34)
        } else {
            expect(
                reversalIdx,
                'without a playing flip, no untransformed frame may leave the landed width again (the visible double-take)'
            ).toBe(-1)
        }

        // Settlement truth: after the full gesture + play, the pane converges to the committed
        // geometry and no transform lingers.
        const tail = samples.slice(-5);

        expect(tail.every(s => Math.abs(s.w - w1) <= 2), 'the pane must settle at the committed width').toBe(true);
        expect(tail.every(s => !s.transformed), 'no transform may linger after the play completes').toBe(true)
    })
})
