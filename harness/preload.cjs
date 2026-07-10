const {contextBridge, ipcRenderer} = require('electron');

// The ONE capability surface every shell window gets (the Electron-shell ADR §2.3.4 —
// ticket-ref-ok: this preload IS that contract's implementation): named, allowlisted affordances
// only — never ipcRenderer raw, never Node. Deliberately minimal in the shell skeleton:
// capabilities land with their consuming leaves (E5 carries the contract; additions amend the
// shell ADR §2.3 first).
contextBridge.exposeInMainWorld('neoShell', {
    shellVersion: process.versions.electron
});

/**
 * Reports renderer failures over a private, sender-validated diagnostic channel.
 * @summary Makes the smoke verdict fail on uncaught errors and unhandled promise rejections.
 * @param {String} type
 * @param {*} error
 */
function reportRuntimeError(type, error) {
    ipcRenderer.send('shell-runtime-error', {
        message: String(error?.message ?? error?.reason ?? error ?? 'unknown renderer error'),
        type
    })
}

window.addEventListener('error', event => reportRuntimeError('error', event.error ?? event.message));
window.addEventListener('unhandledrejection', event => reportRuntimeError('unhandledrejection', event.reason));

// Boot reporter (smoke + diagnostics): polls the DOM (the preload world shares the DOM, never
// page JS state) and reports ONCE when the harness app has mounted. Note for the next author:
// webContents.executeJavaScript wedges on this SharedWorker-heavy page — preload+IPC is the
// reliable observation channel (the shell ADR spike's reporting pattern).
const t0 = Date.now();

const timer = setInterval(() => {
    const
        mounted  = document.querySelectorAll('[class*="neo-"]').length,
        viewport = document.querySelector('[id^="neo-vnode-"], .neo-viewport');

    if (mounted > 10) {
        clearInterval(timer);
        ipcRenderer.send('shell-boot-report', {
            bootMs    : Date.now() - t0,
            mounted,
            viewportId: viewport?.id ?? null
        })
    } else if (Date.now() - t0 > 30000) {
        clearInterval(timer);
        ipcRenderer.send('shell-boot-report', {bootMs: null, mounted, timedOut: true})
    }
}, 250);
