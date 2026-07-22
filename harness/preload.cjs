const {contextBridge, ipcRenderer} = require('electron');

// The ONE capability surface every shell window gets (the Electron-shell ADR §2.3.4 —
// ticket-ref-ok: this preload IS that contract's implementation): named, allowlisted affordances
// only — never ipcRenderer raw, never Node. Deliberately minimal in the shell skeleton:
// capabilities land with their consuming leaves (E5 carries the contract; additions amend the
// shell ADR §2.3 first).
contextBridge.exposeInMainWorld('neoShell', {
    fleetRequest: request => ipcRenderer.invoke('fleet-request', request),
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

const
    FIRST_PAINT_TIMEOUT_MS = 60000,
    TOUR_CONTROL_SELECTOR  = [
        '.fm-fleet-cockpit .fm-fusion-tour',
        '.fm-fleet-cockpit .fm-tour-caption'
    ].join(', ');

/**
 * Tests whether a product marker participates in the visible first paint.
 * @summary Keeps DOM-resident hidden cockpit content out of the product witness.
 * @param {Element} element
 * @returns {Boolean}
 */
function isElementVisible(element) {
    const style = window.getComputedStyle(element);

    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
}

/**
 * Reads the product-owned DOM markers needed by the packaged first-paint contract.
 * @summary Produces a bounded semantic snapshot without exposing page state or transport to the renderer.
 * @returns {Object}
 */
function collectFirstPaintSnapshot() {
    const
        activityLabel = document.querySelector('.fm-fleet-cockpit .fm-stream-head.is-sample .fm-stream-state')?.textContent?.trim() ?? null,
        cards         = [...document.querySelectorAll('.fm-fleet-cockpit .fm-agent-card')],
        cockpit       = document.querySelector('.fm-fleet-cockpit'),
        rosterLabel   = document.querySelector('.fm-fleet-cockpit .fm-fleet-head.is-sample .fm-fleet-stale')?.textContent?.trim() ?? null;

    return {
        activityLabel,
        cardCount       : cards.filter(isElementVisible).length,
        cockpitVisible  : Boolean(cockpit && isElementVisible(cockpit)),
        rosterLabel,
        tourControlCount: document.querySelectorAll(TOUR_CONTROL_SELECTOR).length
    }
}

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

// Separate from generic boot: the product receipt waits for the exact cold-first-paint semantics,
// while popup/shared-heap boot reports remain fast even if a later window has already promoted live.
const firstPaintTimer = setInterval(function reportFirstPaint() {
    const
        elapsed  = Date.now() - t0,
        snapshot = collectFirstPaintSnapshot(),
        ready    = snapshot.cockpitVisible &&
            snapshot.cardCount > 0 &&
            snapshot.rosterLabel === 'static roster · offline' &&
            snapshot.activityLabel === 'sample · live feed pending' &&
            snapshot.tourControlCount === 0,
        timedOut = elapsed > FIRST_PAINT_TIMEOUT_MS;

    if (ready || timedOut) {
        clearInterval(firstPaintTimer);
        ipcRenderer.send('shell-first-paint-report', {
            ...snapshot,
            rendererFirstPaintMs: ready ? elapsed : null,
            timedOut
        })
    }
}, 250);
