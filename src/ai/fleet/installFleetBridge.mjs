import {createFleetRegistryBridge} from './createFleetRegistryBridge.mjs';

/**
 * @summary Wire the dev-server (Option B) app↔fleet HTTP transport into the App Worker. Builds a
 * `fetch`-backed `send` against the fleet server URL, wraps it with {@link createFleetRegistryBridge},
 * and publishes the result at `globalThis.AgentOS.fleet.registryBridge` — the exact slot the agentos
 * pane resolves (`apps/agentos/view/Accounts.mjs:260`). Once this has run, the pane's fail-closed
 * `submitToFleetRegistryBridge` path goes live instead of throwing "Fleet Registry bridge unavailable".
 *
 * Additive + idempotent: it preserves any existing `globalThis.AgentOS` (e.g. a `neuralLink`
 * connection bridge installed elsewhere) and only (re)writes the `fleet.registryBridge` slot. The
 * Electron shell (Option A) installs an equivalent bridge in-process instead of calling this — the
 * pane consumes the same `globalThis.AgentOS.fleet.registryBridge` contract either way.
 *
 * @param {Object}   [opts]
 * @param {String}   [opts.url='http://127.0.0.1:8083/fleet'] The fleet HTTP endpoint (see fleetBridgeServer).
 * @param {Function} [opts.fetchImpl=globalThis.fetch]        Injectable fetch for tests.
 * @param {Object}   [opts.target=globalThis]                 Injectable global for tests.
 * @returns {Object} the installed registry bridge (also reachable at `target.AgentOS.fleet.registryBridge`).
 */
export function installFleetBridge({url = 'http://127.0.0.1:8083/fleet', fetchImpl = globalThis.fetch, target = globalThis} = {}) {
    const send = async request => {
        const response = await fetchImpl(url, {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify(request)
        });

        return response.json()
    };

    const registryBridge = createFleetRegistryBridge(send),
          agentOS        = target.AgentOS = target.AgentOS || {};

    agentOS.fleet                = agentOS.fleet || {};
    agentOS.fleet.registryBridge = registryBridge;

    return registryBridge
}
