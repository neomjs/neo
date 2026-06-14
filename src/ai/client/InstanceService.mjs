import Service             from './Service.mjs';
import {admitWrite}        from '../admitWrite.mjs';
import {deriveSubtreePath} from '../deriveSubtreePath.mjs';

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
     * Monotonic per-instance counter minting unique undo transaction / sequence ids for captured reverse-ops.
     * @member {Number} undoSequence=0
     * @protected
     */
    undoSequence = 0

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
     * Enforces the multi-writer write-lock before a write-class op mutates: composes the {@link Neo.ai.admitWrite}
     * decision with this heap's {@link Neo.ai.Client#writeGuard} and **throws** a deny (no mutation) when the write is
     * not admitted. A bare / legacy frame (no `context`) is unguarded — backward-compatible with non-agent callers.
     * @param {Object|null} context The Bridge-stamped `{agentId, sessionId}` writer pair, or null/undefined (legacy).
     * @param {String} id The target component id whose subtree the write locks.
     * @protected
     */
    assertWritable(context, id) {
        const {admitted, reason, conflict} = admitWrite({
            context,
            componentId: id,
            parentOf   : cid => Neo.getComponent(cid)?.parentId,
            writeGuard : this.client?.writeGuard
        });

        if (!admitted) {
            const heldBy = conflict ? ` (held by ${conflict.agentId} / ${conflict.sessionId})` : '';
            throw new Error(`Write denied for ${id}: ${reason}${heldBy}`)
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

        this.assertWritable(context, id);

        // Capture the reverse (the pre-set values) BEFORE mutating, so an agent can undo this write. Best-effort +
        // fail-closed: only an enforcement-granted *agent* write (a writer identity in `context`) is captured, and a
        // malformed / unserializable reverse is dropped, never thrown into the write path. An undo-replay
        // (`context.undoReplay`, set by {@link #undo}) is NOT captured — re-applying a reverse must never enqueue a
        // new undoable transaction (single-level undo; redo is a later slice).
        const undoOp = context?.undoReplay ? null : this.buildSetReverse({context, id, instance, properties});

        instance.set(properties);

        this.recordUndo(context, undoOp);

        return {success: true}
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
            sequenceId       : `${id}:${++this.undoSequence}`,
            originWriter     : {agentId: context.agentId, sessionId: context.sessionId},
            targetSubtreePath,
            forward          : {tool: 'set_instance_properties', args: {id, properties}},
            reverse          : {tool: 'set_instance_properties', args: {id, properties: oldValues}},
            label            : `set ${Object.keys(properties).join(', ')} on ${id}`
        }
    }

    /**
     * Records a captured reverse-op as a single-op committed transaction on this heap's undo stack
     * ({@link Neo.ai.Client#transactionService}) — `begin` → `record` → `commit`, keyed on the writer's
     * `(agentId, sessionId)`. Best-effort: a `null` op, an absent stack authority, or a stack rejection (a malformed /
     * unserializable reverse) is dropped cleanly (`abort`), never thrown — capturing an undo must never break the
     * forward write it shadows.
     * @param {Object|null} context
     * @param {Object|null} op
     * @protected
     */
    recordUndo(context, op) {
        const transactionService = this.client?.transactionService;

        if (!op || !transactionService) {
            return
        }

        const
            stackId = {agentId: context.agentId, sessionId: context.sessionId},
            txId    = `tx:${op.sequenceId}`;

        transactionService.begin({id: stackId, txId});

        if (transactionService.record({id: stackId, txId, op}).ok) {
            transactionService.commit({id: stackId, txId})
        } else {
            transactionService.abort({id: stackId, txId})
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
     * enqueues a new undoable transaction (single-level; redo is a later slice).
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
     * Calls a method on a specific instance.
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.method
     * @param {Array}  [params.args]
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object}
     */
    async callMethod({id, method, args=[]}, context) {
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

        this.assertWritable(context, id);

        const result = await scope[methodName].call(scope, ...args);

        return {result: this.safeSerialize(result)}
    }
}

export default Neo.setupClass(InstanceService);
