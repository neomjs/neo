/**
 * @summary The dependency-free app↔fleet client-contract AUTHORITY — the exact operation names,
 * envelope schema, protocol versions, capability vocabulary, and finite response states a
 * transport may carry between the agentos pane and {@link Neo.ai.services.fleet.FleetControlBridge}.
 * The Node side binds it directly: `dispatchFleetRequest` rejects anything off this list, and
 * `createFleetRegistryBridge` (the Node-side client factory) generates exactly these methods. The
 * browser binds the operable-cold twin (`apps/agentos/config/fleetWireMethods.mjs`) instead of
 * importing across the realm boundary — `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs`
 * compares every constant and pure helper outcome, so the ends of the wire cannot drift.
 *
 * Deliberately **narrower than FleetControlBridge's class surface**: it excludes the `getRegistry` /
 * `getManager` resolver seams (which return the lifecycle-powerful singletons) and every inherited
 * `Object` / `Neo.core.Base` member, so a crafted `{method:'getManager'}` / `{method:'constructor'}`
 * request cannot reach a non-operation.
 *
 * `getBootIdentity`, `fleetActivity`, `fleetHistory`, `fleetMemories`, `fleetRoster`, `fleetMailboxMirror`,
 * and `fleetWakeRoutes` are **read-observe** verbs — the advisory boot-identity fact, the bounded
 * fleet activity snapshot, one viewer-bound catch-up window, one page of an agent's session
 * summaries (the team-visible corpus; the wire carries the canonical target and paging only), the
 * assembled roster cockpit DTO, one agent's mailbox mirror, and the decomposed per-seat wake-route
 * envelope: they carry NO lifecycle-write / restart authority. The
 * R3 read-observe ÷ lifecycle-write seam keeps the daemon-core restart actuator physically OFF this
 * client wire — only advisory reads ride it.
 *
 * `fleetMailboxMirror` carries no mutation verb and its snapshot is body-free. The transport it
 * rides is authenticated (Host/Origin/process-bearer gates) and every admitted request executes
 * under a SERVER-stamped viewer identity — the launch entry wires the source to resolve the bound
 * viewer from the request context per read, and admission stays the Memory Core primitive's own
 * fail-closed decision. An entry that has not composed the launch contract leaves the source
 * unwired, and every call answers an honest `unavailable`. Being on this list is what makes the
 * seam REAL rather than a Node-side method the browser can never name — an allowlist omission
 * fails closed and SILENT, which reads exactly like a wired-but-empty mailbox from the pane's side.
 *
 * `resolveViewerIdentity` is the **identity-bootstrap** read verb — whoami: it returns the
 * SERVER-stamped viewer identity (`{agentIdentityNodeId}`) from the authenticated request context,
 * never a caller claim. It exists because the mirror's explicit-subject contract is deliberate
 * (no self-defaulting at a trust boundary) while `admission.viewerIdentity` only arrives IN a read
 * result — circular for the FIRST own-inbox read. Whoami is the missing bootstrap leg of
 * "the client SAYS self, and the admission stamp proves it": cockpit calls whoami → passes the
 * returned @-id EXPLICITLY as `subjectAgentId` → the mirror re-stamps and proves it. An unwired
 * source (no composed launch contract) answers an honest `unavailable`; an admitted-but-unbound
 * context answers a named refusal — never a fallback identity.
 *
 * `markFleetCaughtUp` is a runtime-only write: it advances only the authenticated viewer's
 * process-lifetime `lastSeen` through an exact rendered window. It writes no graph, browser storage,
 * or durable digest. `composeOperatorMessage` is the wire's first durable **write** verb — the operator-mailbox steering
 * surface: compose a DM or an `AGENT:*` broadcast through the bridge's injected writer. It rides
 * ONLY the authenticated transport: the ingress stamps the server-resolved viewer into the request
 * context, and the mailbox primitive resolves the author + its principal class from that ambient
 * binding — the sender is never wire-carried, and caller-supplied identity fields never leave the
 * verb's payload whitelist.
 *
 * **Dependency-free by design** — it MUST NOT pull in the Node-only FleetControlBridge / crypto /
 * fs chain, so the client factory and every spec can load it without the server graph.
 * @type {String[]}
 */
