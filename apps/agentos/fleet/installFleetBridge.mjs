import {FLEET_BEARER_PATTERN} from './connectionProfiles.mjs';
import {
    createFleetWireOffer,
    createFleetWireRequest,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    inspectFleetWireResponse
} from '../config/fleetWireMethods.mjs';

/**
 * Query-param names that would smuggle credential material through a URL. The Fleet launch
 * contract forbids the secret in URLs entirely, so a fleet endpoint carrying one of these is
 * refused outright rather than "helpfully" consumed.
 * @type {String[]}
 */
const FORBIDDEN_URL_CREDENTIAL_PARAMS = ['bearer', 'bearerToken', 'fleetBearer', 'token', 'authorization'];

/**
 * Bounded local launch-state errors that may cross the injected shell transport verbatim. Every
 * other rejection collapses to the generic transport failure before reaching the pane.
 * @type {Readonly<Object>}
 */
export const FLEET_LOCAL_TRANSPORT_ERRORS = Object.freeze({
    noBearer       : 'fleet bearer not injected — launch the cockpit through the authenticated Fleet boot path; the pane stays fail-closed until the launch contract supplies the process bearer in memory',
    noLiveWindow   : 'fleet: no live shell window',
    shellCapability: 'fleet: shell request capability unavailable'
});

/**
 * @summary Wire one topology-owned app↔fleet transport into the App Worker. Direct-browser mode
 * builds a `fetch`-backed `send` against the Fleet URL; the packaged Electron shell injects a named
 * preload/main `send` whose bearer never enters this realm. Both feed the proxy map generated here
 * over the app's wire-method twin (`../config/fleetWireMethods.mjs`) and publish it at
 * `globalThis.AgentOS.fleet.registryBridge` — the exact slot the AgentOS
 * pane resolves (`apps/agentos/view/Accounts.mjs:260`). Once this has run, the pane's fail-closed
 * `submitToFleetRegistryBridge` path goes live instead of throwing "Fleet Registry bridge unavailable".
 * The Node-side dual (`ai/services/fleet/createFleetRegistryBridge.mjs`, consumed by CLI tools)
 * binds the AUTHORITY list; the vocabulary-parity lint keeps the two lists identical, so the ends
 * of the wire cannot drift while neither realm imports across the boundary.
 * Every call creates a fresh version/capability offer and validates the server-selected contract
 * before returning operation data. Direct-browser mode emits that offer itself; shell mode keeps
 * the IPC message at `{method, params}` so Electron main can attach its independently loaded,
 * main-owned offer — the operable-cold contract's browser-client half.
 *
 * **The Fleet ingress trust boundary, client half.** Direct-browser requests carry
 * `Authorization: Bearer <token>` — the process-lifetime secret its launch path injects as an
 * in-memory argument. Shell mode instead delegates to main, which owns authorization internally.
 * Neither topology accepts a bearer from a URL. A direct-browser endpoint carrying a
 * credential-shaped query param is refused outright, and a missing bearer produces a bridge whose
 * every call rejects LOCALLY — no unauthenticated request leaves the worker. The client sends no
 * viewer-identity claim; the server resolves and stamps the viewer itself.
 *
 * Additive + idempotent: it preserves any existing `globalThis.AgentOS` (e.g. a `neuralLink`
 * connection bridge installed elsewhere) and only (re)writes the `fleet.registryBridge` slot. The
 * pane consumes the same contract in both topologies; a non-enumerable `credentialIngress` fact tells
 * the form whether credential input belongs to the App Worker (`worker`) or the shell (`shell`).
 *
 * @param {Object}   opts
 * @param {String}   [opts.url]                            Absolute loopback Fleet HTTP endpoint (direct-browser mode).
 * @param {String}   [opts.bearerToken=null]               The process bearer (canonical 32-byte unpadded
 *     base64url). `null` installs a fail-closed bridge that rejects every call locally with the
 *     launch-contract remediation — never a network call without credentials.
 * @param {Function} [opts.fetchImpl=globalThis.fetch]     Injectable fetch for tests.
 * @param {Function} [opts.send=null]                      Packaged-shell intent transport; receives
 *     only `{method, params}` and is mutually exclusive with `url` / `bearerToken`.
 * @param {'worker'|'shell'} [opts.credentialIngress='worker'] Public credential-custody fact.
 * @param {String}   [opts.profileId=null]                 The connection-profile identity this bridge
 *     serves (`./connectionProfiles.mjs` derivation) — a renderable capability fact like
 *     `credentialIngress`, never credential material; bearer-shaped values are refused outright.
 *     `null` for installs whose identity lives with the custodian (the packaged shell) or predates
 *     profile wiring.
 * @param {Boolean}  [opts.selected=false]                 Whether this install is an explicit source
 *     selection (the injector path) versus the boot default. Selected bridges render an empty
 *     registry's true zero state; unselected defaults keep the zero-setup sample.
 * @param {Object}   [opts.target=globalThis]              Injectable global for tests.
 * @returns {Object} the installed registry bridge (also reachable at `target.AgentOS.fleet.registryBridge`).
 */
