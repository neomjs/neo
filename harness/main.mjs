// The Electron harness main: boots the Agent OS app on the packaged origin the Electron-shell ADR
// specifies (ADR 0034 — ticket-ref-ok: this file IS that contract's implementation; every §-ref
// below resolves against it). Scope: harness skeleton + multi-window join + the supervised Brain
// (the hosting-spike verdict: Arm B — see brain.mjs).
//
// ADR bindings implemented here:
//   §2.2 C1  privileged app:// scheme (standard + secure + supportFetchAPI), one stable origin
//   §2.2 C3  window.open popups materialize via setWindowOpenHandler and join the shared workers
//   §2.3.1   explicit secure renderer flags on EVERY window, including popups
//   §2.3.2   fail-closed content/window/navigation policy with a host + path allowlist
//   §2.3.3   permissions denied by default + restrictive document CSP
//   §2.3.4   one capability-shaped preload; IPC validates senderFrame before accepting messages
//   §2.6     the app:// origin resolves the same source graph as dev HTTP through an explicit
//            renderer-content allowlist; it never exposes the whole repository
//
//   §2.1.5   one retained cockpit + tray; explicit quit owns exact-once Brain teardown

import {app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, protocol, session, Tray} from 'electron';
import {createReadStream}                                                                   from 'node:fs';
import {fileURLToPath}                                                                      from 'node:url';
import path                                                                                 from 'node:path';
import {
    ADAPTER_STATE_NAMES,
    computeFirstPaintVerdict
} from './adapterWitness.mjs';
import {createAppLifecycle}    from './appLifecycle.mjs';
import {createFleetCapability} from './fleetCapability.mjs';
import {
    APP_HOST,
    CONTENT_SECURITY_POLICY,
    REQUIRED_ASSET_PATHS,
    createHarnessAssetResolver,
    isAllowedHarnessAssetPath,
    isHarnessDocumentUrl
} from './contentPolicy.mjs';
import {
    allocatePort,
    assertIsolatedProfile,
    awaitFleetReady,
    awaitOrchestratorReady,
    awaitPortListening,
    buildBrainProfile,
    buildPackagedBrainEnv,
    clearRunState,
    detectLiveBrain,
    FLEET_SERVER_ENTRY,
    ORCHESTRATOR_ENTRY,
    probePort,
    registerOwnedChild,
    resolveBrainMode,
    resolveUiFleetTransport,
    resolveBrainPaths,
    resolveProductBrainPlan,
    loadFleetRuntimeContracts,
    startBrainChild,
    stopBrainTree,
    sweepStaleRunState,
    writeRunState
} from './brain.mjs';

const
    harnessDir   = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot     = path.resolve(harnessDir, '..'),
    packagedMode = app.isPackaged,
    // The organism root: the repo checkout in dev, the bundled resources tree when packaged (the
    // pack stage stages the SAME allowlist-derived source graph — §2.6 one-boot-path parity).
    organismRoot = packagedMode ? path.join(process.resourcesPath, 'organism') : repoRoot,
    // DEV MODE, deliberately (operator decision 2026-07-10): the harness window loads the
    // zero-build SOURCE app — Neural Link possession needs real ESM, which minification destroys.
    APP_URL      = `app://${APP_HOST}/apps/agentos/index.html`,
    smokeMode            = process.env.NEO_HARNESS_SMOKE === '1',
    lifecycleWitnessMode = process.env.NEO_HARNESS_LIFECYCLE_WITNESS === '1',
    diagnosticMode       = smokeMode || lifecycleWitnessMode,
    // The Arm-B Brain leg: DEFAULT-ON when packaged (a Finder double-click supplies no env — the
    // product IS the supervised organism; NEO_HARNESS_BRAIN=0 is the explicit opt-out) and opt-in
    // on a checkout (dev machines carry a canonical Brain; see brain.mjs#resolveBrainMode).
    brainMode             = resolveBrainMode({env: process.env, packaged: packagedMode}),
    fleetRuntimeContracts = await loadFleetRuntimeContracts(organismRoot),
    // ONE main-owned secret per Electron boot. It crosses only into the Fleet child environment
    // and main-process Authorization headers; preload/renderer/App-Worker receive no getter or byte.
    fleetBearerToken = fleetRuntimeContracts.resolveFleetBearer({suppliedToken: process.env.NEO_FLEET_BEARER}),
    smokeState       = {
        assetFailures : new Set(),
        assetsSeen    : new Set(),
        fleetMethods  : [],
        rendererErrors: [],
        secretLeaks   : new Set()
    },
    bootReports       = new Map(),
    bootWaiters       = new Map(),
    firstPaintReports = new Map(),
    firstPaintWaiters = new Map();

let
    brainBootPromise = Promise.resolve(null),
    resolveHarnessAsset,
    // The shell's transport-boot fact for the cockpit banner — attached to every brain-health
    // answer so the renderer can name WHICH shell case is live instead of guessing "offline".
    // `null` = no transport story this run (plain UI-only smoke spawns nothing by isolation
    // contract); `{phase: 'starting'}` while a boot is in flight; the normalized settle after.
    uiTransportFact = null;

/**
 * @summary Normalizes a settled transport/Brain boot outcome into the wire-safe banner fact.
 *
 * Every boot path resolves a slightly different shape (`bootUiFleetTransport`'s three-outcome
 * plan, `bootProductBrain`'s plan modes, `bootSmokeBrain`'s profile record, the catch handlers'
 * `{error, up: false}`); the cockpit needs ONE shape. Deliberately no bearer, no paths — ports and
 * harness-authored refusal/error strings only, rendered through the banner's text sink.
 * @param {Object|null} boot The settled boot outcome, or `null` (no transport story).
 * @returns {Object|null}
 */
function normalizeTransportFact(boot) {
    if (!boot) return null;

    return {
        error    : boot.error     ?? null,
        fleetPort: boot.fleetPort ?? null,
        mode     : boot.mode      ?? null,
        phase    : 'settled',
        reason   : boot.reason    ?? null,
        up       : boot.up === true
    }
}

// Packaged mode: every parent-side child spawn (Brain children, the config resolver) runs on the
// bundled Electron runtime — the packaged env fragments add ELECTRON_RUN_AS_NODE per child.
if (packagedMode && !process.env.NEO_HARNESS_NODE_BIN) {
    process.env.NEO_HARNESS_NODE_BIN = process.execPath
}

protocol.registerSchemesAsPrivileged([
    {scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true}}
]);

/**
 * @summary Returns the renderer flags that are explicit invariants for every harness window.
 * @returns {Object}
 */
function getSecureWebPreferences() {
    return {
        backgroundThrottling: false,
        contextIsolation    : true,
        nodeIntegration     : false,
        preload             : path.join(harnessDir, 'preload.cjs'),
        sandbox             : true,
        webSecurity         : true
    }
}

/**
 * @summary Records one de-duplicated runtime failure for the smoke verdict.
 * @param {String} type
 * @param {*} details
 */
function recordSmokeFailure(type, details) {
    if (!diagnosticMode) {
        return
    }

    const
        raw           = String(details?.message ?? details ?? 'unknown'),
        containsToken = raw.includes(fleetBearerToken),
        message       = `${type}: ${containsToken ? '[secret-bearing detail redacted]' : raw.slice(0, 500)}`;

    containsToken && smokeState.secretLeaks.add(type);

    if (!smokeState.rendererErrors.includes(message)) {
        smokeState.rendererErrors.push(message)
    }

    console.log(`HARNESS_RUNTIME_FAILURE ${message}`)
}

