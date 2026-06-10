/**
 * @module ai/daemons/embed/drainLock
 * @summary Per-WAL-directory drain lock that mechanically enforces the sole-drainer invariant.
 *
 * The WAL drain has two mutually-exclusive host modes — the orchestrator-supervised embed daemon
 * (`ai/daemons/embed/daemon.mjs`, local profile) and the in-process loop inside the memory-core
 * server (`memoryWal.inProcessDrain`, containerized / single-process deployments). The purge-race
 * compensation in `./drainCycle.mjs` is only correct while exactly ONE loop drains a given WAL
 * directory: each loop reads "a marker I didn't write" as a purge tombstone, so two concurrent
 * loops would interpret each other's embed markers as tombstones and issue spurious
 * `collection.delete`s against legitimately-embedded memories — a silent integrity failure.
 *
 * That invariant was previously only config-DECLARED (mutually-exclusive default profiles + JSDoc).
 * This module makes it mechanically ENFORCED: whichever host starts first claims an atomic
 * `<dir>/.drain-lock`; a second LIVE host refuses and fails loud — it does NOT take over (the
 * daemon's PID-takeover stays scoped to daemon-vs-daemon succession; pointing it at the memory-core
 * server process would kill the server). A dead holder's lock is reclaimed as stale via a
 * `process.kill(pid, 0)` liveness probe, so a crashed host never wedges the drain.
 *
 * Pure + fully injectable (fs, clock, liveness probe, log) — the daemon and the server own the
 * process-lifecycle wiring (acquire-at-boot, release-on-shutdown); this module owns only the atomic
 * claim / refuse / reclaim / release decision, unit-tested against a real temp directory.
 *
 * The lock file does not match the `wal-<day>.jsonl` pattern `listWalSegmentKeys` filters on, so it
 * never pollutes WAL segment enumeration despite living inside the WAL directory.
 */

import fs   from 'fs-extra';
import path from 'path';

/**
 * Lock file name placed inside the WAL directory.
 * @type {String}
 */
export const DRAIN_LOCK_FILENAME = '.drain-lock';

/**
 * @summary Error thrown when the drain lock is already held by a DIFFERENT live host. Carries the
 * holder descriptor so the caller can fail loud with an actionable, holder-naming message.
 */
