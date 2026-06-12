import Base              from '../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages interaction inspection for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting user interactions, such as Drag & Drop state,
 * focus, and selection.
 *
 * @class Neo.ai.services.neural-link.InteractionService
 * @extends Neo.core.Base
 * @singleton
 */
class InteractionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.InteractionService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.InteractionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ConnectionService.ready();
    }

    /**
     * Retrieves the state of the DragCoordinator.
     * @param {Object} opts
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async getDragState({sessionId}) {
        return await ConnectionService.call(sessionId, 'get_drag_state', {})
    }

    /**
     * Retrieves the recent drag-lifecycle traces (SortZone ring buffer).
     * @param {Object}  opts
     * @param {Boolean} [opts.clear]
     * @param {String}  [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async getDragTrace({clear, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_drag_trace', {clear})
    }

    /**
     * Samples component client rects over a time window (motion trace).
     * @param {Object}   opts
     * @param {String[]} opts.componentIds
     * @param {Number}   [opts.durationMs]
     * @param {Number}   [opts.intervalMs]
     * @param {String}   [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async observeMotion({componentIds, durationMs, intervalMs, sessionId}) {
        return await ConnectionService.call(sessionId, 'observe_motion', {componentIds, durationMs, intervalMs})
    }

    /**
     * Diffs a container's items / vdom / DOM child surfaces (duplication detector).
     * @param {Object} opts
     * @param {String} opts.componentId
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async verifyComponentConsistency({componentId, sessionId}) {
        return await ConnectionService.call(sessionId, 'verify_component_consistency', {componentId})
    }

    /**
     * Highlights a component visually for debugging purposes.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.componentId
     * @param {Object} [opts.options]
     * @returns {Promise<void>}
     */
    async highlightComponent({sessionId, componentId, options}) {
        return await ConnectionService.call(sessionId, 'highlight_component', {
            componentId,
            options
        })
    }

    /**
     * Simulates a native DOM event sequence.
     * @param {Object} opts
     * @param {Object[]} opts.events
     * @param {String} opts.sessionId
     * @returns {Promise<Boolean>}
     */
    async simulateEvent({events, sessionId}) {
        return await ConnectionService.call(sessionId, 'simulate_event', {
            events
        })
    }
}

export default Neo.setupClass(InteractionService);
