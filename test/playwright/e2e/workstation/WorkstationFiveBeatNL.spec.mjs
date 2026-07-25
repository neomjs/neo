import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The five-beat multi-window journey witness for the flagship workstation — the
 * executable authority the release recording derives from. Recordings are derivatives; this
 * journey, with worker-truth receipts per beat, is the proof that regenerates at any head.
 *
 * The five beats:
 *
 *  1. «The room is alive»    — the dense document answers a real resizeSplit, themes flip,
 *                              and the feed heartbeat never pauses (shipped ops — live today);
 *  2. «The tear-out»         — a tab dragged past the window edge becomes a real OS popup
 *                              MID-GESTURE (the vessel exists while the pointer is still down);
 *  3. «The second window learns to dock» — a pane converts to a popup while dragging, glides
 *                              over the first popup, dock zones glow INSIDE it, and overlap
 *                              arbitration previews EXACTLY one claim;
 *  4. «Reintegration»        — the merged stack drags home, commits atomically, and the
 *                              emptied vessel closes itself AFTER the commit;
 *  5. «The signature»        — final topology plus the continuity readout: the same live
 *                              instances, heartbeats monotonic across every transition.
 *
 * Scene 2 is LIVE (the workstation composes the shipped tear-out machinery: `?popout=` vessel
 * shell + DockTearOut/DockVesselEmbodiment composition + the app-owned `executeTearOutStep`
 * executor), including the back-IN morph witness — one continuous drag out and home again,
 * zero mutation by guard. Beats 3-4 remain CONTRACTED (test.fixme) until the cross-window
 * docking wiring lands (conversion, remote zone previews, arbitration, stack return; the
 * mechanics are already shipped in src/dashboard). Each fixme names the worker-truth receipts
 * its activation must assert, so the contract stays reviewable and the legs turn on without
 * reshaping the suite.
 *
 * Determinism contract: the executable journey runs TWICE per spec run; the per-beat logs must
 * be identical across runs (structural facts only — no clock-coupled values), with a
 * zero-residue reload between takes. The film's recording pipeline replays exactly this drive
 * headed, so a surface fix re-runs the spec instead of re-recording a one-shot video.
 *
 * Claim boundary: this spec makes NO cross-platform, default-selection, or release-portability
 * claims — its receipts are macOS-headed only, and caption copy derived from it inherits the
 * same bound.
 *
 * Headed run (the filmable form):
 *   NEO_E2E_PORT=8124 npx playwright test workstation/WorkstationFiveBeatNL \
 *     -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
// Film-take mode (NEO_FILM_TAKE=1): the SAME journey drive, recorded — per-page videos land in
// the Playwright artifacts dir (main window + each vessel separately), and the gesture executors
// switch from spec pacing to the production record's D-010 film pacing (slightly-quick, curved,
// ~30fps pointer sampling). The spec's assertions stay identical: a take that cannot pass the
// witness is not a take.
// birthAttempts ceiling: gesture time + the birth gate must stay UNDER the Neural Link
// rpcTimeout (10s) or a failed birth times the bridge call out and replaces the executor's
// layered diag with a bare "Request timed out" — the widened gate would destroy its own
// receipts. 240 × 16ms ≈ 3.8s of gate + ~1s of film-paced gesture keeps the whole call
// inside the window; birth is absence-not-slowness when it fails, so a longer gate buys
// nothing but a worse error.
const
    filmTake = Boolean(process.env.NEO_FILM_TAKE),
    filmPace = filmTake ? {birthAttempts: 240, curve: 0.18, moveDelay: 33, moveSteps: 24} : {};

// `video` must live at file level (a describe-scoped use() would force a new worker).
test.use({video: filmTake ? 'on' : 'off'});

