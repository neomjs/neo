import FleetControlBridge                 from './FleetControlBridge.mjs';
import {createFleetSessionMemoriesSource} from './fleetSessionMemoriesSource.mjs';

/**
 * @module ai/services/fleet/wireFleetSessionMemoriesSource
 * @summary Installs the viewer-bound session-memories (drill-in) source onto the Fleet control
 * bridge at the authenticated server entry. The operation function and viewer resolver are
 * injected at that use site; this wiring imports neither MCP tool service nor request context.
 */

/**
 * @summary Wire one process-lifetime session-memories source.
 * @param {Object} options
 * @param {Function} options.getSessionMemories
 * @param {Function} options.resolveViewerIdentity
 * @param {Function} [options.now]
 * @param {Object} [options.bridge=FleetControlBridge]
 * @param {Function} [options.createSource=createFleetSessionMemoriesSource]
 * @returns {Object|null}
 */
export function wireFleetSessionMemoriesSource({
    getSessionMemories,
    resolveViewerIdentity,
    now,
    bridge       = FleetControlBridge,
    createSource = createFleetSessionMemoriesSource
} = {}) {
    if (typeof getSessionMemories !== 'function' || typeof resolveViewerIdentity !== 'function') {
        return null
    }

    bridge.sessionMemoriesSource = createSource({
        getSessionMemories,
        resolveViewerIdentity,
        ...(now ? {now} : {})
    });

    return bridge.sessionMemoriesSource
}

export default wireFleetSessionMemoriesSource;
