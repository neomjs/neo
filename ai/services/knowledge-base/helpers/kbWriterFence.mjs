import {
    inspectHeavyMaintenanceLease,
    withHeavyMaintenanceLease
} from '../../../daemons/orchestrator/services/heavyMaintenanceLeasePrimitives.mjs';

/**
 * @summary Cross-process writer fence shared by the two Knowledge Base collection writers.
 *
 * The natural-key divergence scan reads every live row, then writes. That sequence is only sound
 * while no other writer can insert between the two halves: a row landing after the scan carries an
 * identity the scan never examined, so a clean verdict would certify a corpus the guard never saw.
 * A refusal computed from a stale read is worse than no refusal, because it reads as a guarantee.
 *
 * **Both writers must participate or neither is fenced.** A lease taken by the merge import alone
 * provides no exclusion — the ingest path still races it — so the tempting one-sided version is not
 * a partial fence, it is a fence-shaped no-op. The two boundaries are:
 *
 * | Writer | Boundary | Refusal on contention |
 * |---|---|---|
 * | merge import | `KB_DatabaseService.importDatabase` — first live read through last upsert | thrown `KB_IMPORT_LEASE_HELD` |
 * | MCP ingest | `ingestSourceFilesViaMcp` — around `IngestionService.ingestSourceFiles` | returned `KB_INGEST_LEASE_HELD` |
 *
 * This module is deliberately Neo-free and config-free: it takes an already-resolved `leasePath`
 * and returns plain data. Each boundary reads `aiConfig.orchestrator.dataDir` and
 * `aiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs` at its own use site, so no config
 * value is threaded through here and this module never becomes a second resolver for either.
 *
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */

/**
 * Returned by the MCP ingest facade when another writer holds the fence. A returned refusal rather
 * than a thrown error, matching the sibling `KB_INGEST_VOLUME_EXCEEDED` shape the same facade
 * already emits — an MCP caller branches on `code`, and one of the two gates behaving differently
 * would make the facade's contract depend on which gate fired.
 * @member {String} KB_INGEST_LEASE_HELD
 */
export const KB_INGEST_LEASE_HELD = 'KB_INGEST_LEASE_HELD';

/**
 * Thrown by `importDatabase` when another writer holds the fence. Thrown rather than returned
 * because `importDatabase` reports every other refusal by throwing, and its caller distinguishes
 * them via `PRESERVED_IMPORT_REFUSAL_CODES` — a returned refusal would be read as a successful
 * import with a surprising receipt.
 * @member {String} KB_IMPORT_LEASE_HELD
 */
export const KB_IMPORT_LEASE_HELD = 'KB_IMPORT_LEASE_HELD';

/**
 * Lease-owner strings. Distinct per writer so a contention log names which writer is holding,
 * not merely that the KB is busy.
 * @member {Object} KB_WRITER_FENCE_OWNERS
 */
export const KB_WRITER_FENCE_OWNERS = Object.freeze({
    ingest: 'kb-ingest',
    import: 'kb-merge-import'
});

/**
 * Fence outcomes. `inheritedInProcess` is this module's own addition to the underlying lease
 * primitive's set — see `withKbWriterFence` for why it is required rather than cosmetic.
 * @member {Object} KB_WRITER_FENCE_STATUS
 */
export const KB_WRITER_FENCE_STATUS = Object.freeze({
    completed         : 'completed',
    held              : 'held',
    inherited         : 'inherited',
    inheritedInProcess: 'inherited-in-process'
});

/**
 * @summary Projects a held lease to the bounded owner/expiry facts a refusal may carry.
 *
 * Bounded is the operative word, and the exclusion is the point: the lease payload also carries
 * `token`, which is the capability to RELEASE the lease. Returning a whole lease object from an
 * agent-facing refusal would hand a blocked caller the means to evict the writer blocking it, so
 * the projection is an allowlist rather than a redaction — a field added to the lease later is
 * excluded by default instead of leaking on the next payload change.
 *
 * @param {Object|null} lease The held lease payload, or null when contention carried no descriptor.
 * @returns {{leaseOwner: String, leaseAcquiredAt: (String|null), leaseExpiresAt: (String|null), leasePid: (Number|null)}} Bounded contention facts.
 */
export function describeHeldLease(lease) {
    return {
        leaseOwner     : lease?.owner      || 'unknown',
        leaseAcquiredAt: lease?.acquiredAt || null,
        leaseExpiresAt : lease?.expiresAt  || null,
        leasePid       : lease?.pid        ?? null
    }
}

/**
 * @summary Builds the MCP ingest refusal for a fence held by another writer.
 *
 * `retryable: true` is the load-bearing field. The refusal is not a failure — the caller's request
 * was well-formed and the corpus is healthy; another writer simply owns the collection right now.
 * The alternative considered and rejected was waiting inside the call: an MCP tool invocation is
 * synchronous from the agent's side, so an internal wait would freeze the calling agent for the
 * remainder of a multi-hour re-embed and report nothing about why. The caller owns backoff.
 *
 * @param {Object}       options
 * @param {Object|null}  options.lease The held lease payload.
 * @returns {Object} A `{error, message, code, retryable, ...contention}` refusal envelope.
 */
