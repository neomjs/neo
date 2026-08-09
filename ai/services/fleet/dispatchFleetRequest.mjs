import FleetControlBridge from './FleetControlBridge.mjs';
import {
    createFleetWireResponse,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    selectFleetWireContract
} from './fleetWireMethods.mjs';

/**
 * @summary Negotiate one transport-delivered Fleet request, then route it through the
 * {@link FleetControlBridge} allowlist. This is the single choke-point shared by the HTTP transport
 * and Electron injection: protocol selection happens before method lookup, unknown methods fail as
 * their own closed state, and bridge execution returns one finite response state.
 *
 * **Never throws to the transport.** Unsupported protocol/capability offers, rejected method names,
 * and thrown operations all return a versioned closed envelope. No legacy unversioned request can
 * masquerade as an operation failure or empty result.
 *
 * @param {Object}  request Versioned `{method, params, protocol}` request.
 * @param {String}  request.method   One of {@link FLEET_WIRE_METHODS}.
 * @param {*}      [request.params]  The single argument forwarded to the operation — a definition
 *                                   object for `defineAgent`, an id string for the lifecycle ops,
 *                                   omitted for `listAgents` / `fleetStatus`.
 * @param {Object} [bridge=FleetControlBridge] The control surface; inject a stub in tests.
 * @returns {Promise<Object>} Versioned finite-state response envelope.
 */
export async function dispatchFleetRequest(request = {}, bridge = FleetControlBridge) {
    const
        {method, params} = request || {},
        selection        = selectFleetWireContract(request?.protocol);

    if (!selection.ok) {
        return createFleetWireResponse(selection.state, selection)
    }

    if (!FLEET_WIRE_METHODS.includes(method)) {
        return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.unsupportedMethod, {
            error   : "fleet: method '" + method + "' is not on the control surface",
            protocol: selection.protocol
        })
    }

    try {
        const result = await bridge[method](params);

        return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.ok, {
            protocol: selection.protocol,
            result
        })
    } catch (error) {
        // Never expose the raw error across the wire — it can carry a stack trace / internal paths.
        // Log it server-side; return a sanitized, method-scoped failure the pane can act on.
        console.error(`[fleet] dispatch of '${method}' failed:`, error);

        return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.operationFailed, {
            error   : "fleet: '" + method + "' failed",
            protocol: selection.protocol
        })
    }
}

export {FLEET_WIRE_METHODS};
