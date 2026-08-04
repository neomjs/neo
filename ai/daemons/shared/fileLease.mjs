/**
 * @module ai/daemons/shared/fileLease
 * @summary The shared single-owner file lease: atomic claim, refuse-no-takeover, guarded stale
 * reclaim, heartbeat pulse, and loss-detecting revalidation — owner-token identity, liveness
 * strategy INJECTED, and every read-verify-mutate transition serialized through the shared
 * lifecycle guard (`./lifecycleGuard.mjs`).
 *
 * One implementation serving two liveness domains:
 *
 *   - **Same-namespace** contenders (embed drain daemon vs in-process server loop): boot identity
 *     rejects persisted locks from a previous container epoch, then the pid-liveness probe
 *     (`process.kill(pid, 0)`; ESRCH → dead/reclaimable, EPERM → alive/must not displace) governs
 *     contenders within the current boot. See `ai/daemons/embed/drainLock.mjs`.
 *   - **Cross-namespace** contenders (host bare process vs Docker container): pid probes are
 *     BLIND — Docker Desktop runs containers in a VM, so a container's pid has no host-namespace
 *     existence and `kill(pid, 0)` reads a LIVE holder as dead, reclaiming its lease and starting
 *     the duplicate the lease exists to refuse (verified on the maintainer machine). The
 *     authority lease (`ai/daemons/orchestrator/authorityLease.mjs`) therefore injects
 *     TTL-liveness: a lease younger than its TTL reads HELD regardless of pid visibility; older
 *     reads stale and is reclaimed.
 *
 * **Identity is an opaque owner token, never a pid.** Numeric pids collide across pid namespaces
 * (a host process and a container process can both be pid 7), so pid-equality cannot mean
 * "ours." Every acquisition mints a `ownerToken` (injectable for deterministic tests); release,
 * pulse, and same-owner reclaim all key on it.
 *
 * **Mutations are guarded.** Reclaim, pulse, and release enter the identity-carrying lifecycle
 * guard and re-inspect the lease INSIDE the critical section — a successor that claims between a
 * holder's read and its heartbeat write can no longer be overwritten by that write, and a late
 * release re-inspects before unlinking. Plain acquisition stays outside the guard: an exclusive
 * `wx` create is already atomic.
 *
 * Holder-side contract: the holder refreshes `lastPulse` via `pulse()` on its existing cadence;
 * a pulse that finds the file missing, corrupt, or re-recorded by a successor throws
 * {@link FileLeaseLostError} — the holder routes to its refusal path and never continues
 * silently.
 *
 * Pure + fully injectable (fs, clock, liveness, token, guard seams) — process-lifecycle wiring
 * (acquire-at-boot, pulse-on-cadence, release-on-shutdown) belongs to the consuming daemon.
 */

import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';
import {
    enterLifecycleGuardSync,
    exitLifecycleGuardSync,
    verifyLifecycleGuardOwnershipSync
} from './lifecycleGuard.mjs';

/**
 * @summary Thrown when a lease is held by a DIFFERENT verifiably-live holder, or — fail-closed —
 * when the persisted lease state cannot be judged (corrupt and the consumer's policy is refuse).
 * Carries the holder descriptor so the caller can fail loud with an actionable message.
 */
