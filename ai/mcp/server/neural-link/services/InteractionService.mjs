import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages interaction inspection for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting user interactions, such as Drag & Drop state,
 * focus, and selection.
 *
 * @class Neo.ai.mcp.server.neural-link.services.InteractionService
 * @extends Neo.core.Base
 * @singleton
 */
class InteractionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.InteractionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.InteractionService',
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
