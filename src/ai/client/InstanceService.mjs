import Service             from './Service.mjs';
import {admitWrite}        from '../admitWrite.mjs';
import {deriveSubtreePath} from '../deriveSubtreePath.mjs';

/**
 * @summary Registers the JSON-RPC method prefixes one InstanceService instance answers.
 * @param {Object} serviceMap Mutable Client prefix map.
 * @param {InstanceService} service Owning service instance.
 * @returns {Object} The same map after registration.
 */
export function registerInstanceServiceMethods(serviceMap, service) {
    return Object.assign(serviceMap, {
        call_method            : service,
        create_instance        : service,
        destroy_instance       : service,
        find_instances         : service,
        get_instance_properties: service,
        set_instance_properties: service,
        undo                   : service,
        redo                   : service,
        replay_transaction     : service,
        save_transaction       : service,
        abort_transaction      : service,
        begin_transaction      : service,
        commit_transaction     : service,
        list_transactions      : service
    })
}

/**
 * Handles generic instance-related Neural Link requests.
 * @class Neo.ai.client.InstanceService
 * @extends Neo.ai.client.Service
 */
class InstanceService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.InstanceService'
         * @protected
         */
        className: 'Neo.ai.client.InstanceService'
    }

    /**
     * Retrieves properties from a specific instance by its ID.
     * @param {Object} params
     * @param {String} params.id
     * @param {String[]} params.properties
     * @returns {Object}
     */
    getInstanceProperties({id, properties}) {
        const
            instance = Neo.get(id),
            result   = {};

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        properties.forEach(property => {
            result[property] = this.safeSerialize(Neo.ns(property, false, instance))
        });

        return {properties: result}
    }

    /**
     * Finds instances matching a selector.
     * @param {Object} params
     * @param {Object} params.selector
     * @param {String[]} [params.returnProperties]
     * @returns {Object}
     */
    findInstances({selector, returnProperties}) {
        const instances = Neo.manager.Instance.find(selector).map(instance => {
            if (Array.isArray(returnProperties) && returnProperties.length > 0) {
                const props = {};
                returnProperties.forEach(prop => {
                    props[prop] = this.safeSerialize(Neo.ns(prop, false, instance))
                });

                return {
                    className : instance.className,
                    id        : instance.id,
                    properties: props
                }
            }

            return instance.toJSON()
        });

        return {instances}
    }

    /**
     * @summary Creates any JSON-addressable Neo instance, optionally attaching it to a container.
     *
     * `create_instance` is the general Neural Link creation primitive: standalone data/model/controller
     * instances use `Neo.create` / `Neo.ntype`; component creation with `parentId` first passes the target
     * container through the existing subtree write guard, then attaches the created instance via `parent.add`.
     * The captured undo reverse dispatches through the internal `destroy_instance` replay target.
     * @param {Object} params
     * @param {String} [params.className]
     * @param {Object} [params.config={}]
     * @param {String} [params.ntype]
     * @param {String} [params.parentId]
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object} `{id, className, parentId?}`
     */
    createInstance({className, config={}, ntype, parentId}, context) {
        const
            createConfig = this.buildCreateInstanceConfig({className, config, ntype}),
            // Deep-snapshot the resolved config BEFORE instantiation: Neo.ntype / Neo.create → construct
            // consumes the `ntype` / `className` meta keys off createConfig, so the redo forward-op must
            // capture them from a pre-instantiation copy — else a redo re-dispatch has no class to
            // instantiate and fails closed ("provide `className` or `ntype`").
            reverseConfig = this.safeSerialize(createConfig),
            parent        = parentId ? Neo.getComponent(parentId) : null;

        let acquisition = null,
            instance,
            mutationStarted = false,
            rollbackComplete = false;

        if (parentId) {
            if (!parent) {
                throw new Error(`Parent component not found: ${parentId}`)
            }

            if (typeof parent.add !== 'function') {
                throw new Error(`Parent is not a container: ${parentId}`)
            }

            acquisition = this.assertWritable(context, parentId)
        }

        try {
            // Construction can register an instance before throwing, so failures from this point are
            // conservatively unknown unless the parent-add rollback below completes.
            mutationStarted = true;
            instance = createConfig.ntype ? Neo.ntype(createConfig) : Neo.create(createConfig);

            if (!instance) {
                throw new Error('create_instance: Neo.create returned no instance.')
            }

            let attachedInstance = instance;

            if (parent) {
                try {
                    attachedInstance = parent.add(instance)
                } catch (error) {
                    instance.destroy();
                    rollbackComplete = true;
                    throw error
                }
            }

            this.recordUndo(context, this.buildCreateInstanceReverse({
                config  : reverseConfig,
                context,
                instance: attachedInstance,
                parentId
            }));

            const result = {
                id       : attachedInstance.id,
                className: attachedInstance.className
            };

            if (parentId) {
                result.parentId = parentId
            }

            this.finishWritable(acquisition);

            return result
        } catch (error) {
            this.failWritable(
                acquisition,
                error,
                rollbackComplete ? 'rollback-complete' : mutationStarted ? 'unknown' : 'pre-mutation'
            );
            throw error
        }
    }

    /**
     * @summary Builds the normalized, data-only config used by `create_instance`.
     * @param {Object} params
     * @param {String} [params.className]
     * @param {Object} [params.config={}]
     * @param {String} [params.ntype]
     * @returns {Object}
     * @protected
     */
    buildCreateInstanceConfig({className, config={}, ntype}) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw new Error('create_instance: `config` must be an instance configuration object.')
        }

        this.rejectFunctionBearingCreateConfig(config);

        this.rejectModuleBearingCreateConfig(config);

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

        const createConfig = {...config};

        if (resolvedClassName) {
            delete createConfig.ntype;
            createConfig.className = resolvedClassName
        } else {
            delete createConfig.className;
            createConfig.ntype = resolvedNtype
        }

        return createConfig
    }

    /**
     * @summary Rejects function-bearing config values on the app-side Bridge boundary.
     * @param {*} value
     * @param {String} [path='config']
     * @protected
     */
    rejectFunctionBearingCreateConfig(value, path='config') {
        if (typeof value === 'function') {
            throw new Error(`create_instance: function-bearing config is not supported at ${path}; pass a registered handler id string instead.`)
        }

        if (!value || typeof value !== 'object') {
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => this.rejectFunctionBearingCreateConfig(item, `${path}[${index}]`));
            return
        }

        Object.entries(value).forEach(([key, item]) => {
            this.rejectFunctionBearingCreateConfig(item, `${path}.${key}`)
        })
    }

    /**
     * @summary Recursively rejects `module` class-reference keys at any depth on the app-side Bridge boundary.
     *
     * Mirrors {@link rejectFunctionBearingCreateConfig}: a nested `{items: [{module: 'Neo.button.Base'}]}`
     * must be rejected at the boundary, not reach an internal `Container.createItem` TypeError.
     * @param {*} value
     * @param {String} [path='config']
     * @protected
     */
    rejectModuleBearingCreateConfig(value, path='config') {
        if (!value || typeof value !== 'object') {
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => this.rejectModuleBearingCreateConfig(item, `${path}[${index}]`));
            return
        }

        if (Object.hasOwn(value, 'module')) {
            throw new Error(`create_instance: \`module\` is a class reference and cannot cross the Neural Link wire; declare \`ntype\` or \`className\` instead (found at ${path}.module).`)
        }

        Object.entries(value).forEach(([key, item]) => {
            this.rejectModuleBearingCreateConfig(item, `${path}.${key}`)
        })
    }

    /**
     * @summary Rejects non-data values in archived replay descriptors before they re-enter live dispatch.
     * @param {*} value
     * @param {String} [path='archive.ops']
     * @param {WeakSet} [seen]
     * @protected
     */
    rejectNonDataReplayValue(value, path='archive.ops', seen=new WeakSet()) {
        if (typeof value === 'function') {
            throw new Error(`replay_transaction: non-data function value is not supported at ${path}.`)
        }

        if (!value || typeof value !== 'object') {
            return
        }

        if (seen.has(value)) {
            throw new Error(`replay_transaction: cyclic data is not supported at ${path}.`)
        }

        seen.add(value);

        const prototype = Object.getPrototypeOf(value);

        if (!Array.isArray(value) && prototype && prototype !== Object.prototype) {
            throw new Error(`replay_transaction: class-backed data cannot be replayed at ${path}.`)
        }

        if (Object.hasOwn(value, 'module')) {
            throw new Error(`replay_transaction: \`module\` class references cannot be replayed at ${path}.module.`)
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => this.rejectNonDataReplayValue(item, `${path}[${index}]`, seen));
            return
        }

        Object.entries(value).forEach(([key, item]) => {
            this.rejectNonDataReplayValue(item, `${path}.${key}`, seen)
        })
    }

    /**
     * @summary Builds the reverse-op for a `create_instance` write.
     * @param {Object} params
     * @param {Object} params.config The normalized forward config.
     * @param {Object|null} params.context The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @param {Neo.core.Base} params.instance The created instance.
     * @param {String} [params.parentId] Optional parent container id.
     * @returns {Object|null}
     * @protected
     */
    buildCreateInstanceReverse({config, context, instance, parentId}) {
        if (context?.undoReplay || !context?.agentId || !context?.sessionId) {
            return null
        }

        const id = instance?.id;

        if (typeof id !== 'string' || id === '') {
            return null
        }

        const targetSubtreePath = parentId
            ? deriveSubtreePath(id, cid => Neo.getComponent(cid)?.parentId)
            : [`instance:${id}`];

        if (!targetSubtreePath) {
            return null
        }

        const forwardArgs = {config: this.safeSerialize(config)};

        if (parentId) {
            forwardArgs.parentId = parentId
        }

        return {
            sequenceId  : `${id}:${++this.undoSequence}`,
            originWriter: {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward     : {tool: 'create_instance', args: forwardArgs},
            reverse     : {tool: 'destroy_instance', args: {id}},
            label       : `create ${config.ntype || config.className || 'instance'}${parentId ? ` in ${parentId}` : ''}`
        }
    }

    /**
     * @summary Internal undo/redo replay target that destroys an instance created by `create_instance`.
     *
     * This method is deliberately not exposed as an MCP tool. It is reachable through the in-app dispatcher so the
     * transaction stack can replay a data-only reverse descriptor. Component instances still re-enter subtree
     * write-guard enforcement; standalone instances are destroyed directly because they have no component path.
     * @param {Object} params
     * @param {String} params.id
     * @param {Object|null} [context] The Bridge-stamped agent writer pair.
     * @returns {Object}
     */
    destroyInstance({id}, context) {
        if (!context?.undoReplay) {
            throw new Error('destroy_instance is an internal undo/redo replay target.')
        }

        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        if (Neo.getComponent(id)) {
            const acquisition = this.assertWritable(context, id);

            try {
                instance.destroy(true);
                this.finishWritable(acquisition)
            } catch (error) {
                this.failWritable(acquisition, error, 'unknown');
                throw error
            }
        } else {
            instance.destroy()
        }

        return {destroyed: true, id}
    }

    /**
     * Enforces the multi-writer write-lock before a write-class op mutates: composes the {@link Neo.ai.admitWrite}
     * decision with this heap's {@link Neo.ai.Client#writeGuard} and **throws** a deny (no mutation) when the write is
     * not admitted. On enforced admission it starts in-flight protection and returns the fenced acquisition receipt
     * to the operation owner. A bare / legacy frame (no `context`) is unguarded and returns `null`.
     * @param {Object|null} context The Bridge-stamped `{agentId, sessionId}` writer pair, or null/undefined (legacy).
     * @param {String} id The target component id whose subtree the write locks.
     * @returns {Object|null} Fenced acquisition receipt for an enforced write, otherwise `null`.
     * @protected
     */
    assertWritable(context, id) {
        const {admitted, reason, conflict, acquisition} = admitWrite({
            context,
            componentId: id,
            parentOf   : cid => Neo.getComponent(cid)?.parentId,
            writeGuard : this.client?.writeGuard
        });

        if (!admitted) {
            const heldBy = conflict ? ` (held by ${conflict.agentId} / ${conflict.sessionId})` : '';
            throw new Error(`Write denied for ${id}: ${reason}${heldBy}`)
        }

        if (acquisition) {
            const writeGuard = this.client?.writeGuard,
                  {began}    = writeGuard?.beginWrite(acquisition) || {began: false};

            if (!began) {
                if (acquisition.created) {
                    writeGuard?.releaseWrite(acquisition)
                }
                throw new Error(`Write denied for ${id}: stale-acquisition`)
            }
        }

        return acquisition
    }

    /**
     * @summary End a successful write operation while retaining its held lease.
     * @param {Object|null} acquisition Fenced receipt returned by {@link assertWritable}.
     * @protected
     */
    finishWritable(acquisition) {
        if (acquisition) {
            this.client?.writeGuard?.endWrite(acquisition)
        }
    }

    /**
     * @summary End a failed write with phase-aware release/retain semantics and an observable receipt.
     * @param {Object|null} acquisition Fenced receipt returned by {@link assertWritable}.
     * @param {Error} error The operation failure.
     * @param {'pre-mutation'|'rollback-complete'|'unknown'} mutationDisposition Proven mutation phase.
     * @protected
     */
    failWritable(acquisition, error, mutationDisposition) {
        if (acquisition) {
            this.client?.writeGuard?.endWrite(acquisition, {failed: true, mutationDisposition, error})
        }
    }

    /**
     * Sets properties on a specific instance by its ID.
     * @param {Object} params
     * @param {String} params.id
     * @param {Object} params.properties
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object}
     */
    setInstanceProperties({id, properties}, context) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        const acquisition = this.assertWritable(context, id);

        let mutationStarted = false;

        try {
            // Capture the reverse (the pre-set values) BEFORE mutating, so an agent can undo this write. Best-effort +
            // fail-closed: only an enforcement-granted *agent* write (a writer identity in `context`) is captured, and a
            // malformed / unserializable reverse is dropped, never thrown into the write path. A replay
            // (`context.undoReplay`, set by {@link #undo} / {@link #redo}) is NOT captured — re-applying a captured op
            // must never enqueue a new transaction.
            const undoOp = context?.undoReplay ? null : this.buildSetReverse({context, id, instance, properties});

            mutationStarted = true;
            instance.set(properties);

            this.recordUndo(context, undoOp);
            this.finishWritable(acquisition);

            return {success: true}
        } catch (error) {
            this.failWritable(acquisition, error, mutationStarted ? 'unknown' : 'pre-mutation');
            throw error
        }
    }

    /**
     * Builds the reverse-op for a `set_instance_properties` write — `set⁻¹ = set(oldValues)`, capturing the pre-set
     * values. Returns `null` for a legacy / unattributed write (no writer identity ⇒ no per-writer undo stack) or an
     * unresolvable target, so {@link #recordUndo} no-ops. The reverse is a re-dispatchable validated tool descriptor —
     * data-not-code, per the Neural Link capability boundary.
     * @param {Object} params
     * @param {Object|null} params.context  The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @param {String} params.id
     * @param {Neo.core.Base} params.instance
     * @param {Object} params.properties
     * @returns {Object|null} A reverse-record op, or `null` when the write is not capturable.
     * @protected
     */
    buildSetReverse({context, id, instance, properties}) {
        if (!context?.agentId || !context?.sessionId) {
            return null
        }

        const targetSubtreePath = deriveSubtreePath(id, cid => Neo.getComponent(cid)?.parentId);

        if (!targetSubtreePath) {
            return null
        }

        const oldValues = {};

        Object.keys(properties).forEach(key => {
            oldValues[key] = this.safeSerialize(Neo.ns(key, false, instance))
        });

        return {
            sequenceId  : `${id}:${++this.undoSequence}`,
            originWriter: {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward     : {tool: 'set_instance_properties', args: {id, properties}},
            reverse     : {tool: 'set_instance_properties', args: {id, properties: oldValues}},
            label       : `set ${Object.keys(properties).join(', ')} on ${id}`
        }
    }

    /**
     * Builds the reverse-op for a `create_component` write — `create⁻¹ = destroy(newId)`, capturing the id of the
     * just-added child. **Server-stamped only:** the inverse is recorded ONLY when `undoKind === 'create_component'`
     * (the server-side generic `call_method` strips any public-injected marker), the dispatch is the canonical
     * `add(config)` shape, a writer identity is present, and it is not an undo replay. Returns `null` otherwise so
     * {@link #recordUndo} no-ops — a generic `call_method` stays non-undoable. Data-not-code: the reverse is a
     * re-dispatchable validated tool descriptor (the app-side `destroy(true)` form `remove_component` maps to).
     * @param {Object} params
     * @param {Object|null} params.context  The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @param {String} params.id  The parent container id (the `add` target).
     * @param {String} params.method
     * @param {Array} params.args
     * @param {String} [params.undoKind]  The server-stamped capture marker.
     * @param {*} params.result  The `add` return — the created component instance.
     * @returns {Object|null} A reverse-record op, or `null` when the call is not a capturable create.
     * @protected
     */
    buildCreateReverse({context, id, method, args, undoKind, result}) {
        if (undoKind !== 'create_component' || context?.undoReplay) {
            return null
        }

        if (!context?.agentId || !context?.sessionId) {
            return null
        }

        // canonical create shape only — a marker on any other call_method shape is dropped (fail-closed)
        if (method !== 'add' || args.length !== 1 || !args[0] || typeof args[0] !== 'object') {
            return null
        }

        const newId = result?.id;

        if (typeof newId !== 'string' || newId === '') {
            return null
        }

        const targetSubtreePath = deriveSubtreePath(newId, cid => Neo.getComponent(cid)?.parentId);

        if (!targetSubtreePath) {
            return null
        }

        return {
            sequenceId  : `${newId}:${++this.undoSequence}`,
            originWriter: {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward     : {tool: 'create_component', args: {parentId: id, config: args[0]}},
            reverse     : {tool: 'call_method', args: {id: newId, method: 'destroy', args: [true]}},
            label       : `create ${args[0].ntype || args[0].className || 'component'} in ${id}`
        }
    }

    /**
     * Builds the reverse-op for a `remove_component` write — `remove⁻¹ = insert(index, config)` on the parent,
     * snapshotting the destroyed component's parent + tree index + a JSON-safe config BEFORE the destroy runs.
     * **Server-stamped only** (`undoKind === 'remove_component'`), canonical `destroy(true)` shape, writer identity
     * present, not an undo replay — else `null`, so {@link #recordUndo} no-ops (a generic `call_method` stays
     * non-undoable). Position-preserving: the reverse re-inserts at the original `index` (not an appending re-create),
     * so undo restores tree order. The config is a documented JSON-safe `toJSON` snapshot (serializable-config bound,
     * not full live-state fidelity); the data-not-code + payload-cap guards in {@link Neo.ai.TransactionService} bound it.
     * @param {Object} params
     * @param {Object|null} params.context  The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @param {String} params.id  The component id being destroyed.
     * @param {String} params.method
     * @param {Array} params.args
     * @param {String} [params.undoKind]  The server-stamped capture marker.
     * @param {Neo.component.Base} params.instance  The live component, read BEFORE destroy.
     * @returns {Object|null} A reverse-record op, or `null` when the call is not a capturable remove.
     * @protected
     */
    buildRemoveReverse({context, id, method, args, undoKind, instance}) {
        if (undoKind !== 'remove_component' || context?.undoReplay) {
            return null
        }

        if (!context?.agentId || !context?.sessionId) {
            return null
        }

        // canonical remove shape only — the server stamps destroy(true); any other shape is dropped (fail-closed)
        if (method !== 'destroy' || args.length !== 1 || args[0] !== true) {
            return null
        }

        const
            parentId = instance.parentId,
            parent   = parentId ? Neo.getComponent(parentId) : null;

        if (!parent || typeof parent.indexOf !== 'function') {
            return null // a parentless / unresolvable target cannot be re-inserted — fail-closed
        }

        const
            index  = parent.indexOf(id),
            config = this.safeSerialize(typeof instance.toJSON === 'function' ? instance.toJSON() : null);

        if (index < 0 || !config || typeof config !== 'object') {
            return null
        }

        const targetSubtreePath = deriveSubtreePath(parentId, cid => Neo.getComponent(cid)?.parentId);

        if (!targetSubtreePath) {
            return null
        }

        return {
            sequenceId  : `${id}:${++this.undoSequence}`,
            originWriter: {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward     : {tool: 'remove_component', args: {componentId: id}},
            reverse     : {tool: 'call_method', args: {id: parentId, method: 'insert', args: [index, config]}},
            label       : `remove ${id} from ${parentId}`
        }
    }

    /**
     * Reverts the requester's most-recent committed transaction — the `undo` Neural Link tool.
     *
     * Peeks the writer's last committed transaction (non-consuming, via {@link Neo.ai.TransactionService#stackOf}) and
     * re-dispatches each captured reverse-op through the **enforced** dispatch path
     * ({@link Neo.ai.Client#handleRequest}), so the revert re-enters {@link Neo.ai.admitWrite} as the **current**
     * caller with its `subtreePath` re-derived on the live tree (provenance ≠ enforcement identity). The transaction
     * is consumed ({@link Neo.ai.TransactionService#undo}, `committed → undone`) **only on full success**. Each
     * re-dispatch carries an `undoReplay` marker so the replayed writes are not themselves captured — undo never
     * enqueues a new undoable transaction (single-level; {@link #redo} re-applies the forwards symmetrically).
     *
     * Recoverable + fail-closed (never throws for an expected outcome): no writer identity, no stack authority,
     * nothing to undo, or a denied / unresolvable-target re-dispatch → `{undone: false, reason}` with the transaction
     * **preserved** (no-op). Capture is suppressed during replay and the App Worker is single-threaded, so the peeked
     * last-committed transaction is stable through the consume.
     * @param {Object} [params] No parameters — undo targets the requester's own stack.
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{undone: Boolean, txId?: String, reverted?: Number, reason?: String}`
     */
    async undo(params, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {undone: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {undone: false, reason: 'no-transaction-service'}
        }

        const
            stackId     = {agentId: context.agentId, sessionId: context.sessionId},
            {committed} = transactionService.stackOf({id: stackId});

        if (committed.length === 0) {
            return {undone: false, reason: 'nothing-to-undo'}
        }

        const
            tx         = committed[committed.length - 1],
            reverseOps = tx.ops.slice().reverse(), // last mutation undone first
            replayCtx  = {...context, undoReplay: true};

        // Re-dispatch each reverse as a validated tool, enforced as the CURRENT caller. Capture is suppressed
        // (replayCtx.undoReplay), so a successful replay enqueues no new undoable transaction.
        try {
            for (const op of reverseOps) {
                await this.client.handleRequest(op.reverse.tool, op.reverse.args, replayCtx)
            }
        } catch (error) {
            // Preserve-on-fail: a denied / unresolvable re-dispatch leaves the transaction committed (no-op).
            return {undone: false, reason: `undo-denied: ${error.message}`}
        }

        // All reverses applied — consume the transaction (committed → undone).
        const {txId} = transactionService.undo({id: stackId});

        return {undone: true, txId, reverted: reverseOps.length}
    }

    /**
     * Re-applies the requester's most-recently undone transaction — the `redo` Neural Link tool. The symmetric
     * counterpart to {@link #undo}: peeks the writer's redo branch (non-consuming, via
     * {@link Neo.ai.TransactionService#stackOf}) and re-dispatches each captured **forward**-op through the
     * **enforced** dispatch path ({@link Neo.ai.Client#handleRequest}) in capture order, so the re-apply re-enters
     * {@link Neo.ai.admitWrite} as the **current** caller with its `subtreePath` re-derived on the live tree. The
     * transaction is consumed ({@link Neo.ai.TransactionService#redo}, `undone → committed`) **only on full success**;
     * each re-dispatch carries the `undoReplay` marker so a replayed write is not itself captured (re-applying must
     * never enqueue a new transaction). The redo branch is cleared by any intervening committed mutation.
     *
     * Recoverable + fail-closed (never throws for an expected outcome): no writer identity, no stack authority,
     * nothing to redo, or a denied / unresolvable-target re-dispatch → `{redone: false, reason}` with the redo branch
     * **preserved** (no-op).
     *
     * Single-level Slice-2 boundary: a `create_component` re-apply mints a fresh id, so a subsequent undo of a redone
     * create can fail-closed on the now-stale captured reverse — id-stable cyclic create / remove redo is a later
     * slice; `set_instance_properties` redo is fully cyclic.
     * @param {Object} [params] No parameters — redo targets the requester's own stack.
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{redone: Boolean, txId?: String, reapplied?: Number, reason?: String}`
     */
    async redo(params, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {redone: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {redone: false, reason: 'no-transaction-service'}
        }

        const
            stackId = {agentId: context.agentId, sessionId: context.sessionId},
            {redo}  = transactionService.stackOf({id: stackId});

        if (redo.length === 0) {
            return {redone: false, reason: 'nothing-to-redo'}
        }

        const
            tx         = redo[redo.length - 1],
            forwardOps = tx.ops.slice(), // first mutation re-applied first (capture order)
            replayCtx  = {...context, undoReplay: true};

        // Re-dispatch each forward as a validated tool, enforced as the CURRENT caller. Capture is suppressed
        // (replayCtx.undoReplay), so a successful re-apply enqueues no new transaction.
        try {
            for (const op of forwardOps) {
                await this.client.handleRequest(op.forward.tool, op.forward.args, replayCtx)
            }
        } catch (error) {
            // Preserve-on-fail: a denied / unresolvable re-dispatch leaves the transaction on the redo branch (no-op).
            return {redone: false, reason: `redo-denied: ${error.message}`}
        }

        // All forwards applied — consume the redo entry (undone → committed).
        const {txId} = transactionService.redo({id: stackId});

        return {redone: true, txId, reapplied: forwardOps.length}
    }

    /**
     * Lists the requester's transaction history — the `list_transactions` Neural Link tool (read-only audit view).
     *
     * A non-consuming projection of the writer's undo state ({@link Neo.ai.TransactionService#stackOf}): the
     * `committed` stack (undoable, newest last) + the `redo` branch (redoable). Each entry is summarized to
     * `{txId, status, opCount, labels}` — the user-facing op labels, NOT the raw forward/reverse descriptors (those
     * are internal). Read-only: no enforcement, no replay, never mutates the stack. Returns empty lists (never
     * throws) for a legacy / no-writer-identity caller or an absent stack authority.
     * @param {Object} [params] No parameters — lists the requester's own stack.
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{committed: Object[], redo: Object[]}` — each entry `{txId, status, opCount, labels}`.
     */
    async listTransactions(params, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId || !transactionService) {
            return {committed: [], redo: []}
        }

        const
            {committed, redo} = transactionService.stackOf({id: {agentId: context.agentId, sessionId: context.sessionId}}),
            summarize         = tx => ({txId: tx.txId, status: tx.status, opCount: tx.ops.length, labels: tx.ops.map(op => op.label)});

        return {committed: committed.map(summarize), redo: redo.map(summarize)}
    }

    /**
     * Returns a data-only snapshot of one committed transaction for Brain-side archive persistence.
     * The archive writer may only save its own current writer stack: provenance is preserved on the snapshot, but
     * the lookup remains keyed to the Bridge-stamped writer pair.
     * @param {Object} params
     * @param {String} params.txId
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @returns {Promise<Object>} `{saved:Boolean, transaction?:Object, reason?:String}`
     */
    async saveTransaction({txId}={}, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {saved: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {saved: false, reason: 'no-transaction-service'}
        }

        if (typeof txId !== 'string' || txId === '') {
            return {saved: false, reason: 'tx-id-required'}
        }

        const {committed} = transactionService.stackOf({id: {agentId: context.agentId, sessionId: context.sessionId}}),
              transaction = committed.find(tx => tx.txId === txId);

        if (!transaction) {
            return {saved: false, reason: 'transaction-not-found'}
        }

        return {saved: true, transaction}
    }

    /**
     * Replays archived forward ops into the live heap as a fresh, undoable named transaction. Replay deliberately
     * does NOT set `undoReplay`: each forward op re-enters normal write enforcement as the current requester and is
     * captured into a new transaction, so the replay result can be undone normally. On a partial failure the replay
     * transaction record is aborted to avoid publishing an incoherent undo unit; any already-applied UI mutation stays
     * applied, matching the existing abort semantics.
     * @param {Object} params
     * @param {String} params.archiveId
     * @param {String} params.sourceTxId
     * @param {Number} [params.sourceCommittedAt]
     * @param {Object} [params.sourceOriginWriter]
     * @param {Object[]} params.ops
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair.
     * @returns {Promise<Object>} `{replayed:Boolean, txId?:String, ops?:Number, sourceArchiveId?:String, reason?:String}`
     */
    async replayTransaction({archiveId, sourceTxId, sourceCommittedAt, sourceOriginWriter, ops}={}, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {replayed: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {replayed: false, reason: 'no-transaction-service'}
        }

        if (typeof archiveId !== 'string' || archiveId === '') {
            return {replayed: false, reason: 'archive-id-required'}
        }

        if (!Array.isArray(ops) || ops.length === 0) {
            return {replayed: false, reason: 'invalid-archive-ops'}
        }

        for (const op of ops) {
            if (!op?.forward || typeof op.forward.tool !== 'string' || !op.forward.args || typeof op.forward.args !== 'object') {
                return {replayed: false, reason: 'invalid-archive-ops'}
            }

            try {
                this.rejectNonDataReplayValue(op.forward.args)
            } catch (error) {
                return {replayed: false, reason: error.message}
            }
        }

        const
            stackId = {agentId: context.agentId, sessionId: context.sessionId},
            txId    = `replay:${archiveId}`,
            opened  = transactionService.begin({
                id      : stackId,
                txId,
                metadata: {
                    replayOf: {
                        archiveId,
                        committedAt : sourceCommittedAt ?? null,
                        originWriter: sourceOriginWriter ?? null,
                        txId        : sourceTxId ?? null
                    },
                    replayWriter: stackId
                }
            });

        if (!opened.ok) {
            return {replayed: false, reason: opened.reason}
        }

        try {
            for (const op of ops) {
                await this.client.handleRequest(op.forward.tool, op.forward.args, context)
            }
        } catch (error) {
            transactionService.abort({id: stackId, txId});
            return {replayed: false, reason: `replay-denied: ${error.message}`, sourceArchiveId: archiveId}
        }

        const {ok, reason} = transactionService.commit({id: stackId, txId});

        return ok
            ? {replayed: true, txId, ops: ops.length, sourceArchiveId: archiveId}
            : {replayed: false, reason, sourceArchiveId: archiveId}
    }

    /**
     * Opens a named transaction for the requester — the `begin_transaction` Neural Link tool. While a batch is open,
     * the writer's subsequent mutations are captured INTO it (via {@link #recordUndo}) instead of auto-wrapped per-op,
     * so a later {@link #undo} reverts the whole intent (e.g. *"add a summary grid"* = several mutations) as one unit.
     * Close the batch with {@link #commitTransaction}.
     *
     * Fail-closed (never throws for an expected outcome): no writer identity, no stack authority, an empty `name`, or a
     * batch already open (commit it first — opening over it would silently drop the in-flight ops) → `{opened: false,
     * reason}`. The batch `txId` is `batch:<name>` — the agent-supplied name is its audit identity, namespaced apart
     * from an auto-wrap's `tx:<sequenceId>`.
     * @param {Object} params
     * @param {String} params.name A non-empty human-facing name for the batch (the user intent it groups).
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{opened: Boolean, txId?: String, reason?: String}`
     */
    async beginTransaction({name}={}, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {opened: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {opened: false, reason: 'no-transaction-service'}
        }

        if (typeof name !== 'string' || name.trim() === '') {
            return {opened: false, reason: 'name-required'}
        }

        const stackId = {agentId: context.agentId, sessionId: context.sessionId};

        // Reject rather than abort an in-flight batch — opening over an open one would silently drop its captured ops
        // (TransactionService#begin aborts a prior open tx). The agent must commit the current batch first.
        const openTxId = transactionService.openTxId({id: stackId});

        if (openTxId) {
            return {opened: false, reason: 'transaction-already-open', txId: openTxId}
        }

        const
            txId         = `batch:${name.trim()}`,
            {ok, reason} = transactionService.begin({id: stackId, txId});

        return ok ? {opened: true, txId} : {opened: false, reason}
    }

    /**
     * Commits the requester's open named transaction — the `commit_transaction` Neural Link tool. Closes the batch
     * {@link #beginTransaction} opened (`open → committed`), so its accumulated mutations become a single undoable unit
     * on the stack and the redo branch is cleared (a fresh committed mutation diverges history). The symmetric close of
     * the batch lifecycle.
     *
     * Fail-closed (never throws for an expected outcome): no writer identity, no stack authority, no open batch, or an
     * empty batch (no mutations captured — {@link Neo.ai.TransactionService#commit} drops it) → `{committed: false,
     * reason}`.
     * @param {Object} [params] No parameters — commits the requester's own open batch.
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{committed: Boolean, txId?: String, ops?: Number, reason?: String}`
     */
    async commitTransaction(params, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {committed: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {committed: false, reason: 'no-transaction-service'}
        }

        const
            stackId = {agentId: context.agentId, sessionId: context.sessionId},
            {open}  = transactionService.stackOf({id: stackId});

        if (!open) {
            return {committed: false, reason: 'no-open-transaction'}
        }

        // op count from the pre-commit snapshot (commit returns only {ok, reason}) — reported so the agent knows how
        // many mutations the batch folded into one undoable unit.
        const
            opCount      = open.ops.length,
            {ok, reason} = transactionService.commit({id: stackId, txId: open.txId});

        return ok ? {committed: true, txId: open.txId, ops: opCount} : {committed: false, reason}
    }

    /**
     * Aborts the requester's open named transaction — the `abort_transaction` Neural Link tool. Discards the batch
     * {@link #beginTransaction} opened (`open → aborted`, dropped, never undoable) WITHOUT committing it. The forward
     * mutations **remain applied** to the UI (they were enforcement-granted when made); only the undo-record is
     * discarded — this is NOT a rollback. Reverting the UI is composable ({@link #undo} the changes before aborting) or
     * a future dedicated rollback tool. The third arm of the batch lifecycle alongside {@link #commitTransaction}.
     *
     * Fail-closed (never throws for an expected outcome): no writer identity, no stack authority, or no open batch
     * (idempotent — nothing to abort) → `{aborted: false, reason}`.
     * @param {Object} [params] No parameters — aborts the requester's own open batch.
     * @param {Object|null} [context] The Bridge-stamped `{agentId, sessionId}` writer pair (2nd dispatch arg).
     * @returns {Promise<Object>} `{aborted: Boolean, txId?: String, reason?: String}`
     */
    async abortTransaction(params, context) {
        const transactionService = this.client?.transactionService;

        if (!context?.agentId || !context?.sessionId) {
            return {aborted: false, reason: 'no-writer-identity'}
        }

        if (!transactionService) {
            return {aborted: false, reason: 'no-transaction-service'}
        }

        const
            stackId  = {agentId: context.agentId, sessionId: context.sessionId},
            openTxId = transactionService.openTxId({id: stackId});

        if (!openTxId) {
            return {aborted: false, reason: 'no-open-transaction'}
        }

        transactionService.abort({id: stackId, txId: openTxId});

        return {aborted: true, txId: openTxId}
    }

    /**
     * Calls a method on a specific instance.
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.method
     * @param {Array}  [params.args]
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object}
     */
    async callMethod({id, method, args=[], undoKind}, context) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        const
            pathArray  = method.split('.'),
            methodName = pathArray.pop(),
            scope      = pathArray.length < 1 ? instance : Neo.ns(pathArray.join('.'), false, instance);

        if (!scope || typeof scope[methodName] !== 'function') {
            throw new Error(`Method not found: ${method} on instance ${id}`)
        }

        const acquisition = this.assertWritable(context, id);

        let mutationStarted = false;

        try {
            // remove_component reverse-capture must snapshot the component's re-creatable state BEFORE destroy runs (the
            // instance is gone afterwards); create_component's capture is post-call (the new child's id is the `add`
            // return). A server-stamped marker + the canonical shape gate each; a generic call_method + an undo replay
            // capture nothing. See {@link #buildRemoveReverse} / {@link #buildCreateReverse}.
            const removeOp = this.buildRemoveReverse({context, id, method, args, undoKind, instance});

            mutationStarted = true;
            const result = await scope[methodName].call(scope, ...args);

            this.recordUndo(context, removeOp || this.buildCreateReverse({context, id, method, args, undoKind, result}));
            const serializedResult = this.safeSerialize(result);

            this.finishWritable(acquisition);

            return {result: serializedResult}
        } catch (error) {
            this.failWritable(acquisition, error, mutationStarted ? 'unknown' : 'pre-mutation');
            throw error
        }
    }
}

export default Neo.setupClass(InstanceService);
