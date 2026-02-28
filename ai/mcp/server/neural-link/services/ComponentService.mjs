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
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ConnectionService.ready();
    }

    /**
     * Retrieves a property from a component by its ID.
     * @param {Object} opts             The options object.
     * @param {String} opts.id          The component ID.
     * @param {String} opts.property    The property name to retrieve.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<any>} The value of the property.
     */
    async getComponentProperty({id, property, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_component_property', {id, property});
    }

    /**
     * Retrieves the DOM rectangles for one or more components.
     * @param {Object} opts                The options object.
     * @param {String[]} opts.componentIds The list of component IDs.
     * @param {String} [opts.sessionId]    The target session ID.
     * @returns {Promise<Object>} The list of DOMRects.
     */
    async getDomRect({componentIds, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_dom_rect', {componentIds})
    }

    /**
     * Retrieves the computed styles for a component.
     * @param {Object} opts             The options object.
     * @param {String} opts.componentId The component ID.
     * @param {String[]} opts.variables The list of style properties/variables to retrieve.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The computed styles.
     */
    async getComputedStyles({componentId, variables, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_computed_styles', {componentId, variables});
    }

    /**
     * Retrieves the full component tree of the application.
     * @param {Object} opts             The options object.
     * @param {Number} [opts.depth]     The depth limit.
     * @param {Boolean} [opts.lean]     If true, returns optimized output.
     * @param {String} [opts.rootId]    Optional root component ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The component tree structure.
     */
    async getComponentTree({depth, lean, rootId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_component_tree', {depth, lean, rootId});
    }

    /**
     * Inspects the render tree (VDOM/VNode) of a component.
     * @param {Object} opts             The options object.
     * @param {Number} [opts.depth]     The depth limit.
     * @param {String} [opts.rootId]    Optional root component ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @param {String} opts.type        'vdom' | 'vnode' | 'both'
     * @returns {Promise<Object>} The requested tree structure.
     */
    async inspectComponentRenderTree({depth, rootId, sessionId, type}) {
        let method;

        switch (type) {
            case 'vdom':
                method = 'get_vdom_tree';
                break;
            case 'vnode':
                method = 'get_vnode_tree';
                break;
            case 'both':
                method = 'get_vdom_and_vnode';
                break;
            default:
                throw new Error(`Invalid type: ${type}`);
        }

        return await ConnectionService.call(sessionId, method, {depth, rootId});
    }

    /**
     * Queries components based on a selector object (e.g. {ntype: 'button', text: 'Save'}).
     * @param {Object} opts             The options object.
     * @param {Object} opts.selector    The selector object to match against.
     * @param {String} [opts.rootId]    Optional root component ID to limit the search scope.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The list of matching components.
     */
    async queryComponent({selector, rootId, returnProperties, sessionId}) {
        return await ConnectionService.call(sessionId, 'query_component', {selector, rootId, returnProperties});
    }

    /**
     * Queries VDOM nodes based on a selector object (e.g. {cls: 'my-class'}).
     * @param {Object} opts             The options object.
     * @param {Object} opts.selector    The selector object to match against.
     * @param {String} [opts.rootId]    Optional root component ID to limit the search scope.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The matching VDOM node.
     */
    async queryVdom({selector, rootId, sessionId}) {
        return await ConnectionService.call(sessionId, 'query_vdom', {selector, rootId});
    }

    /**
     * Sets a property on a component by its ID.
     * @param {Object} opts             The options object.
     * @param {String} opts.id          The component ID.
     * @param {String} opts.property    The property name to set.
     * @param {*}      opts.value       The value to set.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<void>}
     */
    async setComponentProperty({id, property, value, sessionId}) {
        return await ConnectionService.call(sessionId, 'set_component_property', {id, property, value});
    }
}

export default Neo.setupClass(ComponentService);
