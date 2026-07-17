import {createFleetRegistryBridge} from './createFleetRegistryBridge.mjs';

/**
 * Canonical shape of the Fleet process bearer: 32 random bytes as unpadded base64url (43 chars).
 * A lightweight FORMAT check only — the Node side owns generation + constant-time verification
 * (`ai/mcp/server/shared/helpers/localBearer.mjs`); this module runs in the App Worker and must
 * stay free of Node crypto imports.
 * @type {RegExp}
 */
const FLEET_BEARER_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Query-param names that would smuggle credential material through a URL. The Fleet launch
 * contract forbids the secret in URLs entirely, so a fleet endpoint carrying one of these is
 * refused outright rather than "helpfully" consumed.
 * @type {String[]}
 */
const FORBIDDEN_URL_CREDENTIAL_PARAMS = ['bearer', 'bearerToken', 'fleetBearer', 'token', 'authorization'];

/**
 * @summary Wire the dev-server (Option B) app↔fleet HTTP transport into the App Worker. Builds a
 * `fetch`-backed `send` against the fleet server URL, wraps it with {@link createFleetRegistryBridge},
 * and publishes the result at `globalThis.AgentOS.fleet.registryBridge` — the exact slot the agentos
 * pane resolves (`apps/agentos/view/Accounts.mjs:260`). Once this has run, the pane's fail-closed
 * `submitToFleetRegistryBridge` path goes live instead of throwing "Fleet Registry bridge unavailable".
 *
 * **The Fleet ingress trust boundary, client half.** Every request carries `Authorization: Bearer <token>`
 * — the process-lifetime secret the launch path shares with the Fleet server through memory only.
 * The bearer reaches this function as an ARGUMENT (an in-memory hand-off: the Electron main process,
 * the Neural Link, or a test's init script places it) and never through a URL: a fleet endpoint
 * whose query string carries credential-shaped params is refused outright, and a missing bearer
 * produces a bridge whose every call rejects LOCALLY with a named launch-contract error — no
 * unauthenticated request ever leaves the worker. The client sends no viewer-identity claim of any
 * kind: the server resolves and stamps the viewer itself, so nothing this module could send would
 * become an identity fact.
 *
 * Additive + idempotent: it preserves any existing `globalThis.AgentOS` (e.g. a `neuralLink`
 * connection bridge installed elsewhere) and only (re)writes the `fleet.registryBridge` slot. The
 * Electron shell (Option A) installs an equivalent bridge in-process instead of calling this — the
 * pane consumes the same `globalThis.AgentOS.fleet.registryBridge` contract either way.
 *
 * @param {Object}   opts
 * @param {String}   opts.url                              Absolute loopback fleet HTTP endpoint (see fleetBridgeServer).
 * @param {String}   [opts.bearerToken=null]               The process bearer (canonical 32-byte unpadded
 *     base64url). `null` installs a fail-closed bridge that rejects every call locally with the
 *     launch-contract remediation — never a network call without credentials.
 * @param {Function} [opts.fetchImpl=globalThis.fetch]     Injectable fetch for tests.
 * @param {Object}   [opts.target=globalThis]              Injectable global for tests.
 * @returns {Object} the installed registry bridge (also reachable at `target.AgentOS.fleet.registryBridge`).
 */
export function installFleetBridge({url, bearerToken = null, fetchImpl = globalThis.fetch, target = globalThis} = {}) {
    const endpointError = 'installFleetBridge requires an absolute loopback HTTP(S) fleet URL';
    let fleetUrl;

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

    // The secret never rides a URL (launch-contract rule): refuse an endpoint that tries.
    if (FORBIDDEN_URL_CREDENTIAL_PARAMS.some(name => fleetUrl.searchParams.has(name))) {
        throw new TypeError('installFleetBridge refuses credential material in the fleet URL — the bearer is an in-memory argument, never a query param')
    }

    if (bearerToken !== null && !FLEET_BEARER_PATTERN.test(bearerToken)) {
        throw new TypeError('installFleetBridge requires a canonical 32-byte unpadded-base64url bearerToken (or null for the fail-closed unlaunched state)')
    }

    const send = bearerToken === null
        // Fail-closed unlaunched state: named, local, diagnosable — and zero network traffic.
        ? async () => {
            throw new Error('fleet bearer not injected — launch the cockpit through the authenticated Fleet boot path; the pane stays fail-closed until the launch contract supplies the process bearer in memory')
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
        };

    const registryBridge = createFleetRegistryBridge(send),
          agentOS        = target.AgentOS = target.AgentOS || {};

    agentOS.fleet                = agentOS.fleet || {};
    agentOS.fleet.registryBridge = registryBridge;

    return registryBridge
}