export class FileLeaseHeldError extends Error {
    constructor({lockPath, holder, requester, lockLabel = 'file', remediation = ''}) {
        const who = holder
            ? `${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
            : 'an unverifiable holder (corrupt or unreadable lease state — refusing rather than guessing)';

        // The holder's identity being byte-identical to the requester's is an OBSERVATION, not a
        // conclusion: it is consistent with the same slot restarting inside the freshness window and
        // meeting its own predecessor's lease, and it is also consistent with two genuinely distinct
        // processes that are simply indistinguishable by this identity. Containers make the second
        // case unfalsifiable from here — hostname is the container id and the entrypoint is always
        // pid 1 — which is exactly why the message reports what was measured and lets the reader draw
        // the conclusion.
        //
        // It matters because the caller's remediation ("stop the duplicate") is actively misleading
        // in the restart-loop case: an operator hunts for a second process that does not exist while
        // the loop's real cause scrolls past above it in the same log.
        const holderIdentityMatchesRequester = Boolean(holder) &&
            holder.owner === requester.owner && holder.pid === requester.pid;

        const guidance = holderIdentityMatchesRequester
            ? `The holder's identity is indistinguishable from yours, so this may be your own previous ` +
              `instance inside the lease freshness window rather than a second live process — check ` +
              `whether the previous instance stopped before hunting for a duplicate.`
            : remediation;

        super(`${lockLabel} lease ${lockPath} is held by ${who}; ${requester.owner} pid ${requester.pid} ` +
            `refuses to start a duplicate (single-owner invariant). ${guidance}`.trim());

        this.name      = 'FileLeaseHeldError';
        this.code      = 'FILE_LEASE_HELD';
        this.lockPath  = lockPath;
        this.holder    = holder;
        this.requester = requester;

        /**
         * Whether the recorded holder's `owner` and `pid` are byte-identical to the requester's.
         *
         * Strictly the measured comparison — it does NOT assert that the holder is a dead
         * predecessor, because this frame cannot distinguish that from two live processes with
         * indistinguishable identities. A consumer wanting that stronger claim must corroborate it
         * with something this error does not carry, such as restart count or process liveness.
         * @type {Boolean}
         */
        this.holderIdentityMatchesRequester = holderIdentityMatchesRequester;
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
 * Reads + parses the holder descriptor, or `null` when the file is absent (raced away), corrupt
 * (unparseable), or INVALID (missing a numeric pid, missing an owner token, or carrying
 * unparseable `startedAt` / `lastPulse` dates). Date fields are validated because liveness
 * strategies compute on them: a descriptor whose dates do not parse is unjudgeable, not stale —
 * and under a refuse policy unjudgeable must fail closed, never silently reclaim.
 * @param {String} lockPath
 * @param {Object} fsImpl
 * @returns {Object|null}
 */
export function readFileLeaseHolder(lockPath, fsImpl = fs) {
    try {
        const parsed = JSON.parse(fsImpl.readFileSync(lockPath, 'utf8'));

        return (parsed
            && Number.isInteger(parsed.pid)
            && typeof parsed.ownerToken === 'string'
            && Number.isFinite(Date.parse(parsed.startedAt))
            && Number.isFinite(Date.parse(parsed.lastPulse)))
            ? parsed
            : null;
    } catch (err) {
        return null;
    }
}

/**
 * Atomically claims a lease file, enforcing single-owner.
 *
 * Writes `<dir>/<filename>` with an exclusive (`wx`) flag. If the file already exists, the
 * claimant enters the lifecycle guard and re-inspects INSIDE the critical section:
 *  - held by a DIFFERENT token whose lease the injected `isHeldFresh` reads as live → throws the
 *    injected held-error (refuse, no takeover);
 *  - stale by the injected liveness, or OUR token → unlinked inside the guard and re-claimed;
 *  - corrupt → the `onCorrupt` policy decides: `'refuse'` (fail-closed held-error) or
 *    `'reclaim'`.
 *
 * @param {Object}   options
 * @param {String}   options.dir             Lease directory (created recursively when absent).
 * @param {String}   options.filename        Lease file name inside `dir`.
 * @param {String}   options.owner           Holder identity for diagnostics.
 * @param {Object}   [options.fields]        Extra descriptor fields (e.g. `{profile}`).
 * @param {Number}   [options.pid]           Owning pid (defaults to `process.pid`).
 * @param {String}   [options.token]         Owner-token seam (defaults to a fresh UUID).
 * @param {Function} [options.now]           Clock (epoch ms). Defaults to `Date.now`.
 * @param {Object}   [options.fs]            Filesystem impl (injected for specs). Defaults to `fs-extra`.
 * @param {Function} [options.isHeldFresh]   Liveness strategy `({holder, now}) => boolean`.
 *     Defaults to the same-namespace pid probe. Cross-namespace consumers inject TTL-liveness.
 * @param {Function} [options.createHeldError] Held-error factory `({lockPath, holder, requester}) => Error`.
 * @param {Function} [options.log]           `(level, message)` sink. Defaults to a no-op.
 * @param {String}   [options.lockLabel]     Human label for log/error lines.
 * @param {String}   [options.remediation]   Operator guidance appended to the refusal.
 * @param {String}   [options.onCorrupt]     `'reclaim'` (default — a corrupt lease never wedges)
 *     or `'refuse'` (fail-closed: unjudgeable authority state refuses).
 * @returns {{lockPath: String, pid: Number, owner: String, ownerToken: String, pulse: Function, release: Function}}
 * @throws {Error} The injected held-error when a different live holder owns the lease.
 */
export function acquireFileLease({
    dir,
    filename,
    owner,
    fields     = {},
    pid        = process.pid,
    token      = crypto.randomUUID(),
    now        = Date.now,
    fs: fsImpl = fs,
    isHeldFresh    = defaultIsHeldFresh,
    createHeldError,
    log        = () => {},
    lockLabel  = 'file',
    remediation = '',
    onCorrupt  = 'reclaim'
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
            ownerToken: token,
            /**
             * The heartbeat, guarded: enters the lifecycle guard, re-inspects INSIDE, verifies
             * the lease is still OURS (owner token), then refreshes `lastPulse`. A contender's
             * reclaim can no longer slip between our read and our write — and our write can no
             * longer overwrite a successor that legitimately claimed while we were paused.
             * Throws {@link FileLeaseLostError} when the lease is missing, corrupt, or
             * re-recorded by a successor — the holder's cue to route to its refusal path.
             * @returns {{held: Boolean, contended: Boolean}}
             */
            pulse() {
                const guard = enterLifecycleGuardSync({leasePath: lockPath, fsModule: fsImpl});

                if (!guard) {
                    // Contention exhausted: someone else is mid-transition. That is UNVERIFIED,
                    // not held — the caller must defer this sweep and revalidate next cadence;
                    // reporting held here would treat someone else's live transition as proof
                    // of our authority.
                    return {contended: true, held: false};
                }

                try {
                    const holder = readFileLeaseHolder(lockPath, fsImpl);

                    if (!holder) {
                        throw new FileLeaseLostError({lockPath, pid, reason: 'lease file missing or corrupt'});
                    }

                    if (holder.ownerToken !== token) {
                        throw new FileLeaseLostError({
                            lockPath, pid,
                            reason: `reclaimed by ${holder.owner} pid ${holder.pid} (since ${holder.startedAt})`
                        });
                    }

                    if (!verifyLifecycleGuardOwnershipSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl})) {
                        throw new FileLeaseLostError({lockPath, pid, reason: 'lifecycle guard evicted mid-pulse'});
                    }

                    fsImpl.writeFileSync(
                        lockPath,
                        JSON.stringify({...holder, lastPulse: new Date(now()).toISOString()}),
                        {encoding: 'utf8'}
                    );

                    return {contended: false, held: true};
                } finally {
                    exitLifecycleGuardSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl});
                }
            },
            /**
             * Idempotent release, guarded: unlinks the lease iff it still records OUR owner
             * token, re-inspected inside the lifecycle guard — a displaced holder's late release
             * never deletes a successor's lease.
             * @returns {void}
             */
            release() {
                if (released) return;
                released = true;

                const guard = enterLifecycleGuardSync({leasePath: lockPath, fsModule: fsImpl});
                if (!guard) return; // contended — a stale leftover reclaims via the liveness strategy

                try {
                    const holder = readFileLeaseHolder(lockPath, fsImpl);
                    if (holder && holder.ownerToken === token && verifyLifecycleGuardOwnershipSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl})) {
                        fsImpl.unlinkSync(lockPath);
                        log('INFO', `[file-lease] released by ${owner} pid ${pid} (${lockPath})`);
                    }
                } catch (err) {
                    // Best-effort: a failed release leaves a stale lease the next claimant reclaims
                    // via the liveness strategy — never a correctness hazard.
                } finally {
                    exitLifecycleGuardSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl});
                }
            }
        };
    };

    // At most two passes: claim; on EEXIST, guarded inspect + (if reclaimable) unlink + re-claim.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fsImpl.writeFileSync(
                lockPath,
                JSON.stringify({pid, owner, ownerToken: token, ...fields, startedAt, lastPulse: startedAt}),
                {encoding: 'utf8', flag: 'wx'}
            );
            log('INFO', `[file-lease] acquired by ${owner} pid ${pid} (${lockPath})`);
            return makeHandle();
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;

            const guard = enterLifecycleGuardSync({leasePath: lockPath, fsModule: fsImpl});

            if (!guard) {
                throw heldError({lockPath, holder: readFileLeaseHolder(lockPath, fsImpl), requester: {owner, pid}});
            }

            try {
                const holder = readFileLeaseHolder(lockPath, fsImpl);

                if (holder && holder.ownerToken !== token && isHeldFresh({holder, now: now()})) {
                    throw heldError({lockPath, holder, requester: {owner, pid}});
                }

                if (!holder && onCorrupt === 'refuse') {
                    throw heldError({lockPath, holder: null, requester: {owner, pid}});
                }

                // Stale, our own token, or corrupt-by-reclaim-policy → unlink INSIDE the guard.
                log('INFO', `[file-lease] reclaiming ${holder ? `stale lease (held by ${holder.owner} pid ${holder.pid})` : 'corrupt lease'} at ${lockPath}`);

                if (!verifyLifecycleGuardOwnershipSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl})) {
                    continue; // evicted mid-section — the evictor's claim settles the name
                }

                fsImpl.unlinkSync(lockPath);
            } finally {
                exitLifecycleGuardSync({ownerFilePath: guard.ownerFilePath, fsModule: fsImpl});
            }
        }
    }

    // Both passes lost the wx race: another claimant re-claimed between our guarded unlink and
    // the retry — refuse rather than a third pass.
    throw heldError({lockPath, holder: readFileLeaseHolder(lockPath, fsImpl), requester: {owner, pid}});
}
