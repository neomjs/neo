import Base from '../core/Base.mjs';

/**
 * @summary Deterministic topological-lock conflict logic for multi-writer Neural Link coordination.
 *
 * `Neo.ai.LockRegistry` is the pure, side-effect-free *conflict-detection core* an in-heap (App-Worker)
 * authority consults before applying a write-class Neural Link operation when more than one agent shares
 * a live application heap — the co-habitation premise of the agent harness, where agents and humans mutate
 * the same live components. Topological locking is sequenced ahead of any multi-writer slice: a slice either
 * acquires its locks through this logic or explicitly declares itself single-writer.
 *
 * It is deliberately **not** a transport-side lock owner: the coordination epic rejects Bridge-authoritative
 * locking because transport-held locks desync from in-heap reality under reconnects and worker restarts.
 * The heap is the truth; this class is the logic the heap's authority enforces. Accordingly every method
 * is **static and operates on a caller-held `lockTable`** (a plain array the authority owns), returning a
 * new array rather than mutating shared state — so the logic carries no singleton lifecycle and is trivial
 * to test and reason about.
 *
 * A lock is `{agentId, sessionId, subtreePath}`: a writer — identified by the `(agentId, sessionId)` pair —
 * holds a component **subtree**, named by its root→node component-id path (`subtreePath`). Two locks conflict
 * iff their subtrees overlap (equal, ancestor, or descendant paths) **and** they belong to *different*
 * writers; sibling subtrees never conflict and same-writer re-acquisition is re-entrant. `sessionId` is
 * consumed as an **opaque** string here — the canonical-session-id mechanics are a separate concern.
 *
 * Scope boundary: this leaf is the conflict logic only. In-heap enforcement (intercepting the write path),
 * Bridge-side advisory mirroring, lock-lease expiry policy, and the canonical-id binding are named
 * follow-up consumer slices, not this module.
 * @class Neo.ai.LockRegistry
 * @extends Neo.core.Base
 */
