import Base              from '../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';
import RecorderService   from './RecorderService.mjs';

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
     * @summary Creates any JSON-addressable Neo instance through the Neural Link write surface.
     *
     * This is the general creation primitive beneath component-only creation: callers provide a `className`
     * or `ntype` plus a JSON config, optionally with `parentId` to attach the created component to a container.
     * Server-side validation keeps the MCP boundary data-only before dispatching to the App Worker.
     * @param {Object} opts
     * @param {String} [opts.className] The fully-qualified Neo class name.
     * @param {Object} [opts.config={}] JSON-safe instance config.
     * @param {String} [opts.ntype] The Neo ntype shortcut.
     * @param {String} [opts.parentId] Optional target container id.
     * @param {String} [opts.sessionId] The target session ID.
     * @returns {Promise<Object>}
     */
    async createInstance({className, config={}, ntype, parentId, sessionId}) {
        const payload = this.buildCreateInstancePayload({className, config, ntype, parentId});

        return await ConnectionService.call(sessionId, 'create_instance', payload)
    }

    /**
     * @summary Builds the data-only App Worker payload for `create_instance`.
     * @param {Object} params
     * @param {String} [params.className]
     * @param {Object} [params.config={}]
     * @param {String} [params.ntype]
     * @param {String} [params.parentId]
     * @returns {Object}
     * @protected
     */
    buildCreateInstancePayload({className, config={}, ntype, parentId}) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw new Error('create_instance: `config` must be an instance configuration object.')
        }

        this.rejectFunctionBearingConfig(config);

        this.rejectModuleBearingConfig(config);

        const
            resolvedClassName = className ?? config.className,
            resolvedNtype     = ntype     ?? config.ntype;

        if (className !== undefined && typeof className !== 'string') {
            throw new Error('create_instance: `className` must be a string.')
        }

        if (ntype !== undefined && typeof ntype !== 'string') {
            throw new Error('create_instance: `ntype` must be a string.')
        }

        if (className && config.className && className !== config.className) {
            throw new Error('create_instance: top-level `className` conflicts with `config.className`.')
        }

        if (ntype && config.ntype && ntype !== config.ntype) {
            throw new Error('create_instance: top-level `ntype` conflicts with `config.ntype`.')
        }

        if (resolvedClassName && resolvedNtype) {
            throw new Error('create_instance: provide exactly one of `className` or `ntype`.')
        }

        if (!resolvedClassName && !resolvedNtype) {
            throw new Error('create_instance: provide `className` or `ntype` to instantiate.')
        }

        return {
            className: resolvedClassName,
            config,
            ntype    : resolvedNtype,
            parentId
        }
    }

    /**
     * @summary Rejects function-bearing config values at the MCP boundary.
     * @param {*} value
     * @param {String} [path='config']
     * @protected
     */
    rejectFunctionBearingConfig(value, path='config') {
        if (typeof value === 'function') {
            throw new Error(`create_instance: function-bearing config is not supported at ${path}; pass a registered handler id string instead.`)
        }

        if (!value || typeof value !== 'object') {
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => this.rejectFunctionBearingConfig(item, `${path}[${index}]`));
            return
        }

        Object.entries(value).forEach(([key, item]) => {
            this.rejectFunctionBearingConfig(item, `${path}.${key}`)
        })
    }

    /**
     * @summary Recursively rejects `module` class-reference keys at any depth in the config.
     *
     * `module` is a live class reference that cannot cross the Neural Link wire; a nested
     * `{items: [{module: 'Neo.button.Base'}]}` must be rejected at the boundary, not reach
     * an internal `Container.createItem` TypeError. Mirrors {@link rejectFunctionBearingConfig}'s
     * recursive shape.
     * @param {*} value
     * @param {String} [path='config']
     * @protected
     */
    rejectModuleBearingConfig(value, path='config') {
        if (!value || typeof value !== 'object') {
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => this.rejectModuleBearingConfig(item, `${path}[${index}]`));
            return
        }

        if (Object.hasOwn(value, 'module')) {
            throw new Error(`create_instance: \`module\` is a class reference and cannot cross the Neural Link wire; declare \`ntype\` or \`className\` instead (found at ${path}.module).`)
        }

        Object.entries(value).forEach(([key, item]) => {
            this.rejectModuleBearingConfig(item, `${path}.${key}`)
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
     * Archives one committed Neural Link transaction for later replay after the App Worker session disconnects.
     * The App Worker returns the writer-scoped transaction snapshot; the Brain side persists it in the Memory Core
     * archive so replay does not depend on the live heap.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.txId
     * @param {String} [opts.name]
     * @returns {Promise<Object>}
     */
    async saveTransaction({sessionId, txId, name}) {
        const appSessionId = sessionId ?? ConnectionService.getDefaultSessionId();
        const snapshot     = await ConnectionService.call(sessionId, 'save_transaction', {txId});

        if (!snapshot?.saved) {
            return snapshot
        }

        return await RecorderService.saveTransactionArchive({
            appSessionId,
            name,
            transaction : snapshot.transaction
        })
    }

    /**
     * Replays an archived transaction's forward ops into the target App Worker session as a new undoable transaction.
     * The archived ops are passed back through the standard App Worker dispatch path, so write locks, target
     * resolution, and per-writer transaction capture remain authoritative.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @param {String} opts.archiveId
     * @returns {Promise<Object>}
     */
    async replayTransaction({sessionId, archiveId}) {
        const archive = await RecorderService.getTransactionArchive({archiveId});

        // UNREACHABLE IS NOT ABSENT. Both used to answer `archive-not-found`, which told the caller a
        // durable archive was gone whenever the store was merely out of reach — and "gone" is the one
        // answer that invites them to stop looking for it.
        if (archive?.status === 'unavailable') {
            return {replayed: false, reason: archive.reason}
        }

        if (archive?.status !== 'found') {
            return {replayed: false, reason: 'archive-not-found'}
        }

        const result = await ConnectionService.call(sessionId, 'replay_transaction', {
            archiveId,
            ops               : archive.ops,
            sourceCommittedAt : archive.committedAt,
            sourceOriginWriter: archive.originWriter,
            sourceTxId        : archive.sourceTxId
        });

        if (!result?.replayed) {
            return result
        }

        // THE MARK IS REPORTED, NOT ASSUMED. `replayed` stays true because the ops really were replayed —
        // inverting it would deny work the App Worker actually did. What was missing is that the
        // BOOKKEEPING could fail silently, leaving a replay that happened and a count that never moved,
        // with nothing in the answer to say so.
        const mark = await RecorderService.recordTransactionReplay({archiveId});

        return mark?.updated === true
            ? {...result, replayMarked: true, replayCount: mark.replayCount}
            : {...result, replayMarked: false, replayMarkReason: mark?.reason ?? `archive-mark-${mark?.status ?? 'failed'}`}
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
     * Aborts the requester's open named transaction — forwards the `abort_transaction` tool to the connected App
     * Worker, discarding the open batch without committing. See {@link Neo.ai.client.InstanceService#abortTransaction}.
     * @param {Object} opts
     * @param {String} opts.sessionId
     * @returns {Promise<Object>}
     */
    async abortTransaction({sessionId}) {
        return await ConnectionService.call(sessionId, 'abort_transaction', {})
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
