/**
 * The app↔fleet client-contract vocabulary — the operable-cold Body-side TWIN of the Brain authority
 * (`ai/services/fleet/fleetWireMethods.mjs`). Browser-side `installFleetBridge` generates exactly
 * these proxy methods; Node-side `dispatchFleetRequest` validates against the authority — and
 * `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` compares every constant and pure helper
 * outcome, so the ends of the wire cannot drift. A new client-safe contract element is registered
 * in the authority and mirrored here in the same commit; trust semantics stay documented only on
 * the authority rather than crossing into this no-checkout realm.
 * @summary Operable-cold Fleet client-contract twin: methods, schema, negotiation, and responses.
 */

/**
 * @type {String[]}
 */
export const FLEET_WIRE_METHODS = Object.freeze([
    'defineAgent', 'configureAgent', 'setRepo', 'setAvatar', 'listAgents', 'getAgent',
    'startAgent', 'stopAgent', 'restartAgent', 'removeAgent', 'fleetStatus', 'fleetRuntimeStatus',
    'getBootIdentity', 'fleetActivity', 'fleetHistory', 'fleetMemories', 'fleetSessionMemories', 'fleetRoster', 'fleetMailboxMirror', 'connectTenant', 'listTenants',
    'composeOperatorMessage', 'markFleetCaughtUp', 'resolveViewerIdentity', 'fleetWakeRoutes', 'fleetTasks'
]);

/**
 * @summary The wire verbs whose normal payload includes credential bytes — the preload-ingress
 * classification the packaged Electron shell consumes. Derived exactly as the authority derives it.
 * @type {String[]}
 */
export const FLEET_CREDENTIAL_METHODS = Object.freeze(
    FLEET_WIRE_METHODS.filter(method => method === 'defineAgent' || method === 'connectTenant')
);

/**
 * @summary Protocol versions the operable-cold client can offer, newest first.
 * @type {Number[]}
 */
export const FLEET_WIRE_PROTOCOL_VERSIONS = Object.freeze([1]);

/**
 * @summary Client-safe wire mechanics — never trust or authorization policy.
 * @type {String[]}
 */
export const FLEET_WIRE_CAPABILITIES = Object.freeze([
    'method-schema-v1',
    'closed-response-states-v1'
]);

/**
 * @summary Capabilities required for a usable selected contract.
 * @type {String[]}
 */
export const FLEET_WIRE_REQUIRED_CAPABILITIES = Object.freeze([
    'method-schema-v1',
    'closed-response-states-v1'
]);

/**
 * @summary The finite top-level wire response states mirrored from the Brain authority.
 * @type {Readonly<Record<String, String>>}
 */
export const FLEET_WIRE_RESPONSE_STATES = Object.freeze({
    degraded             : 'degraded',
    ok                   : 'ok',
    operationFailed      : 'operation-failed',
    refused              : 'refused',
    unsupportedCapability: 'unsupported-capability',
    unsupportedMethod    : 'unsupported-method',
    unsupportedProtocol  : 'unsupported-protocol'
});

/**
 * @summary Operable-cold request/offer/selection/response envelope schema.
 * @type {Readonly<Object>}
 */
export const FLEET_WIRE_ENVELOPE_SCHEMA = Object.freeze({
    offer: Object.freeze({
        required: Object.freeze(['versions', 'capabilities'])
    }),
    request: Object.freeze({
        required: Object.freeze(['method', 'protocol']),
        optional: Object.freeze(['params'])
    }),
    response: Object.freeze({
        required       : Object.freeze(['ok', 'state', 'protocol']),
        successRequired: Object.freeze(['result']),
        failureRequired: Object.freeze(['error']),
        optional       : Object.freeze(['degraded'])
    }),
    selection: Object.freeze({
        required: Object.freeze(['version', 'capabilities'])
    })
});

const
    MAX_PROTOCOL_CAPABILITIES = 64,
    MAX_PROTOCOL_TOKEN_LENGTH = 100,
    MAX_PROTOCOL_VERSIONS     = 16,
    MAX_WIRE_DEGRADED_LENGTH  = 100,
    MAX_WIRE_ERROR_LENGTH     = 300,
    responseStates            = new Set(Object.values(FLEET_WIRE_RESPONSE_STATES));

/**
 * @summary Identifies a plain record-shaped wire value without accepting arrays or null.
 * @param {*} value
 * @returns {Boolean}
 * @private
 */
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @summary Creates a fresh current client offer.
 * @returns {{capabilities: String[], versions: Number[]}}
 */
