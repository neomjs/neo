import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the dense tour and the Sparkline offscreen pipeline survive rendering starvation.
 *
 * Sibling to WorkstationStarvedGeometryNL, which proved grid GEOMETRY converges without
 * rendering opportunities. This spec closes the remaining starved legs of the same physical
 * law: paint-gated carriers die in documents that never paint — hidden browser panes,
 * occluded or backgrounded windows — while worker timers and postMessage keep flowing.
 *
 * Two claims, one rig:
 *
 * 1. REGISTRATION LEG — Sparkline offscreen registration is message-driven end to end
 *    (`afterSetMounted` → worker timeout → `DomAccess#transferCanvasToWorker` →
 *    `transferControlToOffscreen` → direct transfer to the Canvas Worker →
 *    `registerCanvasDirect` → `canvasRegistered` ping → flag flip) and completes under full
 *    starvation for EVERY sparkline, before any tour interaction. No leg may ride rAF, RO,
 *    or paint. Instrumented classification falsified the original worker-first-paint
 *    hypothesis: registration was never the starved leg.
 *
 * 2. TOUR LEG — the dense tour completes 11 deterministic beats + 6 surface cues under the
 *    rig. Pre-repair it hung FOREVER in the `startTour` preamble: `DockFlip#play` awaited raw
 *    `requestAnimationFrame` promises (stage-A detach poll, stage-B marker poll, settle frame,
 *    release frame) whose loops were bounded in frame COUNT, not time — in a never-painting
 *    document the first await wedged every dock re-projection. The repair is two-layered:
 *    hidden documents instant-land at `play()` entry (motion is unpresentable there, and
 *    hidden pages ALSO visibility-clamp main-thread timers to >=1s/tick — even a timer dam
 *    degrades to minutes, witnessed live in the agent pane); occluded-but-visible windows
 *    keep normal timer clamps, so each frame wait races a timer dam (`#nextFrame`) there.
 *    This spec's hidden override exercises the entry discriminator; the dam owns the
 *    occluded class at the unit floor (DockFlip.spec.mjs). Live panes only ever progressed
 *    because CDP screenshots force compositor frames — tooling, not product.
 *
 * The tour is driven through the Neural Link fixture (`callMethod`), not the play button:
 * with rAF black-holed, locator actionability checks would hang by design. All settlement is
 * bounded expect.poll on state — no fixed-delay sleeps, no locator actions.
 *
 * Run: npx playwright test WorkstationStarvedTourNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation rendering starvation: sparkline registration + dense tour (#16425)', () => {
    test.setTimeout(300000);
    test.use({viewport: {width: 1280, height: 720}});

    test('every sparkline registers and the dense tour completes without a single rendering opportunity', async ({page, neuralLink}) => {
        await page.addInitScript(() => {
            // The starvation rig — identical to WorkstationStarvedGeometryNL: no native
            // deliveries, no serviced frames, a hidden document.
            window.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };

            window.__starvedFrameRequests = 0;

            window.requestAnimationFrame = () => {
                window.__starvedFrameRequests++;
                return 0
            };
            window.cancelAnimationFrame = () => {};

            Object.defineProperty(Document.prototype, 'hidden', {
                configurable: true,
                get         : () => true
            });
            Object.defineProperty(Document.prototype, 'visibilityState', {
                configurable: true,
                get         : () => 'hidden'
            });
        });

        await page.goto('/apps/workstation/index.html');

        // RIG CONTROL: the app must actually see the starved environment.
        const rig = await page.evaluate(() => ({
            hidden         : document.hidden,
            visibilityState: document.visibilityState
        }));

        expect(rig.hidden).toBe(true);
        expect(rig.visibilityState).toBe('hidden');

        // Boot leg (the ResizeObserver-addon starvation carrier owns the geometry claim —
        // WorkstationStarvedGeometryNL; here it is only the gate that the app reached a
        // living state to measure against).
        await expect.poll(
            () => page.evaluate(() => document.querySelectorAll('[role="row"]').length),
            {message: 'the row pool populates without rendering opportunities', timeout: 30000}
        ).toBeGreaterThan(20);

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsList      = Array.isArray(workspaces) ? workspaces : workspaces ? [workspaces] : [],
              workspaceId = wsList[0]?.id;

        expect(workspaceId).toBeTruthy();

        // REGISTRATION LEG: every mounted Sparkline flips offscreenRegistered with zero
        // serviced frames — measured, not delayed-for.
        const readSparklineCensus = async () => {
            const instances = await app.findInstances(
                {className: 'Neo.component.Sparkline'},
                ['id', 'mounted', 'offscreenRegistered']
            );
            const list = Array.isArray(instances) ? instances : instances ? [instances] : [];

            return {
                mounted   : list.filter(entry => entry.properties?.mounted).length,
                registered: list.filter(entry => entry.properties?.offscreenRegistered).length,
                total     : list.length
            }
        };

        await expect.poll(async () => {
            const census = await readSparklineCensus();
            return census.total > 0 && census.registered === census.total
        }, {message: 'every sparkline completes offscreen registration under starvation', timeout: 30000}).toBe(true);

        const census = await readSparklineCensus();

        expect(census.total, 'the pool renders a real sparkline population').toBeGreaterThan(10);
        expect(census.mounted, 'every sparkline is mounted').toBe(census.total);
        expect(census.registered, 'every sparkline is registered into the Canvas Worker').toBe(census.total);

        // TOUR LEG: the full dense tour settles with a complete receipt. The RPC is fired
        // without awaiting so no bridge timeout can shadow the app-side truth; the receipt
        // poll is the settle gate.
        const tourRpc = app.callMethod(workspaceId, 'startTour').catch(error => ({rpcError: String(error)}));

        await expect.poll(async () => {
            try {
                const state = await app.getComponent(workspaceId, ['lastTourReceipt']);
                return !!state?.lastTourReceipt
            } catch {
                return false
            }
        }, {message: 'the tour settles with a receipt under starvation', timeout: 200000}).toBe(true);

        await tourRpc;

        const {lastTourReceipt} = await app.getComponent(workspaceId, ['lastTourReceipt']);

        expect(lastTourReceipt.errors, 'the starved tour reports zero errors').toEqual([]);
        expect(lastTourReceipt.completed, 'the starved tour completes').toBe(true);
        expect(lastTourReceipt.log?.length, 'all 11 deterministic beats executed').toBe(11);
        expect(lastTourReceipt.cueReceipts?.length, 'all 6 surface cues settled').toBe(6);
        expect(lastTourReceipt.cueReceipts.map(entry => entry.cue.type),
            'the cue set includes the canvas-update pulse')
            .toContain('canvas-update');

        const canvasUpdate = lastTourReceipt.cueReceipts.find(entry => entry.cue.type === 'canvas-update');

        expect(canvasUpdate.receipt, 'the canvas-update cue produced an observable receipt (not the fail-closed false)')
            .toMatchObject({componentId: expect.stringContaining('sparkline')});

        // The operator-visible truth: the exact completion caption.
        const caption = await page.evaluate(() =>
            document.querySelector('.workstation-tour-caption')?.textContent ?? null);

        expect(caption).toBe('Tour complete — 11 deterministic beats and 6 surface cues settled.');

        // RIG CONTROL, closing: frames were requested but never serviced — the run really
        // happened under starvation (a rig failure must fail the spec, not green-wash it).
        const frameRequests = await page.evaluate(() => window.__starvedFrameRequests);

        expect(frameRequests).toBeGreaterThan(0)
    });
});
