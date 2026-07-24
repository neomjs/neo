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
 * Beats 2-4 are CONTRACTED (test.fixme) until the workstation composes the shared dashboard
 * multi-window machinery (vessel shell + workspace composition + app-owned gesture executors —
 * later commits on this branch; the underlying tear-out, conversion, arbitration, return, and
 * teardown mechanics are already shipped in src/dashboard). Each fixme names the worker-truth
 * receipts its activation must assert, so the contract is reviewable now and the legs turn on
 * without reshaping the suite.
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
test.describe('Workstation — the five-beat multi-window journey', () => {
    test.setTimeout(180000);
    // The later beats need real screen estate to the right of the main window for vessels;
    // scene 1 inherits the same stage so the recorded geometry never shifts between beats.
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 800, width: 1280}
    });

    /**
     * Boots the workstation, connects the Neural Link bridge, and wires error capture.
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, pageErrors, wsId}`
     */
    async function boot({page, neuralLink}) {
        const pageErrors = [];

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one Workspace').toBeTruthy();

        return {app, pageErrors, wsId}
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

    // ── beats 2-4: contracted legs — activate as the workstation multi-window wiring lands ──

    test.fixme('scene 2 — the tear-out: a real pointer drag births a vessel MID-GESTURE', async () => {
        // Receipts this leg must assert when activated:
        //  - the popup exists in Playwright's window set BEFORE pointer-up (waitForEvent('popup')
        //    resolves while the drag is still armed — the mid-gesture birth claim);
        //  - committed document: the torn item is ABSENT from every node's items yet PRESENT in
        //    the catalog (the vessel owns it; no leak);
        //  - the pane instance id is IDENTICAL before and after (object permanence into the hop);
        //  - heartbeat monotonic across the transition;
        //  - drive through the workspace-owned gesture executor, never raw reducer calls.
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
