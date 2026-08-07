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
 * @param {Function|null} [options.listActiveSubscriptionIdentities]
 * @param {Function|null} [options.resolveDeliveryLiveness]
 * @param {Function|null} [options.resolveTerminalDeliveryFailures]
 * @param {Function|null} [options.resolveSeatArming]
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
    listActiveSubscriptionIdentities = null,
    resolveDeliveryLiveness = null,
    resolveTerminalDeliveryFailures = null,
    resolveSeatArming = null,
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
        listActiveSubscriptionIdentities,
        resolveDeliveryLiveness,
        resolveTerminalDeliveryFailures,
        resolveSeatArming,
        readPresence,
        ...(wakeIdentityFor ? {wakeIdentityFor} : {}),
        ...(now ? {now} : {})
    });

    return bridge.wakeRoutesSource
}

export default wireFleetWakeRoutesSource;