export const FLEET_WIRE_METHODS = Object.freeze([
    'defineAgent', 'configureAgent', 'setRepo', 'setAvatar', 'listAgents', 'getAgent',
    'startAgent', 'stopAgent', 'restartAgent', 'removeAgent', 'fleetStatus', 'fleetRuntimeStatus',
    'getBootIdentity', 'fleetActivity', 'fleetHistory', 'fleetMemories', 'fleetRoster', 'fleetMailboxMirror', 'connectTenant', 'listTenants',
    'composeOperatorMessage', 'markFleetCaughtUp', 'resolveViewerIdentity', 'fleetWakeRoutes'
]);

/**
 * @summary The wire verbs whose normal payload includes credential bytes. Direct-browser development
 * may carry these through its authenticated in-memory bearer transport, but the packaged Electron
 * shell replaces them with named preload-owned ingress so a Body/App-Worker request never supplies
 * the secret. Keeping this classification beside {@link FLEET_WIRE_METHODS} prevents Electron main
 * and the App Worker from inventing independent, drifting lists.
 * @type {String[]}
 */
export const FLEET_CREDENTIAL_METHODS = Object.freeze(
    FLEET_WIRE_METHODS.filter(method => method === 'defineAgent' || method === 'connectTenant')
);

/**
 * @summary Protocol versions this Fleet service can select, newest first. A client offers one or
 * more versions and the server selects the first common member before method policy or bridge
 * execution. Version 1 introduces explicit capability offers and closed response states.
 * @type {Number[]}
 */
export const FLEET_WIRE_PROTOCOL_VERSIONS = Object.freeze([1]);

/**
 * @summary Client-safe protocol capabilities implemented by this authority. These are wire
 * mechanics only — never identity, bearer, ownership, authorization, or lifecycle policy.
 * @type {String[]}
 */
export const FLEET_WIRE_CAPABILITIES = Object.freeze([
    'method-schema-v1',
    'closed-response-states-v1'
]);

/**
 * @summary Capabilities a client must offer for the current server contract to be usable.
 * Kept distinct from the full capability catalog so future additive capabilities can remain
 * optional without silently widening the minimum client contract.
 * @type {String[]}
 */
export const FLEET_WIRE_REQUIRED_CAPABILITIES = Object.freeze([
    'method-schema-v1',
    'closed-response-states-v1'
]);

/**
 * @summary The finite top-level response-state vocabulary. Domain outcomes such as an admission
 * rejection remain inside result; these states describe only the wire/dispatch layer.
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
 * @summary Executable vocabulary for the request offer, selected contract, and response envelope.
 * It is intentionally structural rather than a duplicate of server-side domain validators.
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
 * @summary Creates the current client offer. Fresh arrays keep callers from mutating the frozen
 * authority or sharing mutable offer state between concurrent requests.
 * @returns {{capabilities: String[], versions: Number[]}}
 */
export function createFleetWireOffer() {
    return {
        capabilities: [...FLEET_WIRE_CAPABILITIES],
        versions    : [...FLEET_WIRE_PROTOCOL_VERSIONS]
    }
}

/**
 * @summary Creates the server's selected-contract stamp.
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
 * @summary Selects one compatible Fleet wire contract from a client offer. Unknown additive
 * capabilities are ignored; every required capability must be present. The result is bounded and
 * carries no caller-authored values except a selected member of the server-owned catalogs.
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
 * @summary Creates a client request with a main/client-owned protocol offer. The method must come
 * from the public operation vocabulary; callers cannot use this helper to mint a wider surface.
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
 * @summary Creates one finite Fleet wire response. Success is derived from the state rather than
 * accepted as a second caller-controlled truth.
 * @param {String} state One of {@link FLEET_WIRE_RESPONSE_STATES}.
 * @param {Object} [options]
 * @param {String} [options.degraded]
 * @param {String} [options.error]
 * @param {Object} [options.protocol=createFleetWireProtocolStamp()]
 * @param {*} [options.result]
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
 * @summary Validates a server envelope against the offer this client sent. Unsupported
 * version/capability states may advertise the server's current stamp; every other state must carry
 * a contract the client actually offered.
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
