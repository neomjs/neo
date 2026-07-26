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
    filmPace = filmTake
        ? {birthAttempts: 240, curve: 0.18, dwellDelay: 700, moveDelay: 33, moveSteps: 24, showCursor: true}
        : {};

/**
 * Film mode only: pins the main window to a deterministic stage via CDP `Browser.setWindowBounds` —
 * the instance-addressed placement verb (never AppleScript: two same-bundle Chrome processes make
 * script addressing flip-flop, which is why the boot already fronts via CDP).
 *
 * The stage rule, two paths with different guarantees:
 * - DEFAULT = the window's natural landing position with the size pinned. Natural landing is
 *   HOST- AND CURSOR-CONDITIONAL, not enforced: identical across runs on the author's host
 *   ({22,22} ×4), but cascade drift has been observed (75 vs 74 across one run's two boots) and
 *   the OS can seat the window on a secondary display (a roulette landing at x=1750 = the BenQ,
 *   where the morph leg currently dies — the secondary-display finding filed from this lane).
 * - `NEO_FILM_DISPLAY_BOUNDS="left,top,width,height"` = the ENFORCED determinism path, and the
 *   take-night rule: set it explicitly to a primary-display target. Receipted green for
 *   same-display moves: 122,122,1282,880 pinned identically across two boots of the film suite.
 *   A cross-display target stays out of scope until the engine finding is answered.
 * Every landing is logged through `Browser.getWindowBounds`, never silent; a malformed override is
 * warned about and ignored — the log is the AC1 receipt, so it must name what actually ran.
 * @param {Object} page Playwright page.
 * @returns {Promise<Object>} the verified window bounds
 */
