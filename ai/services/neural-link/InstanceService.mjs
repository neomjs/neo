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
     * Lists the requester's Neural Link transaction history — forwards the `list_transactions` tool to the
     * connected App Worker, which returns a read-only audit summary of the writer's undo stack + redo branch.
     * See {@link Neo.ai.client.InstanceService#listTransactions}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @returns {Promise<Object>}
     */
    async listTransactions({sessionId}) {
        return await ConnectionService.call(sessionId, 'list_transactions', {})
    }

    /**
     * Opens a named transaction for the requester — forwards the `begin_transaction` tool to the connected App Worker,
     * which captures subsequent mutations into one batch until `commit_transaction`. See
     * {@link Neo.ai.client.InstanceService#beginTransaction}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.name
     * @returns {Promise<Object>}
     */
    async beginTransaction({sessionId, name}) {
        return await ConnectionService.call(sessionId, 'begin_transaction', {name})
    }

    /**
     * Commits the requester's open named transaction — forwards the `commit_transaction` tool to the connected App
     * Worker, folding its accumulated mutations into a single undoable unit. See
     * {@link Neo.ai.client.InstanceService#commitTransaction}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @returns {Promise<Object>}
     */
    async commitTransaction({sessionId}) {
        return await ConnectionService.call(sessionId, 'commit_transaction', {})
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
