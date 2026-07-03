import Base              from '../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages component-related operations for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting and modifying components within the connected
 * Neo.mjs application. It delegates the actual transport to `ConnectionService`.
 *
 * @class Neo.ai.services.neural-link.ComponentService
 * @extends Neo.core.Base
 * @singleton
 */
class ComponentService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.ComponentService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.ComponentService',
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

    /**
     * Creates a component inside a target container at runtime — a first-class, schema-validated,
     * `write-locked` alternative to the generic `admin`-tier `call_method(container.add(...))`.
     *
     * Validates the config server-side (fail-fast with a semantic message, no dispatch on bad input),
     * then delegates to the existing `call_method` dispatch — `container.add(config)` — reusing the
     * worker-side handler (no new worker op). Pinning the method to `add` is exactly what keeps this
     * a CONSTRAINED write tool (`write-locked`) rather than the arbitrary-method `admin` `call_method`:
     * an agent can create components without being granted admin method-call access.
     * @param {Object} opts             The options object.
     * @param {String} opts.parentId    The target container's component ID.
     * @param {Object} opts.config      The component configuration; declare an `ntype` (e.g. `button`) or `className` (e.g. `Neo.button.Base`). A `module` is a class reference that cannot cross the wire — use `ntype`/`className`.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The result of adding the component to the container.
     */
    async createComponent({parentId, config, sessionId}) {
        if (!parentId) {
            throw new Error('create_component: `parentId` (the target container id) is required.');
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw new Error('create_component: `config` must be a component configuration object.');
        }
        // A `module` is a CLASS reference (the imported class, not its name-string). It cannot cross the
        // Neural Link wire (JSON carries no class), and a string/non-class `module` would crash the
        // worker-side `container.add` at `createItem` (`module.prototype.className` on a non-class). Fail
        // fast with a pointer to the wire-usable forms instead of surfacing that cryptic downstream error.
        if (config.module && typeof config.module !== 'function') {
            throw new Error('create_component: `module` must be a class reference, which cannot cross the Neural Link wire — declare `ntype` (e.g. "button") or `className` (e.g. "Neo.button.Base") instead.');
        }
        if (!config.module && !config.ntype && !config.className) {
            throw new Error('create_component: `config` must declare a `module`, `ntype`, or `className` to instantiate.');
        }

        // `undoKind` is a server-only capture marker (deliberately NOT in CallMethodRequest's schema): the app-side
        // write-path records create's inverse (destroy the new child) so the `undo` tool can revert a creation. The
        // generic `call_method` service forwards only {id, method, args}, so this marker cannot be injected by a
        // public caller — generic call_method stays non-undoable.
        return await ConnectionService.call(sessionId, 'call_method', {id: parentId, method: 'add', args: [config], undoKind: 'create_component'});
    }

    /**
     * Removes (destroys) a live component by its ID — a first-class, `write-locked` alternative to the
     * generic `admin`-tier `call_method(component.destroy(...))`. The symmetric counterpart to
     * {@link #createComponent}.
     *
     * Validates `componentId` server-side (fail-fast with a semantic message, no dispatch on bad input),
     * then delegates to the existing `call_method` dispatch — `component.destroy(true)` — reusing the
     * worker-side handler (no new worker op). The pinned `true` is `destroy`'s `updateParentVdom` flag:
     * it detaches the node from the parent's DOM so the component actually disappears from the live tree.
     * The framework default `destroy(false)` unregisters the instance but ORPHANS its DOM node, so the
     * flag is required for a correct removal. Pinning the method to `destroy` is exactly what keeps this
     * a CONSTRAINED write tool (`write-locked`) rather than the arbitrary-method `admin` `call_method`:
     * an agent can remove components without being granted admin method-call access.
     * @param {Object} opts             The options object.
     * @param {String} opts.componentId The id of the component to destroy.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The result of destroying the component.
     */
    async removeComponent({componentId, sessionId}) {
        if (!componentId) {
            throw new Error('remove_component: `componentId` (the component to destroy) is required.');
        }

        // `undoKind` is a server-only capture marker (NOT in CallMethodRequest's schema): the app-side write-path
        // snapshots the component's parent + index + config BEFORE destroy so the `undo` tool can re-insert it at its
        // original position. The generic call_method service forwards only {id, method, args}, so a public caller
        // cannot inject this marker — generic call_method stays non-undoable.
        return await ConnectionService.call(sessionId, 'call_method', {id: componentId, method: 'destroy', args: [true], undoKind: 'remove_component'});
    }
}

export default Neo.setupClass(ComponentService);