export class DrainLockHeldError extends Error {
    constructor({lockPath, holder, requester}) {
        const who = holder
            ? `${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
            : 'an unknown live process';

        super(`WAL drain lock ${lockPath} is held by ${who}; ${requester.owner} pid ${requester.pid} ` +
            'refuses to start a second drain loop on the same WAL directory (sole-drainer invariant). ' +
            'Disable one drain host for this deployment — the embed daemon OR memoryWal.inProcessDrain.');

        this.name      = 'DrainLockHeldError';
        this.code      = 'DRAIN_LOCK_HELD';
        this.lockPath  = lockPath;
        this.holder    = holder;
        this.requester = requester;
    }
}

/**
 * @summary Default process-liveness probe.
 *
 * `process.kill(pid, 0)` sends no signal but performs the permission/existence check: it throws
 * `ESRCH` when the pid is dead (→ reclaimable) and `EPERM` when the pid is alive but unsignalable
 * (still alive — a holder we must NOT displace).
 *
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
 * Reads + parses the lock holder descriptor, or `null` when the file is absent (raced away) or
 * corrupt (unparseable / missing a numeric pid). A `null` holder is reclaimable: a corrupt lock must
 * never permanently wedge the drain.
 * @param {String} lockPath
 * @param {Object} fsImpl
 * @returns {{pid: Number, owner: String, startedAt: String}|null}
 */
function readHolder(lockPath, fsImpl) {
    try {
        const parsed = JSON.parse(fsImpl.readFileSync(lockPath, 'utf8'));
        return (parsed && Number.isInteger(parsed.pid)) ? parsed : null;
    } catch (err) {
        return null;
    }
}

/**
 * Builds the idempotent release handle: unlinks the lock iff it still records OUR pid (so a late
 * release from a displaced host can never delete a successor's lock).
 * @protected
 */
function makeHandle({lockPath, pid, owner, fsImpl, log}) {
    let released = false;

    return {
        lockPath,
        pid,
        owner,
        release() {
            if (released) return;
            released = true;
            try {
                const holder = readHolder(lockPath, fsImpl);
                if (holder && holder.pid === pid) {
                    fsImpl.unlinkSync(lockPath);
                    log('INFO', `[drain-lock] released by ${owner} pid ${pid} (${lockPath})`);
                }
            } catch (err) {
                // Best-effort: a failed release leaves a stale lock the next host reclaims via the
                // liveness probe — never a correctness hazard, only a one-cycle reclaim cost.
            }
        }
    };
}

/**
 * @summary Atomically claims the drain lock for a WAL directory, enforcing single-host drain.
 *
 * Writes `<dir>/.drain-lock` with an exclusive (`wx`) flag. If the file already exists:
 *  - held by a DIFFERENT live pid → throws {@link DrainLockHeldError} (refuse, no takeover);
 *  - held by a dead pid, our own pid, or corrupt/unparseable → reclaimed (unlinked) and retried once.
 *
 * The WAL directory is created (`recursive`) before the claim — on a fresh deployment the daemon may
 * boot before the first `add_memory` materializes the dir.
 *
 * @param {Object}   options
 * @param {String}   options.dir       WAL directory (the resolved `memoryWal.dir` leaf).
 * @param {String}   options.owner     Host kind for diagnostics: `'daemon'` | `'in-process'`.
 * @param {Number}   [options.pid]     Owning pid (defaults to `process.pid`).
 * @param {Function} [options.now]     Clock (epoch ms) for `startedAt`. Defaults to `Date.now`.
 * @param {Object}   [options.fs]      Filesystem impl (injected for specs). Defaults to `fs-extra`.
 * @param {Function} [options.isAlive] Liveness probe `(pid) => boolean`. Defaults to a `process.kill` probe.
 * @param {Function} [options.log]     `(level, message)` sink. Defaults to a no-op.
 * @returns {{lockPath: String, pid: Number, owner: String, release: Function}} Lock handle; `release()`
 *     removes the lock iff it is still ours (idempotent, never displaces a successor).
 * @throws {DrainLockHeldError} When a different live host already holds the lock.
 */
export function acquireDrainLock({
    dir,
    owner,
    pid        = process.pid,
    now        = Date.now,
    fs: fsImpl = fs,
    isAlive    = defaultIsAlive,
    log        = () => {}
} = {}) {
    const lockPath = path.join(dir, DRAIN_LOCK_FILENAME);

    fsImpl.mkdirSync(dir, {recursive: true});

    // At most two passes: claim; on EEXIST inspect + (if reclaimable) unlink and re-claim once.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fsImpl.writeFileSync(
                lockPath,
                JSON.stringify({pid, owner, startedAt: new Date(now()).toISOString()}),
                {encoding: 'utf8', flag: 'wx'}
            );
            log('INFO', `[drain-lock] acquired by ${owner} pid ${pid} (${lockPath})`);
            return makeHandle({lockPath, pid, owner, fsImpl, log});
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;

            const holder = readHolder(lockPath, fsImpl);

            if (holder && holder.pid !== pid && isAlive(holder.pid)) {
                throw new DrainLockHeldError({lockPath, holder, requester: {owner, pid}});
            }

            // Stale (dead holder), our own leftover, or corrupt → reclaim and retry the wx claim.
            log('INFO', `[drain-lock] reclaiming ${holder ? `stale lock (dead ${holder.owner} pid ${holder.pid})` : 'corrupt lock'} at ${lockPath}`);
            try {
                fsImpl.unlinkSync(lockPath);
            } catch (unlinkErr) {
                if (unlinkErr.code !== 'ENOENT') throw unlinkErr; // ENOENT = raced away; the retry wx settles it.
            }
        }
    }

    // Both passes lost the wx race: another host re-claimed between our unlink and re-claim.
    throw new DrainLockHeldError({lockPath, holder: readHolder(lockPath, fsImpl), requester: {owner, pid}});
}