export function buildIngestLeaseHeldRefusal({lease}) {
    const contention = describeHeldLease(lease);

    return {
        error  : 'KB ingest deferred: another writer holds the Knowledge Base writer fence',
        message: `The Knowledge Base collection is held by '${contention.leaseOwner}'` +
                 `${contention.leaseExpiresAt ? ` until ${contention.leaseExpiresAt}` : ''}. ` +
                 `No rows were ingested. Retry after the holder finishes; ingesting concurrently ` +
                 `would race the merge path's natural-key divergence scan and could duplicate the corpus.`,
        code     : KB_INGEST_LEASE_HELD,
        retryable: true,
        ingested : 0,
        ...contention
    }
}

/**
 * @summary Builds the merge-import refusal error for a fence held by another writer.
 *
 * Carries `code` on the Error so `PRESERVED_IMPORT_REFUSAL_CODES` can keep it distinguishable, and
 * `details` for the bounded contention facts. A refusal whose whole value is being identifiable
 * must not be re-wrapped into a generic import failure one frame above the throw.
 *
 * @param {Object}      options
 * @param {Object|null} options.lease The held lease payload.
 * @returns {Error} An error carrying `code: KB_IMPORT_LEASE_HELD`, `retryable: true` and `details`.
 */
export function buildImportLeaseHeldError({lease}) {
    const contention = describeHeldLease(lease);
    const error      = new Error(
        `Knowledge Base merge import refused: the writer fence is held by '${contention.leaseOwner}'` +
        `${contention.leaseExpiresAt ? ` until ${contention.leaseExpiresAt}` : ''}. ` +
        `Nothing was read or written. The natural-key divergence scan cannot be trusted while ` +
        `another writer can insert between the scan and the first upsert.`
    );

    error.code      = KB_IMPORT_LEASE_HELD;
    error.retryable = true;
    error.details   = contention;

    return error
}

/**
 * @summary Runs a task while holding the Knowledge Base writer fence.
 *
 * Thin over `withHeavyMaintenanceLease`, adding exactly one behaviour: **same-process
 * re-entrancy.**
 *
 * That addition is required, not a convenience. The primitive's inheritance path keys on
 * `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`, and every setter of that variable writes it into a
 * *spawned child's* env (`PrimaryRepoSyncService`, `MaintenanceBackpressureService`). Nothing sets
 * it in-process, so a nested acquisition inside one process does not inherit — it sees an active
 * lease, cannot match a token that was never exported, and refuses **against its own holder**.
 * `ai/scripts/maintenance/ingestTenant.mjs` is a live instance of that shape: it acquires the heavy
 * lease and then calls `ingestSourceFiles` in the same process. Acquiring inside the service would
 * deadlock it, which is why the ingest fence sits at the MCP facade instead.
 *
 * Same-pid inheritance is consistent with what the lease means rather than a loosening of it: the
 * lease is a CROSS-process mutex, so a process that already holds it already has the exclusivity
 * the fence exists to provide. In-process ordering was never this lock's guarantee.
 *
 * The inspect-then-run window is a deliberate, bounded TOCTOU: the holder observed is this same
 * process, so it cannot release concurrently except through another async operation of ours — and
 * in that case the pre-existing behaviour was an unfenced write anyway, never a stronger guarantee.
 *
 * @param {Function} task Async task; receives the acquisition descriptor (`{status, acquired, lease}`).
 * @param {Object}   options
 * @param {String}   options.leasePath  Resolved lease-file path; the caller reads its config leaf at its own use site.
 * @param {String}   options.owner      One of `KB_WRITER_FENCE_OWNERS`.
 * @param {String}   options.reason     Short contention-log reason.
 * @param {Function} [options.inspect=inspectHeavyMaintenanceLease] Injectable inspect seam for tests.
 * @param {Function} [options.withLease=withHeavyMaintenanceLease] Injectable lease-wrapper seam for tests.
 * @param {Number}   [options.pid=process.pid] Injectable pid for tests.
 * @returns {Promise<Object>} `{status, acquired, lease, result}`; `status: 'held'` means the task did NOT run.
 */
export async function withKbWriterFence(task, options = {}) {
    const {
        inspect   = inspectHeavyMaintenanceLease,
        withLease = withHeavyMaintenanceLease,
        pid       = process.pid,
        ...leaseOptions
    } = options;

    const current = await inspect({leasePath: leaseOptions.leasePath});

    if (current.active && current.lease && current.lease.pid === pid) {
        const acquisition = {
            status  : KB_WRITER_FENCE_STATUS.inheritedInProcess,
            acquired: false,
            lease   : current.lease
        };

        return {...acquisition, result: await task(acquisition)}
    }

    return withLease(task, leaseOptions)
}
