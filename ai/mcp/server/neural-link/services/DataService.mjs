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
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ConnectionService.ready();
    }

    /**
     * Inspects a specific state provider.
     * @param {Object} opts The options object.
     * @param {String} opts.providerId The ID of the provider to inspect.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The state data.
     */
    async inspectStateProvider({providerId, sessionId}) {
        return await ConnectionService.call(sessionId, 'inspect_state_provider', {providerId});
    }

    /**
     * Inspects a specific data store.
     * @param {Object} opts The options object.
     * @param {String} opts.storeId The ID of the store to inspect.
     * @param {Number} [opts.limit=50] Optional limit.
     * @param {Number} [opts.offset=0] Optional offset.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} Store details (count, filters, sorters, items sample).
     */
    async inspectStore({limit=50, offset=0, storeId, sessionId}) {
        return await ConnectionService.call(sessionId, 'inspect_store', {limit, offset, storeId});
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

    /**
     * Retrieves a specific record.
     * @param {Object} opts The options object.
     * @param {String} opts.recordId The ID of the record.
     * @param {String} [opts.storeId] Optional Store ID.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>} The record data.
     */
    async getRecord({recordId, storeId, sessionId}) {
        return await ConnectionService.call(sessionId, 'get_record', {recordId, storeId});
    }

    /**
     * Modifies the data of a specific state provider.
     * @param {Object} opts The options object.
     * @param {String} opts.providerId The ID of the provider to modify.
     * @param {Object} opts.data The data object to merge into the provider.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<void>}
     */
    async modifyStateProvider({data, providerId, sessionId}) {
        return await ConnectionService.call(sessionId, 'modify_state_provider', {data, providerId});
    }
}

export default Neo.setupClass(DataService);
