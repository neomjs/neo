import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages application runtime and topology operations for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting the runtime structure (workers, windows) and
 * controlling the application lifecycle (reloading).
 *
 * @class Neo.ai.mcp.server.neural-link.services.RuntimeService
 * @extends Neo.core.Base
 * @singleton
 */
class RuntimeService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.RuntimeService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.RuntimeService',
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
     * Checks if a namespace exists.
     * @param {Object} opts            The options object.
     * @param {String} opts.namespace  The namespace to check.
     * @param {String} opts.sessionId  The target session ID.
     * @returns {Promise<Object>}
     */
    async checkNamespace({namespace, sessionId}) {
        return await ConnectionService.call(sessionId, 'check_namespace', {namespace})
    }

    /**
     * @param {Object} opts             The options object.
     * @param {String} opts.componentId The component ID.
     * @param {String} opts.sessionId   The target session ID.
     * @returns {Promise<Object>}
     */
    async getDomEventListeners({componentId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_dom_event_listeners', {componentId})
    }

    /**
     * @param {Object} opts           The options object.
     * @param {String} opts.sessionId The target session ID.
     * @returns {Promise<Object>}
     */
    async getDomEventSummary({sessionId}) {
        return await ConnectionService.call(sessionId, 'get_dom_event_summary', {})
    }

    /**
     * Retrieves the source code of a method.
     * @param {Object} opts            The options object.
     * @param {String} opts.className  The fully qualified class name.
     * @param {String} opts.methodName The name of the method.
     * @param {String} opts.sessionId  The target session ID.
     * @returns {Promise<Object>}
     */
    async getMethodSource({className, methodName, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_method_source', {className, methodName})
    }

    /**
     * Retrieves the loaded namespace tree.
     * @param {Object} opts            The options object.
     * @param {String} [opts.root]     The root namespace.
     * @param {String} opts.sessionId  The target session ID.
     * @returns {Promise<Object>}
     */
    async getNamespaceTree({root, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_namespace_tree', {root})
    }

    /**
     * Manages the global Neo.config.
     * @param {Object} opts            The options object.
     * @param {String} opts.action     'get' | 'set'
     * @param {Object} [opts.config]   The partial config object (for set action).
     * @param {String} opts.sessionId  The target session ID.
     * @param {String} [opts.windowId] Optional window ID (for get action).
     * @returns {Promise<Object>}
     */
    async manageNeoConfig({action, config, sessionId, windowId}) {
        if (action === 'get') {
            return await ConnectionService.call(sessionId, 'get_neo_config', {windowId});
        } else if (action === 'set') {
            return await ConnectionService.call(sessionId, 'set_neo_config', {config});
        }
        throw new Error(`Invalid action: ${action}`);
    }

    /**
     * Retrieves the navigation history stack.
     * @param {Object} opts            The options object.
     * @param {String} opts.sessionId  The target session ID.
     * @param {String} [opts.windowId] Optional window ID.
     * @returns {Promise<Object>}
     */
    async getRouteHistory({sessionId, windowId}) {
        return await ConnectionService.call(sessionId, 'get_route_history', {windowId})
    }

    /**
     * Retrieves the topology of all connected windows.
     * @returns {Promise<Object[]>} List of windows.
     */
    async getWindowTopology() {
        const windows = [];

        // Access ConnectionService data directly since it holds the source of truth
        for (const meta of ConnectionService.sessionData.values()) {
            if (meta.windows) {
                for (const win of meta.windows.values()) {
                    windows.push({
                        ...win,
                        appWorkerId: meta.appWorkerId, // Enrich with worker ID
                        sessionId: meta.sessionId
                    })
                }
            }
        }

        return windows
    }

    /**
     * Retrieves the topology of all connected App Workers.
     * @returns {Promise<Object[]>}
     */
    async getWorkerTopology() {
        return Array.from(ConnectionService.sessionData.values())
    }

    /**
     * Inspects a Neo.mjs class to retrieve its schema.
     * @param {Object} opts            The options object.
     * @param {String} opts.className  The fully qualified class name.
     * @param {String} [opts.detail]   The detail level ('standard' or 'compact').
     * @param {String} opts.sessionId  The target session ID.
     * @returns {Promise<Object>}
     */
    async inspectClass({className, detail, sessionId}) {
        return await ConnectionService.call(sessionId, 'inspect_class', {className, detail})
    }

    /**
     * Replaces a method implementation on a class prototype at runtime.
     * @param {Object} opts            The options object.
     * @param {String} opts.className  The fully qualified class name.
     * @param {String} opts.methodName The name of the method to patch.
     * @param {String} opts.sessionId  The target session ID.
     * @param {String} opts.source     The new function source code.
     * @returns {Promise<Object>}
     */
    async patchCode({className, methodName, sessionId, source}) {
        return await ConnectionService.call(sessionId, 'patch_code', {className, methodName, source})
    }

    /**
     * Reloads the application page.
     * @param {Object} opts            The options object.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<void>}
     */
    async reloadPage({sessionId}) {
        return await ConnectionService.call(sessionId, 'reload_page', {})
    }

    /**
     * Sets the application route (hash).
     * @param {Object} opts            The options object.
     * @param {String} opts.hash       The new hash value.
     * @param {String} opts.sessionId  The target session ID.
     * @param {String} [opts.windowId] Optional window ID.
     * @returns {Promise<Object>}
     */
    async setRoute({hash, sessionId, windowId}) {
        return await ConnectionService.call(sessionId, 'set_route', {hash, windowId})
    }
}

export default Neo.setupClass(RuntimeService);
