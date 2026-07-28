import {createHash}                                     from 'node:crypto';
import path                                             from 'node:path';
import fs                                               from 'fs-extra';
import {test, expect}                                   from '../../fixtures.mjs';
import {assertPreviewZoneAlignment, readComponentRects} from '../utils/dockGeometry.mjs';
import {isFilmTake}                                     from '../utils/gpuIntent.mjs';

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
 * Scenes 2-5 are LIVE through app-owned real-pointer executors: tear-out + back-IN morph,
 * convert-while-dragging into another vessel, deterministic remote arbitration, whole-stack
 * return through physical topology exit, and the two-take full-journey composition that binds
 * these independently executable receipts into one deterministic beat log.
 *
 * Scene 1, the showcase witness, and Scene 5 run twice per spec with structural equality. Scene 5's
 * determinism contract is the uninterrupted full journey twice, with identical clock-free beat
 * logs and a zero-residue reload between takes. The film's recording pipeline replays the same
 * app-owned drives headed, so a surface fix re-runs the spec instead of re-recording a one-shot
 * video.
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
    filmTake    = isFilmTake(),
    journeyRuns = filmTake ? 1 : 2,
    themeDwell  = filmTake ? 3200 : 0,
    filmPace    = filmTake
        ? {birthAttempts: 240, curve: 0.18, dwellDelay: 700, moveDelay: 33, moveSteps: 24, showCursor: true}
        : {},
    filmControl = resolveFilmControl();

/**
 * @summary Resolves the optional film-only ready/go/receipt file contract, rejecting partial,
 * relative, or non-film declarations so a malformed runner cannot silently skip the gate.
 * @returns {Object|null} Absolute ready, go, and semantic-receipt paths.
 */
function resolveFilmControl() {
    const
        controls = {
            goFile     : process.env.NEO_FILM_GO_FILE,
            readyFile  : process.env.NEO_FILM_READY_FILE,
            receiptFile: process.env.NEO_FILM_RECEIPT_FILE
        },
        present = Object.values(controls).filter(Boolean);

    if (!present.length) {
        return null
    }

    if (!filmTake) {
        throw new Error('NEO_FILM_* control files require NEO_FILM_TAKE=1')
    }
    if (present.length !== Object.keys(controls).length) {
        throw new Error('NEO_FILM_READY_FILE, NEO_FILM_GO_FILE, and NEO_FILM_RECEIPT_FILE are one atomic contract')
    }

    for (const [name, value] of Object.entries(controls)) {
        if (!path.isAbsolute(value)) {
            throw new Error(`${name} must be an absolute path`)
        }

        controls[name] = path.normalize(value)
    }
    if (new Set(Object.values(controls)).size !== Object.keys(controls).length) {
        throw new Error('NEO_FILM_READY_FILE, NEO_FILM_GO_FILE, and NEO_FILM_RECEIPT_FILE must be distinct')
    }

    return controls
}

/**
 * @summary Recursively sorts object keys so semantic receipt hashes are stable across writers.
 * @param {*} value JSON-safe receipt value.
 * @returns {*} Canonicalized value with arrays preserved and object keys sorted.
 */
function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize)
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort()
            .map(key => [key, canonicalize(value[key])]))
    }

    return value
}

/**
 * @summary Serializes one semantic receipt in a stable, human-readable JSON form.
 * @param {Object} value JSON-safe receipt.
 * @returns {String} Canonical JSON with one trailing newline.
 */
function serializeReceipt(value) {
    return JSON.stringify(canonicalize(value), null, 2) + '\n'
}

/**
 * @summary Hashes a serialized receipt with SHA-256.
 * @param {String} value Serialized receipt.
 * @returns {String} Lowercase SHA-256 digest.
 */
function hashReceipt(value) {
    return createHash('sha256').update(value).digest('hex')
}

/**
 * @summary Writes a control receipt exactly once so stale runner files cannot be reused.
 * @param {String} filePath Absolute output path.
 * @param {String} value Serialized receipt.
 * @returns {Promise<void>}
 */
async function writeExclusive(filePath, value) {
    await fs.writeFile(filePath, value, {encoding: 'utf8', flag: 'wx'})
}

/**
 * @summary Publishes the verified semantic start state, then blocks the first visual beat until
 * the recorder answers with a go receipt bound to that exact ready hash.
 * @param {Object} payload Canonical start-state receipt.
 * @returns {Promise<Object|null>} Ready/go hashes, or null outside controlled film mode.
 */
