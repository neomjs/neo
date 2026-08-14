import {dispatchFleetRequest} from './dispatchFleetRequest.mjs';
import {
    createFleetWireResponse,
    FLEET_WIRE_METHODS,
    FLEET_WIRE_RESPONSE_STATES,
    selectFleetWireContract
} from './fleetWireMethods.mjs';

/**
 * @summary The complete S1 wire policy for the composed Fleet service. Authentication makes the
 * identity-bearing probe ready, but exposes no plane data by itself: every wire verb names the
 * slice that owns its missing semantics. A marker is not a claim that this one slice is the verb's
 * sole prerequisite: for example, S3 owns roster projection while S4 supplies stable ownership
 * and S5 supplies its viewer grants. Extending
 * `FLEET_WIRE_METHODS` without extending this explicit ledger is a boot/test-visible contract
 * breach rather than an accidentally enabled capability.
 * @type {Readonly<Record<String, 'ready'|'awaiting-s2'|'awaiting-s3'|'awaiting-s4'|'awaiting-s5'|'awaiting-c1'>>}
 */
export const FLEET_S1_METHOD_POLICY = Object.freeze({
    defineAgent           : 'awaiting-s4',
    configureAgent        : 'awaiting-s4',
    setRepo               : 'awaiting-s4',
    setAvatar             : 'awaiting-s4',
    listAgents            : 'awaiting-s3',
    getAgent              : 'awaiting-s3',
    startAgent            : 'awaiting-s5',
    stopAgent             : 'awaiting-s5',
    restartAgent          : 'awaiting-s5',
    removeAgent           : 'awaiting-s5',
    fleetStatus           : 'awaiting-s3',
    fleetRuntimeStatus    : 'awaiting-s3',
    getBootIdentity       : 'ready',
    fleetActivity         : 'awaiting-s3',
    fleetHistory          : 'awaiting-s3',
    fleetMemories         : 'awaiting-s5',
    fleetRoster           : 'awaiting-s3',
    fleetMailboxMirror    : 'awaiting-s5',
    connectTenant         : 'awaiting-c1',
    listTenants           : 'awaiting-s4',
    composeOperatorMessage: 'awaiting-s4',
    markFleetCaughtUp     : 'awaiting-s4',
    resolveViewerIdentity : 'awaiting-s4',
    fleetWakeRoutes       : 'awaiting-s3'
});

/**
 * @summary The R3 verb-class ledger: every wire verb is `read-observe` or `lifecycle-write`, and
 * the split is enforced AT ADMISSION — before availability negotiation — so authority shape never
 * leaks feature topology to a caller the shape refuses. Read-observe verbs admit any
 * authenticated context (possession-proven identity may look). Lifecycle-write verbs additionally
 * require the forge-resolved admission subject (`ownerPrincipal`): possession admits the
 * transport, identity owns the records — a caller without a stable subject cannot mutate what
 * nothing stable would own. The grant families later hang their envelopes on exactly these
 * classes; this ledger is the seam they consume.
 *
 * Same contract discipline as the slice ledger above: extending `FLEET_WIRE_METHODS` without
 * classifying the verb here is a boot/test-visible breach, and an UNCLASSIFIED verb refuses
 * fail-closed rather than defaulting into either class.
 * @type {Readonly<Record<String, 'read-observe'|'lifecycle-write'>>}
 */
export const FLEET_METHOD_SCOPE_CLASSES = Object.freeze({
    defineAgent           : 'lifecycle-write',
    configureAgent        : 'lifecycle-write',
    setRepo               : 'lifecycle-write',
    setAvatar             : 'lifecycle-write',
    listAgents            : 'read-observe',
    getAgent              : 'read-observe',
    startAgent            : 'lifecycle-write',
    stopAgent             : 'lifecycle-write',
    restartAgent          : 'lifecycle-write',
    removeAgent           : 'lifecycle-write',
    fleetStatus           : 'read-observe',
    fleetRuntimeStatus    : 'read-observe',
    getBootIdentity       : 'read-observe',
    fleetActivity         : 'read-observe',
    fleetHistory          : 'read-observe',
    fleetMemories         : 'read-observe',
    fleetRoster           : 'read-observe',
    fleetMailboxMirror    : 'read-observe',
    connectTenant         : 'lifecycle-write',
    listTenants           : 'read-observe',
    composeOperatorMessage: 'lifecycle-write',
    markFleetCaughtUp     : 'lifecycle-write',
    resolveViewerIdentity : 'read-observe',
    fleetWakeRoutes       : 'read-observe'
});

