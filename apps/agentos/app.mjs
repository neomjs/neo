import Viewport                                           from './view/Viewport.mjs';
import {createFleetProfile, retireBearerIngressSlot}      from './fleet/connectionProfiles.mjs';
import {FLEET_LOCAL_TRANSPORT_ERRORS, installFleetBridge} from './fleet/installFleetBridge.mjs';
import {redeemFleetBearerHandshake}                       from './fleet/redeemFleetBearerHandshake.mjs';
import WindowManager                                      from '../../src/manager/Window.mjs';

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

let redeemed = null;

if (bootUrl?.href && resolveFleetTransportMode(bootUrl) === 'browser' && !globalThis.AgentOS?.fleet?.bearerToken) {
    redeemed = await redeemFleetBearerHandshake({url: resolveFleetUrl()})
}

/**
 * @summary Establish session-only Fleet custody for one boot or healing pass, with the full
 * migration lifecycle made real:
 *
 * - **read-old / no-downgrade:** a bearer-less pass NEVER replaces an existing bridge — `onStart()`
 *   runs for every joining SharedWorker window, and after the first join retires the launcher slot
 *   a later join would otherwise overwrite the live capability with a fail-closed one.
 * - **establish:** the install moves the bearer into transport closures. With NO existing bridge
 *   the install publishes synchronously (there is nothing to displace, and the pane needs the
 *   fail-closed or live state immediately). With an existing bridge, the candidate is built
 *   DETACHED: an unproven credential must never displace a proven capability, so the published
 *   bridge stays the known-good one until the candidate verifies.
 * - **verify:** an authenticated `resolveViewerIdentity` round-trip through the NEW bridge — a
 *   constructed closure is not verification; only the server's stamped answer is. A detached
 *   candidate is PROMOTED only after this proof, by re-installing into the real target —
 *   `installFleetBridge` stays the slot's sole publisher.
 * - **retire:** the launcher pre-boot slot is cleared only after verify succeeds, and only while it
 *   still holds the exact established credential (the CAS guard) — a rejected bearer, an
 *   unreachable endpoint, and a value rotated in during verification all preserve the ingress,
 *   which IS the rollback truth. A throwing install preserves it the same way, and a failed
 *   candidate leaves the known-good bridge published.
 *
 * The function reads the ENTRYPOINT truth itself — the module-private handshake redemption result
 * plus the two launcher pre-boot slots (`AgentOS.fleet.bearerToken`, `AgentOS.fleet.mcAuthorization`)
 * — so the production path and the specs exercise the same read-old surface: both mints move into
 * closures at establish, and BOTH ingress copies are CAS-retired under the one custody proof.
 *
 * @param {Object}   opts
 * @param {String}   opts.fleetUrl                         Raw dial endpoint; identity derives from its canonical form.
 * @param {Object}   [opts.redeemed=null]                  The armed-handshake redemption PAIR
 *     (`{bearerToken, mcAuthorization}`), module-private in the boot path — each field takes
 *     precedence over its launcher slot; `null` falls back to the slots entirely.
 * @param {Function} [opts.installImpl=installFleetBridge] Injectable install for tests.
 * @param {Object}   [opts.target=globalThis]              Injectable global for tests.
 * @returns {Object} `{bridge, custodySettled}` — the bridge PUBLISHED at return time (the fresh
 *     install, or the preserved known-good one while a candidate proves itself), and a
 *     never-rejecting promise resolving `true` exactly when the bearer ingress was verified-retired.
 */
export function establishFleetSessionCustody({fleetUrl, redeemed = null, installImpl = installFleetBridge, target = globalThis} = {}) {
    const
        fleet           = target.AgentOS?.fleet,
        existing        = fleet?.registryBridge,
        bearerToken     = redeemed?.bearerToken ?? fleet?.bearerToken ?? null,
        mcAuthorization = redeemed?.mcAuthorization ?? fleet?.mcAuthorization ?? null;

    if (bearerToken === null && existing) {
        return {bridge: existing, custodySettled: Promise.resolve(false)}
    }

    const
        profile    = createFleetProfile({custodian: 'session-only', endpoint: fleetUrl}),
        publishNow = !existing,
        bridge     = installImpl({url: fleetUrl, bearerToken, mcAuthorization, profileId: profile.profileId, target: publishNow ? target : {}});

    const custodySettled = bearerToken === null
        ? Promise.resolve(false)
        : bridge.resolveViewerIdentity()
            .then(() => {
                publishNow || installImpl({url: fleetUrl, bearerToken, mcAuthorization, profileId: profile.profileId, target});

                // One proof gates BOTH retires: the class-3 mint has no boot-time wire proof of
                // its own (its truth surface is the stream's arming answer, observed later), so
                // its ingress copy retires with the session's proven custody transaction — and a
                // failed verify preserves both slots.
                mcAuthorization && retireBearerIngressSlot(target, {expected: mcAuthorization, field: 'mcAuthorization'});
                return retireBearerIngressSlot(target, {expected: bearerToken})
            })
            .catch(() => false);

    return {bridge: publishNow ? bridge : existing, custodySettled}
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
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