async function pinToCaptureDisplay(page) {
    const session    = await page.context().newCDPSession(page),
          {windowId} = await session.send('Browser.getWindowForTarget'),
          current    = (await session.send('Browser.getWindowBounds', {windowId})).bounds,
          raw        = process.env.NEO_FILM_DISPLAY_BOUNDS,
          parsed     = raw?.split(',').map(Number),
          valid      = parsed?.length === 4 && parsed.every(Number.isFinite),
          target     = valid
              ? {left: parsed[0], top: parsed[1], width: parsed[2], height: parsed[3]}
              : {left: current.left, top: current.top, width: current.width, height: current.height},
          {bounds}   = await session.send('Browser.setWindowBounds', {
              bounds: {...target, windowState: 'normal'}, windowId
          }).then(() => session.send('Browser.getWindowBounds', {windowId}));

    if (raw && !valid) {
        console.log(`[film-stage] NEO_FILM_DISPLAY_BOUNDS invalid, ignoring: "${raw}"`)
    }

    console.log(`[film-stage] window pinned via Browser.setWindowBounds: ${JSON.stringify(bounds)}` +
        (valid ? ' (explicit NEO_FILM_DISPLAY_BOUNDS target)' : ' (natural landing, size pinned)'));

    return bounds
}

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
        // addressing flip-flop between instances). The stage is then pinned to the capture
        // display, so two takes land in the same frame rather than whichever display the OS chose.
        if (filmTake) {
            await page.bringToFront();
            await pinToCaptureDisplay(page);
        }

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

    /**
     * @summary Captures and measures every compositor frame presented while one workspace action runs.
     *
     * CDP screencast events are the browser's consecutive presented-frame stream, not sampled
     * screenshots. Chromium does not promise an initial event for an unchanged page, so a tiny
     * compositor animation outside the measured dock crop supplies a continuous presentation clock.
     * The detached-canvas measurement crops the real dock-host rectangle and computes grayscale
     * Shannon entropy in-page, avoiding a recorder/cut dependency and any optional image decoder
     * package. A body-clear frame collapses the dense workspace's entropy while the outer shell
     * remains painted.
     * @param {Object} page Playwright page.
     * @param {Function} action Awaited workspace mutation.
     * @returns {Promise<Object>} Action result plus frame-count and entropy receipt.
     */
    async function captureWorkspaceContinuity(page, action) {
        const
            viewport = page.viewportSize(),
            box      = await page.locator('.workstation-dock-host').boundingBox(),
            session  = await page.context().newCDPSession(page),
            frames   = [],
            acks     = [];
        let resolveFirstFrame;

        expect(box, 'the dock host must expose a measurable compositor region').toBeTruthy();
        expect(viewport, 'the page must expose a fixed film viewport').toBeTruthy();

        const firstFrame = new Promise(resolve => {
            resolveFirstFrame = resolve
        });

        session.on('Page.screencastFrame', frame => {
            frames.push(frame.data);
            resolveFirstFrame?.();
            resolveFirstFrame = null;
            acks.push(session.send('Page.screencastFrameAck', {sessionId: frame.sessionId})
                .catch(error => error))
        });

        let baseline, frameTimer, result;

        try {
            await session.send('Page.enable');
            await session.send('Page.startScreencast', {
                everyNthFrame: 1,
                format       : 'jpeg',
                maxHeight    : 500,
                maxWidth     : 800,
                quality      : 70
            });
            await page.evaluate(() => {
                const marker = document.createElement('div');

                marker.id = 'workstation-compositor-frame-clock';
                Object.assign(marker.style, {
                    background   : '#fff',
                    height       : '2px',
                    left         : '0',
                    pointerEvents: 'none',
                    position     : 'fixed',
                    top          : '0',
                    width        : '2px',
                    zIndex       : '2147483647'
                });
                document.body.append(marker);

                let light = true;

                const tick = () => {
                    if (!marker.isConnected) return;

                    light = !light;
                    marker.style.background = light ? '#fff' : '#000';
                    requestAnimationFrame(tick)
                };

                requestAnimationFrame(tick)
            });
            await Promise.race([
                firstFrame,
                new Promise((_, reject) => {
                    frameTimer = setTimeout(() => reject(
                        new Error('CDP screencast emitted no compositor frame within 5 seconds')
                    ), 5000)
                })
            ]);
            clearTimeout(frameTimer);

            baseline = frames.at(-1);
            frames.length = 0;

            result = await action();

            await page.evaluate(() => new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            ))
        } finally {
            clearTimeout(frameTimer);
            await session.send('Page.stopScreencast').catch(() => {});
            await Promise.allSettled(acks);
            await session.detach().catch(() => {});
            await page.evaluate(() => {
                document.getElementById('workstation-compositor-frame-clock')?.remove()
            }).catch(() => {})
        }

        const
            actionFrames = frames,
            entropies    = await page.evaluate(async ({baseline, box, frames, viewport}) => {
                const measure = async source => {
                    const image = new Image();

                    image.src = `data:image/jpeg;base64,${source}`;
                    await image.decode();

                    const
                        scaleX = image.naturalWidth  / viewport.width,
                        scaleY = image.naturalHeight / viewport.height,
                        sx     = Math.max(0, Math.floor(box.x * scaleX)),
                        sy     = Math.max(0, Math.floor(box.y * scaleY)),
                        sw     = Math.min(image.naturalWidth - sx,  Math.ceil(box.width  * scaleX)),
                        sh     = Math.min(image.naturalHeight - sy, Math.ceil(box.height * scaleY)),
                        canvas = document.createElement('canvas'),
                        width  = 160,
                        height = Math.max(1, Math.round(width * sh / sw)),
                        counts = new Uint32Array(256);

                    canvas.width  = width;
                    canvas.height = height;

                    const context = canvas.getContext('2d', {willReadFrequently: true});

                    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

                    const pixels = context.getImageData(0, 0, width, height).data;

                    for (let index = 0; index < pixels.length; index += 4) {
                        counts[Math.round(
                            pixels[index] * 0.2126
                            + pixels[index + 1] * 0.7152
                            + pixels[index + 2] * 0.0722
                        )]++
                    }

                    let entropy = 0;

                    counts.forEach(count => {
                        if (!count) return;

                        const probability = count / (width * height);

                        entropy -= probability * Math.log2(probability)
                    });

                    return entropy
                };

                const values = [];

                for (const frame of [baseline, ...frames]) {
                    values.push(await measure(frame))
                }

                return values
            }, {
                baseline,
                box,
                frames: actionFrames,
                viewport
            });

        const
            baselineEntropy = entropies.shift(),
            minEntropy      = Math.min(...entropies),
            minFrameIndex   = entropies.indexOf(minEntropy);

        return {
            baselineEntropy,
            frameCount: actionFrames.length,
            frames    : actionFrames,
            minEntropy,
            minFrameIndex,
            result
        }
    }

    test('scene 1 — the room is alive: two runs, identical beat logs, heartbeat never resets', async ({page, neuralLink}, testInfo) => {
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
            const runSpec = () =>
                app.callMethod(wsId, 'runTourSpec', [{
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
                }]),
                continuity = filmTake ? await captureWorkspaceContinuity(page, runSpec) : null,
                spec       = continuity ? continuity.result : await runSpec();

            if (continuity) {
                console.log('[rendered-continuity]', JSON.stringify({
                    baselineEntropy: continuity.baselineEntropy,
                    frameCount     : continuity.frameCount,
                    minEntropy     : continuity.minEntropy,
                    minFrameIndex  : continuity.minFrameIndex,
                    run            : run + 1
                }));

                expect(continuity.frameCount,
                    'the resize/reset boundary must expose consecutive compositor frames').toBeGreaterThan(2);

                const entropyFloor = continuity.baselineEntropy * 0.65;

                if (continuity.minEntropy < entropyFloor) {
                    await testInfo.attach(`scene-1-run-${run + 1}-minimum-entropy-frame`, {
                        body       : Buffer.from(continuity.frames[continuity.minFrameIndex], 'base64'),
                        contentType: 'image/jpeg'
                    })
                }

                expect(continuity.minEntropy,
                    'no presented frame may clear the dense workspace body').toBeGreaterThanOrEqual(entropyFloor)
            }

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

    test('showcase beat — one drag crosses two live dropzones; cancel and commit stay deterministic', async ({page, neuralLink}) => {
        const
            cancelLogs    = [],
            commitLogs    = [],
            pageErrorRuns = [],
            gesture       = {
                itemId      : 'audit',
                sourceNodeId: 'right-top-tabs',
                dwells      : [{
                    targetNodeId : 'scale-tabs',
                    placementKind: 'edge-bottom'
                }, {
                    targetNodeId : 'right-bottom-tabs',
                    placementKind: 'tab-into'
                }]
            };

        for (let run = 0; run < 2; run++) {
            const
                ctx            = await boot({page, neuralLink}),
                {app, wsId}    = ctx,
                documentBefore = await readDocument(app, wsId),
                heartbeatStart = await readHeartbeat(app, wsId),
                paneId         = await app.callMethod(wsId, 'getPaneIdentity', ['audit']);

            pageErrorRuns.push(ctx.pageErrors);

            const cancelled = await app.callMethod(wsId, 'executeCrossZoneShowcaseStep', [{
                ...gesture,
                terminal: 'cancel'
            }, filmPace]);

            expect(cancelled.errors).toEqual([]);
            expect(cancelled.cancelled, 'Escape settles the in-window gesture as cancel').toBe(true);
            expect(cancelled.proof.documentsUnchanged, 'cancel commits no document mutation').toBe(true);
            expect(cancelled.proof.overlaysRetired, 'cancel retires geometry, menu, selection, and preview').toBe(true);
            expect(cancelled.proof.popupConfig.restored,
                'cancel restores the exact popup-conversion setting before resolving').toBe(true);
            expect(cancelled.proof.popupConfig.after).toBe(cancelled.proof.popupConfig.before);
            expect(await readDocument(app, wsId), 'fresh worker truth remains byte-identical after cancel')
                .toEqual(documentBefore);

            const committed = await app.callMethod(wsId, 'executeCrossZoneShowcaseStep', [{
                ...gesture,
                terminal: 'commit'
            }, filmPace]);

            expect(committed.errors).toEqual([]);
            expect(committed.applied, 'release commits the exact active preview').toBe(true);
            expect(committed.proof.documentMatchesPreview,
                'the committed document equals previewToOperation(preview) applied to pre-gesture truth').toBe(true);
            expect(committed.proof.overlaysRetired, 'commit retires geometry, menu, selection, and preview').toBe(true);
            expect(committed.proof.popupConfig.restored,
                'commit restores the exact popup-conversion setting before resolving').toBe(true);
            expect(committed.proof.popupConfig.after).toBe(committed.proof.popupConfig.before);
            expect(committed.proof.descriptor).toEqual({
                operation : 'addTab',
                itemId    : 'audit',
                tabsNodeId: 'right-bottom-tabs',
                index     : null
            });

            const documentAfter = await readDocument(app, wsId);

            expect(documentAfter, 'independent App Worker truth equals the executor expected document')
                .toEqual(committed.proof.expectedDocument);
            expect(documentAfter.nodes['right-top-tabs'].items,
                'the source stays alive with its sibling').toEqual(['metrics']);
            expect(documentAfter.nodes['right-bottom-tabs'].items,
                'the final center target owns the dragged item').toEqual(['commits', 'audit']);
            expect(committed.beatLog.map(({placementKind, targetNodeId}) => ({placementKind, targetNodeId})))
                .toEqual([
                    {placementKind: 'edge-bottom', targetNodeId: 'scale-tabs'},
                    {placementKind: 'tab-into',    targetNodeId: 'right-bottom-tabs'}
                ]);
            expect(await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                'the same pane instance crosses the workspace').toBe(paneId);
            expect(await readHeartbeat(app, wsId), 'living content advances through both gestures')
                .toBeGreaterThan(heartbeatStart);

            cancelLogs.push(cancelled.beatLog);
            commitLogs.push(committed.beatLog);

            if (run === 0) {
                await page.reload()
            }
        }

        expect(cancelLogs[1], 'two cancel drives produce identical semantic dwell logs').toEqual(cancelLogs[0]);
        expect(commitLogs[1], 'two commit drives produce identical semantic dwell logs').toEqual(commitLogs[0]);
        expect(pageErrorRuns.flat(), 'both live gesture-time error streams stay empty').toEqual([])
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

        // Tokens are one of TWO reachability gates, and asserting only this one is how the pane stayed
        // visibly unskinned through a green suite. Cross-window CSS needs BOTH:
        //   1. SHEET    — the owning component's generated stylesheet must LOAD in this window.
        //   2. SELECTOR — a rule in a loaded sheet must MATCH the pane that was transferred.
        // The block above proves neither: it reads variables off the viewport, which resolve from the
        // viewport's own sheet, so it passed while `Workspace.css` — carrying every pane-skin rule —
        // never entered this window at all. Re-scoping a selector cannot repair that; the FILE has to
        // move. Read the REAL transferred pane, never an injected stand-in: an injected element proves
        // a moved selector can match something, not that the hosted pane consumes it.
        const paneSkin = await popup.evaluate(() => {
            const pane = document.querySelector('.workstation-placeholder'),
                  card = document.querySelector('.workstation-resident-card'),
                  read = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;

            return {
                sheets       : [...document.styleSheets].map(sheet => sheet.href || '').filter(Boolean),
                hasWorkspace : !!document.querySelector('.workstation-workspace'),
                paneFound    : !!pane,
                cardFound    : !!card,
                cardDisplay  : read(card, 'display'),
                cardDirection: read(card, 'flex-direction'),
                cardPadding  : parseFloat(read(card, 'padding-top') || '0'),
                paneRadius   : parseFloat(read(pane, 'border-top-left-radius') || '0'),
                paneBorder   : parseFloat(read(pane, 'border-top-width') || '0')
            }
        });

        // Gate 1, stated as the boundary rather than as a file list: the vessel mounts no workspace,
        // so a rule that needs `Workspace.css` is unreachable here BY CONSTRUCTION — which is exactly
        // why pane-owned skin has to live in the sheet both boot modes load.
        expect(paneSkin.hasWorkspace, 'the popup must be a workspace-less vessel — otherwise this proves nothing about the boundary').toBe(false);
        expect(paneSkin.sheets.some(href => /workstation\/Workspace\.css/.test(href)),
            'Workspace.css must NOT load in a vessel; any pane skin left in it is unreachable no matter how it is scoped').toBe(false);

        // Gate 2, on the pane the vessel ACTUALLY hosts. Every value below was the browser default
        // before the fix, because no rule matched: `display: block`, zero padding, zero radius, no
        // border. That is what "dark but unskinned" was on the operator's frame.
        expect(paneSkin.paneFound, 'the transferred resident pane must be present to measure').toBe(true);
        expect(paneSkin.cardFound, 'the resident card is the pane content that rendered as raw stacked text').toBe(true);
        expect(paneSkin.cardDisplay, 'the card must lay out as a flex column, not as an unstyled block').toBe('flex');
        expect(paneSkin.cardDirection).toBe('column');
        expect(paneSkin.paneBorder, 'the pane must carry its own frame').toBeGreaterThan(0);
        expect(paneSkin.paneRadius, 'the pane must carry its own corner radius').toBeGreaterThan(0);

        // Responsive values are asserted as a RANGE, never byte-equal against the main window. The
        // padding is `clamp(12px, 2vw, 24px)`, so a vessel and its parent legitimately differ by
        // viewport width — pinning the number would make the suite fail on a resized window while
        // still passing on a pane with no rules at all, which is the wrong test in both directions.
        expect(paneSkin.cardPadding, 'padding must resolve inside the declared clamp, not to the unstyled 0')
            .toBeGreaterThanOrEqual(12);
        expect(paneSkin.cardPadding).toBeLessThanOrEqual(24);

        // …and the skin must keep reaching it AFTER it is open. A theme is a class an ancestor
        // carries, written by `afterSetTheme` onto the component it was set on — so a workspace-
        // local flip reaches this window and no other, and the vessel's own `body` still carries
        // whatever the Stylesheet addon put there at boot. Carrier-presence at birth proves
        // initial styling only; an open vessel stranding on its birth theme is invisible to every
        // assertion above. Flip, then read the same tokens back through the popup.
        const themeBefore = vesselTokens.cellBg;

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);

        // Poll the OBSERVABLE transition rather than sleeping a frame count. The flip crosses a
        // worker→two-main-threads boundary and commits through a vdom update the popup does not
        // publish an event for, so any fixed wait encodes a guess about someone else's scheduler:
        // two rAFs sampled BEFORE the commit and failed deterministically at this exact head.
        // Polling states the actual contract — the vessel restyles, eventually and observably.
        const readVesselTokens = () => popup.evaluate(() => {
            const viewport = document.querySelector('.workstation-viewport'),
                  styles   = viewport && getComputedStyle(viewport);

            return {
                cellBg: styles?.getPropertyValue('--grid-container-cell-background-color').trim(),
                panel : styles?.getPropertyValue('--workstation-panel').trim()
            }
        });

        await expect.poll(async () => (await readVesselTokens()).cellBg, {
            message: 'the open vessel must restyle when the workspace theme flips',
            timeout: 15000
        }).not.toBe(themeBefore);

        const flipped = await readVesselTokens();

        // Changing is not enough: it must land on the NEW palette. A vessel that merely moved off
        // its birth value — to a stock Neo default, say — would satisfy the assertion above.
        expect(flipped.cellBg, 'and it must land on the NEW palette, not merely change')
            .toBe(flipped.panel);

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-dark']);

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
