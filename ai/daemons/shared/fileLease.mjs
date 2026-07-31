/**
 * @module ai/daemons/shared/fileLease
 * @summary The shared single-owner file lease: atomic claim, refuse-no-takeover, stale reclaim,
 * heartbeat pulse, and loss-detecting revalidation — with the liveness strategy INJECTED.
 *
 * One claim/refuse/reclaim/release/pulse implementation serving two liveness domains:
 *
 *   - **Same-namespace** contenders (embed drain daemon vs in-process server loop): the default
 *     pid-liveness probe (`process.kill(pid, 0)`; ESRCH → dead/reclaimable, EPERM → alive/must not
 *     displace). See `ai/daemons/embed/drainLock.mjs`.
 *   - **Cross-namespace** contenders (host bare process vs Docker container): pid probes are
 *     BLIND — Docker Desktop runs containers in a VM, so a container's pid has no host-namespace
 *     existence and `kill(pid, 0)` reads a LIVE holder as dead, reclaiming its lease and starting
 *     the duplicate the lease exists to refuse (verified on the maintainer machine). The
 *     authority lease (`ai/daemons/orchestrator/authorityLease.mjs`) therefore
 *     injects TTL-liveness: a lease younger than its TTL reads HELD regardless of pid visibility;
 *     older reads stale and is reclaimed.
 *
 * The holder descriptor is diagnostic even when liveness is TTL-based: `{pid, owner, ...fields,
 * startedAt, lastPulse}` — who held it, in which role, since when, and when it last proved life.
 *
 * Holder-side contract: the holder refreshes `lastPulse` via
 * `pulse()` on its existing cadence; a pulse that finds the file missing, corrupt, or re-recorded
 * by a successor throws {@link FileLeaseLostError} — the holder routes to its refusal path and
 * never continues silently.
 *
 * Pure + fully injectable (fs, clock, liveness, error factory, log) — process-lifecycle wiring
 * (acquire-at-boot, pulse-on-cadence, release-on-shutdown) belongs to the consuming daemon.
 */

import fs   from 'fs-extra';
import path from 'path';

/**
 * @summary Thrown when a lease is held by a DIFFERENT verifiably-live holder. Carries the holder
 * descriptor so the caller can fail loud with an actionable, holder-naming message.
 */