/**
 * Serves only the allowlisted source graph and public assets. A realpath check inside the resolver
 * closes symlink escapes; every denial is the same 404 response so filesystem shape is not leaked.
 * @summary Handles app:// requests through the fail-closed renderer-content boundary.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function serveHarnessContent(request) {
    const resolved = await resolveHarnessAsset(request.url);

    if (!resolved.ok) {
        if (
            smokeMode &&
            resolved.pathname &&
            isAllowedHarnessAssetPath(resolved.pathname) &&
            ['containment', 'missing'].includes(resolved.reason)
        ) {
            smokeState.assetFailures.add(`${resolved.pathname}:${resolved.reason}`)
        }

        smokeMode && console.log(`HARNESS_404 ${resolved.pathname ?? '<denied>'} ${resolved.reason}`);
        return new Response('not found', {status: 404})
    }

    smokeState.assetsSeen.add(resolved.pathname);

    const headers = {
        'cache-control'         : 'no-store',
        'content-type'          : resolved.contentType,
        'x-content-type-options': 'nosniff'
    };

    if (resolved.isDocument) {
        headers['content-security-policy'] = CONTENT_SECURITY_POLICY;
        headers['x-frame-options']          = 'DENY'
    }

    return new Response(createReadStream(resolved.filePath), {headers})
}

/**
 * @summary Applies popup, navigation, webview, and smoke-diagnostic policy to one WebContents.
 * @param {Electron.WebContents} contents
 */
function configureWebContents(contents) {
    contents.setWindowOpenHandler(({url: target}) => {
        if (!isHarnessDocumentUrl(target)) {
            return {action: 'deny'}
        }

        return {
            action                      : 'allow',
            overrideBrowserWindowOptions: {webPreferences: getSecureWebPreferences()}
        }
    });

    contents.on('will-navigate', (event, target) => {
        if (!isHarnessDocumentUrl(target)) {
            event.preventDefault()
        }
    });

    contents.on('will-attach-webview', event => event.preventDefault());

    if (!smokeMode) {
        return
    }

    contents.on('render-process-gone', (event, details) => recordSmokeFailure('renderer-gone', JSON.stringify(details)));
    contents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
        isMainFrame && recordSmokeFailure('load-failed', `${code} ${description} ${url}`)
    });
    contents.on('preload-error', (event, preloadPath, error) => recordSmokeFailure('preload-error', error));
    contents.on('console-message', details => {
        console.log(`HARNESS_PAGE ${details.level} ${String(details.message).slice(0, 300)}`);

        if (details.level === 'error') {
            recordSmokeFailure('renderer-console', details.message)
        }
    })
}

/**
 * Creates a visible harness window. Hidden windows do not mount because Neo's main-thread delta
 * application rides requestAnimationFrame; background throttling is disabled for the same reason.
 * @summary Creates a primary harness BrowserWindow with the explicit secure renderer posture.
 * @param {String} url
 * @returns {BrowserWindow}
 */
function createHarnessWindow(url) {
    const win = new BrowserWindow({
        height        : 900,
        width         : 1400,
        webPreferences: getSecureWebPreferences()
    });

    win.loadURL(url);
    return win
}

/**
 * Rebuilds the menu on each owner event because Linux does not project later MenuItem mutations
 * until `setContextMenu()` is called again. The disabled state row and tooltip carry the triad;
 * the macOS template icon remains monochrome by platform convention.
 * @summary Creates the one durable tray handle and its state/menu projection controller.
 * @param {Object} options
 * @param {Function} options.onOpen Shows the retained cockpit.
 * @param {Function} options.onQuit Enters explicit quit.
 * @param {'running'|'degraded'|'stopped'} options.state Initial Brain state.
 * @returns {Object}
 */
function createHarnessTray({onOpen, onQuit, state}) {
    const
        iconName = process.platform === 'darwin' ? 'neoTrayTemplate.png' : 'neoTray.png',
        iconPath = path.join(harnessDir, 'assets', 'tray', iconName),
        icon     = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
        throw new Error(`Harness tray icon failed to load: ${iconPath}`)
    }

    const tray = new Tray(icon);
    let menu;

    /**
     * @summary Rebuilds the platform menu from the lifecycle owner's current state.
     * @param {'running'|'degraded'|'stopped'} nextState
     */
    function setState(nextState) {
        const label = nextState[0].toUpperCase() + nextState.slice(1);

        menu = Menu.buildFromTemplate([
            {enabled: false, id: 'brain-state', label: `State: ${label}`},
            {type: 'separator'},
            {click: onOpen, id: 'open-cockpit', label: 'Open Cockpit'},
            {click: onQuit, id: 'quit', label: 'Quit'}
        ]);
        tray.setContextMenu(menu);
        tray.setToolTip(`Neo Harness — ${label}`)
    }

    setState(state);

    return {
        destroy: () => tray.destroy(),
        invoke(action) {
            const item = menu.getMenuItemById(action);

            if (!item) {
                return false
            }

            item.click(item);
            return true
        },
        setState
    }
}

/**
 * @summary Validates that an IPC event came from an allowlisted top-level Agent OS document.
 * @param {Electron.IpcMainEvent} event
 * @returns {Boolean}
 */
function isTrustedIpcSender(event) {
    const frame = event.senderFrame;

    return Boolean(
        frame &&
        frame === event.sender.mainFrame &&
        isHarnessDocumentUrl(frame.url)
    )
}

/**
 * @summary Collects one Fleet credential in Electron-main custody. The modal deliberately contains
 * no input element or script: `before-input-event` prevents renderer dispatch, main reads paste
 * through Electron's clipboard API, and the page receives only a character count in its title.
 * @param {Object} options
 * @param {Electron.IpcMainInvokeEvent} options.event Trusted originating IPC event.
 * @param {String} options.method Credential-bearing Fleet verb.
 * @returns {Promise<String|null>} The ephemeral credential, or `null` when canceled.
 */
