import Base         from '../core/Base.mjs';
import LockRegistry from './LockRegistry.mjs';

/**
 * Defensive copy of a lock descriptor — the lock object **and** its `subtreePath` array — so the in-heap
 * authority never hands a caller a reference into its live held-lock state.
 * @param {Object} lock
 * @returns {Object}
 */
const copyLock = lock => ({agentId: lock.agentId, sessionId: lock.sessionId, subtreePath: [...lock.subtreePath]});

/**
 * @summary The in-heap authoritative layer that holds the live topological-lock state for one App-Worker
 * heap and enforces it on write-class Neural Link operations.
 *
 * Where `Neo.ai.LockRegistry` is the *stateless* conflict math over a caller-held table, `WriteGuard` is the
 * *stateful authority*: it owns the live lock table for one application heap (the shared truth, per the
 * co-habitation premise) and exposes the write-lifecycle API the in-app Neural Link client calls before it
 * applies a write-class operation. A write **acquires and holds** a subtree lock; a *different* agent's
 * overlapping write is denied while that lock is held; the lock is released explicitly, or swept on
 * disconnect. Held-until-release — not per-op — is the minimum that prevents cross-writer corruption while
 * two agents share one heap.
 *
 * It is deliberately a heap-side authority: the heap is the truth, and any Bridge-level check is advisory
 * routing, never the lock owner. `subtreePath` is supplied by the caller (the client derives the absolute
 * root→node component path from the live tree), so this class stays pure over its inputs and is unit-testable
 * via event sequences with no live-heap or socket dependency.
 *
 * Scope boundary: this is the authority + its lock-state API. The client write-path wiring (intercepting
 * write-class ops, deriving the path, surfacing a denial), Bridge advisory mirroring, and lock leases (TTL
 * expiry for silent holders) are named follow-up slices.
 * @class Neo.ai.WriteGuard
 * @extends Neo.core.Base
 */
class WriteGuard extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.WriteGuard'
         * @protected
         */
        className: 'Neo.ai.WriteGuard'
    }

    /**
     * The live held-lock table — the authoritative truth for this heap. Each entry is a normalized
     * `{agentId, sessionId, subtreePath}` lock currently held by a writer.
     * @member {Object[]} locks=[]
     * @protected
     */
    locks = []

    /**
     * @summary Acquire-and-hold a write lock for a target component subtree.
     * Delegates the conflict decision to `Neo.ai.LockRegistry.acquire`; on a grant the lock is **retained**
     * in the live table (held until {@link releaseWrite} or {@link releaseAgent}), so a later overlapping
     * write by a *different* writer is denied for as long as the holder keeps it. Re-acquiring an identical
     * lock by the same writer is re-entrant (granted, no duplicate). A malformed lock or a cross-writer
     * conflict is denied and the table is left unchanged (fail-closed). The returned `conflict` is a
     * defensive copy of the blocking holder, never a live reference into the held table.
     * @param {Object} lock
     * @param {String} lock.agentId
     * @param {String} lock.sessionId
     * @param {String[]} lock.subtreePath  Absolute root→node component-id path, supplied by the caller.
     * @returns {{granted: Boolean, conflict: Object|null, errors: String[]}}
     */
    requestWrite(lock) {
        const {lockTable, granted, conflict, errors} = LockRegistry.acquire(this.locks, lock);

        if (granted) {
            this.locks = lockTable
        }

        return {granted, conflict: conflict ? copyLock(conflict) : null, errors}
    }

    /**
     * @summary Release one held lock (same writer + same subtree), idempotently.
     * Releasing a lock that is not held is a no-op; a *different* writer's lock on the same subtree is
     * never released by this call.
     * @param {Object} lock The same descriptor shape passed to {@link requestWrite}.
     * @returns {{released: Boolean}}
     */
    releaseWrite(lock) {
        const before = this.locks.length;

        this.locks = LockRegistry.release(this.locks, lock).lockTable;

        return {released: this.locks.length < before}
    }

    /**
     * @summary Release every lock a writer holds — the disconnect / worker-restart sweep hook.
     * Pass `agentId` and/or `sessionId`; a lock is swept when it matches all provided fields. A
     * selector-less call sweeps nothing (fail-closed).
     * @param {Object} selector
     * @param {String} [selector.agentId]
     * @param {String} [selector.sessionId]
     * @returns {{released: Number}}
     */
    releaseAgent(selector) {
        const {lockTable, released} = LockRegistry.releaseAll(this.locks, selector);

        this.locks = lockTable;

        return {released}
    }

    /**
     * @summary A deep snapshot of the currently-held locks (introspection).
     * Every returned lock — including its `subtreePath` array — is a copy, so a caller cannot mutate the
     * live held-lock state through the result (neither the array nor the lock objects nor their paths).
     * @returns {Object[]}
     */
    heldLocks() {
        return this.locks.map(copyLock)
    }
}

export default Neo.setupClass(WriteGuard);
