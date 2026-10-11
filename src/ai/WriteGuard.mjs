import Base         from '../core/Base.mjs';
import LockRegistry from './LockRegistry.mjs';

/**
 * @summary Defensively copies one held lease, including its nested subtree path.
 * @param {Object} lease
 * @returns {Object}
 */
function copyLease(lease) {
    const copy = {
        agentId    : lease.agentId,
        sessionId  : lease.sessionId,
        subtreePath: [...lease.subtreePath]
    };

    ['token', 'acquiredAt', 'lastTouchAt', 'inFlight'].forEach(field => {
        if (Object.hasOwn(lease, field)) {
            copy[field] = lease[field]
        }
    });

    return copy
}

/**
 * @summary Defensively copies an acquisition receipt for an operation owner.
 * @param {Object} lease
 * @param {Boolean} created
 * @param {Boolean} reentrant
 * @returns {Object}
 */
const copyAcquisition = (lease, created, reentrant) => ({
    ...copyLease(lease),
    created,
    reentrant
});

/**
 * @summary Defensively copies an observable lease lifecycle receipt.
 * @param {Object} receipt
 * @returns {Object}
 */
const copyReceipt = receipt => ({...receipt, subtreePath: [...receipt.subtreePath]});

/**
 * @summary The in-heap authoritative layer that holds the live topological-lock state for one App-Worker
 * heap and enforces it on write-class Neural Link operations.
 *
 * A granted write remains held until an explicit fenced release, disconnect sweep, or idle lease expiry.
 * Every held entry carries a monotonic token, acquisition/touch timestamps, and an in-flight count. Lazy
 * request/inspection sweeps reclaim only idle expired generations; an admitted synchronous or async
 * operation increments `inFlight`, so it can never expire while application code is executing. Tokens fence
 * touch/end/release calls: an old operation cannot mutate or remove a successor generation after expiry.
 *
 * The clock is injected through {@link nowFn}; no timer belongs to this heap authority. Lifecycle receipts
 * are bounded and independently inspectable, while every outward lock/acquisition/receipt remains a deep
 * defensive copy. The exact `(agentId, sessionId)` writer key and held-until-release regime remain the
 * source-of-authority contract.
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
     * Idle lease duration. In-flight work is never eligible regardless of elapsed time.
     * @member {Number} leaseTtlMs=300000
     */
    leaseTtlMs = 300_000

    /**
     * Injected deterministic clock.
     * @member {Function} nowFn
     */
    nowFn = () => Date.now()

    /**
     * Maximum independently inspectable lifecycle receipts retained in heap memory.
     * @member {Number} receiptLimit=100
     */
    receiptLimit = 100

    /**
     * The live held-lease table for this heap.
     * @member {Object[]} locks=[]
     * @protected
     */
    locks = []

    /**
     * Bounded lifecycle receipt ledger.
     * @member {Object[]} receiptLog=[]
     * @protected
     */
    receiptLog = []

    /**
     * Monotonic fenced-token source for this heap generation.
     * @member {Number} tokenSequence=0
     * @protected
     */
    tokenSequence = 0

    /**
     * @summary Acquire-and-hold a write lease, returning creation/re-entry provenance and its fenced token.
     *
     * A lazy sweep runs first. Same-writer exact re-entry refreshes `lastTouchAt` and returns the existing
     * token; a newly-created hold receives a new token. Invalid clock/TTL configuration denies without
     * mutating existing state. `reclaimed` contains the independently inspectable expiry receipts observed
     * by this request.
     * @param {Object} lock
     * @returns {{granted: Boolean, conflict: Object|null, errors: String[], created: Boolean, reentrant: Boolean, token: Number|null, acquisition: Object|null, reclaimed: Object[]}}
     */
    requestWrite(lock) {
        const now = this.readNow();

        if (now === null || !this.hasValidTtl()) {
            return {
                granted    : false,
                conflict   : null,
                errors     : [now === null ? 'invalid-write-lease-clock' : 'invalid-write-lease-ttl'],
                created    : false,
                reentrant  : false,
                token      : null,
                acquisition: null,
                reclaimed  : []
            }
        }

        const reclaimed = this.sweepExpired(now);
        const {lockTable, granted, conflict, errors, created, reentrant, acquiredLock} =
            LockRegistry.acquire(this.locks, lock);

        if (!granted) {
            return {
                granted,
                conflict   : conflict ? copyLease(conflict) : null,
                errors,
                created,
                reentrant,
                token      : null,
                acquisition: null,
                reclaimed
            }
        }

        const lease = created
            ? {
                ...acquiredLock,
                token      : ++this.tokenSequence,
                acquiredAt : now,
                lastTouchAt: now,
                inFlight   : 0,
                // Once another operation re-enters this generation, the creator no longer has exclusive
                // authority to auto-release it on failure. TTL/disconnect remain the safe cleanup paths.
                shared     : false
            }
            : {...acquiredLock, lastTouchAt: now, shared: true};

        this.locks = lockTable.map(held => held === acquiredLock ? lease : held);

        return {
            granted,
            conflict   : null,
            errors,
            created,
            reentrant,
            token      : lease.token,
            acquisition: copyAcquisition(lease, created, reentrant),
            reclaimed
        }
    }

    /**
     * @summary Begin an admitted operation under its fenced acquisition and protect it from expiry.
     * @param {Object} acquisition Receipt returned by {@link requestWrite}.
     * @returns {{began: Boolean}}
     */
    beginWrite(acquisition) {
        const current = this.findCurrent(acquisition),
              now     = this.readNow();

        if (!current || now === null) {
            return {began: false}
        }

        this.replaceCurrent(current, {
            ...current,
            lastTouchAt: now,
            inFlight   : current.inFlight + 1
        });

        return {began: true}
    }

    /**
     * @summary End an admitted operation and apply acquisition-aware failure semantics.
     *
     * Successful operations retain the hold. Failed operations release only a lock newly created by this
     * acquisition when the caller proves `pre-mutation` or `rollback-complete`, no other operation remains
     * in flight, and the generation was never shared by re-entry. Re-entrant and unknown partial-mutation
     * failures retain the hold, emit a receipt, and become idle-TTL reclaimable. A stale token is a no-op
     * and cannot affect a successor generation.
     * @param {Object} acquisition Receipt returned by {@link requestWrite}.
     * @param {Object} [options={}]
     * @param {Boolean} [options.failed=false]
     * @param {'pre-mutation'|'rollback-complete'|'unknown'} [options.mutationDisposition='unknown']
     * @param {Error|String} [options.error]
     * @returns {{ended: Boolean, released: Boolean, retained: Boolean}}
     */
    endWrite(acquisition, {failed=false, mutationDisposition='unknown', error} = {}) {
        const current = this.findCurrent(acquisition);

        if (!current || current.inFlight < 1) {
            return {ended: false, released: false, retained: false}
        }

        const
            observedAt = this.readNow() ?? current.lastTouchAt,
            updated    = {
                ...current,
                lastTouchAt: observedAt,
                inFlight   : current.inFlight - 1
            },
            safeToRelease = failed && acquisition.created === true && updated.inFlight === 0 &&
                current.shared !== true &&
                (mutationDisposition === 'pre-mutation' || mutationDisposition === 'rollback-complete');

        this.replaceCurrent(current, updated);

        if (!failed) {
            return {ended: true, released: false, retained: true}
        }

        const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : null;

        if (safeToRelease) {
            this.locks = this.locks.filter(held => held !== updated);
            this.recordReceipt('error-release', updated, observedAt, {mutationDisposition, error: errorMessage});

            return {ended: true, released: true, retained: false}
        }

        this.recordReceipt('error-retained', updated, observedAt, {mutationDisposition, error: errorMessage});

        return {ended: true, released: false, retained: true}
    }

    /**
     * @summary Refresh the current generation only when the fenced token still matches.
     * @param {Object} acquisition Receipt returned by {@link requestWrite}.
     * @returns {{touched: Boolean}}
     */
    touchWrite(acquisition) {
        const current = this.findCurrent(acquisition),
              now     = this.readNow();

        if (!current || now === null) {
            return {touched: false}
        }

        this.replaceCurrent(current, {...current, lastTouchAt: now});

        return {touched: true}
    }

    /**
     * @summary Release one idle held generation with the exact acquisition token.
     *
     * Descriptor-only or stale-token calls are rejected; an in-flight operation is never explicitly
     * released through this path. Disconnect release remains separately authoritative.
     * @param {Object} acquisition Receipt returned by {@link requestWrite}.
     * @returns {{released: Boolean, reason: String|null}}
     */
    releaseWrite(acquisition) {
        const current = this.findCurrent(acquisition);

        if (!current) {
            return {released: false, reason: 'stale-token'}
        }
        if (current.inFlight > 0) {
            return {released: false, reason: 'in-flight'}
        }

        const observedAt = this.readNow() ?? current.lastTouchAt;

        this.locks = this.locks.filter(held => held !== current);
        this.recordReceipt('explicit-release', current, observedAt);

        return {released: true, reason: null}
    }

    /**
     * @summary Release every lock a writer holds — the immediate disconnect / worker-restart authority.
     * @param {Object} selector
     * @param {String} [selector.agentId]
     * @param {String} [selector.sessionId]
     * @returns {{released: Number}}
     */
    releaseAgent(selector) {
        const before                = this.locks;
        const {lockTable, released} = LockRegistry.releaseAll(before, selector);
        const observedAt            = this.readNow();

        this.locks = lockTable;

        if (released > 0) {
            before.filter(held => !lockTable.includes(held)).forEach(held => {
                this.recordReceipt('disconnect-release', held, observedAt ?? held.lastTouchAt)
            })
        }

        return {released}
    }

    /**
     * @summary Deep snapshot of currently-held leases after an inspection-time lazy sweep.
     * @returns {Object[]}
     */
    heldLocks() {
        const now = this.readNow();

        if (now !== null && this.hasValidTtl()) {
            this.sweepExpired(now)
        }

        return this.locks.map(copyLease)
    }

    /**
     * @summary Deep snapshot of the bounded independently inspectable lifecycle receipt ledger.
     * @returns {Object[]}
     */
    leaseReceipts() {
        const now = this.readNow();

        if (now !== null && this.hasValidTtl()) {
            this.sweepExpired(now)
        }

        return this.receiptLog.map(copyReceipt)
    }

    /**
     * @summary Read the injected clock without allowing a broken clock to mutate lease state.
     * @returns {Number|null}
     * @protected
     */
    readNow() {
        try {
            const now = this.nowFn();
            return Number.isFinite(now) ? now : null
        } catch {
            return null
        }
    }

    /**
     * @summary Whether the configured idle TTL can safely drive expiry.
     * @returns {Boolean}
     * @protected
     */
    hasValidTtl() {
        return Number.isFinite(this.leaseTtlMs) && this.leaseTtlMs > 0
    }

    /**
     * @summary Resolve a live lease only when descriptor and fenced token both match.
     * @param {Object} acquisition
     * @returns {Object|null}
     * @protected
     */
    findCurrent(acquisition) {
        const norm = LockRegistry.normalizeLock(acquisition);

        if (!norm || !Number.isInteger(acquisition?.token) || acquisition.token < 1) {
            return null
        }

        const key = LockRegistry.lockKey(norm);

        return this.locks.find(held => held.token === acquisition.token && LockRegistry.lockKey(held) === key) || null
    }

    /**
     * @summary Replace one live lease by object identity.
     * @param {Object} current
     * @param {Object} replacement
     * @protected
     */
    replaceCurrent(current, replacement) {
        this.locks = this.locks.map(held => held === current ? replacement : held)
    }

    /**
     * @summary Reclaim only idle expired generations and emit one receipt per reclaimed lease.
     * @param {Number} now
     * @returns {Object[]} Defensive expiry receipt copies.
     * @protected
     */
    sweepExpired(now) {
        const kept = [], reclaimed = [];

        this.locks.forEach(held => {
            const expired = held.inFlight === 0 && Number.isFinite(held.lastTouchAt) &&
                now - held.lastTouchAt >= this.leaseTtlMs;

            if (expired) {
                reclaimed.push(this.recordReceipt('expired', held, now))
            } else {
                kept.push(held)
            }
        });

        this.locks = kept;

        return reclaimed
    }

    /**
     * @summary Append a bounded lifecycle receipt without letting observability change a lock decision.
     * @param {String} reason
     * @param {Object} lease
     * @param {Number} observedAt
     * @param {Object} [details={}]
     * @returns {Object} Defensive receipt copy.
     * @protected
     */
    recordReceipt(reason, lease, observedAt, details = {}) {
        const receipt = {
            ...copyLease(lease),
            reason,
            observedAt,
            ...details
        };

        try {
            const limit = Number.isInteger(this.receiptLimit) && this.receiptLimit > 0 ? this.receiptLimit : 100;
            this.receiptLog = [...this.receiptLog, receipt].slice(-limit)
        } catch {
            // Observability failure must never alter the lock decision.
        }

        return copyReceipt(receipt)
    }
}

export default Neo.setupClass(WriteGuard);