async function awaitFilmGo(payload) {
    if (!filmControl) {
        return null
    }

    expect(await fs.pathExists(filmControl.goFile), 'the film go file must not predate readiness').toBe(false);
    expect(await fs.pathExists(filmControl.receiptFile),
        'the semantic receipt path must be fresh for this take').toBe(false);

    const
        readyText   = serializeReceipt(payload),
        readySha256 = hashReceipt(readyText);

    await writeExclusive(filmControl.readyFile, readyText);
    console.log(`[film-control] ready sha256=${readySha256}`);

    let goText;

    await expect.poll(async () => {
        try {
            const candidate = await fs.readFile(filmControl.goFile, 'utf8');

            JSON.parse(candidate);
            goText = candidate;

            return true
        } catch (error) {
            if (error.code === 'ENOENT' || error instanceof SyntaxError) {
                return false
            }

            throw error
        }
    }, {
        message  : 'the recorder must acknowledge this exact semantic-ready receipt',
        timeout  : 60000,
        intervals: [50, 100, 250]
    }).toBe(true);

    const
        go = JSON.parse(goText);

    expect(go).toMatchObject({
        readySha256,
        schema: 'neo.film.take17.go.v1'
    });

    const goSha256 = hashReceipt(goText);

    console.log(`[film-control] go sha256=${goSha256}`);

    return {goSha256, readySha256}
}

/**
 * Film mode only: pins the main window to a deterministic stage via CDP `Browser.setWindowBounds` —
 * the instance-addressed placement verb (never AppleScript: two same-bundle Chrome processes make
 * script addressing flip-flop, which is why the boot already fronts via CDP). CDP moves the native
 * window outside Neo's event path, so the adapter republishes only the browser-observed geometry
 * through the product's existing WindowPosition authority after the landing settles.
 *
 * The stage rule, two paths with different guarantees:
 * - DEFAULT = the window's natural landing position with the size pinned. Natural landing is
 *   HOST- AND CURSOR-CONDITIONAL, not enforced: identical across runs on the author's host
 *   ({22,22} ×4), but cascade drift has been observed (75 vs 74 across one run's two boots) and
 *   the OS can seat the window on either display.
 * - `NEO_FILM_DISPLAY_BOUNDS="left,top,width,height"` = the ENFORCED determinism path, and the
 *   take-night rule: set it explicitly to the intended capture display. After either a same- or
 *   cross-display CDP move, the adapter observes the browser's landed geometry and republishes it
 *   through WindowPosition before any journey gesture runs.
 * Every landing logs the CDP bounds, browser observation, and App-Worker manager parity; a malformed
 * override is warned about and ignored — the receipt must name what actually ran.
 * @param {Object} page Playwright page.
 * @returns {Promise<Object>} the verified native bounds plus observed Neo-window identity and geometry
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

    let observed;

    await expect.poll(async () => {
        observed = await page.evaluate(() => ({
            height: globalThis.innerHeight,
            width : globalThis.innerWidth,
            x     : globalThis.screenX,
            y     : globalThis.screenY
        }));

        return Math.max(Math.abs(observed.x - bounds.left), Math.abs(observed.y - bounds.top))
    }, {
        message  : 'the film-stage adapter must observe the requested native-window landing',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    await expect.poll(() => page.evaluate(() =>
        Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
    ), {
        message  : 'the workstation must install its ordinary window-geometry publisher',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(true);

    const neoWindowId = await page.evaluate(() => {
        globalThis.Neo.main.addon.WindowPosition.publishGeometry();

        return globalThis.Neo.worker.Manager.windowId
    });

    console.log(`[film-stage] window pinned via Browser.setWindowBounds: ${JSON.stringify(bounds)}` +
        `; observed geometry republished: ${JSON.stringify(observed)}` +
        (valid ? ' (explicit NEO_FILM_DISPLAY_BOUNDS target)' : ' (natural landing, size pinned)'));

    return {bounds, neoWindowId, observed}
}

/**
 * @summary Proves the CDP adapter's observed geometry reached the ordinary App-Worker window map.
 * @param {Object} app Neural Link app wrapper.
 * @param {Object} stageReceipt Result from {@link pinToCaptureDisplay}.
 * @returns {Promise<Object>} browser-observed and App-Worker-managed geometry
 */
