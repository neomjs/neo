import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages generic instance inspection and manipulation for the Neural Link MCP Server.
 *
 * This service provides tools for reading and writing properties of any registered Neo instance
 * (e.g. Components, Stores, Managers, Controllers).
 *
 * @class Neo.ai.mcp.server.neural-link.services.InstanceService
 * @extends Neo.core.Base
 * @singleton
 */
class InstanceService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.InstanceService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.InstanceService',
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
}

export default Neo.setupClass(InstanceService);