function promptFleetCredential({event, method}) {
    const
        MAX_LENGTH = 1024,
        parent     = BrowserWindow.fromWebContents(event.sender),
        promptWin  = new BrowserWindow({
            backgroundColor: '#151922',
            fullscreenable : false,
            height         : 250,
            maximizable    : false,
            minimizable    : false,
            modal          : Boolean(parent),
            parent         : parent?.isDestroyed() ? undefined : parent,
            resizable      : false,
            show           : false,
            title          : 'Fleet credential — 0 characters',
            width          : 540,
            webPreferences : {
                contextIsolation: true,
                nodeIntegration : false,
                sandbox         : true,
                webSecurity     : true
            }
        }),
        promptLabel = method === 'connectTenant' ? 'tenant PAT' : 'GitHub PAT',
        documentUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Fleet credential</title><style>
body{background:#151922;color:#edf2ff;font:16px/1.5 system-ui,sans-serif;margin:0;padding:32px}
h1{font-size:20px;margin:0 0 16px}p{color:#b9c4d8;margin:8px 0}.hint{color:#8ea4c8;font-size:14px}
</style></head><body><h1>Enter ${promptLabel}</h1><p>Paste or type the credential, then press Enter.</p>
<p class="hint">The page receives no key, paste, or credential data. Escape cancels; Backspace edits. The title shows length only.</p></body></html>`);

    return new Promise(resolve => {
        let credential = '', settled = false;

        const
            updateTitle = () => promptWin.setTitle(`Fleet credential — ${credential.length} characters`),
            complete    = value => {
                if (settled) return;

                settled = true;

                const output = value;

                credential = '';
                !promptWin.isDestroyed() && promptWin.destroy();
                resolve(output)
            };

        promptWin.webContents.on('before-input-event', (inputEvent, input) => {
            inputEvent.preventDefault();

            if (input.type !== 'keyDown') return;

            if (input.key === 'Escape') {
                complete(null)
            } else if (input.key === 'Enter') {
                complete(credential.trim() || null)
            } else if (input.key === 'Backspace') {
                credential = credential.slice(0, -1);
                updateTitle()
            } else if ((input.control || input.meta) && input.key?.toLowerCase() === 'v') {
                credential = clipboard.readText().trim().slice(0, MAX_LENGTH);
                updateTitle()
            } else if (input.key?.length === 1 && !input.alt && !input.control && !input.meta && credential.length < MAX_LENGTH) {
                credential += input.key;
                updateTitle()
            }
        });

        promptWin.once('closed', () => complete(null));
        promptWin.webContents.once('render-process-gone', () => complete(null));
        promptWin.once('ready-to-show', () => {
            promptWin.show();
            promptWin.focus()
        });
        promptWin.loadURL(documentUrl).catch(() => complete(null))
    })
}

// The handler closures own the only renderer→Fleet route in the packaged topology. The Brain
// promise is read at call time so an early-rendering UI receives a named not-ready envelope while a
// later call joins the exact boot the lifecycle owner retained.
const fleetCapability = createFleetCapability({
    bearerToken        : fleetBearerToken,
    createWireOffer    : fleetRuntimeContracts.createFleetWireOffer,
    createWireRequest  : fleetRuntimeContracts.createFleetWireRequest,
    createWireResponse : fleetRuntimeContracts.createFleetWireResponse,
    credentialMethods  : fleetRuntimeContracts.FLEET_CREDENTIAL_METHODS,
    credentialProvider : promptFleetCredential,
    getBrain           : () => brainBootPromise,
    inspectWireResponse: fleetRuntimeContracts.inspectFleetWireResponse,
    isTrustedSender    : isTrustedIpcSender,
    onAdmitted         : ({method}) => diagnosticMode && smokeState.fleetMethods.push(method),
    responseStates     : fleetRuntimeContracts.FLEET_WIRE_RESPONSE_STATES,
    wireMethods        : fleetRuntimeContracts.FLEET_WIRE_METHODS
});

/**
 * @summary Reduces an untrusted boot-report payload to its allowlisted primitive fields.
 * @param {*} report
 * @returns {Object|null}
 */
function sanitizeBootReport(report) {
    if (
        !report ||
        !Number.isFinite(report.mounted) ||
        report.mounted < 0 ||
        !(report.viewportId === null || typeof report.viewportId === 'string') ||
        !(report.bootMs === null || Number.isFinite(report.bootMs))
    ) {
        return null
    }

    return {
        bootMs    : report.bootMs,
        mounted   : report.mounted,
        timedOut  : report.timedOut === true,
        viewportId: report.viewportId
    }
}

/**
 * @summary Reduces an untrusted first-paint report to bounded semantic primitives, stamping
 * shell-launch-to-accepted-receipt `firstPaintMs` while preserving renderer-load-to-semantic-ready
 * `rendererFirstPaintMs`.
 * @param {*} report
 * @returns {Object|null}
 */
function sanitizeFirstPaintReport(report) {
    const
        boundedText   = value => value === null || (typeof value === 'string' && value.length <= 100),
        // `null` = head absent. Any other value must be one of the states the witness knows how to
        // check, so an unmapped state cannot arrive as a plausible-looking string and pass silently.
        adapterState  = value => value === null || (typeof value === 'string' && ADAPTER_STATE_NAMES.includes(value));

    if (
        !report ||
        !adapterState(report.rosterState) ||
        !adapterState(report.streamState) ||
        !boundedText(report.activityLabel) ||
        !Number.isInteger(report.cardCount) ||
        report.cardCount < 0 ||
        typeof report.cockpitVisible !== 'boolean' ||
        !(report.rendererFirstPaintMs === null ||
            (Number.isFinite(report.rendererFirstPaintMs) && report.rendererFirstPaintMs >= 0)) ||
        !boundedText(report.rosterLabel) ||
        !Number.isInteger(report.tourControlCount) ||
        report.tourControlCount < 0
    ) {
        return null
    }

    return {
        activityLabel       : report.activityLabel,
        cardCount           : report.cardCount,
        cockpitVisible      : report.cockpitVisible,
        firstPaintMs        : report.rendererFirstPaintMs === null ? null : Math.round(process.uptime() * 1000),
        rendererFirstPaintMs: report.rendererFirstPaintMs,
        rosterLabel         : report.rosterLabel,
        rosterState         : report.rosterState,
        streamState         : report.streamState,
        timedOut            : report.timedOut === true,
        tourControlCount    : report.tourControlCount
    }
}

/**
 * @summary Accepts, caches, and resolves a sender-validated preload boot report.
 * @param {Electron.IpcMainEvent} event
 * @param {*} report
 */
function onBootReport(event, report) {
    if (!isTrustedIpcSender(event)) {
        recordSmokeFailure('ipc-rejected', 'shell-boot-report sender');
        return
    }

    const normalized = sanitizeBootReport(report);

    if (!normalized) {
        recordSmokeFailure('ipc-rejected', 'shell-boot-report payload');
        return
    }

    const
        senderId = event.sender.id,
        waiter   = bootWaiters.get(senderId);

    diagnosticMode && console.log('HARNESS_BOOT_REPORT ' + JSON.stringify(normalized));

    if (waiter) {
        clearTimeout(waiter.timer);
        bootWaiters.delete(senderId);
        waiter.resolve(normalized)
    } else {
        bootReports.set(senderId, normalized)
    }
}

/**
 * @summary Accepts, caches, and resolves a sender-validated packaged first-paint report.
 * @param {Electron.IpcMainEvent} event
 * @param {*} report
 */
function onFirstPaintReport(event, report) {
    if (!isTrustedIpcSender(event)) {
        recordSmokeFailure('ipc-rejected', 'shell-first-paint-report sender');
        return
    }

    const normalized = sanitizeFirstPaintReport(report);

    if (!normalized) {
        recordSmokeFailure('ipc-rejected', 'shell-first-paint-report payload');
        return
    }

    const
        senderId = event.sender.id,
        waiter   = firstPaintWaiters.get(senderId);

    diagnosticMode && console.log('HARNESS_FIRST_PAINT_REPORT ' + JSON.stringify(normalized));

    if (waiter) {
        clearTimeout(waiter.timer);
        firstPaintWaiters.delete(senderId);
        waiter.resolve(normalized)
    } else {
        firstPaintReports.set(senderId, normalized)
    }
}

/**
 * @summary Accepts a sender-validated renderer failure for the smoke verdict.
 * @param {Electron.IpcMainEvent} event
 * @param {*} report
 */
function onRuntimeError(event, report) {
    if (!isTrustedIpcSender(event)) {
        recordSmokeFailure('ipc-rejected', 'shell-runtime-error sender');
        return
    }

    const
        type    = ['error', 'unhandledrejection'].includes(report?.type) ? report.type : 'renderer-error',
        message = typeof report?.message === 'string' ? report.message : 'invalid runtime error payload';

    recordSmokeFailure(type, message)
}

/**
 * Awaits the preload boot report of a window. Reports received before the caller discovers a popup
 * are cached, closing the original popup-report race.
 * @summary Resolves one validated window boot report or a deterministic timeout report.
 * @param {BrowserWindow} win
 * @param {Number} timeoutMs
 * @returns {Promise<Object>}
 */
function awaitBootReport(win, timeoutMs = 30000) {
    const
        senderId = win.webContents.id,
        cached   = bootReports.get(senderId);

    if (cached) {
        bootReports.delete(senderId);
        return Promise.resolve(cached)
    }

    return new Promise(resolve => {
        const timer = setTimeout(() => {
            bootWaiters.delete(senderId);
            resolve({bootMs: null, mounted: 0, timedOut: true, viewportId: null})
        }, timeoutMs);

        bootWaiters.set(senderId, {resolve, timer})
    })
}

/**
 * Reports received before the main smoke reaches this await are cached by sender id.
 * @summary Resolves one validated first-paint report or a deterministic timeout receipt.
 * @param {BrowserWindow} win
 * @param {Number} [timeoutMs=65000]
 * @returns {Promise<Object>}
 */
function awaitFirstPaintReport(win, timeoutMs = 65000) {
    const
        senderId = win.webContents.id,
        cached   = firstPaintReports.get(senderId);

    if (cached) {
        firstPaintReports.delete(senderId);
        return Promise.resolve(cached)
    }

    return new Promise(resolve => {
        const timer = setTimeout(() => {
            firstPaintWaiters.delete(senderId);
            resolve({
                activityLabel       : null,
                cardCount           : 0,
                cockpitVisible      : false,
                firstPaintMs        : null,
                rendererFirstPaintMs: null,
                rosterLabel         : null,
                timedOut            : true,
                tourControlCount    : 0
            })
        }, timeoutMs);

        firstPaintWaiters.set(senderId, {resolve, timer})
    })
}

/**
 * @summary Waits for a popup BrowserWindow without leaving the smoke probe unbounded.
 * @param {BrowserWindow} primary
 * @param {Number} timeoutMs
 * @returns {Promise<BrowserWindow|null>}
 */
function awaitPopupWindow(primary, timeoutMs = 10000) {
    return new Promise(resolve => {
        const
            interval = setInterval(() => {
                const popup = BrowserWindow.getAllWindows().find(win => win !== primary);

                if (popup) {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    resolve(popup)
                }
            }, 100),
            timeout = setTimeout(() => {
                clearInterval(interval);
                resolve(null)
            }, timeoutMs)
    })
}

/**
 * @summary Invokes the one preload Fleet capability from a real BrowserWindow and applies an
 * independent main-side bearer census to the reply. Used only by the headed smoke.
 * @param {BrowserWindow} win
 * @param {Object} request Public Fleet request.
 * @param {Number} [timeoutMs=8000]
 * @returns {Promise<Object>}
 */
async function invokeFleetFromWindow(win, request, timeoutMs = 8000) {
    if (!win || win.isDestroyed()) {
        return {error: 'window unavailable', ok: false}
    }

    const encoded = JSON.stringify(request);
    const reply   = await Promise.race([
        win.webContents.executeJavaScript(
            `Promise.resolve(globalThis.neoShell?.fleetRequest(${encoded}) ?? ` +
            `{ok:false,error:'capability unavailable'})` +
            `.then(envelope => ({envelope,shellKeys:Object.keys(globalThis.neoShell || {}).sort()}))` +
            `.catch(() => ({envelope:{ok:false,error:'capability rejected'},shellKeys:[]}))`,
            true
        ),
        new Promise(resolve => setTimeout(() => resolve({
            envelope : {error: 'capability probe timed out', ok: false},
            shellKeys: []
        }), timeoutMs))
    ]);

    if (JSON.stringify(reply).includes(fleetBearerToken)) {
        smokeState.secretLeaks.add('ipc-reply');
        return {
            envelope : {error: 'secret-bearing reply rejected by smoke census', ok: false},
            shellKeys: []
        }
    }

    return reply
}

/**
 * @summary Gives asynchronous stylesheet and image requests a bounded window to hit the protocol.
 * @param {Number} timeoutMs
 * @returns {Promise<void>}
 */
async function awaitRequiredAssets(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;

    while (
        Date.now() < deadline &&
        !REQUIRED_ASSET_PATHS.every(asset => smokeState.assetsSeen.has(asset))
    ) {
        await new Promise(resolve => setTimeout(resolve, 50))
    }
}

/**
 * @summary Waits for a lifecycle witness predicate without leaving a headed Electron run open.
 * @param {Function} predicate
 * @param {Number} [timeoutMs=3000]
 * @returns {Promise<Boolean>}
 */
async function awaitLifecycleState(predicate, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (predicate()) {
            return true
        }

        await new Promise(resolve => setTimeout(resolve, 50))
    }

    return false
}

/**
 * The witness invokes the menu items retained by the actual Tray controller. It compares the
 * BrowserWindow, WebContents, and viewport DOM identities around close → hide → Open Cockpit,
 * then exits through that same tray's Quit item so the normal will-quit owner proves its drain.
 * @summary Runs the headed same-renderer lifecycle witness and exits through the shipped tray.
 * @param {BrowserWindow} win
 * @returns {Promise<void>}
 */
async function runLifecycleWitness(win) {
    const [boot, brain] = await Promise.all([awaitBootReport(win), brainBootPromise]);
    const before        = {
        browserWindowId: win.id,
        viewportId     : boot.viewportId,
        webContentsId  : win.webContents.id
    };

    win.close();

    const
        hidden      = await awaitLifecycleState(() => !win.isVisible()),
        zeroVisible = await awaitLifecycleState(() => BrowserWindow.getAllWindows().every(item => !item.isVisible())),
        openInvoked = appLifecycle.invokeTrayAction('open-cockpit'),
        restored    = await awaitLifecycleState(() => win.isVisible());

    const afterViewportId = await win.webContents.executeJavaScript(
        `document.querySelector('[id^="neo-vnode-"], .neo-viewport')?.id ?? null`, true
    );
    const after = {
        browserWindowId: win.id,
        viewportId     : afterViewportId,
        webContentsId  : win.webContents.id
    };
    const receipt = {
        after,
        before,
        brainUp             : brain?.up === true,
        destroyedAfterHide  : win.isDestroyed(),
        hidden,
        openInvoked,
        rendererErrors      : [...smokeState.rendererErrors],
        sameBrowserWindow   : after.browserWindowId === before.browserWindowId,
        sameRenderer        : after.webContentsId === before.webContentsId,
        sameViewportIdentity: Boolean(before.viewportId) && after.viewportId === before.viewportId,
        state               : appLifecycle.brainState,
        restored,
        zeroVisible
    };
    const lifecyclePassed = receipt.brainUp &&
        !receipt.destroyedAfterHide &&
        receipt.hidden &&
        receipt.openInvoked &&
        receipt.rendererErrors.length === 0 &&
        receipt.sameBrowserWindow &&
        receipt.sameRenderer &&
        receipt.sameViewportIdentity &&
        receipt.state === 'running' &&
        receipt.restored &&
        receipt.zeroVisible;
    // Preserve a failing combined receipt while still traversing the REAL tray Quit callback. A
    // failed Brain leg must not short-circuit the lifecycle witness it is meant to exercise.
    process.exitCode = lifecyclePassed ? 0 : 1;

    const
        quitInvoked = appLifecycle.invokeTrayAction('quit'),
        passed      = lifecyclePassed && quitInvoked;

    console.log('HARNESS_LIFECYCLE_RESULTS=' + JSON.stringify({...receipt, passed, quitInvoked}, null, 2));

    if (!quitInvoked) {
        await appLifecycle.exitTerminal(1)
    }
}

app.on('web-contents-created', (event, contents) => configureWebContents(contents));

process.on('unhandledRejection', async error => {
    recordSmokeFailure('main-unhandled-rejection', error);
    console.log('HARNESS_UNHANDLED ' + (error?.stack || error));

    if (diagnosticMode) {
        // app.exit bypasses will-quit, so the failure net owns the Brain teardown explicitly.
        await appLifecycle.exitTerminal(2)
    }
});

const brainState = {children: [], isolationRoot: null};

function brainLog(line) {
    if (line.includes(fleetBearerToken)) {
        smokeState.secretLeaks.add('brain-log');
        console.log('HARNESS_BRAIN [secret-bearing line redacted]')
    } else {
        console.log('HARNESS_BRAIN ' + line.slice(0, 300))
    }
}

/**
 * @summary Full-tree teardown of every child the harness started (and only those — §2.1.1 one
 * lifecycle owner), then clears the smoke run-state: a record surviving a CLEAN stop would make
 * a later sweep signal whatever now owns the recycled process-group ids. Callable from every
 * exit path: will-quit, smoke completion, the smoke nets.
 * @returns {Promise<Object|null>} per-child stop report, or null when nothing was supervised
 */
async function teardownBrain() {
    if (!brainState.children.length) {
        return null
    }

    const children = brainState.children;

    brainState.children = [];

    const report = await stopBrainTree(children);

    if (brainState.isolationRoot) {
        clearRunState({isolationRoot: brainState.isolationRoot});
        brainState.isolationRoot = null
    }

    return report
}

const appLifecycle = createAppLifecycle({
    app,
    onTeardownError(error) {
        console.log('HARNESS_BRAIN_STOP_FAILED ' + (error?.stack || error))
    },
    onTeardownSettled(report) {
        if (diagnosticMode) {
            const
                reports   = Object.values(report ?? {}),
                cleanStop = reports.every(item => item.exited && item.groupEmpty && !item.forced);

            console.log('HARNESS_BRAIN_STOP ' + JSON.stringify({cleanStop, report}))
        }
    },
    smokeMode,
    // Quit during boot waits for that bounded readiness contract before draining children. Without
    // this join, an early will-quit can observe an empty owner and a late spawn becomes an orphan.
    teardownBrain: async () => {
        await brainBootPromise;
        return teardownBrain()
    }
});

/**
 * @summary Registers one owned child: teardown ownership unconditionally, Brain-health
 * observation only for organism children — the split lives in {@link registerOwnedChild}
 * (brain.mjs), where its owner-coverage witness also lives. `observeBrain: false` (the UI-mode
 * fleet transport) is drain-owned with diagnostic-log-only fault visibility.
 * @param {Object} entry The brainState child record (`{child, label, observeBrain?, ...}`).
 * @returns {Object}
 */
function registerBrainChild(entry) {
    return registerOwnedChild({
        children        : brainState.children,
        entry,
        onUnobservedExit: summary => console.log(`HARNESS_UI_FLEET_CHILD ${summary}`),
        watch           : appLifecycle.watchBrainChild
    })
}

/**
 * The product Brain boot — PLANE-ATTACH / ATTACH / OWN (see brain.mjs): a declared containerized
 * plane starts only the missing Fleet transport, a live host Brain is attached, and only a truly
 * fresh machine owns the full organism. It never boots a second organism beside either declared
 * authority — the daemon's single-instance takeover and the supervisor's singleton-port reaping
 * make that unsafe by construction.
 * @summary Boots or attaches the Brain for `start:brain`, supervising only what is missing.
 * @returns {Promise<Object>}
 */
async function bootProductBrain() {
    // Packaged mode: the organism ships read-only(ish), so every mutable path moves to the
    // per-user data root, and Brain children (plus shebang grandchildren via the organism's node
    // shim) run on the BUNDLED Electron runtime — a stranger's machine carries no Node.
    const packagedEnv = packagedMode
        ? {
            ...buildPackagedBrainEnv({dataRoot: path.join(app.getPath('userData'), 'brain')}),
            ELECTRON_RUN_AS_NODE    : '1',
            NEO_HARNESS_ELECTRON_BIN: process.execPath
        }
        : {};

    const
        fleetPort = Number(process.env.NEO_FLEET_PORT) || 8083,
        paths     = await resolveBrainPaths({env: packagedEnv, repoRoot: organismRoot}),
        live      = await detectLiveBrain({
            bearerToken        : fleetBearerToken,
            fleetPort,
            orchestratorDataDir: paths.orchestratorDataDir,
            repoRoot           : organismRoot
        }),
        plan      = resolveProductBrainPlan({
            fleetServing     : live.fleetServing,
            orchestratorAlive: live.orchestratorAlive,
            planeBase        : paths.fleetPlaneBase
        }),
        {mode}    = plan;

    // The selected plan goes on record BEFORE anything spawns: a boot that fails past this point
    // logs HARNESS_BRAIN_BOOT_FAILED with no plan context of its own, and diagnosing "which mode
    // was it attempting" from silence cost a live iteration run. Success keeps the richer
    // HARNESS_BRAIN_MODE line below.
    console.log(`HARNESS_BRAIN_PLAN ${JSON.stringify({fleetPort, mode, planeBase: plan.planeBase ?? null, startFleet: !!plan.startFleet, startOrchestrator: !!plan.startOrchestrator})}`);

    if (plan.startOrchestrator) {
        // Coexistence guard (dev machines): a packaged app's own-mode organism runs the DEFAULT
        // ports — a checkout Brain's Chroma already on that port would be REAPED by the spawned
        // supervisor (singleton-port reconciliation). A held Chroma port without a serving fleet
        // fails the boot closed instead.
        if (packagedMode && await probePort({host: 'localhost', port: paths.chromaPort})) {
            throw new Error(`chroma port ${paths.chromaPort} is already held (a checkout Brain?) — the packaged harness cannot own an organism beside it`)
        }

        const orchestrator = startBrainChild({entry: ORCHESTRATOR_ENTRY, env: packagedEnv, onLog: brainLog, repoRoot: organismRoot});

        registerBrainChild({child: orchestrator, label: 'orchestrator'});
        await awaitOrchestratorReady({child: orchestrator})
    }

    if (plan.startFleet) {
        // Protocol identity, fail closed: a listener that does NOT answer the fleet wire verb is
        // a foreign server squatting the port — spawning into it would EADDRINUSE, and skipping
        // the spawn would report a Brain that the window cannot actually reach.
        if (live.fleetPortHeld) {
            throw new Error(`fleet port ${fleetPort} cannot be reused: ${live.fleetRefusalReason || 'listener did not prove canonical Fleet identity'} — free the port or set NEO_FLEET_PORT`)
        }

        const fleet = startBrainChild({
            entry   : FLEET_SERVER_ENTRY,
            env     : {...packagedEnv, NEO_FLEET_BEARER: fleetBearerToken, NEO_FLEET_PORT: String(fleetPort)},
            onLog   : brainLog,
            repoRoot: organismRoot
        });

        registerBrainChild({child: fleet, label: 'fleet'});
        await awaitFleetReady({bearerToken: fleetBearerToken, child: fleet, port: fleetPort, repoRoot: organismRoot})
    }

    console.log(`HARNESS_BRAIN_MODE ${mode}${plan.planeBase ? ` planeBase=${plan.planeBase}` : ''} fleetPort=${fleetPort} started=[${brainState.children.map(entry => entry.label).join(',') || 'none'}]`);
    return {fleetPort, mode, planeBase: plan.planeBase, up: true}
}

/**
 * The UI-only transport boot: plain `npm start` self-supplies the fleet transport instead of
 * demanding a hand-carried `NEO_FLEET_BEARER` across two terminals (the first live operator run
 * proved that coordination model unusable — and `fleetCapability` gates every renderer request on
 * this boot receipt, so WITHOUT it the UI-only window could never reach a transport at all, even
 * a perfectly-coordinated external one).
 *
 * Three outcomes, fail-honest:
 * - **reuse** — a listener on the port proves canonical Fleet identity for THIS bearer + viewer
 *   (the same-token-same-viewer probe): the shell adopts it and spawns nothing.
 * - **spawn** — the port is free: the shell starts `devFleetServer` as an OWNED child with the
 *   bearer it already holds (zero coordination — the packaged topology's behavior), awaits real
 *   wire readiness, and the existing quit drain tears it down (`brainState.children` is the one
 *   ownership set; the drain keys on membership, not on Brain mode). Ownership ≠ observation:
 *   the child registers `observeBrain: false`, so its death logs diagnostically and renders as
 *   the cockpit's honest offline — never as whole-Brain `degraded` (the tray reports the
 *   organism, not the UI's transport convenience).
 * - **foreign-listener** — something else holds the port: the WINDOW must not brick (contrast:
 *   organism boot fails closed), so the cockpit keeps its honest offline state and the named
 *   refusal lands in the shell log.
 * @summary Probes-then-spawns the app↔fleet transport for UI-only mode; never touches tray Brain state.
 * @returns {Promise<Object>} `{fleetPort, mode: 'reuse'|'spawn'|'foreign-listener', up: Boolean}`
 */
async function bootUiFleetTransport() {
    // The three-outcome routing AND the ownership≠observation invariant live in the witnessable
    // composition (brain.mjs#resolveUiFleetTransport); this wrapper only binds the real
    // collaborators: env coordinates, the shell bearer, the child spawner, and the owner registry.
    return resolveUiFleetTransport({
        agentIdentityNodeId: process.env.NEO_AGENT_IDENTITY,
        awaitReady         : awaitFleetReady,
        bearerToken        : fleetBearerToken,
        fleetPort          : Number(process.env.NEO_FLEET_PORT) || 8083,
        onOutcome          : summary => console.log(`HARNESS_UI_FLEET ${summary}`),
        registerChild      : registerBrainChild,
        repoRoot           : organismRoot,
        spawn              : ({fleetPort}) => startBrainChild({
            entry   : FLEET_SERVER_ENTRY,
            env     : {NEO_FLEET_BEARER: fleetBearerToken, NEO_FLEET_PORT: String(fleetPort)},
            onLog   : brainLog,
            repoRoot: organismRoot
        })
    })
}

/**
 * The smoke Brain boot. TWO profile shapes, deliberately distinct:
 * - **Packaged:** the EXACT product profile (`buildPackagedBrainEnv` — the artifact's lane and
 *   resource closure, unreduced), shifted only in COORDINATES: allocated Chroma/fleet ports and a
 *   throwaway data root, so a dev box's live Brain is never touched while the smoke still proves
 *   what a real double-click boots.
 * - **Checkout:** the fully isolated dev profile (`buildBrainProfile` — every side lane gated),
 *   because a checkout smoke runs beside a canonical organism whose lanes must not double-run.
 * Both assert the isolation matrix THROUGH the config SSOT before anything spawns; readiness is
 * genuine service readiness (poll-loop marker + a real fleet wire verb), never PID existence.
 * @summary Boots the smoke organism under the mode-correct profile, returning every observable.
 * @returns {Promise<Object>}
 */
async function bootSmokeBrain() {
    const
        isolationRoot           = process.env.NEO_HARNESS_BRAIN_ROOT ||
            (packagedMode ? path.join(app.getPath('userData'), 'smoke') : path.join(harnessDir, '.brain', 'smoke')),
        sweptPgids              = sweepStaleRunState({isolationRoot}),
        [chromaPort, fleetPort] = await Promise.all([allocatePort(), allocatePort()]),
        profile                 = packagedMode
            ? {
                ...buildPackagedBrainEnv({dataRoot: isolationRoot}),
                ELECTRON_RUN_AS_NODE    : '1',
                NEO_CHROMA_PORT         : String(chromaPort),
                NEO_FLEET_BEARER        : fleetBearerToken,
                NEO_FLEET_PLANE_BASE    : '',
                NEO_FLEET_PLANE_BEARER  : '',
                NEO_FLEET_PORT          : String(fleetPort),
                NEO_HARNESS_ELECTRON_BIN: process.execPath
            }
            : {...buildBrainProfile({chromaPort, fleetPort, isolationRoot}), NEO_FLEET_BEARER: fleetBearerToken},
        resolved                = await resolveBrainPaths({env: profile, repoRoot: organismRoot}),
        matrixViolations        = assertIsolatedProfile({chromaPort, isolationRoot, resolved});

    if (matrixViolations.length > 0) {
        return {chromaPort, fleetPort, isolationRoot, matrixViolations, sweptPgids, up: false}
    }

    const
        orchestrator = startBrainChild({entry: ORCHESTRATOR_ENTRY, env: profile, onLog: brainLog, repoRoot: organismRoot}),
        fleet        = startBrainChild({entry: FLEET_SERVER_ENTRY, env: profile, onLog: brainLog, repoRoot: organismRoot});

    registerBrainChild({child: orchestrator, ...orchestrator.neoHarnessIdentity, label: 'orchestrator'});
    registerBrainChild({child: fleet,        ...fleet.neoHarnessIdentity,        label: 'fleet'});
    brainState.isolationRoot = isolationRoot;
    writeRunState({
        isolationRoot,
        children: brainState.children.map(({child, entry, ownershipToken}) => ({
            entry,
            ownershipToken,
            pgid: child.pid
        }))
    });

    await Promise.all([
        awaitOrchestratorReady({child: orchestrator}),
        awaitFleetReady({bearerToken: fleetBearerToken, child: fleet, port: fleetPort, repoRoot: organismRoot})
    ]);

    return {
        chromaPort,
        fleetPort,
        isolationRoot,
        matrixViolations,
        profileMode: packagedMode ? 'packaged-product' : 'checkout-isolated',
        sweptPgids,
        up         : true
    }
}

app.whenReady().then(async () => {
    resolveHarnessAsset = await createHarnessAssetResolver(organismRoot);
    await protocol.handle('app', serveHarnessContent);

    // §2.3.3 deny-by-default; Electron requires BOTH handlers for complete permission coverage.
    // Allowlist additions amend the shell ADR §2.3 first.
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));

    if (diagnosticMode) {
        // Preload diagnostics are smoke-only. Registering these in normal operation would cache
        // one unconsumed boot report per window even though no smoke waiter exists.
        ipcMain.on('shell-boot-report', onBootReport);
        ipcMain.on('shell-first-paint-report', onFirstPaintReport);
        ipcMain.on('shell-runtime-error', onRuntimeError)
    }

    ipcMain.handle('fleet-request', fleetCapability.request);

    // Whole-Brain health crosses ONLY from the lifecycle owner — never composed from per-agent
    // fleet rows. Untrusted senders reject (transport truth, never daemon truth).
    ipcMain.handle('brain-health', event => {
        if (!isTrustedIpcSender(event)) {
            throw new Error('brain-health: untrusted sender')
        }

        // Daemon truth plus the shell's transport-boot fact on one pull: the cockpit's banner
        // needs BOTH — the organism's health for the daemon line, the transport fact for honest
        // cold-case guidance (never "start it: npm run ai:fleet-server" inside a shell that
        // self-supplies). No new channel: the fact rides the wire that already crosses.
        return {...appLifecycle.brainHealth, transport: uiTransportFact}
    });

    const win1 = createHarnessWindow(APP_URL);

    appLifecycle.attachCockpitWindow(win1);

    // The Brain boots in parallel with the window — the UI never blocks on the supervisor, and
    // fail-closed surfaces render honestly until the transport is reachable. Boot rejection is
    // deterministic (readiness contract) and lands as up:false, never as a hung promise.
    if (brainMode) {
        appLifecycle.setBrainState('degraded')
    }

    // The banner fact enters 'starting' exactly when a transport boot is actually in flight —
    // brain mode boots the organism's fleet leg, UI-only product self-supplies. Plain UI-only
    // smoke spawns nothing by isolation contract and keeps `null`: no transport story to tell.
    if (brainMode || !diagnosticMode) {
        uiTransportFact = {phase: 'starting'}
    }

    brainBootPromise = brainMode
        ? (diagnosticMode ? bootSmokeBrain() : bootProductBrain())
            .catch(error => {
                console.log('HARNESS_BRAIN_BOOT_FAILED ' + error.message);
                return {error: error.message, up: false}
            })
            .then(boot => {
                appLifecycle.settleBrainBoot(boot.up === true);
                uiTransportFact = normalizeTransportFact(boot);
                return boot
            })
        : (diagnosticMode
            // Plain smoke keeps its isolation contract: UI-only legs spawn nothing (a dev machine
            // may carry a live transport); the fleet leg's evidence lives in smoke:brain.
            ? Promise.resolve(null)
            // UI-only product path: self-supply the transport. Tray Brain state is deliberately
            // untouched — a fleet transport is not a Brain claim.
            : bootUiFleetTransport()
                .catch(error => {
                    console.log('HARNESS_UI_FLEET_BOOT_FAILED ' + error.message);
                    return {error: error.message, up: false}
                })
                .then(boot => {
                    uiTransportFact = normalizeTransportFact(boot);
                    return boot
                }));

    if (!smokeMode) {
        try {
            // The boot promise is retained BEFORE Quit becomes reachable from the tray. An early
            // tray click therefore cannot drain an empty owner while a late child still spawns.
            appLifecycle.installTray(createHarnessTray)
        } catch (error) {
            // Fail reachable: without a tray, cockpit close remains ordinary and
            // window-all-closed keeps the pre-E8 quit fallback.
            console.log('HARNESS_TRAY_INIT_FAILED ' + error.message);
            appLifecycle.setBrainState('degraded')
        }
    }

    if (lifecycleWitnessMode) {
        await runLifecycleWitness(win1);
        return
    }

    if (!smokeMode) {
        return
    }

    // Smoke: slice-1 boot + slice-2 renderer-initiated popup + one-heap evidence. The popup's
    // viewport id must continue the primary window's App-worker sequence, not restart at 1.
    const [boot1, firstPaint] = await Promise.all([
        awaitBootReport(win1),
        awaitFirstPaintReport(win1)
    ]);

    // Renderer window.open needs a user gesture. Post-boot executeJavaScript is bounded because the
    // same call can wedge during module-graph boot; real product popouts originate from real clicks.
    await new Promise(resolve => setTimeout(resolve, 1500));

    const openPath = await Promise.race([
        win1.webContents.executeJavaScript(
            `window.open('${APP_URL}', '_blank', 'width=900,height=700'); 'renderer-window-open'`, true
        ),
        new Promise(resolve => setTimeout(() => resolve('gesture-call-wedged'), 5000))
    ]);

    console.log('HARNESS_POPUP_PATH ' + openPath);

    const
        win2  = await awaitPopupWindow(win1),
        boot2 = win2 ? await awaitBootReport(win2) : {
            bootMs: null, mounted: 0, timedOut: true, viewportId: null
        };

    await awaitRequiredAssets();

    // The VISUAL verdict: mounted-node counts and asset probes cannot see a broken layout (stale
    // built themes, corrupted template data — a live incident shipped exactly that). Every smoke
    // run captures the primary window so a human — or the next agent — can LOOK at what actually
    // rendered. Packaged mode writes to userData (the app bundle is read-only-ish).
    try {
        const
            image    = await win1.capturePage(),
            shotPath = path.join(packagedMode ? app.getPath('userData') : harnessDir, 'smoke-shot.png');

        (await import('node:fs')).writeFileSync(shotPath, image.toPNG());
        console.log('HARNESS_SMOKE_SHOT ' + shotPath)
    } catch (error) {
        console.log('HARNESS_SMOKE_SHOT_FAIL ' + error.message)
    }

    // The Brain leg (Arm B): the isolated organism proven through its OWN consumable surfaces —
    // the resolved-leaf isolation matrix, genuine orchestrator + Fleet readiness, authenticated
    // capability calls from both real windows, a fresh App-Worker crossing after popup close, a
    // genuine off-origin rejection, then full-tree teardown gated on group-empty AND released listeners.
    let brain = {mode: false};

    if (brainMode) {
        const boot = await brainBootPromise;

        let chromaListening = null,
            fleetFromWindow = null;

        if (boot.up) {
            // Let the organism SETTLE before quitting: the isolated Chroma serving on the
            // allocated port is live isolation evidence AND removes the mid-startup-child race
            // from the graceful-teardown measurement. Chroma binds `localhost` (::1 on macOS),
            // and a cold start on a fresh persist dir takes ~a minute.
            chromaListening = await awaitPortListening({host: 'localhost', port: boot.chromaPort, timeoutMs: 120000});

            const
                request             = {method: 'listAgents', params: {}},
                primary             = await invokeFleetFromWindow(win1, request),
                popup               = await invokeFleetFromWindow(win2, request),
                firstWorkerCrossing = await awaitLifecycleState(
                    () => smokeState.fleetMethods.includes('fleetRoster'),
                    20000
                ),
                rosterCountAtClose  = smokeState.fleetMethods.filter(method => method === 'fleetRoster').length;

            win2 && !win2.isDestroyed() && win2.close();

            const
                popupClosed           = Boolean(win2) && await awaitLifecycleState(() => win2.isDestroyed(), 3000),
                primaryAfterPopup     = await invokeFleetFromWindow(win1, request),
                workerAfterPopupClose = await awaitLifecycleState(
                    () => smokeState.fleetMethods.filter(method => method === 'fleetRoster').length > rosterCountAtClose,
                    20000
                ),
                forgedWindow            = new BrowserWindow({show: false, webPreferences: getSecureWebPreferences()});

            let forgedSender;

            try {
                await forgedWindow.loadURL('data:text/html;charset=utf-8,<title>forged Fleet sender</title>');
                forgedSender = await invokeFleetFromWindow(forgedWindow, request)
            } catch {
                forgedSender = {envelope: {error: 'off-origin window failed to load', ok: false}, shellKeys: []}
            } finally {
                !forgedWindow.isDestroyed() && forgedWindow.destroy()
            }

            const
                expectedShellKeys = ['fleetRequest', 'shellVersion'],
                probes            = [primary, popup, primaryAfterPopup, forgedSender],
                surfaceExact      = probes.every(probe =>
                    JSON.stringify(probe.shellKeys) === JSON.stringify(expectedShellKeys)
                ),
                urlSecretFree     = BrowserWindow.getAllWindows().every(win =>
                    !win.webContents.getURL().includes(fleetBearerToken)
                );

            fleetFromWindow = {
                firstWorkerCrossing,
                fleetMethods: [...smokeState.fleetMethods],
                forgedSender,
                popup,
                popupClosed,
                primary,
                primaryAfterPopup,
                surfaceExact,
                urlSecretFree,
                workerAfterPopupClose
            }
        }

        const
            stop          = await appLifecycle.teardown(),
            stopReports   = Object.values(stop ?? {}),
            groupsEmpty   = stopReports.every(report => report.groupEmpty),
            portsReleased = boot.up
                ? !(await probePort({host: 'localhost', port: boot.chromaPort})) && !(await probePort({port: boot.fleetPort}))
                : null;

        if (fleetFromWindow) {
            fleetFromWindow.secretLeaks = [...smokeState.secretLeaks];
            fleetFromWindow.secretFree  = fleetFromWindow.urlSecretFree && fleetFromWindow.secretLeaks.length === 0
        }

        brain = {mode: true, ...boot, chromaListening, fleetFromWindow, groupsEmpty, portsReleased, stop}
    }

    const
        assetFailures       = [...smokeState.assetFailures],
        rendererErrors      = [...smokeState.rendererErrors],
        requiredAssetsReady = REQUIRED_ASSET_PATHS.every(asset => smokeState.assetsSeen.has(asset)) &&
            assetFailures.length === 0,
        sharedHeapEvidence  = Boolean(
            boot1.viewportId &&
            boot2.viewportId &&
            boot1.viewportId !== boot2.viewportId
        ),
        // The verdict arithmetic lives in `adapterWitness.mjs` so it is unit-testable without Electron:
        // it had NO coverage while it sat here, and the verdict is what the release gate reads.
        //
        // NOTE on `tourControlCount`: it is not a term in the verdict, but it DOES gate the final result
        // transitively — the preload only reports `ready` when no tour controls are present, so a demo
        // tour makes the report arrive via the timeout path and `timedOut === false` then fails. The
        // product-first-paint policy is intended; describing it as "removed from the verdict" was true
        // of the expression and false of the behaviour.
        verdict = computeFirstPaintVerdict({
            firstPaint,
            packagedMode,
            brainMode,
            brainUp: brain.mode ? brain.up === true : null
        }),
        {adaptersCoherent, firstPaintPassed, productWitnessPassed, productWitnessUnmet} = verdict,
        firstPaintReceipt = {
            ...firstPaint,
            adaptersCoherent,
            brainMode,
            brainUp: brain.mode ? brain.up === true : null,
            packagedMode,
            passed : firstPaintPassed,
            productWitnessPassed,
            productWitnessUnmet
        },
        results = {
            assetFailures,
            boot1,
            boot2,
            brain,
            firstPaint       : firstPaintReceipt,
            popupMaterialized: Boolean(win2),
            rendererErrors,
            requiredAssetsReady,
            sharedHeapEvidence,
            versions         : {
                chrome  : process.versions.chrome,
                electron: process.versions.electron,
                node    : process.versions.node
            }
        },
        brainPassed = !brain.mode || (
            brain.up === true &&
            (brain.matrixViolations ?? ['unresolved']).length === 0 &&
            brain.chromaListening === true &&
            brain.fleetFromWindow?.primary?.envelope?.ok === true &&
            brain.fleetFromWindow?.popup?.envelope?.ok === true &&
            brain.fleetFromWindow?.popupClosed === true &&
            brain.fleetFromWindow?.primaryAfterPopup?.envelope?.ok === true &&
            brain.fleetFromWindow?.forgedSender?.envelope?.ok === false &&
            brain.fleetFromWindow?.forgedSender?.envelope?.error === 'fleet: untrusted shell sender' &&
            brain.fleetFromWindow?.firstWorkerCrossing === true &&
            brain.fleetFromWindow?.workerAfterPopupClose === true &&
            brain.fleetFromWindow?.surfaceExact === true &&
            brain.fleetFromWindow?.secretFree === true &&
            brain.groupsEmpty === true &&
            brain.portsReleased === true &&
            Object.values(brain.stop ?? {}).every(report => report.exited && !report.forced)
        ),
        passed = boot1.mounted > 10 &&
            boot2.mounted > 10 &&
            firstPaintPassed &&
            results.popupMaterialized &&
            requiredAssetsReady &&
            sharedHeapEvidence &&
            rendererErrors.length === 0 &&
            brainPassed;

    console.log('HARNESS_FIRST_PAINT_RESULTS=' + JSON.stringify(firstPaintReceipt, null, 2));
    console.log('HARNESS_SMOKE_RESULTS=' + JSON.stringify(results, null, 2));
    await appLifecycle.exitTerminal(passed ? 0 : 1)
});

// Smoke safety net — on timeout, capture compositor state before exiting.
(smokeMode || lifecycleWitnessMode) && setTimeout(async () => {
    console.log('HARNESS_SMOKE_TIMEOUT');

    try {
        const
            win   = BrowserWindow.getAllWindows()[0],
            image = await win?.capturePage();

        if (image) {
            const {writeFileSync} = await import('node:fs');

            writeFileSync(path.join(harnessDir, 'smoke-timeout.png'), image.toPNG());
            console.log('HARNESS_TIMEOUT_CAPTURE written')
        }
    } catch (error) {
        console.log('HARNESS_TIMEOUT_CAPTURE_FAIL ' + error.message)
    }

    // app.exit bypasses will-quit, so the timeout net owns the Brain teardown explicitly.
    await appLifecycle.exitTerminal(1)
    // The Brain leg legitimately spends ~2min on a cold Chroma start; the UI-only smoke stays tight.
}, brainMode ? 240000 : 60000);