async function assertStageGeometryPublished(app, stageReceipt) {
    const managers = await app.findInstances({className: 'Neo.manager.Window'}, ['id']),
          manager  = (Array.isArray(managers) ? managers[0] : managers);

    expect(manager?.id, 'the App Worker must expose its singleton window manager').toBeTruthy();

    let receipt;

    await expect.poll(async () => {
        const state    = await app.callMethod(manager.id, 'toJSON'),
              managed  = state.windows.find(item => item.id === stageReceipt.neoWindowId)?.innerRect,
              observed = stageReceipt.observed,
              delta    = managed && ['x', 'y', 'width', 'height']
                  .map(key => Math.abs(managed[key] - observed[key]));

        receipt = {managed, observed};

        return delta ? Math.max(...delta) : Infinity
    }, {
        message  : 'the App Worker must consume the browser-observed film-stage geometry',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(2);

    console.log(`[film-stage] manager.Window parity: ${JSON.stringify(receipt)}`);

    return receipt
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
     * @param {Object} [options={}]
     * @param {Boolean} [options.navigate=true] Set false only after this runner's own reload, so
     * the next worker read witnesses that exact navigation instead of hiding it behind a goto.
     * @returns {Promise<Object>} `{app, disposeObservers, pageErrors, popupProbe, stageReceipt, wsId}`
     */
    async function boot({page, neuralLink}, {navigate=true}={}) {
        const pageErrors = [],
              popupProbe = [];
        let stageReceipt;

        const
            onPageError = error => {
                let value = String(error?.stack || error?.message || error || '');

                value && value !== 'undefined' && pageErrors.push(value)
            },
            onPopup = popup => {
                const fact = {urlAtOpen: popup.url(), loaded: false};

                popupProbe.push(fact);
                console.log(`[vessel-probe] popup created urlAtOpen=${fact.urlAtOpen}`);
                popup.on('pageerror', error => {
                    let value = String(error?.stack || error?.message || error || '');

                    value && value !== 'undefined' && pageErrors.push(`[popup] ${value}`)
                });
                popup.once('load',  () => {fact.loaded = true; fact.urlAtLoad = popup.url(); console.log(`[vessel-probe] popup loaded ${fact.urlAtLoad}`)});
                popup.once('close', () => {fact.closed = true; console.log('[vessel-probe] popup closed')})
            };

        page.on('pageerror', onPageError);

        // Passive birth-layer probe: whether the platform CREATED a popup window is a different
        // fact from whether its page loaded, which is a different fact from whether the vessel
        // joined the shared heap (the executor's own gate). A birth failure needs all three —
        // logged EAGERLY, because a failed birth can outlive the bridge call that reports it.
        page.on('popup', onPopup);

        navigate && await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        // A film take records the physical display: the headed window must be the top of the
        // z-order or the capture shows whatever application happens to cover it. CDP-level and
        // deterministic — never AppleScript (two same-bundle Chrome processes make script
        // addressing flip-flop between instances). The stage is then pinned to the capture
        // display, so two takes land in the same frame rather than whichever display the OS chose.
        if (filmTake) {
            await page.bringToFront();
            stageReceipt = await pinToCaptureDisplay(page)
        }

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [],
            wsId       = workspaces[0]?.id;

        expect(workspaces, 'the connected page must own exactly one current Workspace').toHaveLength(1);
        expect(wsId, 'the App Worker must own one Workspace').toBeTruthy();
        stageReceipt && await assertStageGeometryPublished(app, stageReceipt);

        return {
            app,
            disposeObservers() {
                page.off('pageerror', onPageError);
                page.off('popup', onPopup)
            },
            pageErrors,
            popupProbe,
            stageReceipt,
            wsId
        }
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
     * @summary Creates scene 3's committed A+B vessel through two real pointer gestures.
     *
     * The first gesture tears `metrics` out into the target vessel. The second tears `commits` out
     * while still down, parks that exact popup over the first, and commits through the remote
     * participation. The panes originate in different tabs nodes so the main workspace retains a
     * concrete semantic home for the whole-stack return. Both popup handles come from Playwright's
     * real window set.
     * @param {Object} data
     * @param {Object} data.app Neural Link app wrapper.
     * @param {Object} data.page Playwright page.
     * @param {String} data.wsId Workspace component id.
     * @returns {Promise<Object>}
     */
    async function stageMergedVessel({app, page, wsId}) {
        const
            targetPopupPromise = page.waitForEvent('popup', {timeout: 90000}),
            ownerResult        = await app.callMethod(wsId, 'executeTearOutStep', [
                {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
                filmPace
            ]),
            targetPopup        = await targetPopupPromise,
            sourcePopupPromise = page.waitForEvent('popup', {timeout: 90000}),
            dockResultPromise  = app.callMethod(wsId, 'executeCrossWindowDockStep', [
                {itemId: 'commits', sourceNodeId: 'right-bottom-tabs', targetItemId: 'metrics'},
                {
                    attempts  : filmPace.birthAttempts ?? 180,
                    dwellDelay: filmPace.dwellDelay ?? 600,
                    moveDelay : filmPace.moveDelay ?? 16,
                    moveSteps : filmPace.moveSteps ?? 4,
                    showCursor: filmPace.showCursor ?? false
                }
            ]),
            targetProxy = targetPopup.locator('.workstation-vessel-dragproxy');

        await expect(targetProxy, 'exactly one Workstation proxy must render in the target popup')
            .toHaveCount(1, {timeout: 9000});

        const computedOpacity = await targetProxy.evaluate(element =>
            Number.parseFloat(getComputedStyle(element).opacity));

        expect(computedOpacity, 'the live target proxy must leave the dock preview legible').toBe(.7);

        const [dockResult, sourcePopup] = await Promise.all([dockResultPromise, sourcePopupPromise]);

        dockResult.proof?.remoteSnapshot?.targetProxy &&
            (dockResult.proof.remoteSnapshot.targetProxy.computedOpacity = computedOpacity);

        await expect.poll(() => sourcePopup.isClosed(), {
            message: 'the converted source vessel must retire after its remote commit',
            timeout: 15000
        }).toBe(true);

        return {dockResult, ownerResult, sourcePopup, targetPopup}
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

    test('scene 1 — the room is alive: resize and theme preserve continuity', async ({page, neuralLink}, testInfo) => {
        const logs       = [],
              pageErrors = [];

        for (let run = 0; run < journeyRuns; run++) {
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

            // The poll above is the correctness gate. This fixed wait is presentation pacing only:
            // B-03's light-theme beat must remain readable for at least three seconds on film.
            themeDwell && await page.waitForTimeout(themeDwell);

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
            if (run < journeyRuns - 1) {
                await page.reload()
            }

            ctx.disposeObservers()
        }

        // The normal proof profile retains its two-run equality contract. Film mode records one
        // presentation pass and therefore never puts the determinism reload seam on camera.
        if (!filmTake) {
            expect(logs[1], 'two runs must replay the identical beat log').toEqual(logs[0])
        }

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

        for (let run = 0; run < journeyRuns; run++) {
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

            if (run < journeyRuns - 1) {
                await page.reload()
            }

            ctx.disposeObservers()
        }

        if (!filmTake) {
            expect(cancelLogs[1], 'two cancel drives produce identical semantic dwell logs').toEqual(cancelLogs[0]);
            expect(commitLogs[1], 'two commit drives produce identical semantic dwell logs').toEqual(commitLogs[0])
        }

        expect(pageErrorRuns.flat(), 'all live gesture-time error streams stay empty').toEqual([])
    });

    /**
     * The showcase beat's dwell previews must ALIGN with their target zones — the
     * systematic rect layer's second consumer. Dwell detection rides the preview contract
     * object (worker truth); the painted rect is read by component DOM id (never class
     * selectors); the gesture ends in cancel, so the document is untouched.
     */
    test('showcase dwell previews align with their zones — component-id rect truth', async ({page, neuralLink}) => {
        const
            rectPace    = {birthAttempts: 240, curve: 0.18, dwellDelay: 900, moveDelay: 33, moveSteps: 24, showCursor: false},
            {app, wsId} = await boot({page, neuralLink}),
            readId      = result => result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null),
            zoneIds     = {};

        for (const nodeId of ['scale-tabs', 'right-bottom-tabs']) {
            zoneIds[nodeId] = readId(await app.queryComponent({dockNodeId: nodeId}, ['id']));

            expect(zoneIds[nodeId], `zone ${nodeId} must resolve a component id`).toBeTruthy()
        }

        const dockHostId = readId(await app.queryComponent({reference: 'dock-host'}, ['id'])),
              previewId  = readId(await app.queryComponent({reference: 'dock-preview'}, ['id']));

        expect(dockHostId, 'the dock host must resolve').toBeTruthy();
        expect(previewId,  'the dock preview overlay must resolve').toBeTruthy();

        const readPaintedPreview = async () => {
            const [state, host] = await Promise.all([
                    app.getComponent(previewId, ['dockPreview']),
                    readComponentRects(app, [dockHostId]).then(rects => rects[dockHostId])
                ]),
                dockPreview = state?.properties?.dockPreview ?? state?.dockPreview;

            if (!dockPreview?.target?.nodeId) return null;

            const style = await page.evaluate(id => {
                const el = document.getElementById(id)?.firstElementChild;

                return el?.style && {height: el.style.height, left: el.style.left, top: el.style.top, width: el.style.width}
            }, previewId);

            if (!style || !Number.parseFloat(style.width)) return null;

            const num  = value => Number.parseFloat(value) || 0,
                  left = host.left + num(style.left),
                  top  = host.top  + num(style.top);

            return {
                dockPreview,
                rect: {
                    bottom: top + num(style.height),
                    height: num(style.height),
                    left,
                    right : left + num(style.width),
                    top,
                    width : num(style.width)
                }
            }
        };

        const stepPromise = app.callMethod(wsId, 'executeCrossZoneShowcaseStep', [{
            dwells: [
                {placementKind: 'edge-bottom', targetNodeId: 'scale-tabs'},
                {placementKind: 'tab-into',    targetNodeId: 'right-bottom-tabs'}
            ],
            itemId      : 'audit',
            sourceNodeId: 'right-top-tabs',
            terminal    : 'cancel'
        }, rectPace]);

        // Dwell 1 — the edge band must hug the scale zone's bottom edge inside its budget
        await expect.poll(readPaintedPreview, {intervals: [50, 100, 200], timeout: 15000})
            .toMatchObject({dockPreview: {placement: {kind: 'edge-bottom'}, target: {nodeId: 'scale-tabs'}}});

        const dwell1 = await readPaintedPreview();

        await assertPreviewZoneAlignment(app, {kind: 'edge-bottom', previewRect: dwell1.rect, zoneId: zoneIds['scale-tabs']});

        // Dwell 2 — the tab-into preview must equal the right-bottom zone rect
        await expect.poll(readPaintedPreview, {intervals: [50, 100, 200], timeout: 15000})
            .toMatchObject({dockPreview: {placement: {kind: 'tab-into'}, target: {nodeId: 'right-bottom-tabs'}}});

        const dwell2 = await readPaintedPreview();

        await assertPreviewZoneAlignment(app, {kind: 'tab-into', previewRect: dwell2.rect, zoneId: zoneIds['right-bottom-tabs']});

        const result = await stepPromise;

        expect(result.cancelled, 'the gesture ends as a clean cancel — zero document mutation').toBe(true)
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

    test('scene 3 — the second window learns to dock: convert-while-dragging + exactly one preview', async ({page, neuralLink}) => {
        const {app, pageErrors, wsId} = await boot({page, neuralLink});
        const
            heartbeatBefore                        = await readHeartbeat(app, wsId),
            metricsBefore                          = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            commitsBefore                          = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
            {dockResult, ownerResult, targetPopup} = await stageMergedVessel({app, page, wsId});

        expect(ownerResult.errors).toEqual([]);
        expect(ownerResult.applied, 'pane A must commit into the first real vessel').toBe(true);
        expect(
            dockResult.errors,
            `cross-window dock receipt: ${JSON.stringify(dockResult.proof ?? null)}`
        ).toEqual([]);
        expect(dockResult.applied, 'pane B must commit into A through the remote target').toBe(true);

        const snapshot = dockResult.proof.remoteSnapshot;

        expect(snapshot).toMatchObject({
            claimCount           : 1,
            converted            : true,
            engaged              : true,
            parkedItemId         : 'commits',
            sourceVesselConnected: true,
            targetProxy          : {
                cls: expect.arrayContaining([
                    'neo-dock-dragproxy',
                    'workstation-vessel-dragproxy',
                    'neo-theme-neo-dark'
                ]),
                computedOpacity: .7,
                itemId         : 'commits',
                ownsPane       : true,
                settled        : true,
                visible        : true
            },
            targetWorkspaceId: 'workstation-vessel:metrics',
            winnerStableId   : 'workstation-vessel:metrics'
        });
        expect(snapshot.sourceVesselWindowId, 'the parked physical source vessel must still exist pre-mouseup')
            .toBeTruthy();
        expect(snapshot.targetProxy.sourceWindowId, 'the proxy must reserve that exact parked source popup')
            .toBe(snapshot.sourceVesselWindowId);
        expect(snapshot.targetProxy.targetWindowId, 'the visible proxy must belong to the target popup')
            .toBeTruthy();
        expect(snapshot.preview.previewId, 'the target must publish one semantic preview').toBeTruthy();
        expect(snapshot.rendered.previewId, 'that same preview must paint inside the target popup')
            .toBe(snapshot.preview.previewId);
        expect(snapshot.preview.target.nodeId).toBe('workstation-vessel-tabs:metrics');

        const targetTabs = dockResult.proof.targetDocument.nodes['workstation-vessel-tabs:metrics'];

        expect(targetTabs.items, 'the first accepted drop must compose A then B').toEqual(['metrics', 'commits']);
        expect(dockResult.proof.transfer).toMatchObject({
            applied          : true,
            reconciled       : true,
            sourceWorkspaceId: 'workstation-main',
            targetWorkspaceId: 'workstation-vessel:metrics',
            descriptor       : {operation: 'transferItem', itemId: 'commits'}
        });
        expect(dockResult.proof.sourceVesselRetired, 'B must retire only after the target commit').toBe(true);
        expect(targetPopup.isClosed(), 'the merged A+B target vessel must remain open').toBe(false);

        expect(await app.callMethod(wsId, 'getPaneIdentity', ['metrics'])).toBe(metricsBefore);
        expect(await app.callMethod(wsId, 'getPaneIdentity', ['commits'])).toBe(commitsBefore);
        expect(await readHeartbeat(app, wsId)).toBeGreaterThan(heartbeatBefore);
        expect(pageErrors).toEqual([])
    });

    test('scene 4 — reintegration: whole stack home, commit precedes the vessel self-close', async ({page, neuralLink}) => {
        const {app, pageErrors, wsId} = await boot({page, neuralLink});
        const
            heartbeatBefore                        = await readHeartbeat(app, wsId),
            metricsBefore                          = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            commitsBefore                          = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
            {dockResult, ownerResult, targetPopup} = await stageMergedVessel({app, page, wsId});

        expect(ownerResult.applied).toBe(true);
        expect(dockResult.applied).toBe(true);

        const result = await app.callMethod(wsId, 'executeStackReturnStep', [
            {ownerItemId: 'metrics'},
            {
                attempts  : filmPace.birthAttempts ?? 180,
                moveDelay : filmPace.moveDelay ?? 16,
                showCursor: filmPace.showCursor ?? false
            }
        ]);

        expect(result.errors, JSON.stringify({
            closeReceipt    : result.proof?.closeReceipt,
            phaseOrder      : result.proof?.phaseOrder,
            remoteSnapshot  : result.proof?.remoteSnapshot,
            sourceItemIds   : result.proof?.sourceItemIds,
            sourceWindowGone: result.proof?.sourceWindowGone,
            transfer        : result.proof?.transfer
        })).toEqual([]);
        expect(result.applied, 'the grouped pointer gesture must settle through physical topology exit').toBe(true);
        expect(result.proof.remoteSnapshot).toMatchObject({
            claimCount       : 1,
            engaged          : true,
            targetWorkspaceId: 'workstation-main',
            winnerStableId   : 'workstation-main'
        });
        expect(result.proof.remoteSnapshot.rendered.previewId)
            .toBe(result.proof.remoteSnapshot.preview.previewId);
        expect(result.proof.transfer).toMatchObject({
            applied          : true,
            closeRequested   : true,
            descriptor       : {operation: 'transferNode'},
            reconciled       : true,
            sourceWorkspaceId: 'workstation-vessel:metrics',
            targetWorkspaceId: 'workstation-main',
            topologyExited   : true
        });
        expect(result.proof.phaseOrder).toEqual([
            'documents-adopted',
            'main-projected',
            'close-dispatched',
            'topology-exited'
        ]);
        expect(result.proof.sourceItemIds).toEqual(['metrics', 'commits']);
        expect(result.proof.sourceWindowGone, 'close acknowledgement alone is not topology exit').toBe(true);
        await expect.poll(() => targetPopup.isClosed(), {
            message: 'the empty committed vessel must physically close after main adoption',
            timeout: 15000
        }).toBe(true);

        const documentAfter = await readDocument(app, wsId);

        expect(documentAfter.nodes['right-top-tabs'].items).toEqual(['audit', 'metrics', 'commits']);
        expect(await app.callMethod(wsId, 'getPaneIdentity', ['metrics'])).toBe(metricsBefore);
        expect(await app.callMethod(wsId, 'getPaneIdentity', ['commits'])).toBe(commitsBefore);
        expect(await readHeartbeat(app, wsId)).toBeGreaterThan(heartbeatBefore);
        expect(pageErrors).toEqual([])
    });

    test('scene 5 — the signature: full journey in ONE run, two-take beat-log equality',
        async ({page, neuralLink}, testInfo) => {
        const
            controlReceipts  = [],
            logs             = [],
            openingDocuments = [],
            pageErrorRuns    = [];

        for (let run = 0; run < journeyRuns; run++) {
            const
                ctx              = await boot({page, neuralLink}, {navigate: run === 0}),
                {app, wsId}      = ctx,
                beatLog          = [],
                opening          = await readDocument(app, wsId),
                heartbeatAtOpen  = await readHeartbeat(app, wsId),
                metricsBefore    = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
                commitsBefore    = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
                livePopupsAtOpen = page.context().pages()
                    .filter(candidate => candidate !== page && !candidate.isClosed());

            pageErrorRuns.push(ctx.pageErrors);

            expect(livePopupsAtOpen, 'each take must start without a surviving vessel').toEqual([]);
            expect(opening.nodes['scale-tabs'].items).toEqual(['scale']);
            expect(opening.nodes['heavy-tabs'].items).toHaveLength(12);
            expect(opening.nodes['right-top-tabs'].items).toEqual(['metrics', 'audit']);
            expect(opening.nodes['right-bottom-tabs'].items).toEqual(['commits']);
            expect(opening.items.graph.autoHidden).toBe(true);
            expect(opening.items.inspector.autoHidden).toBe(true);
            expect(heartbeatAtOpen, 'the feed producer must be alive before the uninterrupted journey')
                .toBeGreaterThan(0);
            expect(metricsBefore, 'metrics must be one live pane before it crosses a window').toBeTruthy();
            expect(commitsBefore, 'commits must be one live pane before it crosses a window').toBeTruthy();

            if (openingDocuments.length) {
                expect(opening, 'reload must restore pristine worker truth before the second take')
                    .toEqual(openingDocuments[0])
            } else {
                openingDocuments.push(opening)
            }

            const controlReceipt = await awaitFilmGo({
                opening: {
                    commitsIdentity     : commitsBefore,
                    dockDocumentSha256  : hashReceipt(serializeReceipt(opening)),
                    heartbeatPositive   : heartbeatAtOpen > 0,
                    heavyCount          : opening.nodes['heavy-tabs'].items.length,
                    metricsIdentity     : metricsBefore,
                    railed              : ['graph', 'inspector'],
                    rightBottomItems    : opening.nodes['right-bottom-tabs'].items,
                    rightTopItems       : opening.nodes['right-top-tabs'].items,
                    scaleItems          : opening.nodes['scale-tabs'].items,
                    survivingVesselCount: livePopupsAtOpen.length
                },
                run          : run + 1,
                schema       : 'neo.film.take17.ready.v1',
                stageGeometry: ctx.stageReceipt ?? null
            });

            controlReceipt && controlReceipts.push(controlReceipt);

            const roomSpec = await app.callMethod(wsId, 'runTourSpec', [{
                schema: 'neo.tour.script.v1',
                id    : 'five-beat-signature-room',
                title : 'scene 5 — the room is alive',
                scenes: [{
                    id   : 'room-alive',
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

            expect(roomSpec.completed, 'the opening resize must commit through the app-owned tour runner')
                .toBe(true);
            expect(roomSpec.errors).toEqual([]);
            expect(roomSpec.document.nodes['split-main'].sizes).toEqual([0.52, 0.48]);

            await expect.poll(async () => (await readDocument(app, wsId)).nodes['split-main'].sizes, {
                message  : 'the committed document must carry the opening resize',
                timeout  : 10000,
                intervals: [100, 250]
            }).toEqual([0.52, 0.48]);

            await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);

            await expect.poll(async () =>
                (await app.getComponent(wsId, ['theme'])).theme, {
                message: 'the uninterrupted journey must reach the light theme',
                timeout: 10000
            }).toBe('neo-theme-neo-light');

            themeDwell && await page.waitForTimeout(themeDwell);

            await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-dark']);

            await expect.poll(async () =>
                (await app.getComponent(wsId, ['theme'])).theme, {
                message: 'the uninterrupted journey must return to the dark theme',
                timeout: 10000
            }).toBe('neo-theme-neo-dark');

            beatLog.push({
                beat      : 'room-alive',
                finalTheme: 'neo-theme-neo-dark',
                heavyCount: opening.nodes['heavy-tabs'].items.length,
                railed    : ['graph', 'inspector'],
                sizes     : [0.52, 0.48]
            });

            const
                {dockResult, ownerResult, sourcePopup, targetPopup} =
                    await stageMergedVessel({app, page, wsId});

            expect(ownerResult.errors).toEqual([]);
            expect(ownerResult.proof.born, 'the first vessel must exist before pointer-up').toBe(true);
            expect(ownerResult.proof.survivedProbe,
                'the first vessel must survive post-birth pointer movement').toBe(true);
            expect(ownerResult.applied, 'metrics must commit into its real vessel').toBe(true);
            expect(targetPopup.isClosed(), 'the first committed vessel must stay physically open').toBe(false);

            beatLog.push({
                beat            : 'tear-out',
                bornMidGesture  : true,
                detachCommitted : ownerResult.proof.detachCommitted,
                ownerWorkspaceId: 'workstation-vessel:metrics',
                sourceItems     : ownerResult.proof.documentAfter.nodes['right-top-tabs'].items
            });

            expect(
                dockResult.errors,
                `cross-window dock receipt: ${JSON.stringify(dockResult.proof ?? null)}`
            ).toEqual([]);
            expect(dockResult.applied, 'commits must join metrics through one remote target').toBe(true);
            expect(dockResult.proof.remoteSnapshot).toMatchObject({
                claimCount           : 1,
                converted            : true,
                engaged              : true,
                parkedItemId         : 'commits',
                sourceVesselConnected: true,
                targetProxy          : {
                    cls: expect.arrayContaining([
                        'neo-dock-dragproxy',
                        'workstation-vessel-dragproxy',
                        'neo-theme-neo-dark'
                    ]),
                    computedOpacity: .7,
                    itemId         : 'commits',
                    ownsPane       : true,
                    settled        : true,
                    visible        : true
                },
                targetWorkspaceId: 'workstation-vessel:metrics',
                winnerStableId   : 'workstation-vessel:metrics'
            });
            expect(dockResult.proof.remoteSnapshot.targetProxy.sourceWindowId)
                .toBe(dockResult.proof.remoteSnapshot.sourceVesselWindowId);
            expect(dockResult.proof.remoteSnapshot.rendered.previewId)
                .toBe(dockResult.proof.remoteSnapshot.preview.previewId);
            expect(dockResult.proof.remoteSnapshot.preview.target.nodeId)
                .toBe('workstation-vessel-tabs:metrics');
            expect(dockResult.proof.targetDocument.nodes['workstation-vessel-tabs:metrics'].items)
                .toEqual(['metrics', 'commits']);
            expect(dockResult.proof.transfer).toMatchObject({
                applied          : true,
                reconciled       : true,
                sourceWorkspaceId: 'workstation-main',
                targetWorkspaceId: 'workstation-vessel:metrics',
                descriptor       : {operation: 'transferItem', itemId: 'commits'}
            });
            expect(dockResult.proof.sourceVesselRetired).toBe(true);
            expect(sourcePopup.isClosed(), 'the converted source vessel must be physically gone').toBe(true);

            beatLog.push({
                beat             : 'vessel-dock',
                claimCount       : 1,
                sourceRetired    : true,
                targetItems      : ['metrics', 'commits'],
                targetWorkspaceId: 'workstation-vessel:metrics',
                transfer         : 'transferItem',
                winnerStableId   : 'workstation-vessel:metrics'
            });

            const returnResult = await app.callMethod(wsId, 'executeStackReturnStep', [
                {ownerItemId: 'metrics'},
                {
                    attempts  : filmPace.birthAttempts ?? 180,
                    moveDelay : filmPace.moveDelay ?? 16,
                    showCursor: filmPace.showCursor ?? false
                }
            ]);

            expect(returnResult.errors, JSON.stringify({
                closeReceipt    : returnResult.proof?.closeReceipt,
                phaseOrder      : returnResult.proof?.phaseOrder,
                remoteSnapshot  : returnResult.proof?.remoteSnapshot,
                sourceItemIds   : returnResult.proof?.sourceItemIds,
                sourceWindowGone: returnResult.proof?.sourceWindowGone,
                transfer        : returnResult.proof?.transfer
            })).toEqual([]);
            expect(returnResult.applied,
                'the grouped pointer gesture must settle through physical topology exit').toBe(true);
            expect(returnResult.proof.remoteSnapshot).toMatchObject({
                claimCount       : 1,
                engaged          : true,
                targetWorkspaceId: 'workstation-main',
                winnerStableId   : 'workstation-main'
            });
            expect(returnResult.proof.remoteSnapshot.rendered.previewId)
                .toBe(returnResult.proof.remoteSnapshot.preview.previewId);
            expect(returnResult.proof.transfer).toMatchObject({
                applied          : true,
                closeRequested   : true,
                descriptor       : {operation: 'transferNode'},
                reconciled       : true,
                sourceWorkspaceId: 'workstation-vessel:metrics',
                targetWorkspaceId: 'workstation-main',
                topologyExited   : true
            });
            expect(returnResult.proof.phaseOrder).toEqual([
                'documents-adopted',
                'main-projected',
                'close-dispatched',
                'topology-exited'
            ]);
            expect(returnResult.proof.sourceItemIds).toEqual(['metrics', 'commits']);
            expect(returnResult.proof.sourceWindowGone,
                'native close acknowledgement alone is not topology exit').toBe(true);
            await expect.poll(() => targetPopup.isClosed(), {
                message: 'the emptied vessel must be physically gone',
                timeout: 15000
            }).toBe(true);

            const documentAfter = await readDocument(app, wsId);

            expect(documentAfter.nodes['right-top-tabs'].items).toEqual(['audit', 'metrics', 'commits']);

            beatLog.push({
                beat          : 'reintegration',
                finalTarget   : 'right-top-tabs',
                phaseOrder    : returnResult.proof.phaseOrder,
                sourceItems   : returnResult.proof.sourceItemIds,
                topologyExited: true,
                transfer      : 'transferNode'
            });

            const
                heartbeatAtClose  = await readHeartbeat(app, wsId),
                metricsAfter      = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
                commitsAfter      = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
                livePopupsAtClose = page.context().pages()
                    .filter(candidate => candidate !== page && !candidate.isClosed());

            expect(metricsAfter, 'metrics must remain the same live instance end-to-end')
                .toBe(metricsBefore);
            expect(commitsAfter, 'commits must remain the same live instance end-to-end')
                .toBe(commitsBefore);
            expect(heartbeatAtClose, 'the feed must advance without resetting during the journey')
                .toBeGreaterThan(heartbeatAtOpen);
            expect(livePopupsAtClose,
                'physical vessel topology must be empty before the zero-residue reload').toEqual([]);
            expect(ctx.pageErrors, 'the uninterrupted journey must be browser-error-free').toEqual([]);

            beatLog.push({
                beat                    : 'signature',
                commitsInstancePreserved: true,
                feedAdvanced            : true,
                metricsInstancePreserved: true,
                survivingVessels        : 0
            });
            logs.push(beatLog);

            if (run < journeyRuns - 1) {
                await page.reload()
            }

            ctx.disposeObservers()
        }

        if (!filmTake) {
            expect(logs[1], 'two clean takes must emit the same clock-free five-beat log')
                .toEqual(logs[0])
        }

        expect(logs.every(log => log.length === 5),
            'each uninterrupted journey must emit exactly five semantic beats').toBe(true);
        expect(pageErrorRuns.flat(), 'both journeys must stay browser-error-free').toEqual([]);

        const
            semanticReceipt = {
                beatLogs             : logs,
                controlReceipts,
                filmTake,
                journeyRuns,
                openingDocumentSha256: openingDocuments.map(opening =>
                    hashReceipt(serializeReceipt(opening))),
                schema               : 'neo.film.five-beat-semantic-receipt.v1'
            },
            semanticText   = serializeReceipt(semanticReceipt),
            semanticSha256 = hashReceipt(semanticText);

        await testInfo.attach('five-beat-semantic-receipt', {
            body       : Buffer.from(semanticText),
            contentType: 'application/json'
        });

        if (filmControl) {
            await writeExclusive(filmControl.receiptFile, semanticText)
        }

        console.log(`[film-cue] semantic-receipt sha256=${semanticSha256}` +
            ` journeys=${journeyRuns} beats=${logs.map(log => log.length).join(',')}`)
    });
});
