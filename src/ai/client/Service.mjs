import Base from '../../core/Base.mjs';

/**
 * Base class for Neural Link Client Services.
 * @class Neo.ai.client.Service
 * @extends Neo.core.Base
 */
class Service extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.Service'
         * @protected
         */
        className: 'Neo.ai.client.Service',
        /**
         * @member {Neo.ai.Client|null} client=null
         * @protected
         */
        client: null
    }

    /**
     * Monotonic per-instance counter minting unique undo transaction / sequence ids for captured reverse-ops.
     * @member {Number} undoSequence=0
     * @protected
     */
    undoSequence = 0

    /**
     * Captures a reverse-op onto this heap's undo stack ({@link Neo.ai.Client#transactionService}), keyed on the
     * writer's `(agentId, sessionId)`. Two routes, decided by whether the writer has an **agent-opened named batch**
     * in progress (the `begin_transaction` tool):
     * - **named batch open** → `record` the op INTO it; no per-op commit (the batch accumulates, so the agent's
     *   `commit_transaction` closes it and multiple mutations undo as one unit). The auto-wrap below MUST be
     *   skipped here — its `begin` would abort the open batch ({@link Neo.ai.TransactionService#begin} drops a prior
     *   open tx).
     * - **no open batch** → auto-wrap the op as its own single-op committed transaction (`begin` → `record` →
     *   `commit`), the default per-mutation capture.
     * Best-effort: a `null` op (incl. an undo replay, suppressed at the call site), an absent stack authority, or a
     * stack rejection (a malformed / unserializable reverse) is dropped cleanly (`abort` on the auto-wrap path),
     * never thrown — capturing an undo must never break the forward write it shadows.
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
            stackId  = {agentId: context.agentId, sessionId: context.sessionId},
            openTxId = transactionService.openTxId({id: stackId});

        if (openTxId) {
            // An agent-opened named batch is in progress — accumulate this op into it (no per-op commit). A record
            // rejection drops the op cleanly (the batch stays open + intact).
            transactionService.record({id: stackId, txId: openTxId, op});
            return
        }

        // No open batch → auto-wrap this single mutation as its own committed transaction.
        const txId = `tx:${op.sequenceId}`;

        transactionService.begin({id: stackId, txId});

        if (transactionService.record({id: stackId, txId, op}).ok) {
            transactionService.commit({id: stackId, txId})
        } else {
            transactionService.abort({id: stackId, txId})
        }
    }

    /**
     * @summary Serializes a property value for the wire. Plain objects and arrays serialize in
     * full; a Neo INSTANCE collapses to its `toJSON()` identity snapshot — which is a truncation
     * of the instance's object graph, so the snapshot carries a `__truncated` marker making the
     * collapse machine-distinguishable from a genuinely small value. Without the marker, a deep
     * structure read (a `vnode` tree, a hosted store) looks like confident evidence of a tiny
     * object — a silent false negative in exactly the whitebox-debugging situations this wire
     * exists for. Structure-shaped reads belong to the tree tools (`query_vdom`,
     * `get_component_tree`, `inspect_component_render_tree`).
     * @param {*} value
     * @returns {*}
     */
    safeSerialize(value) {
        const type = Neo.typeOf(value);

        if (type === 'NeoInstance') {
            return {...value.toJSON(), __truncated: 'neo-instance-snapshot'}
        }

        if (type === 'Object') {
            const result = {};
            Object.entries(value).forEach(([k, v]) => {
                result[k] = this.safeSerialize(v)
            });
            return result
        }

        if (type === 'Array') {
            return value.map(v => this.safeSerialize(v))
        }

        return value
    }
}

export default Neo.setupClass(Service);