export class FileLeaseHeldError extends Error {
    constructor({lockPath, holder, requester, lockLabel = 'file', remediation = ''}) {
        const who = holder
            ? `${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
            : 'an unknown live process';

        super(`${lockLabel} lease ${lockPath} is held by ${who}; ${requester.owner} pid ${requester.pid} ` +
            `refuses to start a duplicate (single-owner invariant). ${remediation}`.trim());

        this.name      = 'FileLeaseHeldError';
        this.code      = 'FILE_LEASE_HELD';
        this.lockPath  = lockPath;
        this.holder    = holder;
        this.requester = requester;
    }
}

/**
 * @summary Thrown by `pulse()` when the holder's own lease is gone — missing, corrupt, or
 * re-recorded by a successor after a stale reclaim. The holder must route to its refusal path.
 */
export class FileLeaseLostError extends Error {
    constructor({lockPath, pid, reason}) {
        super(`file lease ${lockPath} is no longer ours (pid ${pid}): ${reason}. ` +
            'Route to the refusal path — never silent continuation.');

        this.name     = 'FileLeaseLostError';
        this.code     = 'FILE_LEASE_LOST';
        this.lockPath = lockPath;
        this.pid      = pid;
    }
}

/**
 * Default liveness: the same-namespace pid probe. `process.kill(pid, 0)` throws ESRCH when the
 * pid is dead (→ reclaimable) and EPERM when alive but unsignalable (→ must not displace).
 * @param {Object} options
 * @param {Object} options.holder Parsed lease descriptor.
 * @returns {Boolean}
 */
function defaultIsHeldFresh({holder}) {
    try {
        process.kill(holder.pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

/**
 * Reads + parses the holder descriptor, or `null` when the file is absent (raced away) or corrupt
 * (unparseable / missing a numeric pid). A `null` holder is reclaimable: a corrupt lease must
 * never permanently wedge the role.
 * @param {String} lockPath
 * @param {Object} fsImpl
 * @returns {Object|null}
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
 * Atomically claims a lease file, enforcing single-owner.
 *
 * Writes `<dir>/<filename>` with an exclusive (`wx`) flag. If the file already exists:
 *  - held by a DIFFERENT pid whose lease the injected `isHeldFresh` reads as live → throws the
 *    injected held-error (refuse, no takeover);
 *  - stale by the injected liveness, our own pid, or corrupt/unparseable → reclaimed and retried once.
 *
 * @param {Object}   options
 * @param {String}   options.dir             Lease directory (created recursively when absent).
 * @param {String}   options.filename        Lease file name inside `dir`.
 * @param {String}   options.owner           Holder identity for diagnostics.
 * @param {Object}   [options.fields]        Extra descriptor fields (e.g. `{profile}`).
 * @param {Number}   [options.pid]           Owning pid (defaults to `process.pid`).
 * @param {Function} [options.now]           Clock (epoch ms). Defaults to `Date.now`.
 * @param {Object}   [options.fs]            Filesystem impl (injected for specs). Defaults to `fs-extra`.
 * @param {Function} [options.isHeldFresh]   Liveness strategy `({holder, now}) => boolean`.
 *     Defaults to the same-namespace pid probe. Cross-namespace consumers inject TTL-liveness.
 * @param {Function} [options.createHeldError] Held-error factory `({lockPath, holder, requester}) => Error`.
 * @param {Function} [options.log]           `(level, message)` sink. Defaults to a no-op.
 * @param {String}   [options.lockLabel]     Human label for log/error lines.
 * @param {String}   [options.remediation]   Operator guidance appended to the refusal.
 * @returns {{lockPath: String, pid: Number, owner: String, pulse: Function, release: Function}}
 * @throws {Error} The injected held-error when a different live holder owns the lease.
 */
export function acquireFileLease({
    dir,
    filename,
    owner,
    fields     = {},
    pid        = process.pid,
    now        = Date.now,
    fs: fsImpl = fs,
    isHeldFresh    = defaultIsHeldFresh,
    createHeldError,
    log        = () => {},
    lockLabel  = 'file',
    remediation = ''
} = {}) {
    const lockPath  = path.join(dir, filename);
    const startedAt = new Date(now()).toISOString();

    const heldError = createHeldError || (({lockPath: lp, holder, requester}) =>
        new FileLeaseHeldError({lockPath: lp, holder, requester, lockLabel, remediation}));

    fsImpl.mkdirSync(dir, {recursive: true});

    const makeHandle = () => {
        let released = false;

        return {
            lockPath,
            pid,
            owner,
            /**
             * The heartbeat: re-reads the lease, verifies it is still OURS, and refreshes
             * `lastPulse`. Throws {@link FileLeaseLostError} when the lease is missing, corrupt,
             * or re-recorded by a successor — the holder's cue to route to its refusal path.
             * @returns {{held: Boolean}}
             */
            pulse() {
                const holder = readHolder(lockPath, fsImpl);

                if (!holder) {
                    throw new FileLeaseLostError({lockPath, pid, reason: 'lease file missing or corrupt'});
                }

                if (holder.pid !== pid || holder.startedAt !== startedAt) {
                    throw new FileLeaseLostError({
                        lockPath, pid,
                        reason: `reclaimed by ${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
                    });
                }

                fsImpl.writeFileSync(
                    lockPath,
                    JSON.stringify({...holder, lastPulse: new Date(now()).toISOString()}),
                    {encoding: 'utf8'}
                );

                return {held: true};
            },
            /**
             * Idempotent release: unlinks the lease iff it still records OUR pid + startedAt, so a
             * displaced holder's late release never deletes a successor's lease.
             * @returns {void}
             */
            release() {
                if (released) return;
                released = true;
                try {
                    const holder = readHolder(lockPath, fsImpl);
                    if (holder && holder.pid === pid && holder.startedAt === startedAt) {
                        fsImpl.unlinkSync(lockPath);
                        log('INFO', `[file-lease] released by ${owner} pid ${pid} (${lockPath})`);
                    }
                } catch (err) {
                    // Best-effort: a failed release leaves a stale lease the next claimant reclaims
                    // via the liveness strategy — never a correctness hazard.
                }
            }
        };
    };

    // At most two passes: claim; on EEXIST inspect + (if reclaimable) unlink and re-claim once.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fsImpl.writeFileSync(
                lockPath,
                JSON.stringify({pid, owner, ...fields, startedAt, lastPulse: startedAt}),
                {encoding: 'utf8', flag: 'wx'}
            );
            log('INFO', `[file-lease] acquired by ${owner} pid ${pid} (${lockPath})`);
            return makeHandle();
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;

            const holder = readHolder(lockPath, fsImpl);

            if (holder && holder.pid !== pid && isHeldFresh({holder, now: now()})) {
                throw heldError({lockPath, holder, requester: {owner, pid}});
            }

            // Stale, our own leftover, or corrupt → reclaim and retry the wx claim.
            log('INFO', `[file-lease] reclaiming ${holder ? `stale lease (held by ${holder.owner} pid ${holder.pid})` : 'corrupt lease'} at ${lockPath}`);
            try {
                fsImpl.unlinkSync(lockPath);
            } catch (unlinkErr) {
                if (unlinkErr.code !== 'ENOENT') throw unlinkErr; // ENOENT = raced away; the retry settles it.
            }
        }
    }

    // Both passes lost the wx race: another claimant re-claimed between our unlink and re-claim.
    throw heldError({lockPath, holder: readHolder(lockPath, fsImpl), requester: {owner, pid}});
}