export function createFleetWireOffer() {
    return {
        capabilities: [...FLEET_WIRE_CAPABILITIES],
        versions    : [...FLEET_WIRE_PROTOCOL_VERSIONS]
    }
}

/**
 * @summary Creates a selected-contract stamp.
 * @param {Number} [version=FLEET_WIRE_PROTOCOL_VERSIONS[0]]
 * @param {String[]} [capabilities=FLEET_WIRE_CAPABILITIES]
 * @returns {{capabilities: String[], version: Number}}
 */
export function createFleetWireProtocolStamp(
    version = FLEET_WIRE_PROTOCOL_VERSIONS[0],
    capabilities = FLEET_WIRE_CAPABILITIES
) {
    return {
        capabilities: [...capabilities],
        version
    }
}

/**
 * @summary Selects one compatible contract from an offer; pure parity twin of the Brain helper.
 * @param {Object} offer
 * @returns {{ok: Boolean, protocol: Object, state: String, error: (String|undefined)}}
 */
export function selectFleetWireContract(offer) {
    const
        versionsValid = Array.isArray(offer?.versions) &&
            offer.versions.length > 0 &&
            offer.versions.length <= MAX_PROTOCOL_VERSIONS &&
            offer.versions.every(version => Number.isInteger(version) && version > 0),
        version = versionsValid
            ? FLEET_WIRE_PROTOCOL_VERSIONS.find(candidate => offer.versions.includes(candidate))
            : undefined;

    if (version === undefined) {
        return {
            error   : 'fleet: unsupported wire protocol',
            ok      : false,
            protocol: createFleetWireProtocolStamp(),
            state   : FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol
        }
    }

    const capabilitiesValid = Array.isArray(offer?.capabilities) &&
        offer.capabilities.length <= MAX_PROTOCOL_CAPABILITIES &&
        offer.capabilities.every(capability => typeof capability === 'string' &&
            capability.length > 0 && capability.length <= MAX_PROTOCOL_TOKEN_LENGTH) &&
        new Set(offer.capabilities).size === offer.capabilities.length;

    if (!capabilitiesValid) {
        return {
            error   : 'fleet: unsupported wire capability offer',
            ok      : false,
            protocol: createFleetWireProtocolStamp(version),
            state   : FLEET_WIRE_RESPONSE_STATES.unsupportedCapability
        }
    }

    const
        offered = new Set(offer.capabilities),
        missing = FLEET_WIRE_REQUIRED_CAPABILITIES.filter(capability => !offered.has(capability));

    if (missing.length > 0) {
        return {
            error   : 'fleet: missing required wire capabilities: ' + missing.join(', '),
            ok      : false,
            protocol: createFleetWireProtocolStamp(version),
            state   : FLEET_WIRE_RESPONSE_STATES.unsupportedCapability
        }
    }

    return {
        ok      : true,
        protocol: createFleetWireProtocolStamp(
            version,
            FLEET_WIRE_CAPABILITIES.filter(capability => offered.has(capability))
        ),
        state: FLEET_WIRE_RESPONSE_STATES.ok
    }
}

/**
 * @summary Creates a versioned request for one public Fleet operation.
 * @param {String} method
 * @param {*} params
 * @param {Object} [protocol=createFleetWireOffer()]
 * @returns {{method: String, params: *, protocol: Object}}
 */
export function createFleetWireRequest(method, params, protocol = createFleetWireOffer()) {
    if (!FLEET_WIRE_METHODS.includes(method)) {
        throw new TypeError("fleet: method '" + method + "' is not on the client contract")
    }

    return {
        method,
        params,
        protocol: {
            capabilities: Array.isArray(protocol?.capabilities) ? [...protocol.capabilities] : protocol?.capabilities,
            versions    : Array.isArray(protocol?.versions) ? [...protocol.versions] : protocol?.versions
        }
    }
}

/**
 * @summary Creates a finite Fleet wire response.
 * @param {String} state
 * @param {Object} [options]
 * @returns {Object}
 */
