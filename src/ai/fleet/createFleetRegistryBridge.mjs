import {FLEET_WIRE_METHODS} from './fleetWireMethods.mjs';

/**
 * @summary Build the pane-facing fleet registry bridge from a transport `send`. Given a request
 * sender, returns the exact object the agentos pane resolves at
 * `globalThis.AgentOS.fleet.registryBridge` (`apps/agentos/view/Accounts.mjs:260`) — one async method
 * per wire-allowlisted operation ({@link FLEET_WIRE_METHODS}), each forwarding `{method, params}`
 * through `send` and unwrapping the `{ok, result|error}` envelope (resolving `result`, throwing on
 * `error`).
 *
 * The browser-side (App-Worker) counterpart to the Node-side `dispatchFleetRequest`: both bind to the
 * same {@link FLEET_WIRE_METHODS} SSOT, so the client cannot call a method the server won't route.
 * **Dependency-light by design** — it imports only the dep-free wire-method list, never the Node-only
 * FleetControlBridge / crypto / fs chain, so it is safe to load in the App Worker.
 *
 * @param {Function} send A transport sender: `({method, params}) => Promise<{ok:Boolean, result?:*, error?:String}>`.
 * @returns {Object} the registry bridge — one async method per {@link FLEET_WIRE_METHODS} entry
 *                   (`defineAgent(payload)`, `startAgent(id)`, `listAgents()`, …).
 */
export function createFleetRegistryBridge(send) {
    if (typeof send !== 'function') {
        throw new Error('createFleetRegistryBridge: a transport send(request) function is required');
    }

    const request = async (method, params) => {
        const envelope = await send({method, params});

        if (!envelope?.ok) {
            throw new Error(envelope?.error || `fleet: '${method}' failed`);
        }

        return envelope.result;
    };

    return Object.fromEntries(
        FLEET_WIRE_METHODS.map(method => [method, params => request(method, params)])
    );
}