class LockRegistry extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.LockRegistry'
         * @protected
         */
        className: 'Neo.ai.LockRegistry'
    }

    /**
     * @summary Validate a lock descriptor, failing closed.
     * Returns a normalized copy of the lock, or `null` when any field is missing or malformed — callers
     * treat `null` as a denial, never as an empty or wildcard lock.
     * @param {Object} lock
     * @param {String} lock.agentId      Non-empty writer (agent) identity.
     * @param {String} lock.sessionId    Non-empty, opaque, harness-native session id.
     * @param {String[]} lock.subtreePath Ordered root→node component-id path; non-empty, all non-empty strings.
     * @returns {Object|null}
     */
    static normalizeLock(lock) {
        if (!lock || typeof lock !== 'object') {
            return null
        }

        const {agentId, sessionId, subtreePath} = lock;

        if (typeof agentId   !== 'string' || agentId   === '') {return null}
        if (typeof sessionId !== 'string' || sessionId === '') {return null}
        if (!Array.isArray(subtreePath) || subtreePath.length === 0) {return null}
        if (!subtreePath.every(segment => typeof segment === 'string' && segment !== '')) {return null}

        return {agentId, sessionId, subtreePath: [...subtreePath]}
    }

    /**
     * @summary Stable string identity of a lock (writer + exact subtree), for dedup and release.
     * Built with `JSON.stringify` over the field tuple, so distinct `(agentId, sessionId, subtreePath)`
     * triples never collide regardless of the characters an id contains.
     * @param {Object} lock A normalized lock.
     * @returns {String}
     */
    static lockKey({agentId, sessionId, subtreePath}) {
        return JSON.stringify([agentId, sessionId, subtreePath])
    }

    /**
     * @summary Whether two locks belong to the same `(agentId, sessionId)` writer.
     * @param {Object} a A normalized lock.
     * @param {Object} b A normalized lock.
     * @returns {Boolean}
     */
    static sameWriter(a, b) {
        return a.agentId === b.agentId && a.sessionId === b.sessionId
    }

    /**
     * @summary Whether two component subtrees overlap (one equals or contains the other).
     * Overlap ⇔ one path is a prefix of the other (a prefix includes the equal case); sibling paths, which
     * diverge before either ends, never overlap. A lock on the root path therefore overlaps everything.
     * @param {String[]} a Ordered root→node id path.
     * @param {String[]} b Ordered root→node id path.
     * @returns {Boolean}
     */
    static pathsOverlap(a, b) {
        const min = Math.min(a.length, b.length);

        for (let i = 0; i < min; i++) {
            if (a[i] !== b[i]) {
                return false // diverged before either subtree root → siblings, disjoint
            }
        }

        return true // one path is a prefix of the other (incl. equal) → subtrees overlap
    }

    /**
     * @summary Find an existing lock held by a *different* writer whose subtree overlaps `candidate`.
     * Returns the conflicting held lock (the first match), or `null` when `candidate` can be granted.
     * Both arguments are expected to be normalized locks (see {@link normalizeLock}).
     * @param {Object[]} lockTable Caller-held active locks (normalized).
     * @param {Object} candidate   A normalized lock.
     * @returns {Object|null}
     */
    static findConflict(lockTable, candidate) {
        for (const held of lockTable) {
            if (!LockRegistry.sameWriter(held, candidate) &&
                LockRegistry.pathsOverlap(held.subtreePath, candidate.subtreePath)) {
                return held
            }
        }

        return null
    }

    /**
     * @summary Attempt to acquire a lock, returning a new table and the outcome — never mutates the input.
     * Fail-closed in three layers: a malformed lock is denied with an error and an unchanged table; a
     * cross-writer subtree overlap is denied with the conflicting holder; otherwise the lock is granted.
     * Re-acquiring an identical lock by the same writer is re-entrant (granted, no duplicate appended).
     * @param {Object[]} lockTable The caller-held active locks.
     * @param {Object} lock        The lock to acquire.
     * @returns {{lockTable: Object[], granted: Boolean, conflict: Object|null, errors: String[]}}
     */
    static acquire(lockTable, lock) {
        const table = Array.isArray(lockTable) ? lockTable : [],
              norm  = LockRegistry.normalizeLock(lock);

        if (!norm) {
            return {lockTable: table, granted: false, conflict: null, errors: ['invalid lock descriptor']}
        }

        const conflict = LockRegistry.findConflict(table, norm);

        if (conflict) {
            return {lockTable: table, granted: false, conflict, errors: []}
        }

        const key = LockRegistry.lockKey(norm);

        if (table.some(held => LockRegistry.lockKey(held) === key)) {
            return {lockTable: table, granted: true, conflict: null, errors: []} // re-entrant, idempotent
        }

        return {lockTable: [...table, norm], granted: true, conflict: null, errors: []}
    }

    /**
     * @summary Release one exact lock (same writer + same subtree), idempotently.
     * Releasing a lock that is not held is a no-op — the table is returned unchanged — so a double-release
     * or a release after a sweep never throws. A lock on the same subtree held by a *different* writer is
     * never released by this call.
     * @param {Object[]} lockTable The caller-held active locks.
     * @param {Object} lock        The lock to release.
     * @returns {{lockTable: Object[]}}
     */
    static release(lockTable, lock) {
        const table = Array.isArray(lockTable) ? lockTable : [],
              norm  = LockRegistry.normalizeLock(lock);

        if (!norm) {
            return {lockTable: table}
        }

        const key = LockRegistry.lockKey(norm);

        return {lockTable: table.filter(held => LockRegistry.lockKey(held) !== key)}
    }

    /**
     * @summary Release every lock matching a writer selector — the disconnect / worker-restart sweep hook.
     * Pass `agentId` and/or `sessionId`; a lock is swept when it matches *all* provided fields. Passing
     * neither field selects nothing (fail-closed: a selector-less sweep never clears the whole table).
     * @param {Object[]} lockTable  The caller-held active locks.
     * @param {Object} [selector={}]
     * @param {String} [selector.agentId]
     * @param {String} [selector.sessionId]
     * @returns {{lockTable: Object[], released: Number}}
     */
    static releaseAll(lockTable, selector = {}) {
        const table = Array.isArray(lockTable) ? lockTable : [],
              {agentId, sessionId} = selector;

        if (agentId === undefined && sessionId === undefined) {
            return {lockTable: table, released: 0}
        }

        const kept = table.filter(held => !(
            (agentId   === undefined || held.agentId   === agentId) &&
            (sessionId === undefined || held.sessionId === sessionId)
        ));

        return {lockTable: kept, released: table.length - kept.length}
    }

    /**
     * @summary Whether an explicit write target is mandatory for the given live-session count (fail-safe).
     * Only a count *known* to be exactly 0 or 1 permits the implicit "most recent session" shortcut
     * (`ConnectionService.call()`, single-writer-safe). Any other value — 2+, or a non-finite / unexpected
     * count such as a consumer's `sessions?.length` resolving to `undefined` — requires an explicit target:
     * if the live-session count cannot be confirmed safe, we must not silently re-enable auto-targeting
     * while co-habitation may be live. The fail direction is the strict one (`true`).
     * @param {Number} liveSessionCount
     * @returns {Boolean}
     */
    static requiresExplicitTarget(liveSessionCount) {
        return liveSessionCount !== 0 && liveSessionCount !== 1
    }
}

export default Neo.setupClass(LockRegistry);