export function createFleetWireResponse(state, {
    degraded,
    error,
    protocol = createFleetWireProtocolStamp(),
    result
} = {}) {
    if (!responseStates.has(state)) {
        throw new TypeError("fleet: unknown wire response state '" + state + "'")
    }

    if (!isRecord(protocol) ||
        !Number.isInteger(protocol.version) || protocol.version < 1 ||
        !Array.isArray(protocol.capabilities) ||
        protocol.capabilities.length > MAX_PROTOCOL_CAPABILITIES ||
        !protocol.capabilities.every(capability => typeof capability === 'string' &&
            capability.length > 0 && capability.length <= MAX_PROTOCOL_TOKEN_LENGTH) ||
        new Set(protocol.capabilities).size !== protocol.capabilities.length) {
        throw new TypeError('fleet: invalid selected wire protocol stamp')
    }

    const
        ok       = state === FLEET_WIRE_RESPONSE_STATES.ok,
        envelope = {
            ok,
            state,
            protocol: createFleetWireProtocolStamp(protocol.version, protocol.capabilities)
        };

    if (ok) {
        if (result === undefined) {
            throw new TypeError('fleet: successful wire response requires a result')
        }

        envelope.result = result
    } else {
        envelope.error = typeof error === 'string' && error
            ? error.slice(0, MAX_WIRE_ERROR_LENGTH)
            : 'fleet: request failed';

        if (typeof degraded === 'string' && degraded) {
            envelope.degraded = degraded.slice(0, MAX_WIRE_DEGRADED_LENGTH)
        }
    }

    return envelope
}

/**
 * @summary Validates a server response against the client offer.
 * @param {Object} envelope
 * @param {Object} [offer=createFleetWireOffer()]
 * @returns {{error: (String|undefined), ok: Boolean}}
 */
export function inspectFleetWireResponse(envelope, offer = createFleetWireOffer()) {
    const
        responseKeys  = new Set(Object.values(FLEET_WIRE_ENVELOPE_SCHEMA.response).flat()),
        selectionKeys = new Set(FLEET_WIRE_ENVELOPE_SCHEMA.selection.required),
        state         = envelope?.state;

    if (!isRecord(envelope) ||
        Object.keys(envelope).some(key => !responseKeys.has(key)) ||
        !responseStates.has(state) ||
        envelope.ok !== (state === FLEET_WIRE_RESPONSE_STATES.ok) ||
        (state === FLEET_WIRE_RESPONSE_STATES.ok &&
            (!Object.hasOwn(envelope, 'result') || envelope.result === undefined ||
                Object.hasOwn(envelope, 'error') || Object.hasOwn(envelope, 'degraded'))) ||
        (state !== FLEET_WIRE_RESPONSE_STATES.ok &&
            (typeof envelope.error !== 'string' || envelope.error.length === 0 ||
                envelope.error.length > MAX_WIRE_ERROR_LENGTH || Object.hasOwn(envelope, 'result'))) ||
        (state === FLEET_WIRE_RESPONSE_STATES.degraded &&
            (typeof envelope.degraded !== 'string' || envelope.degraded.length === 0 ||
                envelope.degraded.length > MAX_WIRE_DEGRADED_LENGTH)) ||
        (state !== FLEET_WIRE_RESPONSE_STATES.degraded && Object.hasOwn(envelope, 'degraded')) ||
        !isRecord(envelope.protocol) ||
        Object.keys(envelope.protocol).some(key => !selectionKeys.has(key)) ||
        !Number.isInteger(envelope.protocol.version) || envelope.protocol.version < 1 ||
        !Array.isArray(envelope.protocol.capabilities) ||
        envelope.protocol.capabilities.length > MAX_PROTOCOL_CAPABILITIES ||
        !envelope.protocol.capabilities.every(capability => typeof capability === 'string' &&
            capability.length > 0 && capability.length <= MAX_PROTOCOL_TOKEN_LENGTH) ||
        new Set(envelope.protocol.capabilities).size !== envelope.protocol.capabilities.length) {
        return {error: 'fleet: malformed wire response', ok: false}
    }

    const negotiationRefusal = [
        FLEET_WIRE_RESPONSE_STATES.unsupportedCapability,
        FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol
    ].includes(envelope.state);

    if (!negotiationRefusal) {
        if (!Array.isArray(offer?.versions) ||
            !Array.isArray(offer?.capabilities) ||
            !offer.versions.includes(envelope.protocol.version)) {
            return {error: 'fleet: response selected an unoffered wire protocol', ok: false}
        }

        const
            offeredCapabilities = new Set(offer?.capabilities),
            selected            = new Set(envelope.protocol.capabilities);

        if (FLEET_WIRE_REQUIRED_CAPABILITIES.some(capability => !selected.has(capability))) {
            return {error: 'fleet: response omitted a required wire capability', ok: false}
        }

        if (envelope.protocol.capabilities.some(capability => !offeredCapabilities.has(capability))) {
            return {error: 'fleet: response selected an unoffered wire capability', ok: false}
        }
    }

    return {ok: true}
}
