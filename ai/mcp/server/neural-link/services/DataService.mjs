import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';

/**
 * @summary Manages data-related operations for the Neural Link MCP Server.
 *
 * This service provides tools for inspecting and modifying data stores and state providers
 * within the connected Neo.mjs application.
 *
 * @class Neo.ai.mcp.server.neural-link.services.DataService
 * @extends Neo.core.Base
 * @singleton
 */
class DataService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.DataService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.DataService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Inspects a specific data store.
     * @param {Object} opts The options object.
     * @param {String} opts.storeId The ID of the store to inspect.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} Store details (count, filters, sorters, items sample).
     */
    async inspectStore({storeId, sessionId}) {
        return await ConnectionService.call(sessionId, 'inspect_store', {storeId});
    }

    /**
     * Lists all active data stores.
     * @param {Object} opts The options object.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object[]>} List of stores with basic metadata.
     */
    async listStores({sessionId}) {
        return await ConnectionService.call(sessionId, 'list_stores', {});
    }
}

export default Neo.setupClass(DataService);
