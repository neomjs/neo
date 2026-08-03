const {contextBridge, ipcRenderer} = require('electron');

// The ONE capability surface every shell window gets (the Electron-shell ADR §2.3.4 —
// ticket-ref-ok: this preload IS that contract's implementation): named, allowlisted affordances
// only — never ipcRenderer raw, never Node. Deliberately minimal in the shell skeleton:
// capabilities land with their consuming leaves (E5 carries the contract; additions amend the
// shell ADR §2.3 first).
contextBridge.exposeInMainWorld('neoShell', {
    // Pull-shaped whole-Brain health from the lifecycle owner. Consumers that render this answer
    // must re-read it for as long as they render (interval is leaf property).
    brainHealth : () => ipcRenderer.invoke('brain-health'),
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
 * Adapter states a cockpit head can render, as `is-<state>` classes (`FleetGrid.mjs` renders
 * `is-${adapterState}`; `FleetCockpit` seeds `sample` and promotes on a capability answer).
 * @type {String[]}
 */
const ADAPTER_STATES = ['live', 'sample', 'stale', 'degraded'];

/**
 * @summary Resolves the single adapter state a class list advertises, or `unknown`.
 *
 * Mirrors `adapterWitness.resolveAdapterState`. The duplication is forced, not chosen: this file is
 * CommonJS because Electron cannot load an ESM preload in a sandboxed renderer, so it cannot import the
 * ESM module. A spec asserts the two state lists stay identical.
 * @param {Object} classList
 * @returns {String}
 */
function resolveAdapterStateFromClassList(classList) {
    const matched = ADAPTER_STATES.filter(state => classList.contains(`is-${state}`));

    return matched.length === 1 ? matched[0] : 'unknown';
}

/**
 * @summary Reports which adapter state a cockpit head is actually rendering, plus its label text.
 *
 * Scoped selectors were the defect this replaces: reading `.fm-fleet-head.is-sample .fm-fleet-stale`
 * can only ever observe the ONE state we do not want to ship. A promoted (live) cockpit made that
 * selector match nothing and the field reported `null` — indistinguishable from a broken selector or
 * an absent cockpit, so the witness could not report success at all, only failure. The state is now
 * read from the element and returned as data, which makes `live` a positive observation and keeps
 * absence distinct from every rendered state.
 * @param {String} headSelector  The adapter head carrying the `is-<state>` class.
 * @param {String} labelSelector The label inside that head.
 * @returns {{state: String|null, label: String|null}} `state` is `null` only when the head is absent.
 */
function readAdapterHead(headSelector, labelSelector) {
    const head = document.querySelector(headSelector);

    if (!head) return {state: null, label: null};

    return {
        // EXACTLY ONE known class, or `unknown`. First-match resolution reported a confident answer
        // about a contradictory DOM: a head carrying `is-live is-sample` resolved to whichever state
        // sat earlier in the list. Ambiguity and unrecognised-state now share the same fail-closed
        // outcome — not ready, not conclusive.
        state: resolveAdapterStateFromClassList(head.classList),
        label: head.querySelector(labelSelector)?.textContent?.trim() ?? null
    }
}

/**
 * Reads the product-owned DOM markers needed by the packaged first-paint contract.
 * @summary Produces a bounded semantic snapshot without exposing page state or transport to the renderer.
 * @returns {Object}
 */
function collectFirstPaintSnapshot() {
    const
        cards      = [...document.querySelectorAll('.fm-fleet-cockpit .fm-agent-card')],
        cockpit    = document.querySelector('.fm-fleet-cockpit'),
        rosterHead = readAdapterHead('.fm-fleet-cockpit .fm-fleet-head', '.fm-fleet-stale'),
        streamHead = readAdapterHead('.fm-fleet-cockpit .fm-stream-head', '.fm-stream-state');

    return {
        activityLabel   : streamHead.label,
        cardCount       : cards.filter(isElementVisible).length,
        cockpitVisible  : Boolean(cockpit && isElementVisible(cockpit)),
        rosterLabel     : rosterHead.label,
        rosterState     : rosterHead.state,
        streamState     : streamHead.state,
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
        // Ready = the cockpit rendered RECOGNISED adapter heads, in ANY honest state. Pinning the
        // sample labels here meant a cockpit wired to the live fleet could never become ready: it
        // would wait out the full timeout and report `timedOut: true`, so the product receipt was
        // reachable only while the product was unfinished. Label-vs-state AGREEMENT is judged by the
        // shell, which owns the verdict — the preload only observes. `tourControlCount === 0` stays:
        // the receipt is for the product first paint, not a demo tour.
        ready    = snapshot.cockpitVisible &&
            snapshot.cardCount > 0 &&
            snapshot.rosterState !== null && snapshot.rosterState !== 'unknown' &&
            snapshot.streamState !== null && snapshot.streamState !== 'unknown' &&
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
