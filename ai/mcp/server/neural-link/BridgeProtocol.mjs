/**
 * @summary Protocol contract shared by the Neural Link Bridge and agent-side
 * ConnectionService.
 *
 * A running Bridge must emit this stamp during agent registration before the
 * agent-side service treats the connection as fresh. Older Bridge processes do
 * not know this frame, which lets local e2e runs fail loudly instead of binding
 * stale behavior from a long-lived `:8081` process.
 */
export const BRIDGE_INFO_TYPE = 'bridge_info';

/**
 * @summary Monotonic Bridge protocol version for agent-side freshness checks.
 * Bump this or `BRIDGE_PROTOCOL_FEATURES` whenever the Bridge's agent-facing
 * behavior changes in a way clients must not accept from stale long-lived processes.
 * @type {Number}
 */
export const BRIDGE_PROTOCOL_VERSION = 1;

/**
 * @summary Current protocol capabilities that stale local bridges must prove.
 * @type {String[]}
 */
export const BRIDGE_PROTOCOL_FEATURES = Object.freeze([
    'agent-message-sidecar'
]);

/**
 * @summary Error code used when a running Bridge is reachable but not fresh.
 * @type {String}
 */
export const STALE_BRIDGE_ERROR_CODE = 'NEURAL_LINK_STALE_BRIDGE';

/**
 * @summary Creates the Bridge freshness payload emitted to newly-connected agents.
 * @returns {Object}
 */
export function createBridgeInfoPayload() {
    return {
        type           : BRIDGE_INFO_TYPE,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        features       : [...BRIDGE_PROTOCOL_FEATURES]
    };
}

/**
 * @summary Returns true when a Bridge freshness payload matches the current protocol.
 * @param {Object} payload
 * @returns {Boolean}
 */
export function isBridgeInfoPayloadFresh(payload) {
    return payload?.type === BRIDGE_INFO_TYPE &&
           payload.protocolVersion === BRIDGE_PROTOCOL_VERSION &&
           Array.isArray(payload.features) &&
           BRIDGE_PROTOCOL_FEATURES.every(feature => payload.features.includes(feature))
}

/**
 * @summary Creates a typed stale-Bridge error for ConnectionService control flow.
 * @param {String} message
 * @returns {Error}
 */
export function createStaleBridgeError(message) {
    const error = new Error(message);
    error.code  = STALE_BRIDGE_ERROR_CODE;
    return error
}
