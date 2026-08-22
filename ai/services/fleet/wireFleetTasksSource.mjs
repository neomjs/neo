import FleetControlBridge       from './FleetControlBridge.mjs';
import {createFleetTasksSource} from './fleetTasksSource.mjs';

/**
 * @module ai/services/fleet/wireFleetTasksSource
 * @summary Installs the viewer-bound tasks source onto the Fleet control bridge at the
 * authenticated server entry. The operation functions and viewer resolver are injected at that
 * use site; this wiring imports neither MCP tool service nor request context. The Knowledge Base
 * ingestion operation is optional — an entry that cannot reach it leaves it out, and the source
 * answers that axis as `unwired`.
 */

/**
 * @summary Wire one process-lifetime tasks source.
 * @param {Object} options
 * @param {Function} options.getDeploymentStateSnapshot
 * @param {Function} options.getRemPipelineState
 * @param {Function} [options.getIngestionProgress]
 * @param {Function} options.resolveViewerIdentity
 * @param {Function} [options.now]
 * @param {Object} [options.bridge=FleetControlBridge]
 * @param {Function} [options.createSource=createFleetTasksSource]
 * @returns {Object|null}
 */
export function wireFleetTasksSource({
    getDeploymentStateSnapshot,
    getRemPipelineState,
    getIngestionProgress,
    resolveViewerIdentity,
    now,
    bridge       = FleetControlBridge,
    createSource = createFleetTasksSource
} = {}) {
    if (typeof getDeploymentStateSnapshot !== 'function' || typeof getRemPipelineState !== 'function' ||
        typeof resolveViewerIdentity !== 'function') {
        return null
    }

    bridge.tasksSource = createSource({
        getDeploymentStateSnapshot,
        getRemPipelineState,
        resolveViewerIdentity,
        ...(typeof getIngestionProgress === 'function' ? {getIngestionProgress} : {}),
        ...(now ? {now} : {})
    });

    return bridge.tasksSource
}

export default wireFleetTasksSource;
