import crypto                                 from 'crypto';
import fs                                     from 'fs-extra';
import os                                     from 'node:os';
import path                                   from 'path';
import {writeFileAtomic, writeFileAtomicSync} from '../../../services/shared/atomicFileWrite.mjs';
import {
    enterLifecycleGuard,
    enterLifecycleGuardSync,
    exitLifecycleGuard,
    exitLifecycleGuardSync,
    LIFECYCLE_GUARD_SUFFIX,
    lifecycleGuardPath,
    verifyLifecycleGuardOwnership,
    verifyLifecycleGuardOwnershipSync
} from '../../shared/lifecycleGuard.mjs';

export {LIFECYCLE_GUARD_SUFFIX};

/**
 * @summary Captures this Node process start once so a reused PID cannot make a lease from the
 * previous process epoch look live after a container restart.
 *
 * @type {Number}
 */
const CURRENT_PROCESS_STARTED_AT = Date.now() - process.uptime() * 1000;

/**
 * @summary Resolves the shared heavy-maintenance lease path without importing Agent OS config.
 *
 * The explicit lease-path override wins and is preserved as caller-owned input for compatibility.
 * Otherwise the caller must inject an absolute orchestrator data directory. Keeping this helper
 * config-free lets subprocess consumers use the primitives without creating a second AiConfig
 * resolution path or deriving placement from the current working directory.
 *
 * @param {Object} options
 * @param {String|null|undefined} [options.leasePath] Explicit lease-file override.
 * @param {String|null|undefined} [options.dataDir] Resolved orchestrator data directory.
 * @returns {String}
 */
export function resolveHeavyMaintenanceLeasePath({leasePath, dataDir} = {}) {
    if (leasePath) return leasePath;

    if (typeof dataDir !== 'string' || !dataDir.trim() || !path.isAbsolute(dataDir)) {
        throw new TypeError(
            'resolveHeavyMaintenanceLeasePath: leasePath or an absolute dataDir is required — inject the resolved ' +
            'AiConfig.orchestrator.dataDir at the AiConfig-aware boundary; this pure primitive carries no cwd-relative default.'
        );
    }

    return path.join(dataDir, 'heavy-maintenance-lease.json');
}

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
 * Discrimination is layered, most-external first: a lease from a DIFFERENT boot
 * (`bootId` mismatch — a container recreate changes the hostname, which is the
 * container ID) is stale regardless of pid liveness, because pid 1 is vacuously
 * alive inside every container boot and a dead epoch's lease would otherwise read
 * live forever. Within one boot, the process-epoch and pid-liveness checks below
 * discriminate. Pre-`bootId` payloads skip the boot clause unchanged — absent
 * evidence is not a stale verdict.
 *
 * @param {Object|null} lease Persisted lease payload.
 * @param {Object} [options]
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Function} [options.isPidAlive=isPidAlive] Process liveness probe seam.
 * @param {Number|String} [options.currentPid=process.pid] Current process id seam.
 * @param {Date|Number|String} [options.currentProcessStartedAt] Current process start seam.
 * @param {String} [options.currentBootId=os.hostname()] Current boot discriminator seam.
 * @returns {Boolean}
 */
export function isLeaseStale(lease, {
    now                     = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive,
    currentPid              = process.pid,
    currentProcessStartedAt = CURRENT_PROCESS_STARTED_AT,
    currentBootId           = os.hostname()
} = {}) {
    if (!lease || !lease.acquiredAt) {
        return true;
    }

    // Cross-boot discrimination FIRST: a lease written by a different boot (container recreate,
    // machine restart) belongs to a dead epoch no matter what the pid probe says — inside a
    // container, pid 1 is alive on every boot, so liveness alone is vacuous there.
    if (typeof lease.bootId === 'string' && lease.bootId.length > 0 && lease.bootId !== currentBootId) {
        return true;
    }

    const acquiredAtMs              = toTimestamp(lease.acquiredAt),
          currentProcessStartedAtMs = toTimestamp(currentProcessStartedAt),
          nowMs                     = toTimestamp(now);

    if (!Number.isFinite(nowMs)) {
        return false;
    }

    // PID namespaces commonly restart the orchestrator as PID 1. A liveness
    // probe alone therefore sees the NEW PID 1 and mistakes the previous
    // process epoch's persisted lease for a live holder. The process-start
    // boundary distinguishes those epochs without changing the payload shape.
    // Historical inspections whose logical `now` predates this process start
    // deliberately skip the live-process comparison.
    if (
        Number(lease.pid) === Number(currentPid) &&
        Number.isFinite(acquiredAtMs) &&
        Number.isFinite(currentProcessStartedAtMs) &&
        nowMs >= currentProcessStartedAtMs &&
        acquiredAtMs < currentProcessStartedAtMs
    ) {
        return true;
    }

    if (lease.pid !== undefined && lease.pid !== null && typeof isPidAliveFn === 'function' && !isPidAliveFn(lease.pid)) {
        return true;
    }

    const expiresAtMs = lease.expiresAt ? toTimestamp(lease.expiresAt) : NaN;
    if (Number.isFinite(expiresAtMs)) {
        return nowMs >= expiresAtMs;
    }

    const staleAfterMs = Number(lease.staleAfterMs);

    return !Number.isFinite(acquiredAtMs) || !Number.isFinite(staleAfterMs) || nowMs - acquiredAtMs >= staleAfterMs;
}

