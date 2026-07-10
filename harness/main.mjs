// The Electron shell main: boots the harness app on the packaged origin the Electron-shell ADR
// specifies (ADR 0034 — ticket-ref-ok: this file IS that contract's implementation; every §-ref
// below resolves against it). Scope: shell skeleton + multi-window join; NO Agent OS hosting yet
// (the topology spike is the next slice; isolating shell risk is the point).
//
// Shell-ADR bindings implemented here:
//   §2.2 C1  privileged app:// scheme (standard + secure + supportFetchAPI), one stable origin
//   §2.2 C3  window.open popups materialize via setWindowOpenHandler and join the shared workers
//   §2.3.1   contextIsolation + sandbox + no nodeIntegration on EVERY window incl. popups
//   §2.3.2   fail-closed window policy: same-origin allowlist, off-origin navigation denied
//   §2.3.3   permissions denied by default
//   §2.3.4   one capability-shaped preload (empty skeleton surface)
//   §2.6     the app:// origin serves the SAME repo root the dev http origin serves, and the
//            harness window loads the dev-mode SOURCE app — parity is the document root itself
//
// Slice-1 simplification, documented: window-all-closed quits the app. The §2.1.5 lifecycle
// (suppress default quit, tray handle, hide-never-destroy) is the E8 leaf — it lands WITH a tray;
// a skeleton without one must stay quittable.

import {app, BrowserWindow, ipcMain, protocol, session} from 'electron';
import {createReadStream, existsSync}                   from 'node:fs';
import {fileURLToPath}                                  from 'node:url';
import path                                             from 'node:path';

const
    harnessDir = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot   = path.resolve(harnessDir, '..'),
    APP_HOST   = 'neo',
    // DEV MODE, deliberately (operator decision 2026-07-10): the harness window loads the
    // zero-build SOURCE app — the Neural Link's possession depth (inspect_class,
    // get_method_source, patch_code) needs real source ESM, which minified dist output destroys.
    // The document root is the repo root, so dist/* stays reachable for size-sensitive arms.
    APP_URL   = `app://${APP_HOST}/apps/agentos/index.html`,
    smokeMode = process.env.NEO_HARNESS_SMOKE === '1';

const MIME = {
    '.css'  : 'text/css',
    '.html' : 'text/html',
    '.js'   : 'text/javascript',
    '.json' : 'application/json',
    '.mjs'  : 'text/javascript',
    '.png'  : 'image/png',
    '.svg'  : 'image/svg+xml',
    '.wasm' : 'application/wasm',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2'
};

protocol.registerSchemesAsPrivileged([
    {scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true}}
]);

/**
 * Serves the repo root on the packaged origin — path-traversal-safe (resolved paths must stay
 * inside the root), 404 for anything else. The document root deliberately equals what the dev
 * http origin serves (§2.6 parity).
 * @param {Request} request
 * @returns {Response}
 */
function serveRepoRoot(request) {
    const
        {pathname} = new URL(request.url),
        file       = path.normalize(path.join(repoRoot, decodeURIComponent(pathname)));

    if (!file.startsWith(repoRoot + path.sep) || !existsSync(file)) {
        smokeMode && console.log(`SHELL_404 ${pathname}`);
        return new Response('not found', {status: 404})
    }

    return new Response(createReadStream(file), {
        headers: {'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'}
    })
}

/**
 * Creates a shell window with the §2.3 posture and the fail-closed window policy.
 * @param {String} url
 * @returns {BrowserWindow}
 */
function createShellWindow(url) {
    // NOTE: windows stay VISIBLE even in smoke mode — Neo's main-thread delta application rides
    // requestAnimationFrame, which never fires in a hidden (show:false) window: the app worker
    // boots, but the DOM never mounts. backgroundThrottling stays off so a briefly occluded
    // smoke window cannot stall the probe either.
    const win = new BrowserWindow({
        height        : 900,
        width         : 1400,
        webPreferences: {
            backgroundThrottling: false,
            preload             : path.join(harnessDir, 'preload.cjs')
        }
    });

    // §2.3.2 fail-closed: only same-origin harness URLs may open windows — that allow path IS the
    // §2.2 C3 popup contract (the popup joins the shared workers); everything else is denied.
    // GOTCHA: match protocol + host, never URL.origin — the main process's URL parser returns
    // origin 'null' for custom schemes (it knows nothing of the renderer's privileged registration).
    win.webContents.setWindowOpenHandler(({url: target}) => {
        const parsed = new URL(target);

        if (parsed.protocol === 'app:' && parsed.host === APP_HOST) {
            return {
                action                      : 'allow',
                overrideBrowserWindowOptions: {
                    webPreferences: {
                        backgroundThrottling: false,
                        preload             : path.join(harnessDir, 'preload.cjs')
                    }
                }
            }
        }

        return {action: 'deny'}
    });

    // §2.3.2 fail-closed: no off-origin navigation inside harness windows (protocol+host match,
    // see the gotcha above)
    win.webContents.on('will-navigate', (event, target) => {
        const parsed = new URL(target);

        if (parsed.protocol !== 'app:' || parsed.host !== APP_HOST) {
            event.preventDefault()
        }
    });

    if (smokeMode) {
        win.webContents.on('render-process-gone', (event, details) => console.log('SHELL_RENDERER_GONE ' + JSON.stringify(details)));
        win.webContents.on('did-fail-load', (event, code, description, url) => console.log(`SHELL_LOAD_FAIL ${code} ${description} ${url}`));
        win.webContents.on('preload-error', (event, preloadPath, error) => console.log(`SHELL_PRELOAD_ERROR ${error.message}`));
        win.webContents.on('console-message', (event, level, message) => console.log('SHELL_PAGE ' + String(message).slice(0, 300)))
    }

    win.loadURL(url);
    return win
}

