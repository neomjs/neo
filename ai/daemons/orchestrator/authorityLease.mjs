/**
 * @module ai/daemons/orchestrator/authorityLease
 * @summary The per-role authority lease: one live orchestrator per role per machine, mechanically
 * enforced across processes AND pid namespaces.
 *
 * Boot-time role requiredness closed the ACCIDENTAL path (an undeclared role refuses at boot);
 * this module closes the deliberate-but-wrong path: an explicit `container-plane`
 * declaration on a host where the container already runs that role. Both would boot, both would
 * write the authority receipt (last-writer-wins), and both would run mutually-exclusive
 * maintenance lanes against the same substrate.
 *
 * **Liveness is TTL, never pid — and that is the falsifier-tested point.** Docker Desktop runs
 * containers in a VM, so a container holder's pid has no host-namespace existence and
 * `process.kill(pid, 0)` reads a LIVE holder as dead, reclaiming its lease and starting the
 * duplicate this lease exists to refuse (verified on the maintainer machine). A lease younger
 * than {@link AUTHORITY_LEASE_TTL_MS} since `lastPulse` reads HELD
 * regardless of pid visibility; older reads stale and is reclaimed. The holder refreshes
 * `lastPulse` on its poll cadence and re-verifies ownership after any gap (see the core module's
 * holder-side contract).
 *
 * `isAlive` is accepted but deliberately IGNORED, so no caller can reintroduce pid-liveness by
 * accident; the specs pass a probe that answers "dead" and still assert HELD — that is the
 * namespace falsifier in executable form.
 *
 * Coexistence is constructive: the lease filename carries the role, so `host-edge` and
 * `container-plane` never contend for the same file.
 */

import fs                                      from 'fs-extra';
import os                                      from 'node:os';
import path                                    from 'node:path';
import {acquireFileLease, readFileLeaseHolder} from '../shared/fileLease.mjs';

/**
 * Lease freshness window. The orchestrator polls every 3s, so 60s is 20 missed beats of margin —
 * a pulse absent that long is a genuine-wedge signal, not a slow cycle.
 * @type {Number}
 */
export const AUTHORITY_LEASE_TTL_MS = 60_000;

/**
 * Per-role lease filename — coexistence of different roles on one machine is by construction.
 * @param {String} profile Authority profile (e.g. `host-edge`, `container-plane`).
 * @returns {String}
 */
export function authorityLeaseFilename(profile) {
    return `.authority-lease-${profile}`;
}

/**
 * @summary Classifies one validated per-role authority-lease descriptor. The three states keep
 * consumer semantics explicit: health accepts only `fresh`, while acquisition may reclaim only
 * `stale`; `invalid` is unhealthy and unreclaimable.
 *
 * @param {Object} options
 * @param {Object|null} options.holder Parsed file-lease descriptor.
 * @param {String} options.profile Expected authority role.
 * @param {Number} [options.ttlMs] Freshness window.
 * @param {Number} [options.now] Current epoch milliseconds.
 * @returns {'fresh'|'stale'|'invalid'}
 */
function classifyAuthorityLease({
    holder,
    profile,
    ttlMs = AUTHORITY_LEASE_TTL_MS,
    now   = Date.now()
}) {
    const age = now - Date.parse(holder?.lastPulse ?? holder?.startedAt);

    if (holder?.profile !== profile || !Number.isFinite(age) || age < 0) return 'invalid';

    return age < ttlMs ? 'fresh' : 'stale';
}

/**
 * @summary Inspects the expected per-role authority lease without mutating it. Descriptor
 * validation is delegated to the shared file-lease reader and freshness uses the same predicate
 * as acquisition, so health probes cannot drift from ownership semantics.
 *
 * Missing, corrupt, invalid, wrong-role, future-dated, and stale leases all return `fresh: false`.
 * Read failures are likewise fail-closed through the shared reader.
 *
 * @param {Object} options
 * @param {String} options.dir Lease directory.
 * @param {String} options.profile Expected authority role.
 * @param {Number} [options.ttlMs] Freshness window.
 * @param {Number} [options.now] Current epoch milliseconds.
 * @param {Object} [options.fs] Filesystem implementation (injected for specs).
 * @returns {{fresh: Boolean, holder: Object|null, lockPath: String, status: 'fresh'|'stale'|'invalid'}}
 */
export function inspectAuthorityLease({
    dir,
    profile,
    ttlMs     = AUTHORITY_LEASE_TTL_MS,
    now       = Date.now(),
    fs: fsImpl = fs
} = {}) {
    const lockPath = path.join(dir, authorityLeaseFilename(profile));
    const holder   = readFileLeaseHolder(lockPath, fsImpl);
    const status   = classifyAuthorityLease({holder, profile, ttlMs, now});

    return {
        fresh: status === 'fresh',
        holder,
        lockPath,
        status
    };
}

const REMEDIATION =
    'The container Compose orchestrator and `npm run ai:host-edge` declare different roles by design ' +
    '(`container-plane` vs `host-edge`); a same-role second claim is never legitimate — stop the duplicate.';

/**
 * @summary Atomically claims the authority lease for a role, before the authority receipt write.
 * Specialization of {@link acquireFileLease} with a per-role filename, TTL-liveness, and a
 * refusal naming the holder, the role, and both entrypoints.
 *
 * @param {Object}   options
 * @param {String}   options.dir             Lease directory — the orchestrator's data dir, beside
 *     the authority receipt (mutually visible to host and container via the bind-mounted plane root).
 * @param {String}   options.profile         Authority role being claimed.
 * @param {String}   [options.agentIdentity] Holder identity for diagnostics.
 * @param {Number}   [options.ttlMs]         Freshness window. Defaults to {@link AUTHORITY_LEASE_TTL_MS}.
 * @param {Number}   [options.pid]           Owning pid (defaults to `process.pid`).
 * @param {Function} [options.now]           Clock (epoch ms). Defaults to `Date.now`.
 * @param {Object}   [options.fs]            Filesystem impl (injected for specs).
 * @param {Function} [options.isAlive]       IGNORED by design — pid-liveness is namespace-blind;
 *     accepted only so the falsifier specs can document that.
 * @param {Function} [options.log]           `(level, message)` sink.
 * @returns {{lockPath: String, pid: Number, owner: String, pulse: Function, release: Function}}
 * @throws {FileLeaseHeldError} When a different holder's lease is still fresh.
 */
export function acquireAuthorityLease({
    dir,
    profile,
    agentIdentity = `orchestrator@${os.hostname()}`,
    ttlMs      = AUTHORITY_LEASE_TTL_MS,
    pid        = process.pid,
    now        = Date.now,
    fs: fsImpl,
    log        = () => {}
} = {}) {
    return acquireFileLease({
        dir,
        filename   : authorityLeaseFilename(profile),
        owner      : agentIdentity,
        fields     : {profile},
        pid,
        now,
        fs         : fsImpl,
        log,
        lockLabel  : 'authority',
        remediation: REMEDIATION,
        // Authority state that cannot be judged is a REFUSAL, never a reclaim: a corrupt lease
        // might be a live cross-namespace holder mid-rotation, and guessing starts the duplicate.
        onCorrupt  : 'refuse',
        // Only a canonically stale descriptor is reclaimable. Invalid/future/wrong-role state is
        // unjudgeable authority and therefore stays held under the refuse-no-takeover contract.
        isHeldFresh: ({holder, now: at}) =>
            classifyAuthorityLease({holder, profile, ttlMs, now: at}) !== 'stale'
    });
}
