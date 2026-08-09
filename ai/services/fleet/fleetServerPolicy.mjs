import {dispatchFleetRequest} from './dispatchFleetRequest.mjs';
import {FLEET_WIRE_METHODS}   from './fleetWireMethods.mjs';

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
    getBootIdentity       : 'awaiting-s2',
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

const SLICE_LABELS = Object.freeze({
    'awaiting-s2': 'S2 admission policy',
    'awaiting-s3': 'S3 viewer projection',
    'awaiting-s4': 'S4 stable ownership',
    'awaiting-s5': 'S5 Fleet grants',
    'awaiting-c1': 'C1 connection broker'
});

/**
 * @summary The exact Fleet wire operations S1 exposes; empty until data authorization exists.
 * @type {ReadonlyArray<String>}
 */
export const FLEET_S1_READY_METHODS = Object.freeze(
    Object.entries(FLEET_S1_METHOD_POLICY)
        .filter(([, disposition]) => disposition === 'ready')
        .map(([method]) => method)
);

/**
 * @summary Dispatch one composed-service request through the S1 availability boundary.
 * Unknown verbs retain the canonical wire refusal; known future-slice verbs return a top-level
 * degradation envelope naming their owning semantic slice and never touch `FleetControlBridge`.
 * @param {Object} request Fleet wire request (`{method, params}`).
 * @param {Object} [bridge] Injectable bridge used by the canonical dispatcher.
 * @returns {Promise<Object>} Canonical success/failure envelope or named-slice degradation.
 */
export async function dispatchFleetS1Request(request={}, bridge) {
    const disposition = Object.hasOwn(FLEET_S1_METHOD_POLICY, request?.method)
        ? FLEET_S1_METHOD_POLICY[request.method]
        : null;

    if (disposition?.startsWith('awaiting-')) {
        return {
            ok      : false,
            degraded: disposition,
            error   : `fleet: '${request.method}' awaits ${SLICE_LABELS[disposition]}`
        }
    }

    return dispatchFleetRequest(request, bridge)
}
