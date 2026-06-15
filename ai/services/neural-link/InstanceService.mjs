import Base              from '../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages generic instance inspection and manipulation for the Neural Link MCP Server.
 *
 * This service provides tools for reading and writing properties of any registered Neo instance
 * (e.g. Components, Stores, Managers, Controllers).
 *
 * @class Neo.ai.services.neural-link.InstanceService
 * @extends Neo.core.Base
 * @singleton
 */
class InstanceService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.InstanceService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.InstanceService',
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
     * Finds instances matching a selector.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {Object} opts.selector
     * @param {String[]} [opts.returnProperties]
     * @returns {Promise<Object>}
     */
    async findInstances({sessionId, selector, returnProperties}) {
        return await ConnectionService.call(sessionId, 'find_instances', {
            selector,
            returnProperties
        })
    }

    /**
     * Retrieves properties from a specific instance by its ID.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.id
     * @param {String[]} opts.properties
     * @returns {Promise<Object>}
     */
    async getInstanceProperties({sessionId, id, properties}) {
        return await ConnectionService.call(sessionId, 'get_instance_properties', {
            id,
            properties
        })
    }

    /**
     * Sets properties on a specific instance by its ID.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.id
     * @param {Object} opts.properties
     * @returns {Promise<Object>}
     */
    async setInstanceProperties({sessionId, id, properties}) {
        return await ConnectionService.call(sessionId, 'set_instance_properties', {
            id,
            properties
        })
    }

    /**
     * Reverts the requester's most-recent committed Neural Link mutation transaction — forwards the `undo` tool to
     * the connected App Worker, which pops the requester's last committed transaction and re-dispatches its captured
     * reverse-op(s) under live enforcement. See {@link Neo.ai.client.InstanceService#undo}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @returns {Promise<Object>}
     */
    async undo({sessionId}) {
        return await ConnectionService.call(sessionId, 'undo', {})
    }

    /**
     * Re-applies the requester's most-recently undone Neural Link mutation transaction — forwards the `redo` tool to
     * the connected App Worker, which pops the requester's redo branch and re-dispatches its captured forward-op(s)
     * under live enforcement. See {@link Neo.ai.client.InstanceService#redo}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @returns {Promise<Object>}
     */
    async redo({sessionId}) {
        return await ConnectionService.call(sessionId, 'redo', {})
    }

    /**
     * Calls a method on a specific instance.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.id
     * @param {String} opts.method
     * @param {Array}  [opts.args]
     * @returns {Promise<Object>}
     */
    async callMethod({sessionId, id, method, args}) {
        return await ConnectionService.call(sessionId, 'call_method', {
            id,
            method,
            args
        })
    }
}

export default Neo.setupClass(InstanceService);
