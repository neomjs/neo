import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages component-related operations for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting and modifying components within the connected
 * Neo.mjs application. It delegates the actual transport to `ConnectionService`.
 *
 * @class Neo.ai.mcp.server.neural-link.services.ComponentService
 * @extends Neo.core.Base
 * @singleton
 */
class ComponentService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.ComponentService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.ComponentService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Retrieves a property from a component by its ID.
     * @param {Object} opts The options object.
     * @param {String} opts.id The component ID.
     * @param {String} opts.property The property name to retrieve.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<any>} The value of the property.
     */
    async getComponentProperty({id, property, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_component_property', {id, property});
    }

    /**
     * Retrieves the full component tree of the application.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The component tree structure.
     */
    async getComponentTree({depth, rootId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_component_tree', {depth, rootId});
    }

    /**
     * Retrieves the VDOM tree of a component.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The VDOM tree structure.
     */
    async getVdomTree({depth, rootId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_vdom_tree', {depth, rootId});
    }

    /**
     * Retrieves the VNode tree of a component.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The VNode tree structure.
     */
    async getVnodeTree({depth, rootId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_vnode_tree', {depth, rootId});
    }

    /**
     * Sets a property on a component by its ID.
     * @param {Object} opts            The options object.
     * @param {String} opts.id         The component ID.
     * @param {String} opts.property   The property name to set.
     * @param {*}      opts.value      The value to set.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<void>}
     */
    async setComponentProperty({id, property, value, sessionId}) {
        return await ConnectionService.call(sessionId, 'set_component_property', {id, property, value});
    }
}

export default Neo.setupClass(ComponentService);