export function installFleetBridge({
    url,
    bearerToken = null,
    fetchImpl = globalThis.fetch,
    send = null,
    credentialIngress = 'worker',
    profileId = null,
    selected = false,
    target = globalThis
} = {}) {
    const endpointError = 'installFleetBridge requires an absolute loopback HTTP(S) fleet URL';
    let fleetUrl, shellTransport, transportSend;

    if (!['shell', 'worker'].includes(credentialIngress)) {
        throw new TypeError("installFleetBridge: credentialIngress must be 'shell' or 'worker'")
    }

    if (profileId !== null && (typeof profileId !== 'string' || !profileId.trim() || FLEET_BEARER_PATTERN.test(profileId))) {
        throw new TypeError('installFleetBridge: profileId must be null or a non-empty identity string — bearer-shaped material is refused, the fact is pane-renderable')
    }

    if (send !== null) {
        if (typeof send !== 'function') {
            throw new TypeError('installFleetBridge: send must be a function')
        }

        if (url !== undefined || bearerToken !== null) {
            throw new TypeError('installFleetBridge: injected send is mutually exclusive with url and bearerToken')
        }

        shellTransport = true;
        transportSend  = send
    } else {
        shellTransport = false;

        if (credentialIngress === 'shell') {
            throw new TypeError('installFleetBridge: shell credential ingress requires an injected send')
        }

        if (typeof url !== 'string' || !url.trim()) {
            throw new TypeError(endpointError)
        }

        try {
            fleetUrl = new URL(url)
        } catch {
            throw new TypeError(endpointError)
        }

        if (!['http:', 'https:'].includes(fleetUrl.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(fleetUrl.hostname)) {
            throw new TypeError(endpointError)
        }

        if (FORBIDDEN_URL_CREDENTIAL_PARAMS.some(name => fleetUrl.searchParams.has(name))) {
            throw new TypeError('installFleetBridge refuses credential material in the fleet URL — the bearer is an in-memory argument, never a query param')
        }

        if (bearerToken !== null && !FLEET_BEARER_PATTERN.test(bearerToken)) {
            throw new TypeError('installFleetBridge requires a canonical 32-byte unpadded-base64url bearerToken (or null for the fail-closed unlaunched state)')
        }

        transportSend = bearerToken === null
            ? async () => {
                throw new Error(FLEET_LOCAL_TRANSPORT_ERRORS.noBearer)
            }
            : async request => {
                const response = await fetchImpl(fleetUrl.href, {
                    method : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization : `Bearer ${bearerToken}`
                    },
                    body: JSON.stringify(request)
                });

                return response.json()
            }
    }

    // The browser's half of the wire contract: one async proxy per twin-listed verb, unwrapping the
    // finite response envelope only after its selection matches this realm's offer. Browser mode
    // sends that offer directly; shell mode relies on parity with main's independently owned offer.
    const request = async (method, params) => {
        const
            offer       = createFleetWireOffer(),
            wireRequest = createFleetWireRequest(method, params, offer);

        let envelope, inspection;

        try {
            envelope = await transportSend(shellTransport
                ? {method: wireRequest.method, params: wireRequest.params}
                : wireRequest)
        } catch (error) {
            const safeError = Object.values(FLEET_LOCAL_TRANSPORT_ERRORS).includes(error?.message)
                ? error.message
                : 'fleet: request transport failed';

            throw new Error(safeError)
        }

        try {
            inspection = inspectFleetWireResponse(envelope, offer)
        } catch {
            throw new Error('fleet: malformed wire response')
        }

        if (!inspection.ok) {
            throw new Error(inspection.error)
        }

        if (envelope.state !== FLEET_WIRE_RESPONSE_STATES.ok) {
            throw new Error(envelope?.error || `fleet: '${method}' failed`);
        }

        return envelope.result
    };

    const registryBridge = Object.fromEntries(
              FLEET_WIRE_METHODS.map(method => [method, params => request(method, params)])
          ),
          agentOS = target.AgentOS = target.AgentOS || {};

    Object.defineProperty(registryBridge, 'credentialIngress', {
        configurable: true,
        value       : credentialIngress
    });

    // The identity twin of the custody fact above: WHICH connection profile this bridge serves,
    // renderable by the pane without exposing anything the closure protects.
    Object.defineProperty(registryBridge, 'profileId', {
        configurable: true,
        value       : profileId
    });

    // An explicitly wired bridge (the ViewportController injector — Neural Link, tests, dev
    // tooling) marks `selected: true`: an empty registry from a deliberately chosen source renders
    // its TRUE zero state, while the boot-default install keeps the zero-setup sample flagship.
    Object.defineProperty(registryBridge, 'selected', {
        configurable: true,
        value       : selected
    });

    agentOS.fleet                = agentOS.fleet || {};
    agentOS.fleet.registryBridge = registryBridge;

    return registryBridge
}
