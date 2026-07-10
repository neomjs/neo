// The Electron harness main: boots the Agent OS app on the packaged origin ADR 0034 specifies.
// Scope: harness skeleton + multi-window join; NO Agent OS hosting yet (the topology spike is the
// next slice; isolating shell risk is the point).
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
// Slice-1 simplification, documented: window-all-closed quits the app. The §2.1.5 lifecycle
// (suppress default quit, tray handle, hide-never-destroy) is the E8 leaf — it lands WITH a tray;
// a skeleton without one must stay quittable.

import {app, BrowserWindow, ipcMain, protocol, session} from 'electron';
import {createReadStream}                               from 'node:fs';
import {fileURLToPath}                                  from 'node:url';
import path                                             from 'node:path';
import {
    APP_HOST,
    CONTENT_SECURITY_POLICY,
    REQUIRED_ASSET_PATHS,
    createHarnessAssetResolver,
    isAllowedHarnessAssetPath,
    isHarnessDocumentUrl
} from './contentPolicy.mjs';

const
    harnessDir = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot   = path.resolve(harnessDir, '..'),
    // DEV MODE, deliberately (operator decision 2026-07-10): the harness window loads the
    // zero-build SOURCE app — Neural Link possession needs real ESM, which minification destroys.
    APP_URL    = `app://${APP_HOST}/apps/agentos/index.html`,
    smokeMode  = process.env.NEO_HARNESS_SMOKE === '1',
    smokeState = {
        assetFailures : new Set(),
        assetsSeen    : new Set(),
        rendererErrors: []
    },
    bootReports = new Map(),
    bootWaiters = new Map();

let resolveHarnessAsset;

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
    if (!smokeMode) {
        return
    }

    const message = `${type}: ${String(details?.message ?? details ?? 'unknown').slice(0, 500)}`;

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

    smokeMode && console.log('HARNESS_BOOT_REPORT ' + JSON.stringify(normalized));

    if (waiter) {
        clearTimeout(waiter.timer);
        bootWaiters.delete(senderId);
        waiter.resolve(normalized)
    } else {
        bootReports.set(senderId, normalized)
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

app.on('web-contents-created', (event, contents) => configureWebContents(contents));

process.on('unhandledRejection', error => {
    recordSmokeFailure('main-unhandled-rejection', error);
    console.log('HARNESS_UNHANDLED ' + (error?.stack || error));
    smokeMode && app.exit(2)
});

app.whenReady().then(async () => {
    resolveHarnessAsset = await createHarnessAssetResolver(repoRoot);
    await protocol.handle('app', serveHarnessContent);

    // §2.3.3 deny-by-default; allowlist additions amend ADR 0034 §2.3 first.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));

    ipcMain.on('shell-boot-report', onBootReport);
    ipcMain.on('shell-runtime-error', onRuntimeError);

    const win1 = createHarnessWindow(APP_URL);

    if (!smokeMode) {
        return
    }

    // Smoke: slice-1 boot + slice-2 renderer-initiated popup + one-heap evidence. The popup's
    // viewport id must continue the primary window's App-worker sequence, not restart at 1.
    const boot1 = await awaitBootReport(win1);

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
        results = {
            assetFailures,
            boot1,
            boot2,
            popupMaterialized: Boolean(win2),
            rendererErrors,
            requiredAssetsReady,
            sharedHeapEvidence,
            versions: {
                chrome  : process.versions.chrome,
                electron: process.versions.electron,
                node    : process.versions.node
            }
        },
        passed = boot1.mounted > 10 &&
            boot2.mounted > 10 &&
            results.popupMaterialized &&
            requiredAssetsReady &&
            sharedHeapEvidence &&
            rendererErrors.length === 0;

    console.log('HARNESS_SMOKE_RESULTS=' + JSON.stringify(results, null, 2));
    app.exit(passed ? 0 : 1)
});

// Slice-1 lifecycle simplification (see file top): quittable without a tray; E8 lands §2.1.5.
app.on('window-all-closed', () => app.quit());

// Smoke safety net — on timeout, capture compositor state before exiting.
smokeMode && setTimeout(async () => {
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

    app.exit(1)
}, 60000);