const SLICE_LABELS = Object.freeze({
    'awaiting-s2': 'S2 admission policy',
    'awaiting-s3': 'S3 viewer projection',
    'awaiting-s4': 'S4 stable ownership',
    'awaiting-s5': 'S5 Fleet grants',
    'awaiting-c1': 'C1 connection broker'
});

/**
 * @summary The exact Fleet wire operations the composed service currently serves. The S2
 * admission subject opened the first one: `getBootIdentity`, a read-observe advisory whose bridge
 * answer degrades honestly when no boot-identity source is wired.
 * @type {ReadonlyArray<String>}
 */
export const FLEET_S1_READY_METHODS = Object.freeze(
    Object.entries(FLEET_S1_METHOD_POLICY)
        .filter(([, disposition]) => disposition === 'ready')
        .map(([method]) => method)
);

/**
 * @summary Negotiate one composed-service request: protocol, then the R3 verb-class boundary AT
 * ADMISSION, then the S1 availability boundary. Unknown verbs retain the canonical
 * `unsupported-method` state; a KNOWN verb missing from the scope-class ledger refuses fail-closed
 * (never a defaulted class); a `lifecycle-write` verb without a forge-resolved admission subject
 * refuses BEFORE availability is negotiated — authority shape precedes feature topology, so an
 * unauthorized caller learns nothing about slice ownership; known future-slice verbs then return
 * a versioned `degraded` state naming their semantic owner and never touch `FleetControlBridge`.
 * @param {Object} request Versioned Fleet wire request (`{method, params, protocol}`).
 * @param {Object} [bridge] Injectable bridge used by the canonical dispatcher.
 * @param {Object|null} [requestContext] Frozen admission context (`createFleetRequestContext`
 *     shape); its `ownerPrincipal` is the derived subject the lifecycle-write class requires.
 * @returns {Promise<Object>} Versioned finite-state response, refusal, or named-slice degradation.
 */
export async function dispatchFleetS1Request(request={}, bridge, requestContext=null) {
    const
        selection   = selectFleetWireContract(request?.protocol),
        known       = Object.hasOwn(FLEET_S1_METHOD_POLICY, request?.method),
        disposition = known ? FLEET_S1_METHOD_POLICY[request.method] : null;

    if (!selection.ok) {
        return createFleetWireResponse(selection.state, selection)
    }

    if (known) {
        const scopeClass = FLEET_METHOD_SCOPE_CLASSES[request.method];

        if (scopeClass !== 'read-observe' && scopeClass !== 'lifecycle-write') {
            return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error   : `fleet: '${request.method}' carries no scope class — the verb-class ledger must classify every wire verb`,
                protocol: selection.protocol
            })
        }

        if (scopeClass === 'lifecycle-write' && !requestContext?.ownerPrincipal) {
            return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.refused, {
                error   : `fleet: '${request.method}' is a lifecycle-write verb and requires a forge-resolved admission subject — possession admits the transport, identity owns the records`,
                protocol: selection.protocol
            })
        }
    }

    if (disposition?.startsWith('awaiting-')) {
        return createFleetWireResponse(FLEET_WIRE_RESPONSE_STATES.degraded, {
            degraded: disposition,
            error   : `fleet: '${request.method}' awaits ${SLICE_LABELS[disposition]}`,
            protocol: selection.protocol
        })
    }

    return dispatchFleetRequest(request, bridge)
}
