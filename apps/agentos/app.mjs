import Viewport             from './view/Viewport.mjs';
import {createFleetProfile, retireBearerIngressSlot}      from './fleet/connectionProfiles.mjs';
import {FLEET_LOCAL_TRANSPORT_ERRORS, installFleetBridge} from './fleet/installFleetBridge.mjs';
import {redeemFleetBearerHandshake}                       from './fleet/redeemFleetBearerHandshake.mjs';
import WindowManager        from '../../src/manager/Window.mjs';

/**
 * @summary Resolve a currently connected AgentOS window for App-Worker→main RMA. `onStart()` runs
 * for every joining window, so a closure pinned to the latest popup would strand the retained
 * cockpit when that popup closes. The live Window manager is the authority; the boot id is only a
 * pre-registration fallback while the first app instance is being created.
 * @param {Object} options
 * @param {String} options.fallbackWindowId
 * @param {Object} [options.apps=Neo.apps]
 * @param {Object[]} [options.windows=WindowManager.items]
 * @returns {String|null}
 */
export function resolveFleetWindowId({fallbackWindowId, apps = Neo.apps, windows = WindowManager.items} = {}) {
    const live = windows.find(item => item.appName === 'AgentOS');

    return live?.id ?? (apps?.[fallbackWindowId] ? fallbackWindowId : null)
}

/**
 * @summary Resolves the AgentOS Fleet transport from the authoritative serialized worker URL.
 *
 * Both initial worker creation and late `startWorker()` registration already carry the absolute
 * main-thread `location.href`. Deriving the scheme from that value keeps one URL authority instead
 * of adding a second `protocol` field that can drift between producer paths. A missing or malformed
 * `href` throws before bridge installation, preserving the fail-closed transport boundary.
 *
 * @param {Object} urlConfig
 * @param {String} urlConfig.href Absolute main-thread URL serialized into `Neo.config.url`.
 * @returns {'shell'|'browser'}
 */
export function resolveFleetTransportMode({href}) {
    return new URL(href).protocol === 'app:' ? 'shell' : 'browser'
}

/**
 * @summary Resolves the Fleet endpoint from the boot window's serialized URL — the one endpoint
 * authority (`?fleetUrl=` override, else the pinned default) both the boot install and the
 * handshake redemption derive from.
 * @returns {String}
 */
export function resolveFleetUrl() {
    const params = new URLSearchParams(Neo.config.url.search);

    return params.has('fleetUrl') ? params.get('fleetUrl') : 'http://127.0.0.1:8083/fleet'
}

// The one-command hand-off, page half: in direct-browser mode with the launcher slot still empty,
// redeem the bearer from the transport's armed handshake BEFORE the app boots — this module-level
// await completes inside `importApp`'s dynamic import, ahead of every `onStart` call. The redeemed
// value stays MODULE-PRIVATE: unlike the launcher pre-boot slot it never touches Body-readable
// state (the custody discipline in ./fleet/connectionProfiles.mjs). Fail-closed: an unarmed or
// absent transport resolves null and the existing bearer-less boot proceeds unchanged. The
// URL-envelope guard keeps the module importable OUTSIDE the worker boot (unit specs import this
// module for its pure exports; there is no serialized boot URL there, so there is nothing to dial).
const bootUrl = globalThis.Neo?.config?.url;

let redeemedBearer = null;

if (bootUrl?.href && resolveFleetTransportMode(bootUrl) === 'browser' && !globalThis.AgentOS?.fleet?.bearerToken) {
    redeemedBearer = await redeemFleetBearerHandshake({url: resolveFleetUrl()})
}

/**
 * @summary Establish session-only Fleet custody for one boot or healing pass: derive the connection
 * profile from the endpoint, install the bridge — the bearer moves into transport closures, the
 * establish phase — and on a live-bearer install retire the launcher pre-boot slot, the retire
 * phase. A throwing install leaves the slot untouched, which IS the rollback: the prior ingress
 * state survives for the next producer or retry. Exported for unit specs; the injectable
 * `installImpl`/`target` keep the runtime global and the network out of the test process.
 * @param {Object}   opts
 * @param {String}   opts.fleetUrl                         Raw dial endpoint; identity derives from its canonical form.
 * @param {String}   [opts.bearerToken=null]               Redeemed or launcher-placed bearer; `null` boots fail-closed.
 * @param {Function} [opts.installImpl=installFleetBridge] Injectable install for tests.
 * @param {Object}   [opts.target=globalThis]              Injectable global for tests.
 * @returns {Object} the installed registry bridge.
 */
export function establishFleetSessionCustody({fleetUrl, bearerToken = null, installImpl = installFleetBridge, target = globalThis} = {}) {
    const profile = createFleetProfile({custodian: 'session-only', endpoint: fleetUrl}),
          bridge  = installImpl({url: fleetUrl, bearerToken, profileId: profile.profileId, target});

    bearerToken && retireBearerIngressSlot(target);

    return bridge
}

export const onStart = () => {
    const
        fallbackWindowId = Neo.bootingWindowId,
        fleetUrl         = resolveFleetUrl();

    if (resolveFleetTransportMode(Neo.config.url) === 'shell') {
        const route = () => resolveFleetWindowId({fallbackWindowId});

        // Packaged custody is the electron-main custodian shape: endpoint, credential, and profile
        // identity all live with main; the worker receives only the send capability, so there is
        // no profileId to stamp and nothing to retire on this side of the boundary.
        installFleetBridge({
            credentialIngress: 'shell',
            send             : request => {
                const windowId = route();

                return windowId
                    ? Neo.Main.fleetRequest({request, windowId})
                    : Promise.reject(new Error(FLEET_LOCAL_TRANSPORT_ERRORS.noLiveWindow))
            }
        })
    } else {
        // Direct-browser dev mode is the session-only custodian shape. The bearer is an IN-MEMORY
        // hand-off: the module-private handshake redemption above, or the launcher pre-boot slot
        // (Electron main, the Neural Link, a test init-script places it BEFORE app start) — read
        // here (the read-old phase), moved into transport closures by the install (establish), and
        // the slot retired once the live bridge stands (retire). Deliberately never read from URL
        // params — a secret in a URL persists in history, logs, and referrers, so installFleetBridge
        // refuses credential-shaped query params outright. Without a bearer the bridge installs
        // fail-closed: every call rejects locally, named — and the slot stays as it was, which is
        // the rollback truth.
        const bearerToken = redeemedBearer ?? globalThis.AgentOS?.fleet?.bearerToken ?? null;

        establishFleetSessionCustody({bearerToken, fleetUrl});
        redeemedBearer = null;

        // Late-transport healing: the module-level redemption races the fleet child's boot (plane
        // admission alone can take seconds), and on a SharedWorker topology a reload re-enters
        // here without re-running module scope. One lazy retry per joining window upgrades the
        // fail-closed bridge in place — installFleetBridge is documented additive + idempotent,
        // and the pane resolves the slot per call, so the next poll goes live. Still-no-bearer
        // stays the honest fail-closed state.
        if (!bearerToken) {
            redeemFleetBearerHandshake({url: fleetUrl}).then(token => {
                token && establishFleetSessionCustody({bearerToken: token, fleetUrl})
            })
        }
    }

    Neo.app({
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
