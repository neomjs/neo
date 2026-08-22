import Viewport                                           from './view/Viewport.mjs';
import {establishFleetSessionCustody, resolveFleetUrl}    from './fleet/fleetSessionCustody.mjs';
import {FLEET_LOCAL_TRANSPORT_ERRORS, installFleetBridge} from './fleet/installFleetBridge.mjs';
import {redeemFleetBearerHandshakeUntilAvailable}         from './fleet/redeemFleetBearerHandshake.mjs';
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

let browserFleetHealPromise = null;

/**
 * @summary Runs one bounded browser-handshake heal against the bridge that owned the disconnected
 * boot moment. The expected-bridge guard cancels when an operator switch, manual re-wire, or newer
 * successful owner publishes a replacement. Session custody performs the second CAS after the
 * authenticated proof, closing the verification-window race too.
 *
 * Never throws: exhaustion or lost authority leaves the already-rendered shell on its honest
 * fail-closed bridge, where the instance switcher and Reconnect control remain operable.
 *
 * @param {Object} opts
 * @param {Object} opts.expectedBridge Published bridge this heal is allowed to replace.
 * @param {String} opts.fleetUrl Fleet endpoint authority.
 * @param {Object} [opts.target=globalThis]
 * @param {Function} [opts.redeemImpl=redeemFleetBearerHandshakeUntilAvailable]
 * @param {Function} [opts.establishImpl=establishFleetSessionCustody]
 * @param {Object} [opts.redemptionOptions]
 * @returns {Promise<Boolean>} true only when the authenticated candidate retained promotion authority.
 */
export async function healBrowserFleetSession({
    expectedBridge,
    fleetUrl,
    target = globalThis,
    redeemImpl = redeemFleetBearerHandshakeUntilAvailable,
    establishImpl = establishFleetSessionCustody,
    redemptionOptions = {}
} = {}) {
    const stillExpected = () => target.AgentOS?.fleet?.registryBridge === expectedBridge;

    try {
        const redeemed = await redeemImpl({
            ...redemptionOptions,
            shouldContinue: stillExpected,
            url           : fleetUrl
        });

        if (!redeemed || !stillExpected()) {
            return false
        }

        const {promoted} = establishImpl({fleetUrl, redeemed, target});

        return await promoted
    } catch {
        return false
    }
}

export const onStart = () => {
    const
        fallbackWindowId = Neo.bootingWindowId,
        fleetUrl         = resolveFleetUrl();

    let browserHeal = null;

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
        // Direct-browser dev mode renders FIRST with whatever custody truth exists now: launcher
        // slots establish synchronously; absence publishes/preserves a fail-closed bridge. The top
        // chrome instance switcher is the recovery path, so no network wait may gate Neo.app().
        const
            hadBearer = (globalThis.AgentOS?.fleet?.bearerToken ?? null) !== null,
            {bridge}  = establishFleetSessionCustody({fleetUrl});

        if (!hadBearer) {
            browserHeal = {expectedBridge: bridge, fleetUrl}
        }
    }

    Neo.app({
        mainView: Viewport,
        name    : 'AgentOS'
    });

    // Start only AFTER shell creation and keep one SharedWorker-wide window in flight. A later
    // joining window may start a fresh bounded window after exhaustion; no permanent poller lives.
    if (browserHeal && browserFleetHealPromise === null) {
        const current = browserFleetHealPromise = healBrowserFleetSession(browserHeal);

        current.finally(() => {
            browserFleetHealPromise === current && (browserFleetHealPromise = null)
        })
    }
};
