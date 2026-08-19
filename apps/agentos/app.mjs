import Viewport                                           from './view/Viewport.mjs';
import {establishFleetSessionCustody, resolveFleetUrl}    from './fleet/fleetSessionCustody.mjs';
import {FLEET_LOCAL_TRANSPORT_ERRORS, installFleetBridge} from './fleet/installFleetBridge.mjs';
import {redeemFleetBearerHandshake}                       from './fleet/redeemFleetBearerHandshake.mjs';
import WindowManager                                      from '../../src/manager/Window.mjs';

// The custody machine + endpoint authority moved VERBATIM to ./fleet/fleetSessionCustody.mjs —
// the instance-switch owner needs them without an import cycle through this boot module; the
// re-export keeps this module's surface, and every existing spec import, unchanged.
export {establishFleetSessionCustody, resolveFleetUrl};

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

// The one-command hand-off, page half: in direct-browser mode with the launcher slot still empty,
// redeem the bearer from the transport's armed handshake BEFORE the app boots — this module-level
// await completes inside `importApp`'s dynamic import, ahead of every `onStart` call. The redeemed
// value stays MODULE-PRIVATE: unlike the launcher pre-boot slot it never touches Body-readable
// state (the custody discipline in ./fleet/connectionProfiles.mjs). Fail-closed: an unarmed or
// absent transport resolves null and the existing bearer-less boot proceeds unchanged. The
// URL-envelope guard keeps the module importable OUTSIDE the worker boot (unit specs import this
// module for its pure exports; there is no serialized boot URL there, so there is nothing to dial).
const bootUrl = globalThis.Neo?.config?.url;

let redeemed = null;

if (bootUrl?.href && resolveFleetTransportMode(bootUrl) === 'browser' && !globalThis.AgentOS?.fleet?.bearerToken) {
    redeemed = await redeemFleetBearerHandshake({url: resolveFleetUrl()})
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
        // Direct-browser dev mode is the session-only custodian shape. Both mints are IN-MEMORY
        // hand-offs: the module-private handshake redemption above, or the launcher pre-boot
        // slots (Electron main, the Neural Link, a test init-script places `bearerToken` and,
        // when arming, `mcAuthorization` BEFORE app start) — read inside the establish call (the
        // read-old phase), moved into transport closures (establish), and both ingress copies
        // CAS-retired only after the bridge's authenticated whoami round-trip proves the session
        // (verify → retire). Deliberately never read from URL params — a secret in a URL persists
        // in history, logs, and referrers, so installFleetBridge refuses credential-shaped query
        // params outright. Without a bearer the bridge installs fail-closed (every call rejects
        // locally, named) — or, on a SharedWorker re-join, an existing bridge is PRESERVED rather
        // than downgraded — and the slots stay as they were, which is the rollback truth.
        const hadBearer = redeemed !== null || (globalThis.AgentOS?.fleet?.bearerToken ?? null) !== null;

        establishFleetSessionCustody({fleetUrl, redeemed});
        redeemed = null;

        // Late-transport healing: the module-level redemption races the fleet child's boot (plane
        // admission alone can take seconds), and on a SharedWorker topology a reload re-enters
        // here without re-running module scope. One lazy retry per joining window upgrades the
        // fail-closed bridge in place — installFleetBridge is documented additive + idempotent,
        // and the pane resolves the slot per call, so the next poll goes live. Still-no-bearer
        // stays the honest fail-closed state.
        if (!hadBearer) {
            redeemFleetBearerHandshake({url: fleetUrl}).then(pair => {
                pair && establishFleetSessionCustody({fleetUrl, redeemed: pair})
            })
        }
    }

    Neo.app({
        mainView: Viewport,
        name    : 'AgentOS'
    })
};
