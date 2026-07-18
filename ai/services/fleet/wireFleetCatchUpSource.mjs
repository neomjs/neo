import FleetControlBridge         from './FleetControlBridge.mjs';
import {createFleetCatchUpSource} from './fleetCatchUpSource.mjs';

/**
 * @module ai/services/fleet/wireFleetCatchUpSource
 * @summary Installs the viewer-bound catch-up source onto the Fleet control bridge at the
 * authenticated server entry. The operation functions and viewer resolver are injected at that
 * use site; this wiring imports neither MCP tool service nor request context.
 */

/**
 * @summary Wire one process-lifetime catch-up source.
 * @param {Object} options
 * @param {Function} options.exploreMemoryHistory
 * @param {Function} options.explorePullRequestHistory
 * @param {Function} options.resolveViewerIdentity
 * @param {Function} [options.now]
 * @param {Object} [options.bridge=FleetControlBridge]
 * @param {Function} [options.createSource=createFleetCatchUpSource]
 * @returns {Object|null}
 */
export function wireFleetCatchUpSource({
    exploreMemoryHistory,
    explorePullRequestHistory,
    resolveViewerIdentity,
    now,
    bridge       = FleetControlBridge,
    createSource = createFleetCatchUpSource
} = {}) {
    if (typeof exploreMemoryHistory !== 'function' || typeof explorePullRequestHistory !== 'function' ||
        typeof resolveViewerIdentity !== 'function') {
        return null
    }

    bridge.historySource = createSource({
        exploreMemoryHistory,
        explorePullRequestHistory,
        resolveViewerIdentity,
        ...(now ? {now} : {})
    });

    return bridge.historySource
}

export default wireFleetCatchUpSource;
