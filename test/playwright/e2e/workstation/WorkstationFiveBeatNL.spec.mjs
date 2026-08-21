import {execFile}                                                   from 'node:child_process';
import {createHash}                                                 from 'node:crypto';
import path                                                         from 'node:path';
import {promisify}                                                  from 'node:util';
import fs                                                           from 'fs-extra';
import {previewToOperation}                                         from '../../../../src/dashboard/dockPreviewContract.mjs';
import {test, expect}                                               from '../../fixtures.mjs';
import {assertPreviewZoneAlignment, readComponentRects}             from '../utils/dockGeometry.mjs';
import {pinToCaptureDisplay, placeNativeWindow, readBrowserSurface} from '../utils/filmStage.mjs';
import {isFilmTake}                                                 from '../utils/gpuIntent.mjs';

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
    execFileAsync = promisify(execFile),
    filmTake      = isFilmTake(),
    journeyRuns   = filmTake ? 1 : 2,
    themeDwell    = filmTake ? 3200 : 0,
    filmPace      = filmTake
        ? {birthAttempts: 240, curve: 0.18, dwellDelay: 700, moveDelay: 33, moveSteps: 24, showCursor: true}
        : {},
    filmControl      = resolveFilmControl(),
    ordinaryScreen   = {height: 1080, width: 1920},
    ordinaryViewport = {height: 800, width: 1280};

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
 * @summary Performs one literal macOS HID titlebar drag with CoreGraphics mouse events.
 *
 * The path first enters popup content and exits through its titlebar so the product's ordinary
 * mouseout-owned movement observer is live. It then holds the OS mouse button throughout the
 * cross-window move and dwell. No CDP or Neo method moves the popup during this gesture.
 * @param {Object} data
 * @param {{x:Number,y:Number}} data.end Global release coordinate over the target window.
 * @param {{x:Number,y:Number}} data.prime Global point inside popup content.
 * @param {{x:Number,y:Number}} data.start Global popup-titlebar press coordinate.
 * @returns {Promise<Object>} Accessibility and physical mouse timing receipt.
 */
async function dragNativeTitlebar({end, prime, start}) {
    const points = [end, prime, start];

    if (!points.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) {
        throw new Error('native titlebar drag requires finite global coordinates')
    }

    const
        literal = value => Number(value).toFixed(3),
        script  = `
import Cocoa
import Darwin
import Foundation

func post(_ type: CGEventType, x: Double, y: Double) {
    let point = CGPoint(x: x, y: y)
    let event = CGEvent(
        mouseEventSource: nil,
        mouseType: type,
        mouseCursorPosition: point,
        mouseButton: .left
    )!
    event.post(tap: .cghidEventTap)
}

let access = CGPreflightPostEventAccess()
print("access=\\(access)")
if !access {
    exit(77)
}

let primeX = ${literal(prime.x)}
let primeY = ${literal(prime.y)}
let startX = ${literal(start.x)}
let startY = ${literal(start.y)}
let endX = ${literal(end.x)}
let endY = ${literal(end.y)}

post(.mouseMoved, x: primeX, y: primeY)
Thread.sleep(forTimeInterval: 0.18)
post(.mouseMoved, x: startX, y: startY)
Thread.sleep(forTimeInterval: 0.18)
post(.leftMouseDown, x: startX, y: startY)
print("mouseDownMs=\\(Int(Date().timeIntervalSince1970 * 1000))")

for step in 1...28 {
    let progress = Double(step) / 28.0
    let eased = progress * progress * (3.0 - 2.0 * progress)
    post(
        .leftMouseDragged,
        x: startX + (endX - startX) * eased,
        y: startY + (endY - startY) * eased
    )
    Thread.sleep(forTimeInterval: 0.025)
}

Thread.sleep(forTimeInterval: 0.14)
print("mouseUpMs=\\(Int(Date().timeIntervalSince1970 * 1000))")
post(.leftMouseUp, x: endX, y: endY)
Thread.sleep(forTimeInterval: 0.12)
`,
        moduleCache = path.join(process.env.TMPDIR || '/tmp', 'neo-native-titlebar-swift-cache');

    await fs.ensureDir(moduleCache);

    try {
        const {stderr, stdout} = await execFileAsync('/usr/bin/swift', ['-e', script], {
            env: {
                ...process.env,
                CLANG_MODULE_CACHE_PATH: moduleCache,
                SWIFT_MODULE_CACHE_PATH: moduleCache
            },
            timeout: 60000
        });
        const receipt = Object.fromEntries(stdout.trim().split('\n').map(line => {
            const index = line.indexOf('=');

            return [line.slice(0, index), line.slice(index + 1)]
        }));

        stderr.trim() && console.log(`[native-titlebar][swift] ${stderr.trim()}`);

        return {
            access     : receipt.access === 'true',
            mouseDownMs: Number(receipt.mouseDownMs),
            mouseUpMs  : Number(receipt.mouseUpMs)
        }
    } catch (error) {
        throw new Error(
            'physical native-titlebar input failed; grant Accessibility to the active Codex/terminal host'
            + `\nstdout: ${String(error.stdout || '').trim()}`
            + `\nstderr: ${String(error.stderr || '').trim()}`
        )
    }
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
        const
            state         = await app.callMethod(manager.id, 'toJSON'),
            managedWindow = state.windows.find(item => item.id === stageReceipt.neoWindowId),
            observed      = stageReceipt.after,
            delta         = managedWindow?.innerRect && managedWindow?.outerRect
                ? [
                    ...['x', 'y', 'width', 'height']
                        .map(key => Math.abs(managedWindow.innerRect[key] - observed.inner[key])),
                    Math.abs(managedWindow.outerRect.width  - observed.outer.width),
                    Math.abs(managedWindow.outerRect.height - observed.outer.height)
                ]
                : null;

        receipt = {
            browser: observed,
            managed: managedWindow && {
                inner: managedWindow.innerRect,
                outer: managedWindow.outerRect
            }
        };

        return delta ? Math.max(...delta) : Infinity
    }, {
        message  : 'the App Worker must consume the browser-observed film-stage geometry',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(2);

    console.log(`[film-stage] manager.Window parity: ${JSON.stringify(receipt)}`);

    return {...stageReceipt, managed: receipt.managed}
}

