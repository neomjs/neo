import Base from '../core/Base.mjs';

/**
 * JSON deep-clone of a transaction op's data-only descriptors. The in-heap stack never hands a caller a live
 * reference into its held undo state, and every captured reverse-op is **data-not-code** (a JSON tool-descriptor
 * per the Neural Link capability boundary), so a structural JSON clone is both sufficient *and* the contract
 * guard — a function / class reference smuggled into `forward` / `reverse` would throw here rather than enter the
 * stack.
 * @param {Object} op
 * @returns {Object}
 */
const cloneOp = op => ({
    sequenceId       : op.sequenceId,
    originWriter     : {agentId: op.originWriter.agentId, sessionId: op.originWriter.sessionId},
    targetSubtreePath: [...op.targetSubtreePath],
    forward          : JSON.parse(JSON.stringify(op.forward)),
    reverse          : JSON.parse(JSON.stringify(op.reverse)),
    label            : op.label
});

/**
 * Deep-copy a transaction (id + status + a clone of every op), for introspection / undo return values.
 * @param {Object} tx
 * @returns {Object}
 */
const cloneTx = tx => ({txId: tx.txId, status: tx.status, ops: tx.ops.map(cloneOp)});

/**
 * The stable string key for a writer's undo stack — the **full session identity**, so two Neural Link sessions
 * or two writers never share a stack. Fails closed (`null`) when any field is missing: no shared / wildcard stack.
 * @param {Object} [id={}] `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
 * @returns {String|null}
 */
const stackKey = ({neuralLinkSessionId, requesterAgentId, requesterSessionId} = {}) => {
    if (!neuralLinkSessionId || !requesterAgentId || !requesterSessionId) {
        return null
    }
    return JSON.stringify([neuralLinkSessionId, requesterAgentId, requesterSessionId])
};

/**
 * @summary In-heap, per-session transaction stack — the **active undo authority** for one App-Worker heap.
 *
 * The stateful counterpart to the Neural Link mutation primitives: where each write-class op mutates the live
 * component tree, this records that op's **reverse** so an agent can say *"undo that"* and revert cleanly. It is
 * the heap's active undo state, distinct by design from `Neo.ai.RecorderService` / `nl_action_log` — that ledger
 * stays a **forward-only audit** trail; this is the live reversible stack (in-memory now by the converged design,
 * persistence a later slice — the active-vs-archive split).
 *
 * Like `Neo.ai.WriteGuard`, it is a per-heap authority owned by the in-app `Neo.ai.Client` and is **pure over its
 * inputs** — reverse-capture, the enforcement grant, and the live tree all live in the caller; this class only
 * owns the stack lifecycle, so it is unit-testable via event sequences with no live-heap or socket dependency.
 *
 * **Lifecycle / state machine**: `open → committed → undone`, with `aborted` / `timedOut`
 * as failure / teardown terminals. A reverse-op is captured ({@link record}) only after the forward write is
 * enforcement-granted — the caller (the `InstanceService` write-path, behind `Neo.ai.admitWrite`) guarantees that
 * ordering, so a denied write never reaches {@link record} and leaves no reverse record. Slice-1 is **single-level**
 * undo: {@link undo} reverts the most-recent committed transaction for the writer.
 *
 * **Identity / provenance**: each op stores `originWriter:{agentId, sessionId}` as
 * provenance / authorization evidence **only**; the stack never enforces with it — undo is re-dispatched and
 * re-enforced as the *current* requester by the caller, and the enforcement `subtreePath` is re-derived at undo
 * time on the live tree (the stored `targetSubtreePath` is audit metadata, never the enforcement path).
 *
 * Scope boundary (Slice-1): this is the stack authority + its lifecycle API. The `InstanceService`
 * capture-hook, the `undo` Neural Link tool, `redo` + named batching (Slice-2), Memory-Core persistence (Slice-3),
 * and any privileged `systemRollback` are named follow-up slices, not this module.
 * @class Neo.ai.TransactionService
 * @extends Neo.core.Base
 */
class TransactionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.TransactionService'
         * @protected
         */
        className: 'Neo.ai.TransactionService',
        /**
         * Max committed transactions retained per session; the oldest is evicted (and no longer undoable) past
         * this depth — a bound on heap growth (the converged density cap).
         * @member {Number} maxStackDepth=50
         */
        maxStackDepth: 50,
        /**
         * Max reverse-ops a single transaction may hold (a bound on a runaway batch; Slice-1 is typically 1).
         * @member {Number} maxOpsPerTransaction=100
         */
        maxOpsPerTransaction: 100,
        /**
         * Max serialized byte size of a single reverse-op descriptor — a captured reverse larger than this is
         * rejected (fail-closed: better to drop reversibility for one giant op than blow the heap budget).
         * @member {Number} maxReversePayloadBytes=65536
         */
        maxReversePayloadBytes: 65536
    }

    /**
     * Per-session undo state, keyed by {@link stackKey}. Each value is `{open: Object|null, committed: Object[]}`:
     * at most one `open` transaction at a time, plus the depth-capped `committed` stack (newest last). In-memory
     * + same-live-session only (the converged design); a disconnect {@link sweep}s the session away.
     * @member {Map<String,Object>} sessions
     * @protected
     */
    sessions = new Map()

    /**
     * @summary Open a new transaction for a writer's session (`status: 'open'`).
     * Slice-1 holds at most one open transaction per session: opening a new one while a prior is still open
     * marks the stale one `aborted` (a write that never committed / a teardown gap) so a leaked open transaction
     * can't accumulate ops forever. Fails closed on an incomplete session identity or missing `txId`.
     * @param {Object} params
     * @param {Object} params.id   `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @param {String} params.txId
     * @returns {{ok: Boolean, reason: (String|null)}}
     */
    begin({id, txId}) {
        const key = stackKey(id);

        if (!key || typeof txId !== 'string' || txId === '') {
            return {ok: false, reason: 'invalid-session-or-tx'}
        }

        let entry = this.sessions.get(key);

        if (!entry) {
            entry = {open: null, committed: []};
            this.sessions.set(key, entry)
        }

        if (entry.open) {
            entry.open.status = 'aborted' // a prior open tx never committed — fail-safe abort, don't leak it
        }

        entry.open = {txId, status: 'open', ops: []};

        return {ok: true, reason: null}
    }

    /**
     * @summary Record a reverse-op into the session's open transaction — the capture step.
     * The caller invokes this only **after** the forward write is enforcement-granted (so a denied write leaves no
     * reverse record). Fails closed on: no open transaction, a `txId` mismatch, a malformed op (missing
     * `originWriter` / `targetSubtreePath` / `reverse`), the per-transaction op cap, or an oversized reverse payload.
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @param {String} params.txId
     * @param {Object} params.op  `{sequenceId, originWriter:{agentId,sessionId}, targetSubtreePath:String[], forward, reverse, label}`
     * @returns {{ok: Boolean, reason: (String|null)}}
     */
    record({id, txId, op}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry?.open || entry.open.txId !== txId) {
            return {ok: false, reason: 'no-open-transaction'}
        }

        if (!op || typeof op !== 'object' ||
            !op.originWriter?.agentId || !op.originWriter?.sessionId ||
            !Array.isArray(op.targetSubtreePath) || op.reverse === undefined) {
            return {ok: false, reason: 'malformed-op'}
        }

        if (entry.open.ops.length >= this.maxOpsPerTransaction) {
            return {ok: false, reason: 'max-ops-per-transaction'}
        }

        let serialized;

        try {
            serialized = JSON.stringify(op.reverse)
        } catch (e) {
            return {ok: false, reason: 'reverse-not-serializable'} // a non-JSON reverse (function/cycle) — data-not-code guard
        }

        if (serialized.length > this.maxReversePayloadBytes) {
            return {ok: false, reason: 'max-reverse-payload-bytes'}
        }

        entry.open.ops.push(cloneOp(op));

        return {ok: true, reason: null}
    }

    /**
     * @summary Commit the session's open transaction — `open → committed`.
     * The committed transaction joins the undo stack (newest last); if that pushes the stack past
     * {@link maxStackDepth}, the **oldest** committed transaction is evicted (no longer undoable). A commit with no
     * ops is dropped rather than committed (nothing to undo). Fails closed on no-open / `txId` mismatch.
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @param {String} params.txId
     * @returns {{ok: Boolean, reason: (String|null)}}
     */
    commit({id, txId}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry?.open || entry.open.txId !== txId) {
            return {ok: false, reason: 'no-open-transaction'}
        }

        const tx = entry.open;

        entry.open = null;

        if (tx.ops.length === 0) {
            tx.status = 'aborted';
            return {ok: false, reason: 'empty-transaction'} // nothing captured — not undoable
        }

        tx.status = 'committed';
        entry.committed.push(tx);

        if (entry.committed.length > this.maxStackDepth) {
            entry.committed.shift() // evict the oldest — past the depth bound it is no longer undoable
        }

        return {ok: true, reason: null}
    }

    /**
     * @summary Undo the most-recent committed transaction for the writer — `committed → undone` (single-level).
     * Marks the transaction `undone` and returns its reverse-ops **in reverse capture order** (last-in mutation
     * undone first), for the caller to re-dispatch as validated tool calls — re-enforced as the *current*
     * requester, with the enforcement `subtreePath` re-derived on the live tree (NOT the stored audit path). Does
     * not itself mutate the tree or the lock table. Returns `reverseOps: null` when there is nothing to undo.
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @returns {{txId: (String|null), reverseOps: (Object[]|null)}}
     */
    undo({id}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry || entry.committed.length === 0) {
            return {txId: null, reverseOps: null}
        }

        const tx = entry.committed.pop();

        tx.status = 'undone';

        return {txId: tx.txId, reverseOps: tx.ops.map(cloneOp).reverse()}
    }

    /**
     * @summary Abort the session's open transaction (`open → aborted`) — the failure / teardown path.
     * A no-op when no transaction is open or the `txId` does not match (idempotent). An aborted transaction is
     * dropped, never undoable, and leaves no reverse record.
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @param {String} params.txId
     * @returns {{aborted: Boolean}}
     */
    abort({id, txId}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry?.open || entry.open.txId !== txId) {
            return {aborted: false}
        }

        entry.open.status = 'aborted';
        entry.open        = null;

        return {aborted: true}
    }

    /**
     * @summary Sweep a writer's entire undo state on disconnect / worker-restart — aborts any open transaction and
     * retires the session's stack. The transaction-side counterpart to `WriteGuard.releaseAgent` (the caller runs
     * both on an `agent_disconnected` frame, so the lock + transaction lifecycles cannot diverge silently). Fails
     * closed on an incomplete identity (sweeps nothing — never clears the whole table).
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @returns {{swept: Boolean}}
     */
    sweep({id}) {
        const key = stackKey(id);

        if (!key || !this.sessions.has(key)) {
            return {swept: false}
        }

        this.sessions.delete(key);

        return {swept: true}
    }

    /**
     * @summary A deep snapshot of a session's undo state (introspection / testing).
     * Every returned transaction + op is a copy, so a caller cannot mutate the live stack through the result.
     * @param {Object} params
     * @param {Object} params.id  `{neuralLinkSessionId, requesterAgentId, requesterSessionId}`
     * @returns {{open: (Object|null), committed: Object[]}}
     */
    stackOf({id}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry) {
            return {open: null, committed: []}
        }

        return {
            open     : entry.open ? cloneTx(entry.open) : null,
            committed: entry.committed.map(cloneTx)
        }
    }
}

export default Neo.setupClass(TransactionService);
