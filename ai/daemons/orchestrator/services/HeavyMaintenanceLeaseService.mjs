import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';
import Neo    from '../../../../src/Neo.mjs';
import Base   from '../../../../src/core/Base.mjs';

export const DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH = '.neo-ai-data/orchestrator-daemon/heavy-maintenance-lease.json';
export const DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * @summary Converts supported time inputs into epoch milliseconds.
 *
 * @param {Date|Number|String} value Time input.
 * @returns {Number}
 */
export function toTimestamp(value) {
    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === 'number') {
        return value;
    }

    return new Date(value).getTime();
}

/**
 * @summary Checks whether a process id still has a live owner.
 *
 * `process.kill(pid, 0)` is the cross-platform Node probe for process existence.
 * `EPERM` still means a process exists but cannot be signalled by this user; only
 * `ESRCH` / invalid pid shapes are treated as dead. Used by lease inspection so
 * crashed orchestrator-owned maintenance tasks do not hold the mutex until the
 * long wall-clock TTL expires.
 *
 * @param {Number|String} pid Process id recorded in a lease payload.
 * @returns {Boolean}
 */
export function isPidAlive(pid) {
    const numericPid = Number(pid);

    if (!Number.isInteger(numericPid) || numericPid <= 0) {
        return false;
    }

    try {
        process.kill(numericPid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
}

/**
 * @summary Determines whether a persisted heavy-maintenance lease has expired.
 *
 * The stale check is intentionally payload-based instead of file-mtime-based so
 * copied or restored state keeps the owning task's declared deadline. This is the
 * shared recovery contract for daemon-owned and CLI-owned maintenance work.
 *
 * @param {Object|null} lease Persisted lease payload.
 * @param {Object} [options]
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Function} [options.isPidAlive=isPidAlive] Process liveness probe seam.
 * @returns {Boolean}
 */
export function isLeaseStale(lease, {now = new Date(), isPidAlive: isPidAliveFn = isPidAlive} = {}) {
    if (!lease || !lease.acquiredAt) {
        return true;
    }

    const nowMs = toTimestamp(now);

    if (!Number.isFinite(nowMs)) {
        return false;
    }

    if (lease.pid !== undefined && lease.pid !== null && typeof isPidAliveFn === 'function' && !isPidAliveFn(lease.pid)) {
        return true;
    }

    const expiresAtMs = lease.expiresAt ? toTimestamp(lease.expiresAt) : NaN;
    if (Number.isFinite(expiresAtMs)) {
        return nowMs >= expiresAtMs;
    }

    const acquiredAtMs = toTimestamp(lease.acquiredAt);
    const staleAfterMs = Number(lease.staleAfterMs);

    return !Number.isFinite(acquiredAtMs) || !Number.isFinite(staleAfterMs) || nowMs - acquiredAtMs >= staleAfterMs;
}

/**
 * @summary Builds the durable diagnostic payload for a heavy-maintenance lease.
 *
 * @param {Object} options
 * @param {String} options.owner Stable owner label.
 * @param {String} [options.reason='manual'] Acquisition reason.
 * @param {Object} [options.metadata={}] Diagnostic metadata.
 * @param {Number} [options.pid=process.pid] Owning process ID.
 * @param {Number} [options.staleAfterMs=DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS] Stale TTL.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {String} [options.token] Owner release token.
 * @returns {Object}
 */
export function buildLeasePayload({
    owner,
    reason       = 'manual',
    metadata     = {},
    pid          = process.pid,
    staleAfterMs = DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
    now          = new Date(),
    token        = crypto.randomUUID()
}) {
    const acquiredAt = new Date(toTimestamp(now));
    const expiresAt  = new Date(acquiredAt.getTime() + staleAfterMs);

    return {
        owner,
        reason,
        pid,
        token,
        acquiredAt: acquiredAt.toISOString(),
        staleAfterMs,
        expiresAt : expiresAt.toISOString(),
        metadata
    };
}

/**
 * @summary Reads and classifies the current heavy-maintenance lease file.
 *
 * @param {Object} [options]
 * @param {String} [options.leasePath=DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH] Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @returns {Promise<Object>}
 */
export async function inspectHeavyMaintenanceLease({
    leasePath = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    let raw;

    try {
        raw = await fsModule.readFile(leasePath, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            return {status: 'missing', active: false, stale: false, lease: null};
        }

        return {status: 'unreadable', active: false, stale: true, lease: null, error: e.message};
    }

    try {
        const lease = JSON.parse(raw);
        const stale = isLeaseStale(lease, {now, isPidAlive: isPidAliveFn});

        return {
            status: stale ? 'stale' : 'active',
            active: !stale,
            stale,
            lease
        };
    } catch (e) {
        return {status: 'malformed', active: false, stale: true, lease: null, error: e.message};
    }
}

async function writeLeaseFile(leasePath, lease, fsModule) {
    await fsModule.ensureDir(path.dirname(leasePath));
    await fsModule.writeFile(leasePath, JSON.stringify(lease, null, 2), {encoding: 'utf8', flag: 'wx'});
}

function writeLeaseFileSync(leasePath, lease, fsModule) {
    fsModule.ensureDirSync(path.dirname(leasePath));
    fsModule.writeFileSync(leasePath, JSON.stringify(lease, null, 2), {encoding: 'utf8', flag: 'wx'});
}

/**
 * @summary Synchronous overload of {@link inspectHeavyMaintenanceLease}.
 *
 * Provided for orchestrator-poll callers (`ai/daemons/Orchestrator.mjs#createMaintenanceExecutor`)
 * that must complete lease inspection within the synchronous poll cycle to preserve
 * test observability post-`orchestrator.poll()`. CLI scripts continue using the async
 * variant via `withHeavyMaintenanceLease`. Shares the same payload-shape and stale-check
 * contract as the async path — only the IO seam differs.
 *
 * @param {Object} [options] See {@link inspectHeavyMaintenanceLease}.
 * @returns {Object}
 */
export function inspectHeavyMaintenanceLeaseSync({
    leasePath = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    let raw;

    try {
        raw = fsModule.readFileSync(leasePath, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            return {status: 'missing', active: false, stale: false, lease: null};
        }

        return {status: 'unreadable', active: false, stale: true, lease: null, error: e.message};
    }

    try {
        const lease = JSON.parse(raw);
        const stale = isLeaseStale(lease, {now, isPidAlive: isPidAliveFn});

        return {
            status: stale ? 'stale' : 'active',
            active: !stale,
            stale,
            lease
        };
    } catch (e) {
        return {status: 'malformed', active: false, stale: true, lease: null, error: e.message};
    }
}

/**
 * @summary Synchronous overload of {@link acquireHeavyMaintenanceLease}.
 *
 * See {@link inspectHeavyMaintenanceLeaseSync} for the rationale. The contract
 * mirrors the async version exactly — same returned shapes, same stale-recovery
 * + malformed-recovery semantics, same `'held'` non-error deferral path. Only
 * the IO seam differs.
 *
 * @param {Object} options See {@link acquireHeavyMaintenanceLease}.
 * @returns {Object}
 */
export function acquireHeavyMaintenanceLeaseSync({
    owner,
    reason       = 'manual',
    metadata     = {},
    leasePath    = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule     = fs,
    now          = new Date(),
    pid          = process.pid,
    staleAfterMs = DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
    isPidAlive: isPidAliveFn = isPidAlive,
    token
} = {}) {
    if (!owner) {
        throw new Error('Heavy-maintenance lease owner is required.');
    }

    const lease = buildLeasePayload({owner, reason, metadata, pid, staleAfterMs, now, token});

    try {
        writeLeaseFileSync(leasePath, lease, fsModule);
        return {status: 'acquired', acquired: true, lease};
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }

    const current = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

    if (current.active) {
        return {status: 'held', acquired: false, lease: current.lease};
    }

    fsModule.removeSync(leasePath);

    try {
        writeLeaseFileSync(leasePath, lease, fsModule);
        return {
            status: current.status === 'malformed' ? 'acquired-after-malformed' : 'acquired-after-stale',
            acquired: true,
            previousStatus: current.status,
            lease
        };
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }

        const raced = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
        return {status: 'held', acquired: false, lease: raced.lease};
    }
}

/**
 * @summary Synchronous overload of {@link releaseHeavyMaintenanceLease}.
 *
 * @param {Object} options See {@link releaseHeavyMaintenanceLease}.
 * @returns {Object}
 */
export function releaseHeavyMaintenanceLeaseSync({
    token,
    leasePath = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for release.');
    }

    const current = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

    if (current.status === 'missing') {
        return {status: 'missing', released: false};
    }

    if (!current.lease || current.lease.token !== token) {
        return {status: 'not-owner', released: false, lease: current.lease};
    }

    fsModule.removeSync(leasePath);

    return {status: 'released', released: true, lease: current.lease};
}

/**
 * @summary Attempts to acquire the shared Agent OS heavy-maintenance lease.
 *
 * Normal contention returns a held status with active-owner metadata. It does
 * not throw because overlap prevention is a non-error deferral.
 *
 * @param {Object} options
 * @param {String} options.owner Stable owner label.
 * @param {String} [options.reason='manual'] Acquisition reason.
 * @param {Object} [options.metadata={}] Diagnostic metadata.
 * @param {String} [options.leasePath=DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH] Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Number} [options.pid=process.pid] Owning process ID.
 * @param {Number} [options.staleAfterMs=DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS] Stale TTL.
 * @param {String} [options.token] Owner release token.
 * @returns {Promise<Object>}
 */
export async function acquireHeavyMaintenanceLease({
    owner,
    reason       = 'manual',
    metadata     = {},
    leasePath    = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule     = fs,
    now          = new Date(),
    pid          = process.pid,
    staleAfterMs = DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
    isPidAlive: isPidAliveFn = isPidAlive,
    token
} = {}) {
    if (!owner) {
        throw new Error('Heavy-maintenance lease owner is required.');
    }

    const lease = buildLeasePayload({owner, reason, metadata, pid, staleAfterMs, now, token});

    try {
        await writeLeaseFile(leasePath, lease, fsModule);
        return {status: 'acquired', acquired: true, lease};
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }

    const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

    if (current.active) {
        return {status: 'held', acquired: false, lease: current.lease};
    }

    await fsModule.remove(leasePath);

    try {
        await writeLeaseFile(leasePath, lease, fsModule);
        return {
            status: current.status === 'malformed' ? 'acquired-after-malformed' : 'acquired-after-stale',
            acquired: true,
            previousStatus: current.status,
            lease
        };
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }

        const raced = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
        return {status: 'held', acquired: false, lease: raced.lease};
    }
}

/**
 * @summary Releases the shared heavy-maintenance lease when the token matches.
 *
 * @param {Object} options
 * @param {String} options.token Owner token returned by acquire.
 * @param {String} [options.leasePath=DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH] Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @returns {Promise<Object>}
 */
export async function releaseHeavyMaintenanceLease({
    token,
    leasePath = DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for release.');
    }

    const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

    if (current.status === 'missing') {
        return {status: 'missing', released: false};
    }

    if (!current.lease || current.lease.token !== token) {
        return {status: 'not-owner', released: false, lease: current.lease};
    }

    await fsModule.remove(leasePath);

    return {status: 'released', released: true, lease: current.lease};
}

/**
 * @summary Runs a task while holding the heavy-maintenance lease.
 *
 * Acquires the lease, runs `task` with the acquisition descriptor, then releases
 * the lease in a `finally` block — guaranteeing release even on task failure.
 * On `held` (lease already owned by another maintenance lane), returns the
 * acquisition descriptor without running the task — caller decides whether to
 * defer-exit or retry.
 *
 * ## ⚠️  Release-timing semantics (consumer-side correctness invariant)
 *
 * The lease is released in **this helper's own `finally` block** (the one that
 * wraps the `task` invocation below and calls `releaseHeavyMaintenanceLease`).
 * JavaScript await semantics guarantee the following ordering for the
 * `await withHeavyMaintenanceLease(...)` call site:
 *
 *   1. `task` body runs to completion (return OR throw)
 *   2. `task`'s own `finally` blocks run (if any)
 *   3. THIS helper's `finally` runs → `releaseHeavyMaintenanceLease` removes the lease file
 *   4. THIS helper's returned promise settles
 *   5. Caller's code AFTER `await withHeavyMaintenanceLease(...)` executes
 *
 * **Consequence:** any side effect placed in step 5 runs **OUTSIDE the lease window**.
 * If the side effect must be substrate-protected (Chroma write, SQLite mutation,
 * Memory Core graph edit, file lock, etc.), it MUST be inside the task — typically
 * inside the task's own `finally` so it runs regardless of task success/failure.
 *
 * This release-timing trap is the durable consumer-side invariant for callers that
 * need protected substrate mutation inside the lease window.
 *
 * ### ✅ Right shape — substrate mutation INSIDE the lease window
 *
 * ```js
 * await withHeavyMaintenanceLease(async () => {
 *     try {
 *         await runHeavyWork(); // primary task
 *     } finally {
 *         // Runs in step 2 above — lease still held.
 *         GraphService.decayGlobalTopology();
 *     }
 * }, {owner: 'sandman', reason: 'manual-cli'});
 * ```
 *
 * ### ❌ Wrong shape — substrate mutation AFTER the await runs OUTSIDE the lease
 *
 * ```js
 * await withHeavyMaintenanceLease(async () => {
 *     await runHeavyWork();
 * }, {owner: 'sandman', reason: 'manual-cli'});
 *
 * // BUG: lease was released in step 3 above; this graph mutation runs unprotected.
 * GraphService.decayGlobalTopology();
 * ```
 *
 * Canonical consumer reference: `ai/scripts/runners/runSandman.mjs`, which
 * delegates to `DreamService.executeRemCycle()` while the lease is still held.
 *
 * ## Returned shape (what callers of `await withHeavyMaintenanceLease(...)` see)
 *
 * The wrapper normalizes acquisition outcomes into ONE of these two shapes:
 *
 * | `status`      | `acquired` | `result` field    | Meaning                                                                      |
 * |---------------|------------|-------------------|------------------------------------------------------------------------------|
 * | `'completed'` | `true`     | the task's return | Lease acquired (including after stale/malformed recovery); task ran to completion (success or graceful-return). |
 * | `'inherited'` | `false`    | the task's return | Inherited via matching env-var token; lease was acquired by a parent process; task ran to completion. |
 * | `'held'`      | `false`    | absent            | Another active owner holds the lease; task NOT executed. `lease` carries that owner's descriptor. |
 *
 * Note: when `acquireHeavyMaintenanceLease` returns a non-`'acquired'` non-`'held'`
 * acquisition descriptor (e.g., an `'unreadable'` IO-failure shape — theoretical
 * edge case), the wrapper passes it through unchanged. Task exceptions propagate;
 * release still fires from the wrapper's `finally` (unless inherited).
 *
 * ### Acquisition descriptor passed to `task` (separate surface)
 *
 * The acquisition descriptor passed into `task(acquisition)` exposes internal
 * recovery telemetry NOT visible in the wrapper's return:
 *
 * | `acquisition.status`          | `previousStatus` | When it fires                                                |
 * |-------------------------------|------------------|--------------------------------------------------------------|
 * | `'acquired'`                  | absent           | Clean acquisition on a previously-missing lease.            |
 * | `'acquired-after-stale'`      | `'stale'`        | Prior owner's TTL expired; replaced atomically.             |
 * | `'acquired-after-malformed'`  | `'malformed'`    | Prior lease file was unparseable; replaced atomically.      |
 * | `'inherited'`                 | absent           | Clean inheritance of active parent lease.                   |
 *
 * Inspect `acquisition.previousStatus` inside `task` if you need to log/alert
 * on stale-recovery telemetry. From the wrapper-caller's perspective, all three
 * cases normalize to `{status: 'completed', acquired: true, ...}` (or inherited).
 *
 * @param {Function} task Async task to execute when the lease is acquired. Receives the acquisition descriptor as its single argument (`{status, acquired, lease}`).
 * @param {Object} options Lease acquisition options forwarded to `acquireHeavyMaintenanceLease` (owner, reason, metadata, leasePath, staleAfterMs, pid, token, fsModule, now).
 * @returns {Promise<Object>} `{status, acquired, lease, result}` on completion; `{status: 'held', acquired: false, lease}` on contention.
 * @see acquireHeavyMaintenanceLease
 * @see releaseHeavyMaintenanceLease
 * @see ai/scripts/runners/runSandman.mjs — canonical consumer pattern
 */
export async function withHeavyMaintenanceLease(task, options = {}) {
    const inheritedToken = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;

    if (inheritedToken) {
        const current = await inspectHeavyMaintenanceLease({
            leasePath: options.leasePath,
            fsModule : options.fsModule,
            now      : options.now,
            isPidAlive: options.isPidAlive
        });

        if (current.active && current.lease && current.lease.token === inheritedToken) {
            const acquisition = {status: 'inherited', acquired: false, lease: current.lease};
            return {
                status: 'inherited',
                acquired: false,
                lease : current.lease,
                result: await task(acquisition)
            };
        }
    }

    const acquisition = await acquireHeavyMaintenanceLease(options);

    if (!acquisition.acquired) {
        return acquisition;
    }

    try {
        return {
            status: 'completed',
            acquired: true,
            lease : acquisition.lease,
            result: await task(acquisition)
        };
    } finally {
        await releaseHeavyMaintenanceLease({
            token    : acquisition.lease.token,
            leasePath: options.leasePath,
            fsModule : options.fsModule,
            now      : options.now,
            isPidAlive: options.isPidAlive
        });
    }
}

/**
 * @summary Shared lease service for Agent OS substrate-heavy maintenance work.
 *
 * The service is the reusable mutex contract between orchestrator-owned tasks
 * and operator-runnable CLI scripts. It prevents Chroma / SQLite / LLM
 * maintenance lanes from overlapping across process boundaries while preserving
 * non-error deferral semantics for expected contention.
 *
 * @class Neo.ai.daemons.services.HeavyMaintenanceLeaseService
 * @extends Neo.core.Base
 * @singleton
 */
export class HeavyMaintenanceLeaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.HeavyMaintenanceLeaseService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.HeavyMaintenanceLeaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} leasePath_='.neo-ai-data/orchestrator-daemon/heavy-maintenance-lease.json'
         * @protected
         * @reactive
         */
        leasePath_: DEFAULT_HEAVY_MAINTENANCE_LEASE_PATH,
        /**
         * @member {Number} staleAfterMs_=21600000
         * @protected
         * @reactive
         */
        staleAfterMs_: DEFAULT_HEAVY_MAINTENANCE_LEASE_TTL_MS,
        /**
         * @member {Object} fsModule_=fs
         * @protected
         * @reactive
         */
        fsModule_: fs
    }

    /**
     * Inspects the current lease file.
     * @param {Object} [options] Inspect overrides.
     * @returns {Promise<Object>}
     */
    inspect(options = {}) {
        return inspectHeavyMaintenanceLease({
            leasePath: options.leasePath ?? this.leasePath,
            fsModule : options.fsModule  ?? this.fsModule,
            now      : options.now       ?? new Date(),
            isPidAlive: options.isPidAlive
        });
    }

    /**
     * Acquires the current lease when no active owner exists.
     * @param {Object} options Acquisition options.
     * @returns {Promise<Object>}
     */
    acquire(options = {}) {
        return acquireHeavyMaintenanceLease({
            ...options,
            leasePath   : options.leasePath    ?? this.leasePath,
            fsModule    : options.fsModule     ?? this.fsModule,
            staleAfterMs: options.staleAfterMs ?? this.staleAfterMs
        });
    }

    /**
     * Releases the current lease if the token matches.
     * @param {Object} options Release options.
     * @returns {Promise<Object>}
     */
    release(options = {}) {
        return releaseHeavyMaintenanceLease({
            ...options,
            leasePath: options.leasePath ?? this.leasePath,
            fsModule : options.fsModule  ?? this.fsModule
        });
    }

    /**
     * Runs an async task while holding the heavy-maintenance lease.
     * @param {Function} task Async task to execute.
     * @param {Object} options Lease options.
     * @returns {Promise<Object>}
     */
    withLease(task, options = {}) {
        return withHeavyMaintenanceLease(task, {
            ...options,
            leasePath   : options.leasePath    ?? this.leasePath,
            fsModule    : options.fsModule     ?? this.fsModule,
            staleAfterMs: options.staleAfterMs ?? this.staleAfterMs
        });
    }
}

export default Neo.setupClass(HeavyMaintenanceLeaseService);