/**
 * @summary Resolves the one surviving semantic tear-out page after transient popup generations.
 * @param {import('@playwright/test').Page} page
 * @param {String} itemId
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function waitForTearOutPopup(page, itemId) {
    let popups;

    await expect.poll(() => {
        popups = page.context().pages().filter(candidate => {
            if (candidate === page || candidate.isClosed()) return false;

            try {
                return new URL(candidate.url()).searchParams.get('popout') === itemId
            } catch {
                return false
            }
        });

        return popups.length
    }, {
        message  : `one live popout=${itemId} page must survive terminal acquisition`,
        timeout  : 30000,
        intervals: [25, 50, 100]
    }).toBe(1);

    return popups[0]
}

// `video` must live at file level (a describe-scoped use() would force a new worker).
test.use({video: filmTake ? 'on' : 'off'});

test.describe('Workstation — the five-beat multi-window journey', () => {
    test.setTimeout(180000);
    // The later beats need real screen estate to the right of the main window for vessels;
    // scene 1 inherits the same stage so the recorded geometry never shifts between beats.
    test.use(filmTake
        ? {viewport: null}
        : {
            colorScheme   : 'dark',
            contextOptions: {screen: ordinaryScreen},
            viewport      : ordinaryViewport
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

        const emulatedViewport = page.viewportSize();

        if (filmTake) {
            expect(emulatedViewport,
                'film mode must delegate page geometry to the native Chrome window').toBeNull()
        } else {
            expect(emulatedViewport,
                'ordinary E2E mode must retain its deterministic emulated viewport').toEqual(ordinaryViewport)
        }

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
        if (stageReceipt) {
            stageReceipt = await assertStageGeometryPublished(app, stageReceipt)
        }

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
     * @summary Samples every live page while one gesture runs so cursor migration is proven across
     * physical documents, rather than inferred from one terminal page after the gesture settles.
     * @param {Object} data
     * @param {Function} data.action Awaited gesture action.
     * @param {Boolean} [data.observeContinuously=true] Sample between action start and settlement.
     * @param {Object} data.page Playwright main page.
     * @param {Object} data.sourcePage Physical document that initially owns the cursor.
     * @param {Object|null} [data.targetPage=null] Physical replacement document, when migrating.
     * @returns {Promise<Object>} Gesture result plus aggregate cursor lifecycle evidence.
     */
    async function captureFilmCursorLifecycle({
        action,
        observeContinuously=true,
        page,
        sourcePage,
        targetPage=null
    }) {
        const evidence = {
            finalTotal           : null,
            initialTotal         : null,
            maxParticipatingPages: 0,
            maxTotal             : 0,
            overlapSamples       : 0,
            sampleCount          : 0,
            sourceSeen           : false,
            targetSeen           : false,
            targetSeenWithSource : 0
        };
        let running = true;

        const sample = async () => {
            const pages  = page.context().pages().filter(candidate => !candidate.isClosed());
            const counts = await Promise.all(pages.map(async candidate => {
                let count = 0;

                try {
                    count = await candidate.locator('.film-cursor').count()
                } catch {
                    // A popup may close between the page census and its DOM query.
                }

                return {count, page: candidate}
            }));
            const
                sourceCount = counts.find(entry => entry.page === sourcePage)?.count ?? 0,
                targetCount = counts.find(entry => entry.page === targetPage)?.count ?? 0,
                total       = counts.reduce((sum, entry) => sum + entry.count, 0);

            evidence.sampleCount++;
            evidence.finalTotal            = total;
            evidence.maxParticipatingPages  = Math.max(evidence.maxParticipatingPages, pages.length);
            evidence.maxTotal              = Math.max(evidence.maxTotal, total);
            evidence.overlapSamples       += Number(total > 1);
            evidence.sourceSeen           ||= sourceCount > 0;
            evidence.targetSeen           ||= targetCount > 0;
            evidence.targetSeenWithSource += Number(sourceCount > 0 && targetCount > 0)
        };

        await sample();
        evidence.initialTotal = evidence.finalTotal;

        const observer = observeContinuously
            ? (async () => {
                while (running) {
                    await new Promise(resolve => setTimeout(resolve, 16));
                    running && await sample()
                }
            })()
            : Promise.resolve();

        let result;

        try {
            result = await action()
        } finally {
            running = false;
            await observer;
            await sample()
        }

        return {evidence, result}
    }

    /**
     * @summary Applies the shared cursor lifecycle assertions for film migrations and ordinary
     * cursor-free paths.
     * @param {Object} evidence Output from captureFilmCursorLifecycle().
     * @param {Object} options
     * @param {Boolean} [options.expectMigration=false]
     * @param {Boolean} options.showCursor
     */
    function assertFilmCursorLifecycle(evidence, {expectMigration=false, showCursor}) {
        expect(evidence.initialTotal, 'each gesture must start without prior cursor residue').toBe(0);
        expect(evidence.maxTotal, 'aggregate cursors across all participating documents never exceed one')
            .toBeLessThanOrEqual(1);
        expect(evidence.overlapSamples, 'no sampled frame may contain source and replacement cursors').toBe(0);
        expect(evidence.finalTotal, 'the terminal receipt must leave every document cursor-free').toBe(0);

        if (showCursor) {
            console.log('[film-cursor-lifecycle]', JSON.stringify(evidence));
            expect(evidence.sourceSeen, 'film mode must expose the source cursor during the gesture').toBe(true);

            if (expectMigration) {
                expect(evidence.maxParticipatingPages,
                    'migration evidence must cover at least two physical documents').toBeGreaterThanOrEqual(2);
                expect(evidence.targetSeen, 'film mode must expose the replacement cursor in its target document')
                    .toBe(true);
                expect(evidence.targetSeenWithSource,
                    'the source document must be physically empty when the replacement is observable').toBe(0)
            }
        } else {
            expect(evidence.maxTotal, 'ordinary mode must never create a film cursor').toBe(0);
            expect(evidence.sourceSeen).toBe(false);
            expect(evidence.targetSeen).toBe(false)
        }
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
            ]);

        // The step awaits the vessel birth internally, so its receipt is complete here. Asserting
        // it BEFORE the popup wait converts a silent 90s waitForEvent timeout into the step's own
        // arming/birth diagnostics — the receipt names the failing gate, the timeout names nothing.
        expect(ownerResult.errors ?? [], JSON.stringify(ownerResult.proof ?? {})).toEqual([]);
        expect(ownerResult.applied, 'the metrics tear-out must apply before merge staging continues').toBe(true);

        const
            targetPopup        = await targetPopupPromise,
            sourcePopupPromise = page.waitForEvent('popup', {timeout: 90000}),
            showCursor         = filmPace.showCursor ?? false,
            cursorProofPromise = captureFilmCursorLifecycle({
                action: () => app.callMethod(wsId, 'executeCrossWindowDockStep', [
                    {itemId: 'commits', sourceNodeId: 'right-bottom-tabs', targetItemId: 'metrics'},
                    {
                        attempts  : filmPace.birthAttempts ?? 180,
                        dwellDelay: filmPace.dwellDelay ?? 600,
                        moveDelay : filmPace.moveDelay ?? 16,
                        moveSteps : filmPace.moveSteps ?? 4,
                        showCursor
                    }
                ]),
                observeContinuously: showCursor,
                page,
                sourcePage         : page,
                targetPage         : targetPopup
            }),
            targetProxy = targetPopup.locator('.workstation-vessel-dragproxy');

        await expect(targetProxy, 'exactly one Workstation proxy must render in the target popup')
            .toHaveCount(1, {timeout: 9000});

        const computedOpacity = await targetProxy.evaluate(element =>
            Number.parseFloat(getComputedStyle(element).opacity));

        expect(computedOpacity, 'the live target proxy must leave the dock preview legible').toBe(.7);

        const [{evidence: cursorEvidence, result: dockResult}, sourcePopup] =
            await Promise.all([cursorProofPromise, sourcePopupPromise]);

        dockResult.proof?.remoteSnapshot?.targetProxy &&
            (dockResult.proof.remoteSnapshot.targetProxy.computedOpacity = computedOpacity);

        await expect.poll(() => sourcePopup.isClosed(), {
            message: 'the converted source vessel must retire after its remote commit',
            timeout: 15000
        }).toBe(true);

        return {cursorEvidence, dockResult, ownerResult, showCursor, sourcePopup, targetPopup}
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
            viewport = await page.evaluate(() => ({
                height: globalThis.innerHeight,
                width : globalThis.innerWidth
            })),
            box      = await page.locator('.workstation-dock-host').boundingBox(),
            session = await page.context().newCDPSession(page),
            frames  = [],
            acks    = [];
        let resolveFirstFrame;

        expect(box, 'the dock host must expose a measurable compositor region').toBeTruthy();
        expect(Math.min(viewport.height, viewport.width),
            'the film screencast must expose a positive live browser content area').toBeGreaterThan(0);

        const firstFrame = new Promise(resolve => {
            resolveFirstFrame = resolve
        });

        session.on('Page.screencastFrame', frame => {
            // The arrival time travels WITH the frame so the window can be split after the fact.
            // CDP reports seconds since epoch; the page reports milliseconds, so normalise here —
            // one conversion, at the only place both units meet.
            frames.push({data: frame.data, timestampMs: frame.metadata.timestamp * 1000});
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

            baseline = frames.at(-1).data;
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
                frames: actionFrames.map(frame => frame.data),
                viewport
            });

        const
            baselineEntropy = entropies.shift(),
            minEntropy      = Math.min(...entropies),
            minFrameIndex   = entropies.indexOf(minEntropy);

        /**
         * Reduces one region's frames to the receipt every consumer reads.
         *
         * The whole-window figures above stay the headline because they are what every existing
         * consumer reads, and they remain the honest answer to *did any frame clear* — a region is a
         * narrower question, never a weaker one. What a region adds is ATTRIBUTION: a window spanning
         * more than the step it is named for can report a real defect against the wrong beat, which
         * is exactly what happened here (`scene-1-run-1-resize` was reporting an entry-time frame).
         * @param {Object[]} rows Frames of one region, each carrying `entropy`, `index`, `timestampMs`.
         * @returns {Object|null} Region receipt, or null when the region observed no frame.
         */
        function summarise(rows) {
            if (!rows.length) return null;

            const lowest = rows.reduce((min, row) => row.entropy < min.entropy ? row : min);

            // `minFrameIndex` is the index into the FULL frame list, not into the region, so an
            // attachment resolves against `frames` without the caller knowing the region's offset.
            return {
                frameCount   : rows.length,
                minEntropy   : lowest.entropy,
                minFrameIndex: lowest.index
            }
        }

        const entryCompletedAt = result?.phases?.entryCompletedAt ?? null;

        /**
         * Splits the capture at the entry/replay boundary into three regions, ORDINALLY.
         *
         * `entryCompletedAt` is stamped in the App Worker when `refreshDockWorkspace()` resolves —
         * DOM acknowledgement, not presentation. The compositor can swap an entry-caused frame after
         * that reply leaves, so a plain `timestamp <` predicate can file an entry frame under the
         * resize label: the exact misattribution this capture exists to remove, one layer down.
         *
         * The uncertainty is ONE-SIDED. The stamp is sampled immediately before `runner.start()`, so
         * a frame presenting before it cannot belong to the replay — program order already proves
         * ownership, and a symmetric band would report uncertainty on the side that has none.
         *
         * The ambiguous unit is one FRAME, not one interval. A per-run median cadence is better than
         * a 16.7ms constant and still fails the case that matters: a first post-boundary frame
         * arriving 31ms after the stamp under a 16ms median falls back into the replay region and
         * recreates the defect. Deriving from presentation ORDER removes the statistic from the
         * correctness path; median and adjacent gaps stay below as diagnostics only.
         *
         * The model is falsifiable and was falsified-tested rather than asserted: more than one
         * entry-owned presented frame after the stamp would disprove it. Measured at this head with
         * the replay reduced to a no-op — so every post-stamp change is entry-owned by construction —
         * exactly one entry-owned frame presented after the stamp, at ordinal 0, across 58 observed
         * post-stamp frames and with the boundary tightened from 247ms of slack to 29ms.
         * @returns {Object|null} Region receipts, or null when the phase stamp is unavailable.
         */
        function partition() {
            if (entryCompletedAt === null) return null;

            const
                rows          = actionFrames.map((frame, index) => ({
                    entropy    : entropies[index],
                    index,
                    timestampMs: frame.timestampMs
                })),
                entryCertain  = rows.filter(row => row.timestampMs <  entryCompletedAt),
                postStamp     = rows.filter(row => row.timestampMs >= entryCompletedAt),
                // The EARLIEST post-stamp timestamp, never the first DELIVERED one. Chromium stamps
                // `metadata.timestamp` before handing each bitmap to a shared thread-pool encoder and
                // emits one event per independent reply, so `Page.screencastFrame` arrival order does
                // not establish presentation order. Reading `postStamp[0]` treated transport order as
                // presentation order and could leave a frame in NEITHER region — arrival
                // `[90, 120, 110, 130]` against a stamp of 100 selected 120 as the boundary and
                // dropped 110 from all three, while every non-empty check still passed and both band
                // minima read healthy over a cleared frame (@neo-gpt, cycle-2 re-review).
                //
                // Ties share the boundary frame's fate: two frames stamped identically cannot be
                // ordered by the receipt, so neither may be promoted to `resizeCertain` alone.
                boundaryMs    = postStamp.length
                    ? Math.min(...postStamp.map(row => row.timestampMs))
                    : undefined,
                ambiguous     = postStamp.filter(row => row.timestampMs === boundaryMs),
                resizeCertain = postStamp.filter(row => row.timestampMs >  boundaryMs),
                // Sorted before differencing for the same reason: an unsorted delta over delivery
                // order yields negative "gaps" that are transport artefacts, not cadence.
                ordered       = rows.map(row => row.timestampMs).sort((left, right) => left - right),
                gaps          = ordered.slice(1).map((value, index) => value - ordered[index])
                    .sort((left, right) => left - right);

            return {
                // The asserted regions. Continuity covers `entryCertain ∪ ambiguous` because the two
                // misattributions are not equally costly: an entry frame called "resize" is the
                // defect being removed, while a resize frame called "entry" is an investigable false
                // red. The tie-break is deliberately not neutral, and the residual stays visible
                // below rather than being folded into a single confident number.
                entry : summarise([...entryCertain, ...ambiguous]),
                resize: summarise(resizeCertain),

                // Diagnostics. `medianGapMs` is reported so a reader can see the cadence the
                // partition did NOT use; it must never re-enter the correctness path.
                ambiguousFrameCount  : ambiguous.length,
                ambiguousFrameIndices: ambiguous.map(row => row.index),
                entryCertainCount    : entryCertain.length,
                medianGapMs          : gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
                // CONSERVATION. Reported so the assertion can check it rather than trust the
                // predicates: three regions that are pairwise disjoint can still fail to cover the
                // capture, and a frame belonging to no region is invisible to every band assertion
                // while every non-empty check passes. Disjointness was proven and coverage was
                // merely assumed — this is the number that makes the assumption checkable.
                partitionedFrameCount: entryCertain.length + ambiguous.length + resizeCertain.length,
                resizeCertainCount   : resizeCertain.length
            }
        }

        return {
            baselineEntropy,
            // Absent only when `runTourSpec` did not publish the boundary — an older workspace, or a
            // different action entirely. Null rather than a guessed split: attributing frames on an
            // assumed boundary is the defect this exists to remove, one layer down.
            bands     : partition(),
            frameCount: actionFrames.length,
            frames    : actionFrames.map(frame => frame.data),
            minEntropy,
            minFrameIndex,
            result
        }
    }

    /**
     * @summary Enforces the dense-workspace presented-frame entropy contract for one action.
     * @param {Object} config Assertion inputs.
     * @param {Object} config.continuity Receipt returned by captureWorkspaceContinuity().
     * @param {String} config.label Stable attachment and log label.
     * @param {Object} config.testInfo Playwright test metadata.
     * @param {String|null} [config.band=null] `'entry'` (certain ∪ ambiguous) or `'resize'`
     * (certain only). Omitted keeps whole-window semantics for every pre-existing caller, and
     * naming a region additionally fails closed unless all three regions were observed.
     * @param {Boolean} [config.expectedCleared=false] Known-defect red-control direction.
     * @param {Object} [config.receipt] Additional action-specific log fields.
     * @returns {Promise<void>}
     */
    async function assertWorkspaceContinuity({
        band=null,
        continuity,
        expectedCleared=false,
        label,
        receipt={},
        testInfo
    }) {
        // Whole-window when no band is named, so every existing caller keeps its exact semantics.
        const
            regions = continuity.bands,
            scoped  = band ? regions?.[band] : continuity;

        // A named band that produced NO frames must fail here rather than pass silently. Zero frames
        // means the phase was never observed, and an oracle that reports green on an unobserved phase
        // is worse than one that reports nothing — it manufactures coverage.
        expect(scoped,
            `${label}: band '${band}' produced no frames, so it proves nothing about that phase`).toBeTruthy();

        // Fail closed on the partition itself, not just on the asserted band. All three regions must
        // have been observed: an unobserved `entryCertain` means the capture opened too late, an
        // unobserved `resizeCertain` means it closed too early, and a missing ambiguous frame means
        // the boundary was never crossed — none of which a green band can distinguish from health.
        // `document.hidden` swaps the frame path for `setTimeout`, which carries no presentation
        // guarantee at all; that case must surface here as an unobserved phase rather than be
        // absorbed by a region that happens to be non-empty.
        if (band) {
            expect(regions.entryCertainCount,
                `${label}: no frame presented before the entry boundary, so the capture opened too late`
            ).toBeGreaterThan(0);

            expect(regions.ambiguousFrameCount,
                `${label}: no frame presented at or after the entry boundary, so it was never crossed`
            ).toBeGreaterThan(0);

            expect(regions.resizeCertainCount,
                `${label}: no frame presented past the boundary frame, so the replay went unobserved`
            ).toBeGreaterThan(0);

            // Conservation, asserted rather than assumed. Every captured frame must land in exactly
            // one region: the three predicates are pairwise disjoint, but disjointness does not imply
            // coverage, and a frame in no region is measured by no band while all three non-empty
            // checks still pass. A cleared frame can hide in that gap with both band minima reading
            // healthy — which is this oracle's own defect, one layer further down.
            expect(regions.partitionedFrameCount,
                `${label}: the regions must account for every captured frame — ` +
                `${regions.partitionedFrameCount} of ${continuity.frameCount} attributed, so a frame ` +
                `belongs to no region and no band assertion can see it`
            ).toBe(continuity.frameCount)
        }

        // An entry red whose minimum IS the boundary frame is attributed, not confirmed. The
        // tie-break resolved it toward entry deliberately, and the receipt has to keep saying so —
        // a reader chasing this number must know whether the frame was proven entry-owned by program
        // order or assigned to entry by the tie-break.
        const minFrameAttribution = band === 'entry' && regions.ambiguousFrameIndices.includes(scoped.minFrameIndex)
            ? 'entry-attributed / boundary-ambiguous'
            : band ?? 'whole-window';

        console.log('[rendered-continuity]', JSON.stringify({
            ambiguousFrameCount: regions?.ambiguousFrameCount ?? null,
            band               : band ?? 'whole-window',
            baselineEntropy    : continuity.baselineEntropy,
            entryCertainCount  : regions?.entryCertainCount ?? null,
            frameCount         : scoped.frameCount,
            label,
            medianGapMs        : regions?.medianGapMs ?? null,
            minEntropy         : scoped.minEntropy,
            minFrameAttribution,
            minFrameIndex      : scoped.minFrameIndex,
            resizeCertainCount : regions?.resizeCertainCount ?? null,
            ...receipt
        }));

        // The whole window must show a real sequence. A band is a slice of that sequence, so it can
        // legitimately be short — the entry projection is fast — and the floor there is only that it
        // was observed at all.
        expect(scoped.frameCount,
            `${label} must expose consecutive compositor frames`).toBeGreaterThan(band ? 0 : 2);

        // The baseline stays the WHOLE capture's pre-action frame in both cases: it is the reference
        // for "what the workspace looks like when nothing is wrong", and re-deriving a per-region
        // baseline would let a region that starts mid-defect normalise the defect away.
        //
        // Floor provenance, measured not chosen: confirmed whole-body clears measure ~0.08x
        // baseline (the repaired tour-entry blank: 0.4088 against 5.30-5.35 baselines), while
        // healthy film-paced minima hold >=0.93x baseline (5.30/5.31 on the same stages). 0.65
        // separates the measured populations with >=8x margin on the red side and >=1.4x on the
        // green side; retune it only against fresh measured receipts of both populations.
        const entropyFloor = continuity.baselineEntropy * 0.65;

        if (scoped.minEntropy < entropyFloor) {
            await testInfo.attach(`${label}-minimum-entropy-frame`, {
                body       : Buffer.from(continuity.frames[scoped.minFrameIndex], 'base64'),
                contentType: 'image/jpeg'
            })
        }

        if (expectedCleared) {
            expect(scoped.minEntropy,
                `${label} red control must expose the confirmed cleared-body frame`).toBeLessThan(entropyFloor)
        } else {
            expect(scoped.minEntropy,
                `${label} must not present a cleared dense workspace body (${minFrameAttribution})`
            ).toBeGreaterThanOrEqual(entropyFloor)
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
                // Two beats, asserted separately, because `runTourSpec` performs both inside one
                // call: it re-stages the workspace from `initialDocument` (entry) and only then
                // replays the resize. Measuring the pair under the resize label is what let an
                // entry-time cleared frame be reported as a resize defect for this oracle's whole
                // life — the minimum sat at frame 7 of 59, at the START of the window, before the
                // step it was named for had run.
                //
                // Both bands are asserted, not just the renamed one. Narrowing the resize oracle
                // WITHOUT covering entry would have converted a caught defect into an uncaught one:
                // the same blank would simply have fallen outside the window and gone green.
                await assertWorkspaceContinuity({
                    band   : 'entry',
                    continuity,
                    label  : `scene-1-run-${run + 1}-entry-projection`,
                    receipt: {run: run + 1},
                    testInfo
                });

                await assertWorkspaceContinuity({
                    band   : 'resize',
                    continuity,
                    label  : `scene-1-run-${run + 1}-resize`,
                    receipt: {run: run + 1},
                    testInfo
                })
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
            await expect(page.locator('.film-cursor'),
                'cancel must retire the film cursor from physical DOM, not only component truth').toHaveCount(0);

            const {evidence: errorCursorEvidence, result: failed} =
                await captureFilmCursorLifecycle({
                    action: () => app.callMethod(wsId, 'executeCrossZoneShowcaseStep', [{
                        ...gesture,
                        dwells: [{
                            targetNodeId : 'missing-film-target-a',
                            placementKind: 'edge-bottom'
                        }, {
                            targetNodeId : 'missing-film-target-b',
                            placementKind: 'tab-into'
                        }]
                    }, {
                        ...filmPace,
                        showCursor: true
                    }]),
                    page,
                    sourcePage: page
                });

            expect(failed.applied).toBe(false);
            expect(failed.errors).toEqual([
                "cross-zone target 'missing-film-target-a' is not measurable"
            ]);
            assertFilmCursorLifecycle(errorCursorEvidence, {showCursor: true});
            expect(await readDocument(app, wsId),
                'the thrown film path must cancel cleanly without mutating document truth').toEqual(documentBefore);

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
            await expect(page.locator('.film-cursor'),
                'a second film gesture in the same app session must not accumulate cursor residue').toHaveCount(0);
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

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);

        expect((await app.getComponent(wsId, ['theme'])).theme,
            'the parent Neo theme, not the host preference, is the popup birth authority')
            .toBe('neo-theme-neo-light');
        if (!filmTake) {
            expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
                'ordinary scene 2 must oppose Neo light with a dark host preference').toBe(true)
        }

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
        await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

        const
            popupWindowId = await popup.evaluate(() => Neo.worker.Manager.windowId),
            popupBirth    = await popup.evaluate(() => {
                const viewport = document.querySelector('.workstation-viewport');

                return {
                    bootstrap      : globalThis.WorkstationBootstrap,
                    hostPrefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
                    metaContents   : [...document.querySelectorAll('meta[name="color-scheme"]')]
                        .map(meta => meta.content),
                    themeClasses: [...viewport.classList].filter(name => name.startsWith('neo-theme-'))
                }
            });

        await expect.poll(async () => {
            const found = await app.findInstances(
                {className: 'Workstation.view.Viewport'},
                ['id', 'theme', 'windowId']
            );

            return found.find(item => item.properties?.windowId === popupWindowId)?.properties?.theme
        }, {
            message: 'the child viewport must be born with the carried Neo light theme',
            timeout: 15000
        }).toBe('neo-theme-neo-light');

        expect(new URL(popup.url()).searchParams.get('theme')).toBe('neo-theme-neo-light');
        expect(popupBirth.bootstrap).toEqual({
            colorScheme : 'light',
            defaultTheme: 'neo-theme-neo-dark',
            schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
            theme       : 'neo-theme-neo-light'
        });
        expect(popupBirth.metaContents, 'the final document must own exactly one active-theme scheme')
            .toEqual(['light']);
        expect(popupBirth.themeClasses).toEqual(['neo-theme-neo-light']);
        if (!filmTake) {
            expect(popupBirth.hostPrefersDark,
                'the popup must retain the opposing host preference used by this matrix row').toBe(true)
        }

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
        // padding is `clamp(12px, 2px + 5cqh, 24px)` against the pane container, so a vessel and its
        // parent legitimately differ by pane height — pinning the number would make the suite fail on
        // a resized window while still passing on a pane with no rules at all, which is the wrong
        // test in both directions.
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

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-dark']);

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

        await expect.poll(async () => {
            const found = await app.findInstances(
                {className: 'Workstation.view.Viewport'},
                ['id', 'theme', 'windowId']
            );

            return found.find(item => item.properties?.windowId === popupWindowId)?.properties?.theme
        }, {
            message: 'the open child viewport must retain live Neo theme authority after birth',
            timeout: 15000
        }).toBe('neo-theme-neo-dark');
        expect(await popup.locator('.workstation-viewport').evaluate(viewport =>
            [...viewport.classList].filter(name => name.startsWith('neo-theme-'))
        )).toEqual(['neo-theme-neo-dark']);

        // The heartbeat moved FORWARD — nothing reloaded, nothing recreated.
        expect(await readHeartbeat(app, wsId)).toBeGreaterThan(heartbeatBefore);
        expect(pageErrors).toEqual([])
    });

    test('first tear-out preserves dense source continuity through projection',
        async ({page, neuralLink}, testInfo) => {
            const userAgent = await page.evaluate(() => navigator.userAgent);

            test.skip(
                userAgent.includes('HeadlessChrome'),
                'run with --headed because CDP screencast compositor frames are required'
            );

            const {app, pageErrors, wsId} = await boot({page, neuralLink});
            const
                popupPromise = page.waitForEvent('popup', {timeout: 90000}),
                continuity   = await captureWorkspaceContinuity(page, () =>
                    app.callMethod(wsId, 'executeTearOutStep', [
                        {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
                        filmPace
                    ])
                ),
                ownerResult = continuity.result;

            await popupPromise;

            await assertWorkspaceContinuity({
                continuity,
                label: 'first-tear-out-source-projection',
                testInfo
            });
            expect(ownerResult.errors).toEqual([]);
            expect(ownerResult.applied, 'the continuity guard must still complete its first tear-out commit').toBe(true);
            expect(pageErrors).toEqual([])
        }
    );

    test('continuity guard red-control: a deliberate whole-body clear reds the guard',
        async ({page, neuralLink}, testInfo) => {
            const userAgent = await page.evaluate(() => navigator.userAgent);

            test.skip(
                userAgent.includes('HeadlessChrome'),
                'run with --headed because CDP screencast compositor frames are required'
            );

            // Instrument-integrity fixture, never a scene: a film take runs this whole file
            // with cameras rolling, and a staged whole-body clear must not enter take footage
            // (frame audits sweep the take for exactly this signature).
            test.skip(filmTake, 'the staged clear is excluded from film takes by design');

            const {pageErrors} = await boot({page, neuralLink});

            // The action IS the fixture: hold the dock host fully transparent across enough
            // compositor frames for the screencast to capture the exposed backdrop, then
            // restore. A red-control direction that has never fired is instrument theater —
            // this run proves the guard can convict the exact state it exists to catch.
            const continuity = await captureWorkspaceContinuity(page, () =>
                page.evaluate(() => new Promise(resolve => {
                    const host = document.querySelector('.workstation-dock-host');

                    host.style.opacity = '0';

                    let held = 0;

                    const step = () => {
                        if (++held >= 10) {
                            host.style.opacity = '';
                            resolve()
                        } else {
                            requestAnimationFrame(step)
                        }
                    };

                    requestAnimationFrame(step)
                }))
            );

            // Discrimination needs both directions on one capture: the baseline must read as a
            // healthy dense room, so the red below is the staged clear's doing — never a broken
            // instrument measuring an empty stage.
            expect(continuity.baselineEntropy,
                'the red-control baseline must be a healthy dense workspace')
                .toBeGreaterThan(2);

            await assertWorkspaceContinuity({
                continuity,
                expectedCleared: true,
                label          : 'red-control-staged-whole-body-clear',
                receipt        : {stagedClear: 'dock-host opacity 0 held across 10 rAF frames'},
                testInfo
            });

            const restoredOpacity = await page.evaluate(() =>
                getComputedStyle(document.querySelector('.workstation-dock-host')).opacity
            );

            expect(restoredOpacity, 'the staged clear must leave no residue on the host').toBe('1');

            // The untargeted-surface discipline: the restore is proven by the SAME instrument that
            // proved the clear, never by reading back the one property the fixture itself wrote. A
            // plausible-but-wrong restore — a pane re-rendered broken, content lost, while the
            // host's own opacity reads '1' — must red HERE. The cross-capture guard is load-bearing:
            // the second capture's OWN baseline must measure baseline-class against the first, or a
            // degraded-but-stable restore would normalise itself away inside its own capture.
            const restored = await captureWorkspaceContinuity(page, () => page.waitForTimeout(600));

            expect(restored.baselineEntropy,
                'the post-restore workspace measures baseline-class against the pre-clear room')
                .toBeGreaterThanOrEqual(continuity.baselineEntropy * 0.65);

            await assertWorkspaceContinuity({
                continuity     : restored,
                expectedCleared: false,
                label          : 'red-control-post-restore-continuity',
                receipt        : {postRestore: 'second capture over a 600ms settle window after the staged clear restored'},
                testInfo
            });

            expect(pageErrors).toEqual([])
        }
    );

    test('scene 2 (native titlebar) — a physical macOS popup drag previews, embodies, and returns home', async ({page, neuralLink}) => {
        test.skip(process.platform !== 'darwin', 'the physical titlebar witness is macOS-only');
        test.skip(!filmTake, 'run with NEO_FILM_TAKE=1 and --headed for literal native input');

        const userAgent = await page.evaluate(() => navigator.userAgent);

        expect(userAgent, 'a headless browser cannot witness an OS titlebar gesture')
            .not.toContain('HeadlessChrome');

        const {default: DockZoneModel} = await import('../../../../src/dashboard/DockZoneModel.mjs');

        const
            {app, pageErrors, popupProbe, wsId} = await boot({page, neuralLink}),
            readStoreIds                        = async () => {
                const listed = await app.listStores(),
                      stores = Array.isArray(listed?.stores)
                          ? listed.stores
                          : Array.isArray(listed) ? listed : [];

                return stores.map(store => store?.id).filter(id =>
                    id?.endsWith('__feed') || id?.endsWith('__scale')).sort()
            },
            heartbeatBefore = await readHeartbeat(app, wsId),
            paneIdBefore    = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            storeIdsBefore = await readStoreIds(),
            tearOut         = await app.callMethod(wsId, 'executeTearOutStep', [
                {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
                filmPace
            ]),
            popup           = await waitForTearOutPopup(page, 'metrics');

        expect(tearOut.errors).toEqual([]);
        expect(tearOut.applied, 'setup must leave one real terminal metrics popup').toBe(true);
        expect(paneIdBefore).toBeTruthy();
        expect(storeIdsBefore).toHaveLength(2);
        await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

        const documentBeforeReturn = await readDocument(app, wsId);

        expect(Object.values(documentBeforeReturn.nodes)
            .flatMap(node => node.items ?? [])
            .filter(itemId => itemId === 'metrics'),
        'setup must leave metrics detached from the main document tree').toHaveLength(0);

        const screen = await page.evaluate(() => ({
            availHeight: globalThis.screen.availHeight,
            availLeft  : globalThis.screen.availLeft,
            availTop   : globalThis.screen.availTop,
            availWidth : globalThis.screen.availWidth
        }));

        expect(screen.availWidth, 'the physical witness needs room for source and target windows')
            .toBeGreaterThanOrEqual(1200);
        expect(screen.availHeight).toBeGreaterThanOrEqual(700);

        const
            gap         = 24,
            popupWidth  = Math.min(460, Math.floor(screen.availWidth * .32)),
            mainWidth   = Math.min(1000, screen.availWidth - popupWidth - gap - 60),
            mainHeight  = Math.min(760, screen.availHeight - 80),
            popupHeight = Math.min(420, mainHeight - 120),
            mainBounds  = {
                height: mainHeight,
                left  : screen.availLeft + 20,
                top   : screen.availTop + 40,
                width : mainWidth
            },
            popupBounds = {
                height: popupHeight,
                left  : mainBounds.left + mainBounds.width + gap,
                top   : mainBounds.top + 120,
                width : popupWidth
            },
            mainPlacement = await placeNativeWindow(page, mainBounds);

        // Do not move the now-discoverable source popup until the worker has consumed the target's
        // smaller landing. Otherwise the popup's setup geometry can intersect the OLD main rect
        // and falsely become the native gesture this test is meant to prove.
        await assertStageGeometryPublished(app, {
            after      : mainPlacement.browser,
            neoWindowId: mainPlacement.neoWindowId
        });

        const popupPlacement = await placeNativeWindow(popup, popupBounds);

        await assertStageGeometryPublished(app, {
            after      : popupPlacement.browser,
            neoWindowId: popupPlacement.neoWindowId
        });

        await popup.bringToFront();

        const
            readId = result =>
                result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null),
            targetMatches = await app.findInstances(
                {dockNodeId: 'right-top-tabs'},
                ['id', 'windowId']
            ),
            targetRecord = targetMatches.find(item =>
                (item.properties?.windowId ?? item.windowId) === mainPlacement.neoWindowId),
            targetId = readId(targetRecord);

        expect(targetId,
            `the exact main-window return target must remain projected; matches=${JSON.stringify(targetMatches)}`)
            .toBeTruthy();

        let targetBox;

        await expect.poll(async () => {
            targetBox = await page.locator(`#${targetId}`).boundingBox();

            return Boolean(
                targetBox &&
                targetBox.x >= 0 &&
                targetBox.y >= 0 &&
                targetBox.x + targetBox.width <= mainPlacement.browser.inner.width &&
                targetBox.y + targetBox.height <= mainPlacement.browser.inner.height
            )
        }, {
            message: 'the exact main-window target must settle inside its physical viewport',
            timeout: 10000
        }).toBe(true);

        expect(targetBox, 'the physical target must expose live rendered geometry').toBeTruthy();

        const candidateLocalPoint = {
            x: targetBox.x + targetBox.width / 2,
            y: targetBox.y + targetBox.height / 2
        };

        expect(await app.callMethod(wsId, 'hitTestCrossWindowTarget', [
            'workstation-main',
            candidateLocalPoint.x,
            candidateLocalPoint.y
        ]), 'the exact physical target point must pass the lower-layer workspace hit test').toBe(true);

        const
            mainChromeHeight  = mainPlacement.browser.outer.height - mainPlacement.browser.inner.height,
            popupChromeHeight = popupPlacement.browser.outer.height - popupPlacement.browser.inner.height,
            titlebarOffset    = Math.max(8, Math.min(18, popupChromeHeight / 2)),
            targetCenter      = {
                x: mainPlacement.bounds.left
                    + (mainPlacement.browser.outer.width - mainPlacement.browser.inner.width) / 2
                    + targetBox.x + targetBox.width / 2,
                y: mainPlacement.bounds.top + mainChromeHeight + targetBox.y + targetBox.height / 2
            },
            start = {
                x: popupPlacement.bounds.left + popupPlacement.bounds.width / 2,
                y: popupPlacement.bounds.top + titlebarOffset
            },
            prime = {
                x: start.x,
                y: popupPlacement.bounds.top + popupChromeHeight
                    + Math.min(80, popupPlacement.browser.inner.height / 3)
            },
            desiredPopupTop = targetCenter.y - popupPlacement.bounds.height / 2,
            end = {
                x: targetCenter.x,
                y: desiredPopupTop + titlebarOffset
            },
            popupStart = await popup.evaluate(() => ({
                x: globalThis.screenX,
                y: globalThis.screenY
            }));

        await page.evaluate(() => {
            const
                state = globalThis.__nativeTitlebarWitness = {
                    activeBothSince  : null,
                    firstBothAt      : null,
                    firstPreviewAt   : null,
                    firstProxyAt     : null,
                    lastVisibility   : null,
                    maxBothDurationMs: 0,
                    presence         : [],
                    samples          : [],
                    stopped          : false
                },
                visible = element => {
                    if (!element) return false;

                    const
                        rect  = element.getBoundingClientRect(),
                        style = getComputedStyle(element);

                    return rect.width > 0 && rect.height > 0
                        && style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && Number.parseFloat(style.opacity || '1') > 0
                },
                pickRect = element => {
                    const {height, left, top, width} = element.getBoundingClientRect();

                    return {height, left, top, width}
                },
                sample = () => {
                    if (state.stopped) return;

                    const
                        previews       = [...document.querySelectorAll('.neo-dock-preview-affordance')],
                        proxies        = [...document.querySelectorAll('.workstation-vessel-dragproxy')],
                        preview        = previews.find(visible) ?? previews[0] ?? null,
                        proxy          = proxies.find(visible) ?? proxies[0] ?? null,
                        previewVisible = visible(preview),
                        proxyVisible   = visible(proxy),
                        now            = Date.now(),
                        visibility     = `${previewVisible}:${proxyVisible}`;

                    previewVisible && (state.firstPreviewAt ??= now);
                    proxyVisible && (state.firstProxyAt ??= now);

                    if (state.lastVisibility !== visibility && state.presence.length < 20) {
                        state.lastVisibility = visibility;
                        state.presence.push({
                            at          : now,
                            previewClass: preview?.className ?? null,
                            previewCount: previews.length,
                            previewVisible,
                            proxyClass  : proxy?.className ?? null,
                            proxyCount  : proxies.length,
                            proxyVisible
                        })
                    }

                    if (previewVisible && proxyVisible) {
                        state.firstBothAt ??= now;
                        state.activeBothSince ??= now;
                        state.maxBothDurationMs = Math.max(
                            state.maxBothDurationMs,
                            now - state.activeBothSince
                        );

                        const previous = state.samples.at(-1);

                        (!previous || now - previous.at >= 16) && state.samples.length < 12 &&
                            state.samples.push({
                            at     : now,
                            preview: pickRect(preview),
                            proxy  : pickRect(proxy)
                        })
                    } else if (state.activeBothSince != null) {
                        state.maxBothDurationMs = Math.max(
                            state.maxBothDurationMs,
                            now - state.activeBothSince
                        );
                        state.activeBothSince = null
                    }
                };

            state.observer = new MutationObserver(sample);
            state.observer.observe(document.body, {
                attributes: true,
                childList : true,
                subtree   : true
            });
            state.sample = sample;
            sample()
        });

        let popupClosedAt = null;

        popup.on('close', () => popupClosedAt = Date.now());

        const
            movedPromise = popup.waitForFunction(({x, y}) => {
                const moved = Math.max(
                    Math.abs(globalThis.screenX - x),
                    Math.abs(globalThis.screenY - y)
                ) > 40;

                return moved ? {x: globalThis.screenX, y: globalThis.screenY} : false
            }, popupStart, {polling: 'raf', timeout: 15000}).then(async handle => {
                const value = await handle.jsonValue();

                await handle.dispose();
                return value
            }),
            retainedPromise = (async () => {
                const deadline         = Date.now() + 15000;
                let   semanticSnapshot = null;

                while (Date.now() < deadline) {
                    const coexistence = await page.evaluate(() => {
                        const witness = globalThis.__nativeTitlebarWitness;

                        witness.sample();
                        return {
                            firstBothAt      : witness.firstBothAt,
                            maxBothDurationMs: witness.maxBothDurationMs
                        }
                    });

                    if (coexistence.firstBothAt && !semanticSnapshot) {
                        semanticSnapshot = await app.callMethod(wsId, 'readCrossWindowGestureSnapshot', [{
                            parkedItemId     : 'metrics',
                            targetWorkspaceId: 'workstation-main'
                        }])
                    }

                    if (coexistence.firstBothAt && coexistence.maxBothDurationMs >= 32) {
                        return {
                            ...coexistence,
                            firstBothSeen: true,
                            semanticSnapshot,
                            sourceOpen   : !popup.isClosed()
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 10))
                }

                return {
                    error        : 'no proxy/preview coexistence within 15000ms',
                    firstBothSeen: false,
                    semanticSnapshot,
                    sourceOpen   : !popup.isClosed()
                }
            })(),
            [nativeInput, moved, retainedAtFirst] = await Promise.all([
                dragNativeTitlebar({end, prime, start}),
                movedPromise,
                retainedPromise
            ]),
            retained = {
                ...retainedAtFirst,
                receipt: await page.evaluate(() => {
                    const witness = globalThis.__nativeTitlebarWitness;

                    witness.sample();

                    return {
                        firstBothAt      : witness.firstBothAt,
                        firstPreviewAt   : witness.firstPreviewAt,
                        firstProxyAt     : witness.firstProxyAt,
                        maxBothDurationMs: witness.maxBothDurationMs,
                        presence         : witness.presence,
                        samples          : witness.samples
                    }
                }),
                popupClosedAt
            };

        console.log('[native-titlebar][physical-receipt]', JSON.stringify({
            end,
            moved,
            nativeInput,
            popupStart,
            retained: retained.receipt,
            targetCenter
        }));

        expect(nativeInput.access, 'the OS accepted literal HID event authority').toBe(true);
        expect(nativeInput.mouseUpMs).toBeGreaterThan(nativeInput.mouseDownMs);
        expect(Math.max(
            Math.abs(moved.x - popupStart.x),
            Math.abs(moved.y - popupStart.y)
        ), 'the browser must observe its exact OS window physically moving').toBeGreaterThan(40);
        expect(retained.sourceOpen,
            'the source popup must still exist while proxy and preview share retained frames').toBe(true);
        expect(retained.receipt.firstBothAt,
            `the settled proxy and preview must coexist; witness=${JSON.stringify(retained)}`).toBeTruthy();
        expect(retained.receipt.firstPreviewAt,
            'continuous target preview must paint during the physical move').toBeLessThan(nativeInput.mouseUpMs);
        expect(retained.receipt.firstProxyAt,
            'the target-local live proxy must paint before semantic settlement').toBeTruthy();
        expect(retained.receipt.firstPreviewAt,
            'continuous preview must precede the inferred terminal embodiment').toBeLessThan(retained.receipt.firstBothAt);
        expect(retained.receipt.maxBothDurationMs,
            'proxy and readable preview must coexist across at least two 60 Hz frame intervals')
            .toBeGreaterThanOrEqual(32);

        const committedPreview = retained.semanticSnapshot?.preview;

        expect(committedPreview,
            `retained visual frames must carry semantic target truth; snapshot=${JSON.stringify(retained.semanticSnapshot)}`)
            .toMatchObject({
                feedback: {state: 'accepted'},
                itemId  : 'metrics',
                target  : {nodeId: 'right-top-tabs'}
            });
        expect(retained.semanticSnapshot?.rendered?.previewId,
            'the target renderer must display the exact semantic preview').toBe(committedPreview.previewId);

        const
            expectedOperation = previewToOperation(committedPreview),
            expectedReturn    = DockZoneModel.applyOperation(documentBeforeReturn, expectedOperation);

        expect(expectedOperation, 'the retained accepted preview must convert through the production contract')
            .toBeTruthy();
        expect(expectedReturn.errors, 'the retained preview operation must be valid against pre-return truth')
            .toEqual([]);

        let closeReceipt   = null,
            nativeSnapshot = null;

        await expect.poll(async () => {
            closeReceipt = (await app.getComponent(wsId, ['lastTearOutClose']))?.lastTearOutClose ?? null;
            nativeSnapshot = await app.callMethod(wsId, 'readCrossWindowGestureSnapshot', [{
                parkedItemId     : 'metrics',
                targetWorkspaceId: 'workstation-main'
            }]);

            return popup.isClosed()
        }, {
            message: 'semantic commit must settle before retiring the exact source popup',
            timeout: 15000
        }).toBe(true).catch(error => {
            error.message += `\ncloseReceipt=${JSON.stringify(closeReceipt)}`
                + `\nnativeSnapshot=${JSON.stringify(nativeSnapshot)}`;
            throw error
        });

        const documentAfter = await readDocument(app, wsId);

        expect(documentAfter,
            `the exact physical landing must commit its retained ${committedPreview.placement.kind} preview`)
            .toEqual(expectedReturn.document);
        expect(Object.values(documentAfter.nodes)
            .flatMap(node => node.items ?? [])
            .filter(itemId => itemId === 'metrics')).toHaveLength(1);
        expect(await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            'the same live pane must cross the native boundary').toBe(paneIdBefore);
        expect(await readStoreIds(), 'provider store identities must survive the native return')
            .toEqual(storeIdsBefore);
        expect(await readHeartbeat(app, wsId), 'the workspace must stay alive across the return')
            .toBeGreaterThan(heartbeatBefore);

        await page.evaluate(() => {
            const witness = globalThis.__nativeTitlebarWitness;

            witness.stopped = true;
            witness.observer.disconnect()
        });
        await expect.poll(() => page.evaluate(() => {
            const visible = element => {
                if (!element) return false;

                const
                    rect  = element.getBoundingClientRect(),
                    style = getComputedStyle(element);

                return rect.width > 0 && rect.height > 0
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number.parseFloat(style.opacity || '1') > 0
            };

            return {
                preview: visible(document.querySelector('.neo-dock-preview-affordance')),
                proxy  : visible(document.querySelector('.workstation-vessel-dragproxy'))
            }
        }), {
            message  : 'native terminal cleanup must leave no preview or proxy residue',
            timeout  : 5000,
            intervals: [25, 50, 100]
        }).toEqual({preview: false, proxy: false});

        expect(popupProbe).toHaveLength(1);
        expect(popupProbe[0].closed).toBe(true);
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
            heartbeatBefore = await readHeartbeat(app, wsId),
            metricsBefore   = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            commitsBefore   = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
            {cursorEvidence, dockResult, ownerResult, showCursor, targetPopup} =
                await stageMergedVessel({app, page, wsId});

        expect(ownerResult.errors).toEqual([]);
        expect(ownerResult.applied, 'pane A must commit into the first real vessel').toBe(true);
        expect(
            dockResult.errors,
            `cross-window dock receipt: ${JSON.stringify(dockResult.proof ?? null)}`
        ).toEqual([]);
        expect(dockResult.applied, 'pane B must commit into A through the remote target').toBe(true);
        assertFilmCursorLifecycle(cursorEvidence, {expectMigration: true, showCursor});

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
            heartbeatBefore = await readHeartbeat(app, wsId),
            metricsBefore   = await app.callMethod(wsId, 'getPaneIdentity', ['metrics']),
            commitsBefore   = await app.callMethod(wsId, 'getPaneIdentity', ['commits']),
            {cursorEvidence, dockResult, ownerResult, showCursor, targetPopup} =
                await stageMergedVessel({app, page, wsId});

        expect(ownerResult.applied).toBe(true);
        expect(dockResult.applied).toBe(true);
        assertFilmCursorLifecycle(cursorEvidence, {expectMigration: true, showCursor});

        // Projection-continuity witnesses. Pane instances AND their DOM nodes survive
        // EITHER reconciliation path (native reparenting moves them through the common-ancestor
        // transaction — red-proof measured, not assumed), so the pane tag below is a reparenting
        // regression guard, NOT the path discriminator. The discriminator is the SHELL identity:
        // the staged full path replaces the shell instance (its reveal is the measured whole-
        // workspace blank frame), the stable-topology fast path retains it.
        const witnessArmed = await page.evaluate(() => {
            const el = document.querySelector('.workstation-pane-queues');

            if (!el) return false;

            el.__paneContinuityWitness = true;
            return true
        });

        expect(witnessArmed, 'the unmoved queues pane must exist to arm the DOM-continuity witness').toBe(true);

        const shellBefore = await app.callMethod(wsId, 'getShellIdentity', []);

        expect(shellBefore, 'the projection shell must be resolvable before the return').toBeTruthy();

        // The departing-state witness observes DURING the return at RENDERED depth: the terminal
        // presentation is a claim about live-theme paint, not class dispatch. The retheme before
        // the return is the falsifier for the stale-carrier class of bug — a vessel born dark and
        // rethemed light must depart behind the LIGHT ground (document.body keeps its BOOT theme,
        // so a body-mounted consumer would close in the stale color). Each sample compares the
        // overlay's computed background against a same-context probe resolving the LIVE token.
        // Cross-window authority kills the circularity: the MAIN page resolves the expected
        // ground per theme, so a stale vessel cascade cannot satisfy the assertion by agreeing
        // with itself. The pre-flip capture also witnesses the flip's authority (the two
        // expectations must differ, or the retheme never landed anywhere).
        const readMainGround = () => page.evaluate(() => {
            const probe = document.createElement('div');

            probe.style.background = 'var(--workstation-ground)';
            document.querySelector('.workstation-viewport').appendChild(probe);

            const ground = getComputedStyle(probe).backgroundColor;

            probe.remove();
            return ground
        });

        const expectedDarkGround = await readMainGround();

        // Reduced-motion witness: the vocabulary collapses every duration at its root, and the
        // departing rule must inherit that collapse THROUGH the vessel's loaded sheet. Probed on
        // an in-vessel element under emulation BEFORE the real return (which needs normal motion
        // for the fade-progression samples below).
        await targetPopup.emulateMedia({reducedMotion: 'reduce'});

        const reducedMotionDuration = await targetPopup.evaluate(() => {
            const probe = document.createElement('div');

            probe.className = 'workstation-viewport workstation-vessel-departing';
            document.body.appendChild(probe);

            const duration = getComputedStyle(probe, '::after').animationDuration;

            probe.remove();
            return duration
        });

        expect(reducedMotionDuration, 'the vocabulary reduced-motion collapse reaches the departing rule').toBe('0s');

        await targetPopup.emulateMedia({reducedMotion: null});

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);
        await new Promise(resolve => setTimeout(resolve, 600));

        const expectedLightGround = await readMainGround();

        expect(expectedLightGround, 'the theme flip must change the resolved ground (flip authority)')
            .not.toBe(expectedDarkGround);

        const departingSamples = (async () => {
            const samples = [];

            for (let attempt = 0; attempt < 600; attempt++) {
                if (targetPopup.isClosed()) break;

                const sample = await targetPopup.evaluate(() => {
                    const root = document.querySelector('.workstation-viewport.workstation-vessel-departing');

                    if (!root) return null;

                    const
                        after = getComputedStyle(root, '::after'),
                        probe = document.createElement('div');

                    probe.style.background = 'var(--workstation-ground)';
                    root.appendChild(probe);

                    const groundNow = getComputedStyle(probe).backgroundColor;

                    probe.remove();

                    return {background: after.backgroundColor, ground: groundNow, opacity: Number(after.opacity)}
                }).catch(() => null);

                sample && samples.push(sample);
                await new Promise(resolve => setTimeout(resolve, 16))
            }

            return samples
        })();

        const {evidence: returnCursorEvidence, result} = await captureFilmCursorLifecycle({
            action: () => app.callMethod(wsId, 'executeStackReturnStep', [
                {ownerItemId: 'metrics'},
                {
                    attempts : filmPace.birthAttempts ?? 180,
                    moveDelay: filmPace.moveDelay ?? 16,
                    showCursor
                }
            ]),
            observeContinuously: showCursor,
            page,
            sourcePage         : targetPopup,
            targetPage         : page
        });

        const samples = await departingSamples;

        console.log('[departing-witness]', JSON.stringify({count: samples.length, first: samples[0], last: samples.at(-1)}));

        expect(samples.length, 'the departing overlay must render during the close window').toBeGreaterThan(0);
        expect(samples.some(sample => sample.opacity > 0 && sample.opacity < 1),
            'at least one intermediate fade state must render — motion, not a class toggle').toBe(true);
        expect(samples.at(-1).opacity, 'the overlay settles opaque before the close').toBeGreaterThan(.9);

        samples.forEach(sample => {
            expect(sample.background, 'the overlay resolves the LIVE theme ground, never the boot theme')
                .toBe(sample.ground);
            expect(sample.background, 'the vessel ground matches the MAIN window authority for the flipped theme')
                .toBe(expectedLightGround)
        });

        expect(result.errors, JSON.stringify({
            closeReceipt    : result.proof?.closeReceipt,
            phaseOrder      : result.proof?.phaseOrder,
            remoteSnapshot  : result.proof?.remoteSnapshot,
            sourceItemIds   : result.proof?.sourceItemIds,
            sourceWindowGone: result.proof?.sourceWindowGone,
            transfer        : result.proof?.transfer
        })).toEqual([]);
        expect(result.applied, 'the grouped pointer gesture must settle through physical topology exit').toBe(true);
        assertFilmCursorLifecycle(returnCursorEvidence, {expectMigration: true, showCursor});
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

        const witnessState = await page.evaluate(() => {
            const el = document.querySelector('.workstation-pane-queues');

            return {present: Boolean(el), retained: el?.__paneContinuityWitness === true}
        });

        expect(witnessState, 'an unmoved pane DOM node survives the stack-return adoption (native reparenting guard)').toEqual({
            present : true,
            retained: true
        });

        expect(
            await app.callMethod(wsId, 'getShellIdentity', []),
            'a topologically stable stack-return adoption retains the projection shell (no staged full re-stage)'
        ).toBe(shellBefore);

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
