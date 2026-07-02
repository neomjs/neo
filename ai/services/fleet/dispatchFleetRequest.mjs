import FleetControlBridge   from './FleetControlBridge.mjs';
import {FLEET_WIRE_METHODS} from './fleetWireMethods.mjs';

/**
 * @summary Route one transport-delivered fleet request to the {@link FleetControlBridge} allowlist —
 * the single choke-point every app↔fleet transport (the dev-server WebSocket, or the Electron shell's
 * in-process inject) funnels through. It enforces the wire-level method allowlist, forwards the single
 * `params` argument, and normalizes success / failure into a serializable envelope.
 *
 * **Never throws to the transport.** A rejected method name, a thrown operation, or a rejected promise
 * all return an `{ok:false, error}` envelope, so the calling pane sees a fail-closed result rather than
 * a crashed connection — mirroring the fail-closed discipline the pane already applies when no bridge
 * is injected (`apps/agentos/view/Accounts.mjs`).
 *
 * @param {Object}  request
 * @param {String}  request.method   One of {@link FLEET_WIRE_METHODS}.
 * @param {*}      [request.params]  The single argument forwarded to the operation — a definition
 *                                   object for `defineAgent`, an id string for the lifecycle ops,
 *                                   omitted for `listAgents` / `fleetStatus`.
 * @param {Object} [bridge=FleetControlBridge] The control surface; inject a stub in tests.
 * @returns {Promise<Object>} `{ok:true, result}` on success; `{ok:false, error}` on a non-allowlisted
 *                            method or a thrown / rejected operation.
 */
export async function dispatchFleetRequest({method, params} = {}, bridge = FleetControlBridge) {
    if (!FLEET_WIRE_METHODS.includes(method)) {
        return {ok: false, error: `fleet: method '${method}' is not on the control surface`};
    }

    try {
        const result = await bridge[method](params);
        return {ok: true, result};
    } catch (error) {
        return {ok: false, error: error?.message || String(error)};
    }
}

export {FLEET_WIRE_METHODS};
