/**
 * @module ai/daemons/embed/drainLock
 * @summary Per-WAL-directory drain lock — the sole-drainer invariant, mechanically enforced.
 *
 * This module is now a THIN SPECIALIZATION of the shared file-lease core
 * (`ai/daemons/shared/fileLease.mjs`), keeping its original public API
 * (`acquireDrainLock`, `DrainLockHeldError`, `DRAIN_LOCK_FILENAME`) byte-compatible so the embed
 * daemon, the message drain wrapper, and the memory-core server's in-process loop consume it
 * unchanged.
 *
 * The drain lock keeps PID-liveness: its two mutually-exclusive hosts (the orchestrator-supervised
 * embed daemon and the in-process drain loop) are always SAME-namespace processes on one host, so
 * `process.kill(pid, 0)` is the correct probe here. Cross-namespace liveness (host vs Docker
 * container, where pid probes are blind) is the authority lease's TTL strategy — same core,
 * different injected `isHeldFresh`; see the core module's JSDoc.
 */

import {
    acquireFileLease,
    FileLeaseHeldError
} from '../shared/fileLease.mjs';

/**
 * Lock file name placed inside the WAL directory.
 * @type {String}
 */
export const DRAIN_LOCK_FILENAME = '.drain-lock';

const DEFAULT_LOCK_LABEL = 'WAL';
const DEFAULT_REMEDIATION =
    'Disable one drain host for this deployment — the embed daemon OR memoryWal.inProcessDrain.';

/**
 * Default same-namespace liveness probe: ESRCH → dead (reclaimable), EPERM → alive (must not
 * displace).
 * @param {Number} pid
 * @returns {Boolean}
 */
function defaultIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

/**
 * @summary Error thrown when the drain lock is already held by a DIFFERENT live host. Carries the
 * holder descriptor so the caller can fail loud with an actionable, holder-naming message.
 */
export class DrainLockHeldError extends Error {
    constructor({lockPath, holder, requester, lockLabel = DEFAULT_LOCK_LABEL, remediation = DEFAULT_REMEDIATION}) {
        const who = holder
            ? `${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
            : 'an unknown live process';

        super(`${lockLabel} drain lock ${lockPath} is held by ${who}; ${requester.owner} pid ${requester.pid} ` +
            'refuses to start a second drain loop on the same WAL directory (sole-drainer invariant). ' +
            remediation);

        this.name      = 'DrainLockHeldError';
        this.code      = 'DRAIN_LOCK_HELD';
        this.lockPath  = lockPath;
        this.holder    = holder;
        this.requester = requester;
    }
}

/**
 * @summary Atomically claims the drain lock for a WAL directory, enforcing single-host drain.
 * Specialization of {@link acquireFileLease} with the WAL filename, drain-specific refusal text,
 * and same-namespace pid-liveness.
 *
 * @param {Object}   options
 * @param {String}   options.dir       WAL directory (the resolved `memoryWal.dir` leaf).
 * @param {String}   options.owner     Host kind for diagnostics: `'daemon'` | `'in-process'`.
 * @param {Number}   [options.pid]     Owning pid (defaults to `process.pid`).
 * @param {Function} [options.now]     Clock (epoch ms) for `startedAt`. Defaults to `Date.now`.
 * @param {Object}   [options.fs]      Filesystem impl (injected for specs). Defaults to `fs-extra`.
 * @param {Function} [options.isAlive] Liveness probe `(pid) => boolean`. Defaults to a `process.kill` probe.
 * @param {Function} [options.log]     `(level, message)` sink. Defaults to a no-op.
 * @param {String}   [options.lockLabel] Human label for log/error lines.
 * @param {String}   [options.remediation] Operator guidance appended to the refusal.
 * @returns {{lockPath: String, pid: Number, owner: String, pulse: Function, release: Function}}
 * @throws {DrainLockHeldError} When a different live host already holds the lock.
 */
export function acquireDrainLock({
    dir,
    owner,
    pid        = process.pid,
    now        = Date.now,
    fs: fsImpl,
    isAlive    = defaultIsAlive,
    log        = () => {},
    lockLabel  = DEFAULT_LOCK_LABEL,
    remediation = DEFAULT_REMEDIATION
} = {}) {
    return acquireFileLease({
        dir,
        filename       : DRAIN_LOCK_FILENAME,
        owner,
        pid,
        now,
        fs             : fsImpl,
        log,
        isHeldFresh    : ({holder}) => isAlive(holder.pid),
        createHeldError: ({lockPath, holder, requester}) =>
            new DrainLockHeldError({lockPath, holder, requester, lockLabel, remediation})
    });
}
