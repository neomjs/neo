import FleetControlBridge            from './FleetControlBridge.mjs';
import {createFleetWakeRoutesSource} from './fleetWakeRoutesSource.mjs';

/**
 * @module ai/services/fleet/wireFleetWakeRoutesSource
 * @summary Installs the decomposed wake-routes source onto the Fleet control bridge at the
 * authenticated server entry. Every read path is injected at that use site; this wiring imports
 * neither MCP tool service nor request context, and a missing required collaborator leaves the
 * verb honestly unwired instead of half-alive.
 */

/**
 * @summary Wire one process-lifetime wake-routes source.
 * @param {Object} options
 * @param {Function} options.listAgents
 * @param {Function} options.resolveViewerIdentity
 * @param {Function|null} [options.listActiveSubscriptionObservations]
 * @param {Function|null} [options.resolveDeliveryLiveness]
 * @param {Function|null} [options.resolveTerminalDeliveryFailures]
 * @param {Function|null} [options.resolveSeatArming] Explicit resolver override — wins over the
 *     source's manifest-path composition; the FleetManager-level test seam.
 * @param {String|null} [options.wakeReceiverManifestPath] Absolute path of the receiver's
 *     published 0600 route manifest, forwarded verbatim — the path→reader composition lives in
 *     `createFleetWakeRoutesSource`, the Neo-free site the spec exercises directly.
 * @param {Function|null} [options.readPresence]
 * @param {Function} [options.wakeIdentityFor]
 * @param {Function} [options.now]
 * @param {Object} [options.bridge=FleetControlBridge]
 * @param {Function} [options.createSource=createFleetWakeRoutesSource]
 * @returns {Object|null}
 */
export function wireFleetWakeRoutesSource({
    listAgents,
    resolveViewerIdentity,
    listActiveSubscriptionObservations = null,
    resolveDeliveryLiveness = null,
    resolveTerminalDeliveryFailures = null,
    resolveSeatArming = null,
    wakeReceiverManifestPath = null,
    readPresence = null,
    wakeIdentityFor,
    now,
    bridge       = FleetControlBridge,
    createSource = createFleetWakeRoutesSource
} = {}) {
    if (typeof listAgents !== 'function' || typeof resolveViewerIdentity !== 'function') {
        return null
    }

    bridge.wakeRoutesSource = createSource({
        listAgents,
        resolveViewerIdentity,
        listActiveSubscriptionObservations,
        resolveDeliveryLiveness,
        resolveTerminalDeliveryFailures,
        resolveSeatArming,
        wakeReceiverManifestPath,
        readPresence,
        ...(wakeIdentityFor ? {wakeIdentityFor} : {}),
        ...(now ? {now} : {})
    });

    return bridge.wakeRoutesSource
}

export default wireFleetWakeRoutesSource;