/**
 * @summary Decides whether a live, long-running heavy-maintenance task should cooperatively yield its lease.
 *
 * Distinct from {@link isLeaseStale}, which governs dead-holder reclamation via
 * `staleAfterMs`: this governs the ACTIVE hold of a *live* task. A long task
 * (e.g. a multi-session summary that loops the whole pending backlog in one
 * hold) polls this between work units; when it returns `true` the task returns
 * early, releasing the single heavy-maintenance lease so an overdue peer (e.g.
 * `dream`, whose window would otherwise arrive hours late) can interleave. The
 * next periodic sweep re-acquires for the remaining work. The mutex stays
 * correct — this only bounds how long one task may monopolize it.
 *
 * Pure + read-only: never mutates the lease or touches the release path. The
 * value of `maxActiveHoldMs` is policy (the fairness Decision Record),
 * supplied by the calling task — this helper is the value-agnostic mechanism.
 *
 * Fail-safe: a falsy/non-positive `maxActiveHoldMs` (the unset knob) returns
 * `false`, so behavior is byte-identical to today until a caller opts in; a
 * missing lease or unparseable timestamp also returns `false` — never abandon
 * work on bad input.
 *
 * @param {Object|null} lease Persisted lease payload (reads `acquiredAt`).
 * @param {Object} [options]
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Number} [options.maxActiveHoldMs] Bounded active-hold budget in ms; falsy ⇒ never yields (back-compat).
 * @returns {Boolean} `true` only when the active hold has exceeded `maxActiveHoldMs`.
 */
export function shouldYieldHeavyMaintenanceLease(lease, {now = new Date(), maxActiveHoldMs} = {}) {
    if (!lease || !lease.acquiredAt) {
        return false;
    }

    const maxHoldMs = Number(maxActiveHoldMs);

    if (!Number.isFinite(maxHoldMs) || maxHoldMs <= 0) {
        return false;
    }

    const acquiredAtMs = toTimestamp(lease.acquiredAt);
    const nowMs        = toTimestamp(now);

    if (!Number.isFinite(acquiredAtMs) || !Number.isFinite(nowMs)) {
        return false;
    }

    return nowMs - acquiredAtMs > maxHoldMs;
}

/**
 * @summary Builds the durable diagnostic payload for a heavy-maintenance lease.
 *
 * @param {Object} options
 * @param {String} options.owner Stable owner label.
 * @param {String} [options.reason='manual'] Acquisition reason.
 * @param {Object} [options.metadata={}] Diagnostic metadata.
 * @param {Number} [options.pid=process.pid] Owning process ID.
 * @param {Number} options.staleAfterMs Stale TTL in ms — REQUIRED; resolved from AiConfig at the boundary (no primitive default).
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {String} [options.token] Owner release token.
 * @param {String} [options.bootId=os.hostname()] Boot discriminator — the container's hostname is
 *     its container ID, which changes on recreate, so a dead epoch's lease can never read as
 *     belonging to the new boot. Additive: pre-field payloads are unaffected (see isLeaseStale).
 * @returns {Object}
 */
