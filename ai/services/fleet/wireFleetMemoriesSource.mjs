import FleetControlBridge          from './FleetControlBridge.mjs';
import {createFleetMemoriesSource} from './fleetMemoriesSource.mjs';

/**
 * @module ai/services/fleet/wireFleetMemoriesSource
 * @summary Installs the viewer-bound memories source onto the Fleet control bridge at the
 * authenticated server entry. The operation function and viewer resolver are injected at that
 * use site; this wiring imports neither MCP tool service nor request context.
 */

/**
 * @summary Wire one process-lifetime memories source.
 * @param {Object} options
 * @param {Function} options.getAllSummaries
 * @param {Function} options.resolveViewerIdentity
 * @param {Function} [options.now]
 * @param {Object} [options.bridge=FleetControlBridge]
 * @param {Function} [options.createSource=createFleetMemoriesSource]
 * @returns {Object|null}
 */
export function wireFleetMemoriesSource({
    getAllSummaries,
    resolveViewerIdentity,
    now,
    bridge       = FleetControlBridge,
    createSource = createFleetMemoriesSource
} = {}) {
    if (typeof getAllSummaries !== 'function' || typeof resolveViewerIdentity !== 'function') {
        return null
    }

    bridge.memoriesSource = createSource({
        getAllSummaries,
        resolveViewerIdentity,
        ...(now ? {now} : {})
    });

    return bridge.memoriesSource
}

export default wireFleetMemoriesSource;
