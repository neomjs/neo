import Viewport             from './view/Viewport.mjs';
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

// The one-command hand-off, page half: in direct-browser mode with the designed slot still empty,
// redeem the bearer from the transport's armed handshake BEFORE the app boots — this module-level
// await completes inside `importApp`'s dynamic import, ahead of every `onStart` call, so the boot
// install below sees the bearer exactly as if a launcher had placed it. Fail-closed: an unarmed or
// absent transport resolves null and the existing bearer-less boot proceeds unchanged. The
// URL-envelope guard keeps the module importable OUTSIDE the worker boot (unit specs import this
// module for its pure exports; there is no serialized boot URL there, so there is nothing to dial).
const bootUrl = globalThis.Neo?.config?.url;

if (bootUrl?.href && resolveFleetTransportMode(bootUrl) === 'browser' && !globalThis.AgentOS?.fleet?.bearerToken) {
    const token = await redeemFleetBearerHandshake({url: resolveFleetUrl()});

    if (token) {
        const agentOS = globalThis.AgentOS = globalThis.AgentOS || {};

        agentOS.fleet             = agentOS.fleet || {};
        agentOS.fleet.bearerToken = token
    }
}

export const onStart = () => {
    const
        fallbackWindowId = Neo.bootingWindowId,
        fleetUrl         = resolveFleetUrl();

    // The process bearer is an IN-MEMORY hand-off only: the Electron main process, the
    // Neural Link, a test init-script — or the armed-handshake redemption above — places it at
    // globalThis.AgentOS.fleet.bearerToken BEFORE app start. Deliberately never read from URL
    // params — a secret in a URL persists in history, logs, and referrers, so installFleetBridge
    // refuses credential-shaped query params outright.
    // Without the bearer the bridge installs fail-closed: every call rejects locally, named.
    const bearerToken = globalThis.AgentOS?.fleet?.bearerToken ?? null;

    if (resolveFleetTransportMode(Neo.config.url) === 'shell') {
        const route = () => resolveFleetWindowId({fallbackWindowId});

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
        // Direct-browser dev mode remains the distinct transitional topology: its in-memory bearer
        // and App-Worker credential field are supported here, never in the packaged app:// path.
        installFleetBridge({url: fleetUrl, bearerToken});

        // Late-transport healing: the module-level redemption races the fleet child's boot (plane
        // admission alone can take seconds), and on a SharedWorker topology a reload re-enters
        // here without re-running module scope. One lazy retry per joining window upgrades the
        // fail-closed bridge in place — installFleetBridge is documented additive + idempotent,
        // and the pane resolves the slot per call, so the next poll goes live. Still-no-bearer
        // stays the honest fail-closed state.
        if (!bearerToken) {
            redeemFleetBearerHandshake({url: fleetUrl}).then(token => {
                if (token) {
                    const agentOS = globalThis.AgentOS = globalThis.AgentOS || {};

                    agentOS.fleet             = agentOS.fleet || {};
                    agentOS.fleet.bearerToken = token;

                    installFleetBridge({url: fleetUrl, bearerToken: token})
                }
            })
        }
    }

    Neo.app({
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