test.describe('Workstation — the five-beat multi-window journey', () => {
    test.setTimeout(180000);
    // The later beats need real screen estate to the right of the main window for vessels;
    // scene 1 inherits the same stage so the recorded geometry never shifts between beats.
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 800, width: 1280}
    });

    /**
     * Boots the workstation, connects the Neural Link bridge, and wires error capture plus the
     * eager popup-layer probe (window created / page loaded / window closed — the three facts a
     * birth failure needs, logged as they happen because a failed birth can outlive the bridge
     * call that reports it).
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, pageErrors, popupProbe, wsId}`
     */
    async function boot({page, neuralLink}) {
        const pageErrors = [],
              popupProbe = [];

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        // Passive birth-layer probe: whether the platform CREATED a popup window is a different
        // fact from whether its page loaded, which is a different fact from whether the vessel
        // joined the shared heap (the executor's own gate). A birth failure needs all three —
        // logged EAGERLY, because a failed birth can outlive the bridge call that reports it.
        page.on('popup', popup => {
            const fact = {urlAtOpen: popup.url(), loaded: false};

            popupProbe.push(fact);
            console.log(`[vessel-probe] popup created urlAtOpen=${fact.urlAtOpen}`);
            popup.once('load',  () => {fact.loaded = true; fact.urlAtLoad = popup.url(); console.log(`[vessel-probe] popup loaded ${fact.urlAtLoad}`)});
            popup.once('close', () => {fact.closed = true; console.log('[vessel-probe] popup closed')})
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        // A film take records the physical display: the headed window must be the top of the
        // z-order or the capture shows whatever application happens to cover it. CDP-level and
        // deterministic — never AppleScript (two same-bundle Chrome processes make script
        // addressing flip-flop between instances).
        filmTake && await page.bringToFront();

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one Workspace').toBeTruthy();

        return {app, pageErrors, popupProbe, wsId}
    }

    /**
     * Reads the committed dock document fresh from the worker — the third-party truth every
     * beat asserts against (never an executor's own snapshot).
     * @param {Object} app Neural Link app wrapper.
     * @param {String} wsId
     * @returns {Promise<Object>}
     */
    async function readDocument(app, wsId) {
        return (await app.getComponent(wsId, ['dockModel'])).dockModel
    }

    /**
     * Reads the monotonic feed heartbeat — the continuity witness the whole journey rides:
     * a reset would prove a reload/recreate happened where the story claims none did.
     * @param {Object} app Neural Link app wrapper.
     * @param {String} wsId
     * @returns {Promise<Number>}
     */
    async function readHeartbeat(app, wsId) {
        return (await app.getComponent(wsId, ['feedSequence'])).feedSequence
    }

    test('scene 1 — the room is alive: two runs, identical beat logs, heartbeat never resets', async ({page, neuralLink}) => {
        const logs       = [],
              pageErrors = [];

        for (let run = 0; run < 2; run++) {
            const ctx     = await boot({page, neuralLink}),
                  {app}   = ctx,
                  {wsId}  = ctx,
                  beatLog = [];

            pageErrors.push(...ctx.pageErrors);

            // ── beat 1: the dense opening stage IS the committed document ────────────────────
            const opening = await readDocument(app, wsId);

            expect(opening.nodes['scale-tabs'].items).toEqual(['scale']);
            expect(opening.nodes['heavy-tabs'].items).toHaveLength(12);
            expect(opening.items.graph.autoHidden).toBe(true);
            expect(opening.items.inspector.autoHidden).toBe(true);

            const heartbeatAtOpen = await readHeartbeat(app, wsId);

            expect(heartbeatAtOpen, 'the feed producer must already be alive at the opening shot')
                .toBeGreaterThan(0);
            beatLog.push({
                beat      : 'opening-topology',
                heavyCount: opening.nodes['heavy-tabs'].items.length,
                railed    : ['graph', 'inspector']
            });

            // ── beat 2: the room answers — a real resizeSplit through the app-owned tour
            // harness. `applyDockZoneOperation` is PURE (computes {document, errors}); the
            // commit lives on the adapter's documentChange path, and `runTourSpec` is the
            // workspace's own spec-mode front door: fresh document, reducer op, runner-owned
            // deterministic log — the same contract the film's recording pipeline replays. ──
            const spec = await app.callMethod(wsId, 'runTourSpec', [{
                schema: 'neo.tour.script.v1',
                id    : 'five-beat-scene1',
                title : 'scene 1 — the room answers',
                scenes: [{
                    id   : 's1',
                    title: 'resize',
                    steps: [{
                        type      : 'op',
                        descriptor: {operation: 'resizeSplit', splitNodeId: 'split-main', sizes: [0.52, 0.48]},
                        expect    : [{path: 'nodes.split-main.sizes.0', equals: 0.52}]
                    }, {
                        type  : 'topology-assert',
                        expect: [{path: 'nodes.split-main.sizes.1', equals: 0.48}]
                    }]
                }]
            }]);

            expect(spec.completed, 'the spec-mode replay must complete cleanly').toBe(true);
            expect(spec.errors).toEqual([]);
            expect(spec.document.nodes['split-main'].sizes).toEqual([0.52, 0.48]);

            await expect.poll(async () => (await readDocument(app, wsId)).nodes['split-main'].sizes, {
                message  : 'the committed document must carry the new proportion',
                timeout  : 10000,
                intervals: [100, 250]
            }).toEqual([0.52, 0.48]);

            beatLog.push({beat: 'resize-commit', runnerBeats: spec.log.length, sizes: [0.52, 0.48]});

            // ── beat 3: daylight changes nothing but the light — theme round-trip ────────────
            await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);

            await expect.poll(async () =>
                (await app.getComponent(wsId, ['theme'])).theme, {
                message: 'the workspace must reach the light theme',
                timeout: 10000
            }).toBe('neo-theme-neo-light');

            await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-dark']);

            await expect.poll(async () =>
                (await app.getComponent(wsId, ['theme'])).theme, {
                message: 'the workspace must return to the dark theme',
                timeout: 10000
            }).toBe('neo-theme-neo-dark');

            // The document survived both flips untouched — the skin is not the state.
            const afterThemes = await readDocument(app, wsId);

            expect(afterThemes.nodes['split-main'].sizes).toEqual([0.52, 0.48]);
            beatLog.push({beat: 'theme-roundtrip', finalTheme: 'neo-theme-neo-dark'});

            // ── continuity: the heartbeat moved FORWARD through every beat, never reset ──────
            const heartbeatAtClose = await readHeartbeat(app, wsId);

            expect(heartbeatAtClose, 'heartbeats never reset across the scene')
                .toBeGreaterThan(heartbeatAtOpen);
            beatLog.push({beat: 'continuity', monotonic: true});

            logs.push(beatLog);

            // zero-residue between takes: a fresh boot must reproduce the identical beat log
            if (run === 0) {
                await page.reload()
            }
        }

        // the determinism AC: two scripted runs replay the identical structural beat log
        expect(logs[1], 'two runs must replay the identical beat log').toEqual(logs[0]);
        expect(pageErrors, 'the journey must be error-free').toEqual([])
    });

    // ── beats 3-4: contracted legs — activate as the cross-window docking wiring lands ──

    test('scene 2 — the tear-out: a real pointer drag births a vessel MID-GESTURE', async ({page, neuralLink}) => {
        const {app, pageErrors, popupProbe, wsId} = await boot({page, neuralLink});

        const
            heartbeatBefore = await readHeartbeat(app, wsId),
            paneIdBefore    = (await app.callMethod(wsId, 'getPaneIdentity', ['metrics'])),
            popupPromise    = page.waitForEvent('popup', {timeout: 90000});

        expect(paneIdBefore, 'the pane must be live and cached before the gesture').toBeTruthy();

        // Drive through the workspace-owned gesture executor — real pointer, worker-truth proof.
        const result = await app.callMethod(wsId, 'executeTearOutStep', [
            {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
            filmPace
        ]);

        console.log('[vessel-probe][commit-leg]', JSON.stringify(popupProbe));
        expect(result.errors).toEqual([]);
        expect(result.proof.born,  'the vessel must be born MID-GESTURE (before pointer-up)').toBe(true);
        expect(result.proof.survivedProbe, 'post-birth outward moves must not reap the vessel').toBe(true);
        expect(result.applied, 'the detached release must commit detachItem').toBe(true);

        // The popup is a REAL OS window in Playwright's window set — and it stays alive: it owns
        // the pane now.
        const popup = await popupPromise;

        expect(popup.isClosed(), 'the committed vessel must remain open').toBe(false);

        // Third-party truth: the committed document read fresh from the worker.
        const documentAfter = await readDocument(app, wsId);

        expect(Object.values(documentAfter.nodes).some(node => node.items?.includes('metrics')),
            'the torn item must be ABSENT from every node').toBe(false);
        expect(documentAfter.items.metrics, 'the torn item must stay in the catalog').toBeTruthy();
        expect(documentAfter.nodes['right-top-tabs'].items, 'the sibling tab keeps the node alive')
            .toEqual(['audit']);

        // Object permanence: the SAME live instance crossed the window boundary.
        const paneIdAfter = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']);

        expect(paneIdAfter).toBe(paneIdBefore);

        // …and the vessel must STYLE the pane it hosts, not merely own it. Every assertion above
        // stayed green while the tear-out rendered as bare text on the ground colour, because the
        // grid/tab token bridge was scoped to `.workstation-workspace` — a class this window
        // deliberately never mounts. Note what this does NOT assert: the theme class was
        // present throughout that bug, so a class check on the vessel document would have passed
        // the whole time. Read the RESOLVED token instead, and compare it to the palette rather
        // than to a hex literal, so a future palette edit moves both sides together.
        const vesselTokens = await popup.evaluate(() => {
            const viewport = document.querySelector('.workstation-viewport'),
                  styles   = viewport && getComputedStyle(viewport);

            return {
                isVessel: !!document.querySelector('.workstation-popout-host'),
                cellBg  : styles?.getPropertyValue('--grid-container-cell-background-color').trim(),
                stripBg : styles?.getPropertyValue('--tab-strip-background-color').trim(),
                panel   : styles?.getPropertyValue('--workstation-panel').trim(),
                panel2  : styles?.getPropertyValue('--workstation-panel-2').trim()
            }
        });

        expect(vesselTokens.isVessel, 'the committed popup must be the pop-out vessel host').toBe(true);
        expect(vesselTokens.panel, 'the vessel must inherit the Workstation palette').toBeTruthy();
        expect(vesselTokens.cellBg, 'the vessel must bridge grid tokens onto the Workstation palette')
            .toBe(vesselTokens.panel);
        expect(vesselTokens.stripBg, 'the vessel must bridge tab tokens onto the Workstation palette')
            .toBe(vesselTokens.panel2);

        // The heartbeat moved FORWARD — nothing reloaded, nothing recreated.
        expect(await readHeartbeat(app, wsId)).toBeGreaterThan(heartbeatBefore);
        expect(pageErrors).toEqual([])
    });

    // The engine's re-entry path is whole at last: the ratio crosses (min-area coverage) AND the
    // entry fires on placeholder-less zones (the layout restore is gated on its own marker) — one
    // continuous drag out past the edge and home again, zero mutation by guard.
    test('scene 2 (morph) — out past the edge and BACK IN: the vessel retires mid-drag, zero mutation', async ({page, neuralLink}) => {
        const {app, pageErrors, popupProbe, wsId} = await boot({page, neuralLink});

        const
            heartbeatBefore = await readHeartbeat(app, wsId),
            paneIdBefore    = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            popupPromise    = page.waitForEvent('popup', {timeout: 90000});

        // One continuous drag: out (vessel born) → back IN (vessel retires, the in-window proxy
        // resumes) — the film's back-IN morph beat, witnessed from worker truth.
        const result = await app.callMethod(wsId, 'executeTearOutStep', [
            {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
            {reenter: true, ...filmPace}
        ]);

        console.log('[vessel-probe][morph-leg]', JSON.stringify(popupProbe));
        expect(result.errors).toEqual([]);
        expect(result.proof.born, 'the vessel must be born mid-gesture').toBe(true);
        expect(result.reentered, 'the vessel must retire on re-entry while the pointer is down').toBe(true);
        expect(result.proof.documentsUnchanged, 'a re-entered gesture is zero-mutation by guard').toBe(true);

        // The popup existed for real — and closed itself when the gesture came home.
        const popup = await popupPromise;

        await expect.poll(() => popup.isClosed(), {
            message: 'the retired vessel window must close',
            timeout: 15000
        }).toBe(true);

        // Third-party truth: the committed document still holds the item in its original node.
        const documentAfter = await readDocument(app, wsId);

        expect(documentAfter.nodes['right-top-tabs'].items).toEqual(['metrics', 'audit']);

        // Same instance, heartbeat monotonic — the morph never touched the living content.
        expect(await app.callMethod(wsId, 'getPaneIdentity', ['metrics'])).toBe(paneIdBefore);
        expect(await readHeartbeat(app, wsId)).toBeGreaterThan(heartbeatBefore);
        expect(pageErrors).toEqual([])
    });

    test.fixme('scene 3 — the second window learns to dock: convert-while-dragging + exactly one preview', async () => {
        // Receipts this leg must assert when activated:
        //  - a second pane converts to a vessel while its drag continues (park-not-close
        //    lifecycle: the vessel is parked during the gesture, never destroyed mid-flight);
        //  - dragged over the first popup, the TARGET popup's zones preview (remote previews
        //    rendered inside the other window);
        //  - with two overlapping candidates, EXACTLY ONE preview claims — deterministic
        //    arbitration, asserted from the claim registry, not from pixels;
        //  - release docks: two panes in one popup, both stores still streaming.
    });

    test.fixme('scene 4 — reintegration: whole stack home, commit precedes the vessel self-close', async () => {
        // Receipts this leg must assert when activated:
        //  - stack-handle drag home over main; main zones preview;
        //  - the commit lands the WHOLE stack atomically (one document transaction);
        //  - the emptied vessel closes itself AFTER the commit — and a native close resolves
        //    provisionally: the receipt is terminal only when the runtime windowId leaves the
        //    connected topology (dispatch success is never effect proof);
        //  - same-instance identity + heartbeat continuity across the return.
    });

    test.fixme('scene 5 — the signature: full journey in ONE run, two-take beat-log equality', async () => {
        // The capstone contract: all five beats consecutively, one headed run, real pointer,
        // the per-beat worker-truth asserts above, two consecutive runs with identical beat
        // logs, and the final continuity readout (feed counts monotonic end-to-end) as the
        // closing shot the film records.
    });
});