/**
 * Awaits the preload boot report of the given window (see preload.cjs — the DOM-polling
 * reporter over IPC; the reliable observation channel for this SharedWorker-heavy page, where
 * webContents.executeJavaScript wedges).
 * @param {BrowserWindow} win
 * @param {Number} timeoutMs
 * @returns {Promise<Object>}
 */
function awaitBootReport(win, timeoutMs = 30000) {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve({mounted: 0, timedOut: true}), timeoutMs);

        const handler = (event, report) => {
            if (event.sender.id === win.webContents.id) {
                clearTimeout(timer);
                ipcMain.off('shell-boot-report', handler);
                resolve(report)
            }
        };

        ipcMain.on('shell-boot-report', handler)
    })
}

process.on('unhandledRejection', error => {
    console.log('SHELL_UNHANDLED ' + (error?.stack || error));
    smokeMode && app.exit(2)
});

app.whenReady().then(async () => {
    smokeMode && ipcMain.on('shell-boot-report', (event, report) => console.log('SHELL_BOOT_REPORT ' + JSON.stringify(report)));

    protocol.handle('app', serveRepoRoot);

    // §2.3.3 deny-by-default; allowlist additions amend the shell ADR §2.3 first
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(false)
    });

    const win1 = createShellWindow(APP_URL);

    if (!smokeMode) {
        return
    }

    // Smoke: slice-1 AC (the shell boots the built app) + slice-2 AC (a renderer-initiated
    // window.open popup materializes through setWindowOpenHandler and joins the same shared
    // workers). Shared-heap observable: Neo instance/DOM ids are handed out by the ONE App
    // worker — the popup's viewport id CONTINUES the sequence instead of restarting it.
    const boot1 = await awaitBootReport(win1);

    // Renderer-initiated window.open needs a user gesture (the popup blocker denies the
    // preload-world attempt) — executeJavaScript with userGesture:true grants one. Guarded by a
    // race: the call can wedge when issued DURING the module-graph boot, so it runs post-boot
    // with a timeout fallback that records the path taken.
    await new Promise(resolve => setTimeout(resolve, 1500));

    const openPath = await Promise.race([
        win1.webContents.executeJavaScript(
            `window.open('${APP_URL}', '_blank', 'width=900,height=700'); 'renderer-window-open'`, true
        ),
        new Promise(resolve => setTimeout(() => resolve('gesture-call-wedged'), 5000))
    ]);

    console.log('SHELL_POPUP_PATH ' + openPath);

    const
        win2  = (await new Promise(resolve => {
            const timer = setInterval(() => {
                const wins = BrowserWindow.getAllWindows().filter(win => win !== win1);
                if (wins.length > 0) { clearInterval(timer); resolve(wins) }
            }, 200)
        }))[0],
        boot2 = await awaitBootReport(win2);

    const results = {
        boot1,
        boot2,
        popupMaterialized : BrowserWindow.getAllWindows().length === 2,
        sharedHeapEvidence: Boolean(boot1.viewportId && boot2.viewportId && boot1.viewportId !== boot2.viewportId),
        versions          : {chrome: process.versions.chrome, electron: process.versions.electron, node: process.versions.node}
    };

    console.log('SHELL_SMOKE_RESULTS=' + JSON.stringify(results, null, 2));
    app.exit(results.boot1.mounted > 10 && results.boot2.mounted > 10 && results.popupMaterialized ? 0 : 1)
});

// Slice-1 lifecycle simplification (see file top): quittable without a tray; E8 lands §2.1.5
app.on('window-all-closed', () => app.quit());

// smoke safety net — on timeout, capture what the window actually shows (compositor-level,
// no page JS involved) before exiting
smokeMode && setTimeout(async () => {
    console.log('SHELL_SMOKE_TIMEOUT');

    try {
        const
            win   = BrowserWindow.getAllWindows()[0],
            image = await win?.capturePage();

        if (image) {
            const {writeFileSync} = await import('node:fs');
            writeFileSync(path.join(harnessDir, 'smoke-timeout.png'), image.toPNG());
            console.log('SHELL_TIMEOUT_CAPTURE written')
        }
    } catch (error) {
        console.log('SHELL_TIMEOUT_CAPTURE_FAIL ' + error.message)
    }

    app.exit(1)
}, 60000);
