/**
 * @module harness/preloadEsmCapabilityProbe
 * @summary Boots a temporary sandboxed Electron renderer with an ESM preload that imports Electron
 * and a sibling ESM module, then fails the harness smoke preflight when both become supported.
 */

import {app, BrowserWindow}                 from 'electron';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir}                             from 'node:os';
import path                                 from 'node:path';

import {
    PRELOAD_ESM_PROBE_MARKER,
    classifyPreloadEsmProbe
} from './preloadEsmProbeOutcome.mjs';

const PROBE_TIMEOUT_MS = 10000;

/**
 * @summary Waits for the temporary renderer to finish or fail its document load.
 * @param {Electron.WebContents} contents
 * @param {String[]} errors
 * @returns {Promise<{timedOut: Boolean}>}
 */
function waitForDocument(contents, errors) {
    return new Promise(resolve => {
        const finish = timedOut => {
            clearTimeout(timer);
            contents.removeListener('did-fail-load', onFailure);
            contents.removeListener('did-finish-load', onSuccess);
            resolve({timedOut})
        };
        const onFailure = (event, code, description, url, isMainFrame) => {
            isMainFrame && errors.push(`document load failed: ${code} ${description} ${url}`);
            finish(false)
        };
        const onSuccess = () => finish(false);
        const timer     = setTimeout(() => finish(true), PROBE_TIMEOUT_MS);

        contents.once('did-fail-load', onFailure);
        contents.once('did-finish-load', onSuccess)
    })
}

/**
 * @summary Executes the real pinned-Electron sandboxed ESM preload and sibling-import probe.
 * @returns {Promise<{message: String, ok: Boolean, status: String}>}
 */
async function runProbe() {
    const
        probeDir       = mkdtempSync(path.join(tmpdir(), 'neo-preload-esm-probe-')),
        dependencyPath = path.join(probeDir, 'probeDependency.mjs'),
        preloadPath    = path.join(probeDir, 'preload.mjs'),
        errors         = [];
    let win;

    try {
        writeFileSync(dependencyPath, [
            'export const siblingImportLoaded = true;',
            ''
        ].join('\n'));

        writeFileSync(preloadPath, [
            'import {contextBridge} from \'electron\';',
            'import {siblingImportLoaded} from \'./probeDependency.mjs\';',
            `contextBridge.exposeInMainWorld('${PRELOAD_ESM_PROBE_MARKER}', Object.freeze({loaded: siblingImportLoaded}));`,
            ''
        ].join('\n'));

        win = new BrowserWindow({
            show          : false,
            webPreferences: {
                backgroundThrottling: false,
                contextIsolation    : true,
                nodeIntegration     : false,
                preload             : preloadPath,
                sandbox             : true
            }
        });

        win.webContents.on('preload-error', (event, observedPath, error) => {
            errors.push(error?.message ?? String(error))
        });

        const documentState = waitForDocument(win.webContents, errors);

        // `loadURL()` itself can stay pending when preload evaluation aborts early. The event-owned
        // timeout above is therefore the authority; awaiting this promise would bypass fail-closed.
        win.loadURL('data:text/html;charset=utf-8,<title>Neo preload ESM capability probe</title>')
            .catch(error => errors.push(`loadURL rejected: ${error?.message ?? String(error)}`));

        const {timedOut}   = await documentState;
        let   markerLoaded = false;

        if (!timedOut) {
            try {
                markerLoaded = await win.webContents.executeJavaScript(
                    `globalThis.${PRELOAD_ESM_PROBE_MARKER}?.loaded === true`
                )
            } catch (error) {
                errors.push(`marker observation failed: ${error?.message ?? String(error)}`)
            }

            // `preload-error` normally precedes `did-finish-load`; one short turn also captures a
            // future runtime that reports it immediately after document completion.
            await new Promise(resolve => setTimeout(resolve, 50))
        }

        return classifyPreloadEsmProbe({errors, markerLoaded, timedOut})
    } finally {
        win && !win.isDestroyed() && win.destroy();
        rmSync(probeDir, {force: true, recursive: true})
    }
}

/**
 * @summary Runs after Electron readiness without top-level-awaiting that readiness from the ESM
 * entry module (Electron cannot emit `ready` until entry-module evaluation has completed).
 * @returns {Promise<void>}
 */
async function main() {
    let exitCode = 1;

    try {
        console.log(`[preload-esm-probe] testing Electron ${process.versions.electron}`);

        const result = await runProbe();

        (result.ok ? console.log : console.error)(`[preload-esm-probe] ${result.message}`);
        exitCode = result.ok ? 0 : 1
    } catch (error) {
        console.error(`[preload-esm-probe] Probe crashed; failing closed: ${error?.stack ?? error}`)
    } finally {
        app.exit(exitCode)
    }
}

app.whenReady().then(main, error => {
    console.error(`[preload-esm-probe] Electron readiness failed; failing closed: ${error?.stack ?? error}`);
    app.exit(1)
});
