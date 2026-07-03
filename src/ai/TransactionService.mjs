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
 * The stable string key for a writer's undo stack — the `(agentId, sessionId)` writer pair, so two writers never
 * share a stack. This is the **same writer identity `Neo.ai.WriteGuard` keys locks on** — the Bridge stamps the
 * pair per agent connection (the `agent_message` sidecar) — so the lock + undo lifecycles key identically and a
 * disconnect sweep maps straight from the `agent_disconnected` frame. Fails closed (`null`) when either field is
 * missing: no shared / wildcard stack.
 * @param {Object} [id={}] `{agentId, sessionId}` — the Bridge-stamped writer pair
 * @returns {String|null}
 */
const stackKey = ({agentId, sessionId} = {}) => {
    // Stricter than a truthy check, mirroring `LockRegistry.normalizeLock` — a non-string id fails closed too, so
    // the undo-stack key and the write-lock key reject exactly the same way (fail-closed symmetry across both sides).
    if (typeof agentId !== 'string' || agentId === '' || typeof sessionId !== 'string' || sessionId === '') {
        return null
    }
    return JSON.stringify([agentId, sessionId])
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
 * **Lifecycle / state machine**: `open → committed → undone`, plus the redo re-entry `undone → committed`
 * ({@link redo}), with `aborted` / `timedOut` as failure / teardown terminals. A reverse-op is captured
 * ({@link record}) only after the forward write is enforcement-granted — the caller (the `InstanceService`
 * write-path, behind `Neo.ai.admitWrite`) guarantees that ordering, so a denied write never reaches {@link record}
 * and leaves no reverse record. Undo + redo are **single-level**: {@link undo} reverts the most-recent committed
 * transaction for the writer; {@link redo} re-applies the most-recently undone one (the undo↔redo cycle), and a new
 * {@link commit} clears the redo branch (a fresh mutation diverges history).
 *
 * **Identity / provenance**: each op stores `originWriter:{agentId, sessionId}` as
 * provenance / authorization evidence **only**; the stack never enforces with it — undo is re-dispatched and
 * re-enforced as the *current* requester by the caller, and the enforcement `subtreePath` is re-derived at undo
 * time on the live tree (the stored `targetSubtreePath` is audit metadata, never the enforcement path).
 *
 * Scope boundary: this is the stack authority + its lifecycle API (`begin`/`record`/`commit`/`undo`/`redo`/
 * `abort`/`timeout`/`sweep`). The `InstanceService` capture-hook + the `undo` / `redo` Neural Link tools are the
 * wiring (not this module); named transaction batching (the Slice-2 remainder), Memory-Core persistence (Slice-3),
 * and any privileged `systemRollback` are named follow-up slices.
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
         * Max serialized byte size of a single op descriptor (each of `forward` / `reverse`) — a descriptor larger
         * than this is rejected (fail-closed: better to drop reversibility for one giant op than blow the heap budget).
         * @member {Number} maxOpPayloadBytes=65536
         */
        maxOpPayloadBytes: 65536,
        /**
         * Max length of an op's user-facing display `label` — a bound on the label/source string.
         * @member {Number} maxLabelChars=200
         */
        maxLabelChars: 200
    }

    /**
     * Per-session undo state, keyed by {@link stackKey}. Each value is `{open: Object|null, committed: Object[],
     * redo: Object[]}`: at most one `open` transaction at a time, the depth-capped `committed` undo stack (newest
     * last), and the `redo` branch ({@link undo} pushes here, {@link redo} pops, a new {@link commit} clears it).
     * In-memory + same-live-session only (the converged design); a disconnect {@link sweep}s the session away.
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
     * @param {Object} params.id   `{agentId, sessionId}` — the Bridge-stamped writer pair
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
            entry = {open: null, committed: [], redo: []};
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
     * reverse record). Fails closed (returns `{ok:false}`, never throws) on: no open transaction; a `txId` mismatch;
     * a malformed op (any of `sequenceId` / `originWriter.{agentId,sessionId}` / `targetSubtreePath` / `forward` /
     * `reverse` / `label` missing or mistyped); a non-serializable `forward` or `reverse` (the data-not-code guard);
     * the per-transaction op cap; an over-long `label`; or an oversized op payload.
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @param {String} params.txId
     * @param {Object} params.op  `{sequenceId, originWriter:{agentId,sessionId}, targetSubtreePath:String[], forward, reverse, label}`
     * @returns {{ok: Boolean, reason: (String|null)}}
     */
    record({id, txId, op}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry?.open || entry.open.txId !== txId) {
            return {ok: false, reason: 'no-open-transaction'}
        }

        if (!op || typeof op !== 'object') {
            return {ok: false, reason: 'malformed-op'}
        }

        const {sequenceId, originWriter, targetSubtreePath, forward, reverse, label} = op;

        // Every required reverse-record field must be present + well-typed — a malformed descriptor fails closed
        // here, never stored half-formed and never reached by cloneOp / undo downstream.
        if (typeof sequenceId !== 'string' || sequenceId === ''                               ||
            !originWriter ||
            typeof originWriter.agentId   !== 'string' || originWriter.agentId   === ''        ||
            typeof originWriter.sessionId !== 'string' || originWriter.sessionId === ''        ||
            !Array.isArray(targetSubtreePath) || targetSubtreePath.length === 0                ||
            !targetSubtreePath.every(segment => typeof segment === 'string' && segment !== '') ||
            forward === undefined || reverse === undefined                                     ||
            typeof label !== 'string' || label === '') {
            return {ok: false, reason: 'malformed-op'}
        }

        if (entry.open.ops.length >= this.maxOpsPerTransaction) {
            return {ok: false, reason: 'max-ops-per-transaction'}
        }

        if (label.length > this.maxLabelChars) {
            return {ok: false, reason: 'max-label-length'}
        }

        // BOTH `forward` and `reverse` must be JSON-serializable (the data-not-code guard) + within the payload
        // bound. A function / cycle / oversized descriptor fails closed — it must never enter the stack OR escape as
        // an uncaught exception from a downstream `cloneOp`.
        let forwardJson, reverseJson;

        try {
            forwardJson = JSON.stringify(forward);
            reverseJson = JSON.stringify(reverse)
        } catch (e) {
            return {ok: false, reason: 'op-not-serializable'}
        }

        if (forwardJson.length > this.maxOpPayloadBytes || reverseJson.length > this.maxOpPayloadBytes) {
            return {ok: false, reason: 'max-op-payload-bytes'}
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
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
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
        entry.redo.length = 0; // a new committed mutation diverges history — the redo branch is no longer valid

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
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @returns {{txId: (String|null), reverseOps: (Object[]|null)}}
     */
    undo({id}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry || entry.committed.length === 0) {
            return {txId: null, reverseOps: null}
        }

        const tx = entry.committed.pop();

        tx.status = 'undone';
        entry.redo.push(tx); // retain the undone transaction so `redo` can re-apply it (Slice-2)

        return {txId: tx.txId, reverseOps: tx.ops.map(cloneOp).reverse()}
    }

    /**
     * @summary Redo the most-recently undone transaction for the writer — `undone → committed` (single-level).
     * The symmetric counterpart to {@link undo}: pops the writer's redo branch (the transactions {@link undo}
     * retained), restores the transaction to the committed stack (`status: 'committed'`, undoable again), and returns
     * its **forward-ops in capture order** (first mutation re-applied first) for the caller to re-dispatch as validated
     * tool calls — re-enforced as the *current* requester, with the enforcement `subtreePath` re-derived on the live
     * tree (NOT the stored audit path), exactly as undo does for the reverses. Does not itself mutate the tree or the
     * lock table. Returns `forwardOps: null` when there is nothing to redo. The redo branch is invalidated by any new
     * {@link commit} — a fresh mutation diverges history (standard editor semantics).
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @returns {{txId: (String|null), forwardOps: (Object[]|null)}}
     */
    redo({id}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry || entry.redo.length === 0) {
            return {txId: null, forwardOps: null}
        }

        const tx = entry.redo.pop();

        tx.status = 'committed';
        entry.committed.push(tx); // restored to the undo stack — undoable again (the undo↔redo cycle)

        return {txId: tx.txId, forwardOps: tx.ops.map(cloneOp)}
    }

    /**
     * @summary Abort the session's open transaction (`open → aborted`) — the failure / teardown path.
     * A no-op when no transaction is open or the `txId` does not match (idempotent). An aborted transaction is
     * dropped, never undoable, and leaves no reverse record.
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
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
     * @summary Time out the session's open transaction (`open → timedOut`) — the lease-expiry path, distinct from a
     * caller-driven `abort`. A no-op when no transaction is open or the `txId` does not match (idempotent). A
     * timed-out transaction is dropped, never undoable, and leaves no reverse record (a partial capture is not a
     * coherent undo unit). The terminal is recorded separately from `aborted` so a lease expiry stays auditable as
     * its own cause rather than masquerading as a deliberate abort.
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @param {String} params.txId
     * @returns {{timedOut: Boolean}}
     */
    timeout({id, txId}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry?.open || entry.open.txId !== txId) {
            return {timedOut: false}
        }

        entry.open.status = 'timedOut';
        entry.open        = null;

        return {timedOut: true}
    }

    /**
     * @summary Sweep a writer's entire undo state on disconnect / worker-restart — aborts any open transaction and
     * retires the session's stack. The transaction-side counterpart to `WriteGuard.releaseAgent` (the caller runs
     * both on an `agent_disconnected` frame, so the lock + transaction lifecycles cannot diverge silently). Fails
     * closed on an incomplete identity (sweeps nothing — never clears the whole table).
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
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
     * @summary The id of the session's currently-open transaction, or `null` — a clone-free open-batch probe.
     * The hot-path counterpart to {@link stackOf}: the capture hook ({@link Neo.ai.client.InstanceService#recordUndo})
     * consults this on **every** mutation to route an op into an agent-opened named batch (`begin_transaction`) vs.
     * auto-wrapping it as its own single-op transaction — and `stackOf` deep-copies the entire stack, the wrong cost
     * for a per-mutation check (within an N-mutation batch the open tx grows, so probing it via `stackOf` is O(N²)).
     * Fail-closed: an incomplete identity / unknown session → `null`.
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @returns {String|null}
     */
    openTxId({id}) {
        return this.sessions.get(stackKey(id) ?? '')?.open?.txId ?? null
    }

    /**
     * @summary A deep snapshot of a session's undo state (introspection / testing).
     * Every returned transaction + op is a copy, so a caller cannot mutate the live stack through the result.
     * @param {Object} params
     * @param {Object} params.id  `{agentId, sessionId}` — the Bridge-stamped writer pair
     * @returns {{open: (Object|null), committed: Object[]}}
     */
    stackOf({id}) {
        const entry = this.sessions.get(stackKey(id) ?? '');

        if (!entry) {
            return {open: null, committed: [], redo: []}
        }

        return {
            open     : entry.open ? cloneTx(entry.open) : null,
            committed: entry.committed.map(cloneTx),
            redo     : entry.redo.map(cloneTx)
        }
    }
}

export default Neo.setupClass(TransactionService);