export function buildLeasePayload({
    owner,
    reason       = 'manual',
    metadata     = {},
    pid          = process.pid,
    staleAfterMs,
    now          = new Date(),
    token        = crypto.randomUUID(),
    bootId       = os.hostname()
}) {
    if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
        throw new TypeError('buildLeasePayload: staleAfterMs (positive ms) is required — resolve it from AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs at the AiConfig-aware boundary; this Neo/Base-free primitive carries no TTL default by design.');
    }

    const acquiredAt = new Date(toTimestamp(now));
    const expiresAt  = new Date(acquiredAt.getTime() + staleAfterMs);

    return {
        owner,
        reason,
        pid,
        token,
        bootId,
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
 * @param {String} options.leasePath Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @returns {Promise<Object>}
 */
export async function inspectHeavyMaintenanceLease({
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

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
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

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
    leasePath,
    fsModule     = fs,
    now          = new Date(),
    pid          = process.pid,
    staleAfterMs,
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive,
    token
} = {}) {
    if (!owner) {
        throw new Error('Heavy-maintenance lease owner is required.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

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

    // Guarded recovery — sync mirror of the async contract above: mutate only on
    // a fresh re-inspection taken INSIDE the lifecycle guard.
    const guardEntry = enterLifecycleGuardSync({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        const raced = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
        return {status: 'held', acquired: false, guardContended: true, lease: raced.lease};
    }

    try {
        const reinspect = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (reinspect.active) {
            return {status: 'held', acquired: false, lease: reinspect.lease};
        }

        if (reinspect.status !== 'missing') {
            if (!verifyLifecycleGuardOwnershipSync({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
                const raced = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
                return {status: 'held', acquired: false, guardEvicted: true, lease: raced.lease};
            }

            try {
                fsModule.unlinkSync(leasePath);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
        }

        try {
            writeLeaseFileSync(leasePath, lease, fsModule);
        } catch (e) {
            if (e.code !== 'EEXIST') {
                throw e;
            }

            const raced = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
            return {status: 'held', acquired: false, lease: raced.lease};
        }

        return reinspect.status === 'missing'
            ? {status: 'acquired', acquired: true, lease}
            : {
                status        : reinspect.status === 'malformed' ? 'acquired-after-malformed' : 'acquired-after-stale',
                acquired      : true,
                previousStatus: reinspect.status,
                lease
            };
    } finally {
        exitLifecycleGuardSync({ownerFilePath: guardEntry.ownerFilePath, fsModule});
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
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for release.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

    const guardEntry = enterLifecycleGuardSync({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        throw new Error(`Heavy-maintenance lease release could not enter the lifecycle guard: ${lifecycleGuardPath(leasePath)}`);
    }

    try {
        const current = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (current.status === 'missing') {
            return {status: 'missing', released: false};
        }

        if (!current.lease || current.lease.token !== token) {
            return {status: 'not-owner', released: false, lease: current.lease};
        }

        if (!verifyLifecycleGuardOwnershipSync({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
            return {status: 'not-owner', released: false, guardEvicted: true, lease: current.lease};
        }

        fsModule.removeSync(leasePath);

        return {status: 'released', released: true, lease: current.lease};
    } finally {
        exitLifecycleGuardSync({ownerFilePath: guardEntry.ownerFilePath, fsModule});
    }
}

/**
 * @summary Synchronous overload of {@link renewHeavyMaintenanceLease}.
 *
 * @param {Object} options See {@link renewHeavyMaintenanceLease}.
 * @returns {Object}
 */
export function renewHeavyMaintenanceLeaseSync({
    token,
    staleAfterMs,
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for renewal.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

    if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
        throw new TypeError('renewHeavyMaintenanceLeaseSync: staleAfterMs (positive ms) is required — resolve it from AiConfig at the boundary; this Neo/Base-free primitive carries no TTL default by design.');
    }

    const guardEntry = enterLifecycleGuardSync({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        throw new Error(`Heavy-maintenance lease renewal could not enter the lifecycle guard: ${lifecycleGuardPath(leasePath)}`);
    }

    try {
        const current = inspectHeavyMaintenanceLeaseSync({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (current.status === 'missing') {
            return {status: 'missing', renewed: false};
        }

        if (!current.lease || current.lease.token !== token) {
            return {status: 'not-owner', renewed: false, lease: current.lease};
        }

        if (!verifyLifecycleGuardOwnershipSync({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
            return {status: 'not-owner', renewed: false, guardEvicted: true, lease: current.lease};
        }

        const nowMs   = toTimestamp(now);
        const renewed = {
            ...current.lease,
            staleAfterMs,
            renewedAt: new Date(nowMs).toISOString(),
            expiresAt: new Date(nowMs + staleAfterMs).toISOString()
        };

        // `fsync: true` is load-bearing, not decoration: a lease that survives a crash as a stale
        // renewal is how two holders end up believing they own the same lease. The scratch was
        // `${leasePath}.renew-tmp-${pid}` — unique per process but not per renewal attempt.
        writeFileAtomicSync(leasePath, JSON.stringify(renewed, null, 2), {fsModule, fsync: true});

        return {status: 'renewed', renewed: true, lease: renewed};
    } finally {
        exitLifecycleGuardSync({ownerFilePath: guardEntry.ownerFilePath, fsModule});
    }
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
 * @param {String} options.leasePath Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Number} [options.pid=process.pid] Owning process ID.
 * @param {Number} options.staleAfterMs Stale TTL in ms — REQUIRED; resolved from AiConfig at the boundary (no primitive default).
 * @param {Number} [options.guardStaleAfterMs] Lifecycle-guard crash-recovery age override (stale/malformed recovery only).
 * @param {String} [options.token] Owner release token.
 * @returns {Promise<Object>}
 */
export async function acquireHeavyMaintenanceLease({
    owner,
    reason       = 'manual',
    metadata     = {},
    leasePath,
    fsModule     = fs,
    now          = new Date(),
    pid          = process.pid,
    staleAfterMs,
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive,
    token
} = {}) {
    if (!owner) {
        throw new Error('Heavy-maintenance lease owner is required.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

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

    // Guarded recovery. The pre-guard stale observation above is only an
    // admission ticket: a peer may legitimately replace, renew, or release the
    // lease at any moment after it. Every mutation therefore acts exclusively
    // on the fresh re-inspection taken INSIDE the lifecycle guard, re-proves
    // live guard ownership immediately before mutating, and the guard
    // serializes recovery against release and renewal. An outside plain
    // acquirer winning the unlink→create window is deferred to via EEXIST.
    const guardEntry = await enterLifecycleGuard({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        const raced = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
        return {status: 'held', acquired: false, guardContended: true, lease: raced.lease};
    }

    try {
        const reinspect = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (reinspect.active) {
            return {status: 'held', acquired: false, lease: reinspect.lease};
        }

        if (reinspect.status !== 'missing') {
            if (!await verifyLifecycleGuardOwnership({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
                const raced = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
                return {status: 'held', acquired: false, guardEvicted: true, lease: raced.lease};
            }

            try {
                await fsModule.unlink(leasePath);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
        }

        try {
            await writeLeaseFile(leasePath, lease, fsModule);
        } catch (e) {
            if (e.code !== 'EEXIST') {
                throw e;
            }

            const raced = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});
            return {status: 'held', acquired: false, lease: raced.lease};
        }

        return reinspect.status === 'missing'
            ? {status: 'acquired', acquired: true, lease}
            : {
                status        : reinspect.status === 'malformed' ? 'acquired-after-malformed' : 'acquired-after-stale',
                acquired      : true,
                previousStatus: reinspect.status,
                lease
            };
    } finally {
        await exitLifecycleGuard({ownerFilePath: guardEntry.ownerFilePath, fsModule});
    }
}

/**
 * @summary Releases the shared heavy-maintenance lease when the token matches.
 *
 * @param {Object} options
 * @param {String} options.token Owner token returned by acquire.
 * @param {String} options.leasePath Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Number} [options.guardStaleAfterMs] Lifecycle-guard crash-recovery age override.
 * @returns {Promise<Object>}
 */
export async function releaseHeavyMaintenanceLease({
    token,
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for release.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

    // Token validation and removal execute inside ONE guarded section: a
    // replacement owner appearing between an unguarded check and the unlink can
    // no longer be removed by the outgoing owner's release.
    const guardEntry = await enterLifecycleGuard({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        throw new Error(`Heavy-maintenance lease release could not enter the lifecycle guard: ${lifecycleGuardPath(leasePath)}`);
    }

    try {
        const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (current.status === 'missing') {
            return {status: 'missing', released: false};
        }

        if (!current.lease || current.lease.token !== token) {
            return {status: 'not-owner', released: false, lease: current.lease};
        }

        if (!await verifyLifecycleGuardOwnership({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
            return {status: 'not-owner', released: false, guardEvicted: true, lease: current.lease};
        }

        await fsModule.remove(leasePath);

        return {status: 'released', released: true, lease: current.lease};
    } finally {
        await exitLifecycleGuard({ownerFilePath: guardEntry.ownerFilePath, fsModule});
    }
}

/**
 * @summary Extends the current owner's lease deadline without changing ownership.
 *
 * The work-level half of the exclusivity contract: `isLeaseStale` classifies a
 * live process as expired the moment its deadline passes, so any owner whose
 * work can outlive `staleAfterMs` MUST renew periodically while working. A
 * renewing live owner never reaches its deadline, which is what makes
 * "live expiry starts overlapping work" structurally impossible instead of
 * merely unlikely. Renewal failure (`renewed: false` or a thrown IO error)
 * means ownership is no longer provable — the caller must stop starting new
 * protected work and abort at its next fence.
 *
 * Runs inside the lifecycle guard: verification and rewrite cannot interleave
 * with a recovery or release. The rewrite is full-write + fsync + atomic
 * rename, so readers outside the guard never observe a partial payload and the
 * canonical name never goes absent mid-renewal.
 *
 * @param {Object} options
 * @param {String} options.token Owner token returned by acquire.
 * @param {Number} options.staleAfterMs Renewed TTL in ms — REQUIRED; resolved from AiConfig at the boundary (no primitive default).
 * @param {String} options.leasePath Lease file path.
 * @param {Object} [options.fsModule=fs] File-system implementation seam.
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @param {Number} [options.guardStaleAfterMs] Lifecycle-guard crash-recovery age override.
 * @returns {Promise<Object>} `{status: 'renewed', renewed: true, lease}` on success; `{status: 'missing'|'not-owner', renewed: false}` when ownership is not provable.
 */
export async function renewHeavyMaintenanceLease({
    token,
    staleAfterMs,
    leasePath,
    fsModule  = fs,
    now       = new Date(),
    guardStaleAfterMs,
    isPidAlive: isPidAliveFn = isPidAlive
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for renewal.');
    }

    leasePath = resolveHeavyMaintenanceLeasePath({leasePath});

    if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
        throw new TypeError('renewHeavyMaintenanceLease: staleAfterMs (positive ms) is required — resolve it from AiConfig at the boundary; this Neo/Base-free primitive carries no TTL default by design.');
    }

    const guardEntry = await enterLifecycleGuard({leasePath, fsModule, guardStaleAfterMs});

    if (!guardEntry) {
        throw new Error(`Heavy-maintenance lease renewal could not enter the lifecycle guard: ${lifecycleGuardPath(leasePath)}`);
    }

    try {
        const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now, isPidAlive: isPidAliveFn});

        if (current.status === 'missing') {
            return {status: 'missing', renewed: false};
        }

        if (!current.lease || current.lease.token !== token) {
            return {status: 'not-owner', renewed: false, lease: current.lease};
        }

        if (!await verifyLifecycleGuardOwnership({ownerFilePath: guardEntry.ownerFilePath, fsModule})) {
            return {status: 'not-owner', renewed: false, guardEvicted: true, lease: current.lease};
        }

        const nowMs   = toTimestamp(now);
        const renewed = {
            ...current.lease,
            staleAfterMs,
            renewedAt: new Date(nowMs).toISOString(),
            expiresAt: new Date(nowMs + staleAfterMs).toISOString()
        };

        // Async twin of the sync renewal: same durability requirement, same reason. The injected
        // fsModule here is fd-style (`open` -> fd, `fsync(fd)`), which the primitive's flush handles.
        await writeFileAtomic(leasePath, JSON.stringify(renewed, null, 2), {fsModule, fsync: true});

        return {status: 'renewed', renewed: true, lease: renewed};
    } finally {
        await exitLifecycleGuard({ownerFilePath: guardEntry.ownerFilePath, fsModule});
    }
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
 * EXCEPTION — the stale **inherited-token** case is the one recovery signal that IS
 * surfaced to the wrapper-caller (as `previousStatus: 'inherited-token-stale'` on the
 * return, per @returns below). A lost inheritance must never be misread as success, so
 * unlike the internal stale/malformed recovery above it is promoted to a first-class
 * return marker — not internal-only telemetry.
 *
 * @param {Function} task Async task to execute when the lease is acquired. Receives the acquisition descriptor as its single argument (`{status, acquired, lease}`).
 * @param {Object} options Lease acquisition options forwarded to `acquireHeavyMaintenanceLease` (owner, reason, metadata, leasePath, staleAfterMs, pid, token, fsModule, now).
 * @param {String} [options.leasePath] Explicit lease-file path. Required for this config-free primitive; config-aware callers resolve it from the active orchestrator `dataDir`.
 * @param {Function} [options.onInheritedTokenStale] Observability hook fired once when this child inherited a token (`NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`) but the live lease no longer carries it (the parent released before the child checked). Default: a stderr warn (`warnInheritedTokenStale`) — a deliberately loud default, because per-caller wiring across the 6+ maintenance callers is the exact discipline whose lapse caused the original silent-skip regression; override with a no-op for silence. The deferral is ALSO surfaced structurally via the `previousStatus` return marker below, independent of this hook.
 * @returns {Promise<Object>} `{status, acquired, lease, result}` on completion; `{status: 'held', acquired: false, lease}` on contention. When a set inherited token was found stale, the return additionally carries `previousStatus: 'inherited-token-stale'` (on either the held or completed shape) — the structural guarantee that a lost-inheritance deferral can never be misread as an ordinary success.
 * @see acquireHeavyMaintenanceLease
 * @see releaseHeavyMaintenanceLease
 * @see ai/scripts/runners/runSandman.mjs — canonical consumer pattern
 */
export async function withHeavyMaintenanceLease(task, options = {}) {
    const inheritedToken      = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
    let   inheritedTokenStale = false;

    if (inheritedToken) {
        const current = await inspectHeavyMaintenanceLease({
            leasePath : options.leasePath,
            fsModule  : options.fsModule,
            now       : options.now,
            isPidAlive: options.isPidAlive
        });

        if (current.active && current.lease && current.lease.token === inheritedToken) {
            const acquisition = {status: 'inherited', acquired: false, lease: current.lease};
            return {
                status  : 'inherited',
                acquired: false,
                lease   : current.lease,
                result  : await task(acquisition)
            };
        }

        // Inherited token set but STALE: the parent released its lease before this child checked. The
        // child was approved to run under inheritance, so the fall-through below must never be a silent
        // skip — a 'held' result masked as "completed" is what stalled kb-sync embedding for days.
        // Surface it (hook + a distinct previousStatus) so callers can never mistake an inherited-but-lost
        // deferral for success. The acquire-or-defer itself is unchanged — the mutex is preserved.
        // The hook DEFAULTS to a loud stderr warn (not a no-op): with 6+ maintenance callers, a no-op
        // default + per-caller opt-in is the fragile discipline whose lapse caused the original silent-skip
        // regression — loud-by-default is the safer floor. The `previousStatus` return marker is the
        // hook-independent structural guarantee.
        inheritedTokenStale = true;
        (options.onInheritedTokenStale ?? warnInheritedTokenStale)({inheritedToken, current});
    }

    const acquisition = await acquireHeavyMaintenanceLease(options);

    if (!acquisition.acquired) {
        return inheritedTokenStale ? {...acquisition, previousStatus: 'inherited-token-stale'} : acquisition;
    }

    try {
        return {
            status  : 'completed',
            acquired: true,
            lease   : acquisition.lease,
            ...(inheritedTokenStale && {previousStatus: 'inherited-token-stale'}),
            result: await task(acquisition)
        };
    } finally {
        await releaseHeavyMaintenanceLease({
            token     : acquisition.lease.token,
            leasePath : options.leasePath,
            fsModule  : options.fsModule,
            now       : options.now,
            isPidAlive: options.isPidAlive
        });
    }
}

/**
 * @summary Default observability for a stale inherited heavy-maintenance lease token.
 *
 * Fires when a child was spawned with `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN` but the live lease
 * no longer carries that token (the parent released it before the child checked). The child was approved
 * to run under inheritance; without this signal the subsequent acquire-or-defer can end in a silent skip
 * masked as "completed". Override via `options.onInheritedTokenStale` (tests inject a spy).
 *
 * @param {Object} info
 * @param {String} info.inheritedToken The stale token the child inherited.
 * @param {Object} info.current Current lease inspection result.
 * @returns {void}
 */
function warnInheritedTokenStale({inheritedToken, current}) {
    console.warn(
        '[HeavyMaintenanceLeaseService] inherited lease token is stale (parent released before child ' +
        'checked) — falling through to self-acquire; a deferral here is observable, not a silent skip. ' +
        `tokenPrefix=${String(inheritedToken).slice(0, 8)} currentOwner=${current?.lease?.owner ?? 'none'} ` +
        `currentStatus=${current?.status ?? 'none'}`
    );
}
