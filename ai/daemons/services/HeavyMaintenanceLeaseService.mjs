import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';
import Neo    from '../../../src/Neo.mjs';
import Base   from '../../../src/core/Base.mjs';

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
 * @summary Determines whether a persisted heavy-maintenance lease has expired.
 *
 * The stale check is intentionally payload-based instead of file-mtime-based so
 * copied or restored state keeps the owning task's declared deadline. This is the
 * shared #11503 recovery contract for daemon-owned and CLI-owned maintenance work.
 *
 * @param {Object|null} lease Persisted lease payload.
 * @param {Object} [options]
 * @param {Date|Number|String} [options.now=new Date()] Current time.
 * @returns {Boolean}
 */
export function isLeaseStale(lease, {now = new Date()} = {}) {
    if (!lease || !lease.acquiredAt) {
        return true;
    }

    const nowMs = toTimestamp(now);

    if (!Number.isFinite(nowMs)) {
        return false;
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
    now       = new Date()
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
        const stale = isLeaseStale(lease, {now});

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

/**
 * @summary Attempts to acquire the shared Agent OS heavy-maintenance lease.
 *
 * Normal contention returns a held status with active-owner metadata. It does
 * not throw because #11503 treats overlap prevention as a non-error deferral.
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

    const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now});

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

        const raced = await inspectHeavyMaintenanceLease({leasePath, fsModule, now});
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
    now       = new Date()
} = {}) {
    if (!token) {
        throw new Error('Heavy-maintenance lease token is required for release.');
    }

    const current = await inspectHeavyMaintenanceLease({leasePath, fsModule, now});

    if (current.status === 'missing') {
        return {status: 'missing', released: false};
    }

    if (!current.lease || current.lease.token !== token) {
        return {status: 'not-owner', released: false, lease: current.lease};
    }

    await fsModule.remove(leasePath);

    return {status: 'released', released: true, lease: current.lease};
}

export const ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN';

/**
 * @summary Runs a task while holding the heavy-maintenance lease.
 *
 * Support for process-boundary lease inheritance (e.g., Orchestrator spawning child tasks):
 * If process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN is present and matches the
 * active owner's token in the lease file, acquisition is bypassed and the task yields
 * `status: 'inherited'`. Release is similarly delegated back to the parent owner.
 *
 * @param {Function} task Async task to execute.
 * @param {Object} options Lease acquisition options.
 * @returns {Promise<Object>}
 */
export async function withHeavyMaintenanceLease(task, options = {}) {
    const inheritedToken = process.env[ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN];

    if (inheritedToken) {
        const current = await inspectHeavyMaintenanceLease({
            leasePath: options.leasePath,
            fsModule : options.fsModule,
            now      : options.now
        });

        if (current.active && current.lease && current.lease.token === inheritedToken) {
            return {
                status  : 'inherited',
                acquired: false,
                lease   : current.lease,
                result  : await task({status: 'inherited', acquired: false, lease: current.lease})
            };
        }
    }

    const acquisition = await acquireHeavyMaintenanceLease(options);

    if (!acquisition.acquired) {
        return acquisition;
    }

    try {
        return {
            status  : 'completed',
            acquired: true,
            lease   : acquisition.lease,
            result  : await task(acquisition)
        };
    } finally {
        await releaseHeavyMaintenanceLease({
            token    : acquisition.lease.token,
            leasePath: options.leasePath,
            fsModule : options.fsModule,
            now      : options.now
        });
    }
}

/**
 * @summary Shared lease service for Agent OS substrate-heavy maintenance work (#11505).
 *
 * The service is the reusable #11503 mutex contract between orchestrator-owned
 * tasks and operator-runnable CLI scripts. It prevents Chroma / SQLite / LLM
 * maintenance lanes from overlapping across process boundaries while preserving
 * non-error deferral semantics for expected contention.
 *
 * @class Neo.ai.daemons.services.HeavyMaintenanceLeaseService
 * @extends Neo.core.Base
 * @singleton
 * @see https://github.com/neomjs/neo/issues/11503
 * @see https://github.com/neomjs/neo/issues/11505
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
            now      : options.now       ?? new Date()
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
