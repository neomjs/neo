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
     * Retrieves a property from a specific instance by its ID.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.id
     * @param {String} opts.property
     * @returns {Promise<Object>}
     */
    async getInstanceProperty({sessionId, id, property}) {
        return await ConnectionService.call(sessionId, 'get_instance_property', {
            id,
            property
        })
    }

    /**
     * Sets a property on a specific instance by its ID.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.id
     * @param {String} opts.property
     * @param {*}      opts.value
     * @returns {Promise<Object>}
     */
    async setInstanceProperty({sessionId, id, property, value}) {
        return await ConnectionService.call(sessionId, 'set_instance_property', {
            id,
            property,
            value
        })
    }
}

export default Neo.setupClass(InstanceService);
