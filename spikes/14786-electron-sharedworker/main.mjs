// Electron SharedWorker constraint-set spike for the Electron shell ADR (ticket 14786).
// Empirically answers: under which origin classes, window-creation paths, and session
// partitions do two Electron-hosted pages share ONE SharedWorker instance?
//
// Phases (all windows show:false — fully invisible):
//   file2win   — two BrowserWindows, file:// origin, default secure flags
//   filepopup  — one BrowserWindow + window.open() popup, file://
//   app2win    — two BrowserWindows, custom privileged app:// scheme
//   apppopup   — one BrowserWindow + window.open() popup, app://
//   http2win   — two BrowserWindows, http://127.0.0.1 (in-process node server)
//   httppopup  — one BrowserWindow + window.open() popup, http://127.0.0.1
//   partition  — two BrowserWindows, same URL, DIFFERENT session partitions (negative control)
//
// Verdict per phase: reported `connections` values {1,2} = SHARED (same worker instance);
// {1,1} = ISOLATED (one instance each); error/timeout recorded verbatim.

import {app, BrowserWindow, ipcMain, protocol, session} from 'electron';
import http                                             from 'node:http';
import {createReadStream}                               from 'node:fs';
import os                                               from 'node:os';
import {fileURLToPath}                                  from 'node:url';
import path                                             from 'node:path';

const dir     = path.dirname(fileURLToPath(import.meta.url));
const results = {};
let   reports = [];

protocol.registerSchemesAsPrivileged([
    {scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true}}
]);

ipcMain.on('spike-report', (event, payload) => {
    reports.push(payload);
});

function winOpts(extra = {}) {
    // strip webPreferences BEFORE spreading the rest — a plain `...extra` after the
    // webPreferences block would REPLACE the whole object and silently drop the preload
    const {webPreferences = {}, ...extraRest} = extra;

    return {
        show          : false,
        webPreferences: {
            preload: path.join(dir, 'preload.cjs'),
            ...webPreferences
        },
        ...extraRest
    };
}

function makeWindow(url, extra = {}) {
    const win = new BrowserWindow(winOpts(extra));

    // Allow window.open() popups; keep them invisible and preload-free (relay via opener).
    win.webContents.setWindowOpenHandler(() => ({
        action                      : 'allow',
        overrideBrowserWindowOptions: {show: false}
    }));

    win.loadURL(url);
    return win;
}

function collect(phase, expected, timeoutMs = 6000) {
    return new Promise(resolve => {
        const t0    = Date.now();
        const timer = setInterval(() => {
            if (reports.length >= expected || Date.now() - t0 > timeoutMs) {
                clearInterval(timer);
                results[phase] = reports.slice();
                reports        = [];
                console.log(`PHASE ${phase}: ${JSON.stringify(results[phase])}`);
                resolve();
            }
        }, 100);
    });
}

async function closeAll() {
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
    await new Promise(r => setTimeout(r, 300)); // let workers wind down
}

async function twoWindowPhase(phase, baseUrl, win2Extra = {}) {
    makeWindow(`${baseUrl}?label=${phase}-A`);
    await new Promise(r => setTimeout(r, 600)); // deterministic connect order
    makeWindow(`${baseUrl}?label=${phase}-B`, win2Extra);
    await collect(phase, 2);
    await closeAll();
}

async function popupPhase(phase, baseUrl) {
    makeWindow(`${baseUrl}?label=${phase}-A&open=1`);
    await collect(phase, 2, 8000);
    await closeAll();
}

// The spike opens/destroys windows per phase — without this, Electron's default
// window-all-closed behavior quits the app after the FIRST phase's teardown.
app.on('window-all-closed', () => {});

process.on('unhandledRejection', err => {
    console.log('UNHANDLED_REJECTION: ' + (err?.stack || err));
    app.exit(2);
});
process.on('uncaughtException', err => {
    console.log('UNCAUGHT: ' + (err?.stack || err));
    app.exit(3);
});

app.whenReady().then(async () => {
    console.log('READY_PHASE_START');

    const appHandler = req => {
        const {pathname} = new URL(req.url);
        const file       = path.join(dir, pathname === '/' ? 'page.html' : pathname);
        const type       = file.endsWith('.js')   ? 'text/javascript'
                         : file.endsWith('.json') ? 'application/json'
                         : 'text/html';
        return new Response(createReadStream(file), {headers: {'content-type': type}});
    };

    // protocol handlers are SESSION-specific (a load-bearing constraint in its own right):
    // the default session serves the main matrix; the control partition needs its OWN
    // registration or its windows cannot load app:// at all.
    protocol.handle('app', appHandler);
    session.fromPartition('persist:other').protocol.handle('app', appHandler);

    // http://127.0.0.1 serves the spike dir
    const server = http.createServer((req, res) => {
        const {pathname} = new URL(req.url, 'http://x');
        const file       = path.join(dir, pathname === '/' ? 'page.html' : pathname);
        res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
        createReadStream(file).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const httpBase = `http://127.0.0.1:${server.address().port}/page.html`;

    const fileBase = `file://${path.join(dir, 'page.html')}`;
    const appBase  = 'app://spike/page.html';

    await twoWindowPhase('file2win',  fileBase);
    await popupPhase   ('filepopup', fileBase);
    await twoWindowPhase('app2win',   appBase);
    await popupPhase   ('apppopup',  appBase);
    await twoWindowPhase('http2win',  httpBase);
    await popupPhase   ('httppopup', httpBase);

    // ONE-VARIABLE partition controls on SHARING origins: same URL, same preload — only
    // window B's session partition differs. Both windows must REPORT their own counts;
    // isolation shows as B seeing a FRESH worker (count 1), never as silence.
    await twoWindowPhase('partitionapp',  appBase,  {webPreferences: {partition: 'persist:other'}});
    await twoWindowPhase('partitionhttp', httpBase, {webPreferences: {partition: 'persist:other'}});

    // fetch smoke: the packaged origin must serve JSON via fetch() — the Store `url` seed path
    await (async () => {
        makeWindow(`${appBase}?label=fetchsmoke-A&mode=fetch`);
        await collect('fetchsmoke', 1);
        await closeAll();
    })();

    results.versions = {
        chrome  : process.versions.chrome,
        electron: process.versions.electron,
        node    : process.versions.node,
        platform: `${process.platform} ${os.release()}`
    };

    console.log('SPIKE_RESULTS_JSON=' + JSON.stringify(results, null, 2));
    app.exit(0);
});

// Hard safety net
setTimeout(() => {
    console.log('SPIKE_TIMEOUT — partial: ' + JSON.stringify(results));
    app.exit(1);
}, 90000);
