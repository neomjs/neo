import {
    createFleetWireOffer,
    createFleetWireRequest,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    inspectFleetWireResponse
} from './fleetWireMethods.mjs';

/**
 * @summary Build the pane-facing fleet registry bridge from a transport `send`. Given a request
 * sender, returns the exact object the agentos pane resolves at
 * `globalThis.AgentOS.fleet.registryBridge` (`apps/agentos/view/Accounts.mjs:260`) — one async method
 * per wire-allowlisted operation ({@link FLEET_WIRE_METHODS}). Each operation sends a fresh
 * version/capability offer, then accepts result data only after the response selects a contract the
 * client offered — the operable-cold contract's Node-client half.
 *
 * The NODE-side client factory (CLI tools like `ai/scripts/fleet/onboardPeer.mjs`, integration
 * specs), binding the same {@link FLEET_WIRE_METHODS} authority `dispatchFleetRequest` validates
 * against — a client built here cannot call a method the server won't route. The BROWSER does not
 * import this module: `apps/agentos/fleet/installFleetBridge.mjs` generates its own proxy map over
 * the app's wire-method twin, and the vocabulary-parity lint keeps the two lists identical
 * **Dependency-light by design** — it imports only the dep-free wire-method list, never
 * the Node-only FleetControlBridge / crypto / fs chain.
 *
 * @param {Function} send A transport sender for versioned Fleet request/response envelopes.
 * @param {Object} [options]
 * @param {String} [options.transportFailureMessage='fleet: request transport failed'] Static,
 *                 caller-owned remediation used when `send` rejects. The rejected error is never
 *                 interpolated or exposed across the client boundary.
 * @returns {Object} the registry bridge — one async method per {@link FLEET_WIRE_METHODS} entry
 *                   (`defineAgent(payload)`, `startAgent(id)`, `listAgents()`, …).
 */
export function createFleetRegistryBridge(send, {transportFailureMessage = 'fleet: request transport failed'} = {}) {
    if (typeof send !== 'function') {
        throw new Error('createFleetRegistryBridge: a transport send(request) function is required');
    }

    if (typeof transportFailureMessage !== 'string' || !transportFailureMessage.trim() || transportFailureMessage.length > 512 || /[\r\n]/.test(transportFailureMessage)) {
        throw new Error('createFleetRegistryBridge: transportFailureMessage must be a non-empty single-line string no longer than 512 characters');
    }

    const request = async (method, params) => {
        const
            offer       = createFleetWireOffer(),
            wireRequest = createFleetWireRequest(method, params, offer);

        let envelope, inspection;

        try {
            envelope = await send(wireRequest)
        } catch {
            throw new Error(transportFailureMessage)
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

        return envelope.result;
    };

    return Object.fromEntries(
        FLEET_WIRE_METHODS.map(method => [method, params => request(method, params)])
    );
}
