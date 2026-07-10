const {contextBridge, ipcRenderer} = require('electron');

// The ONE capability surface every shell window gets (the Electron-shell ADR §2.3.4 —
// ticket-ref-ok: this preload IS that contract's implementation): named, allowlisted affordances
// only — never ipcRenderer raw, never Node. Deliberately minimal in the shell skeleton:
// capabilities land with their consuming leaves (E5 carries the contract; additions amend the
// shell ADR §2.3 first).
contextBridge.exposeInMainWorld('neoShell', {
    shellVersion: process.versions.electron
});

// Smoke popup trigger: a renderer-initiated window.open (the Neo pattern, hitting the shell's
// setWindowOpenHandler) — driven from main over IPC because executeJavaScript wedges here.
ipcRenderer.on('shell-open-popup', (event, url) => {
    console.log('SHELL_POPUP_TRIGGER received');
    const popup = window.open(url, '_blank', 'width=900,height=700');
    console.log('SHELL_POPUP_TRIGGER window.open returned ' + String(!!popup))
});

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
