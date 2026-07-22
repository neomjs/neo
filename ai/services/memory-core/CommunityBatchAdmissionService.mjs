import fs                    from 'fs-extra';
import path                  from 'path';
import crypto                from 'crypto';
import Base                  from '../../../src/core/Base.mjs';
import config                from '../../mcp/server/memory-core/config.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import SourceRegistryService from './SourceRegistryService.mjs';
import {classifyAttention}   from './communityAttentionClassifier.mjs';
import {
    MAX_HOSTED_BATCH_BYTES,
    MAX_HOSTED_OBSERVATIONS,
    canonicalBatchDigest,
    carriesCredentialMaterial,
    carriesHostedAuthority,
    validateBatch,
    validateHostedEnvelope,
    occurrenceIdentity,
    observationDigest
} from './communityBatchContract.mjs';

/**
 * @summary Admission outcomes. These are RESULTS, not exceptions, because all are ordinary protocol
 * states a connector must act on: retry safely, reconcile from current basis, or investigate.
 * @member {Object<String,String>}
 */
export const ADMISSION_STATUS = {
    ACCEPTED  : 'accepted',
    IDEMPOTENT: 'idempotent',
    CONFLICT  : 'conflict'
};

/**
 * Thrown inside the admission transaction to abort + roll back on an observation-level integrity
 * conflict; caught at the boundary and turned into a CONFLICT result. Not a public error.
 */
class ObservationConflict extends Error {
    constructor(reason) { super(reason); this.reason = reason }
}

/**
 * @summary Atomically admits reproducible community-activity batches into durable history.
 *
 * Providers acquire and normalize; this service validates and admits. The entire admission — epoch
 * fence, partition-scoped receipt check, base-checkpoint verification, observation dedup, receipt,
 * and the partition advance — runs as ONE serialized transaction, so a crash can never leave a
 * receipt without its observations, an advanced cursor without its receipt, or an admitted sequence
 * without the row it numbers. Tenant scope is server-derived and re-applied in every statement.
 *
 * @class Neo.ai.services.memory-core.CommunityBatchAdmissionService
 * @extends Neo.core.Base
 * @singleton
 */
class CommunityBatchAdmissionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.CommunityBatchAdmissionService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.CommunityBatchAdmissionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @summary SQLite connection to the Memory Core database (dedicated tables, not the graph).
         * @protected
         */
        db: null,
        /**
         * @member {Object|null} attentionPolicy=null
         * @summary The injected attention-classification policy. Required, never defaulted: an accepted
         * row must carry an evidence-backed disposition, so admitting without a policy fails loud.
         */
        attentionPolicy: null
    }

    /**
     * Opens the SQLite connection and ensures the admission schema.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.db) return;

        try {
            const dbPath = config.storagePaths.graph;

            if (!dbPath) {
                logger.warn('[CommunityBatchAdmissionService] storagePaths.graph not configured. Admission disabled.');
                return;
            }

            if (dbPath !== ':memory:') {
                await fs.ensureDir(path.dirname(dbPath));
            }

            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, {verbose: null});

            if (dbPath !== ':memory:') {
                this.db.pragma('journal_mode = WAL');
            }

            // A competing writer (e.g. a lifecycle revoke on the registry connection) waits for the
            // IMMEDIATE admission transaction to finish rather than failing SQLITE_BUSY.
            this.db.pragma('busy_timeout = 5000');

            this.ensureSchema();
            logger.info('[CommunityBatchAdmissionService] Connected to Memory Core community admission tables.');
        } catch (err) {
            logger.warn('[CommunityBatchAdmissionService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Creates the admission tables if absent and upgrades older observation ledgers in place. Receipt
     * identity is scoped by `resourceFamily` (the CAS partition), so a `batchId` reused across families
     * never collides. Additive nullable observation columns preserve existing rows and callers.
     * @returns {void}
     */
    ensureSchema() {
        if (!this.db) return;

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS mc_community_batch_receipt (
                receipt_id            TEXT    PRIMARY KEY,
                tenant_id             TEXT    NOT NULL,
                source_instance_id    TEXT    NOT NULL,
                resource_family       TEXT    NOT NULL,
                batch_id              TEXT    NOT NULL,
                digest                TEXT    NOT NULL,
                registration_epoch    INTEGER NOT NULL,
                base_checkpoint_version INTEGER NOT NULL,
                next_checkpoint_version INTEGER NOT NULL,
                base_inventory_hash   TEXT,
                next_inventory_hash   TEXT,
                coverage              TEXT,
                observation_count     INTEGER NOT NULL,
                admitted_sequence     INTEGER NOT NULL,
                admitted_at           INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_batch_receipt_identity
                ON mc_community_batch_receipt(tenant_id, source_instance_id, resource_family, batch_id);
            CREATE INDEX IF NOT EXISTS idx_mc_batch_receipt_sequence
                ON mc_community_batch_receipt(tenant_id, admitted_sequence);

            CREATE TABLE IF NOT EXISTS mc_community_observation (
                observation_row_id    TEXT    PRIMARY KEY,
                tenant_id             TEXT    NOT NULL,
                source_instance_id    TEXT    NOT NULL,
                occurrence_identity   TEXT    NOT NULL,
                occurrence_digest     TEXT    NOT NULL,
                provider_entity_id    TEXT    NOT NULL,
                parent_provider_entity_id TEXT,
                occurrence_kind       TEXT    NOT NULL,
                occurrence_coordinate TEXT    NOT NULL,
                occurred_at           TEXT    NOT NULL,
                actor_id              TEXT,
                actor_kind            TEXT    NOT NULL,
                provider_state        TEXT,
                source_association    TEXT,
                revision_of           TEXT,
                absence               TEXT,
                deletion_evidence     TEXT,
                attention_disposition TEXT    NOT NULL,
                attention_reason      TEXT    NOT NULL,
                receipt_id            TEXT    NOT NULL,
                admitted_sequence     INTEGER NOT NULL,
                admitted_at           INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_observation_identity
                ON mc_community_observation(tenant_id, occurrence_identity);
            CREATE INDEX IF NOT EXISTS idx_mc_observation_entity
                ON mc_community_observation(tenant_id, source_instance_id, provider_entity_id);

            CREATE TABLE IF NOT EXISTS mc_community_checkpoint (
                tenant_id          TEXT    NOT NULL,
                source_instance_id TEXT    NOT NULL,
                resource_family    TEXT    NOT NULL,
                checkpoint_version INTEGER NOT NULL,
                inventory_hash     TEXT,
                provider_state     TEXT,
                coverage           TEXT,
                last_receipt_id    TEXT    NOT NULL,
                updated_at         INTEGER NOT NULL,
                PRIMARY KEY (tenant_id, source_instance_id, resource_family)
            );
        `);

        // Serialize the inspect-and-alter sequence: multiple Memory Core processes can open the same
        // store during rollout, and two unlocked readers could otherwise both attempt the same ALTER.
        this.db.transaction(() => {
            const observationColumns = new Set(
                this.db.prepare(`PRAGMA table_info(mc_community_observation)`).all().map(column => column.name)
            );

            if (!observationColumns.has('parent_provider_entity_id')) {
                this.db.exec(`ALTER TABLE mc_community_observation ADD COLUMN parent_provider_entity_id TEXT`)
            }
            if (!observationColumns.has('provider_state')) {
                this.db.exec(`ALTER TABLE mc_community_observation ADD COLUMN provider_state TEXT`)
            }
            if (!observationColumns.has('source_association')) {
                this.db.exec(`ALTER TABLE mc_community_observation ADD COLUMN source_association TEXT`)
            }
        }).immediate()
    }

    /**
     * @summary Validates, fences, and atomically admits one batch in a single serialized transaction.
     *
     * Never throws for an ordinary protocol outcome — a conflict is a returned status. The transaction
     * runs the nine admission steps in order: (1) verify the ACTIVE registration + epoch INSIDE the
     * boundary; (2) check the partition-scoped `batchId` receipt; (3) for the same digest, repair only
     * nullable materialized projections and return the prior result; (4) fail closed for the same
     * `batchId` with a different digest; (5) verify the base checkpoint version + inventory hash;
     * (6) dedup overlapping observations by occurrence identity + digest, applying the same bounded
     * projection repair; (7) fail closed when the same occurrence carries a different digest; (8) admit
     * a genuinely new occurrence as an immutable fact; (9) persist provider state/inventory/coverage/
     * receipt and advance the partition.
     * @param {Object} batch A `community-activity-batch.v1` payload.
     * @returns {Object} `{status, digest, receipt?, checkpoint?, errors?, reason?}`
     * @throws {Error} `BATCH_ADMISSION_NO_TENANT` | `ATTENTION_POLICY_NOT_CONFIGURED` (fail closed).
     */
    admitBatch(batch) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) {
            throw new Error('BATCH_ADMISSION_NO_TENANT');
        }

        if (!this.attentionPolicy) {
            throw new Error('ATTENTION_POLICY_NOT_CONFIGURED');
        }

        const {valid, errors} = validateBatch(batch);

        if (!valid) {
            return {status: ADMISSION_STATUS.CONFLICT, reason: 'SCHEMA_INVALID', errors};
        }

        const
            {
                batchId, sourceInstanceId, resourceFamily, registrationEpoch, baseCheckpointVersion,
                baseInventoryHash, nextProviderState, nextInventoryHash, coverage, observations
            } = batch,
            digest = canonicalBatchDigest(batch);

        let outcome;

        try {
            // IMMEDIATE acquires the write lock at BEGIN, so the registration read below and every
            // write commit or roll back as one serialized unit — a concurrent revoke on another
            // connection either lands before this transaction (and is seen) or serializes behind it.
            outcome = this.db.transaction(() => {
                // Step 1 — the epoch fence, read through THIS connection inside the transaction. The
                // registration table lives in the same database; delegating to the registry service
                // would read through its separate connection, leaving the fence outside this
                // serialized boundary and admitting a batch under a concurrently-committed revocation.
                const registration = this.db.prepare(
                    `SELECT lifecycle_state, registration_epoch FROM mc_source_registration
                     WHERE tenant_id = ? AND source_instance_id = ?`
                ).get(tenantId, sourceInstanceId);

                if (!registration || registration.lifecycle_state !== 'ACTIVE' || registration.registration_epoch !== registrationEpoch) {
                    return {status: ADMISSION_STATUS.CONFLICT, reason: 'REGISTRATION_NOT_ADMISSIBLE'}
                }

                // These nullable columns can be materialized after the occurrence digest already covered
                // their payload values. An exact digest match therefore authorizes filling a storage hole,
                // but never rewriting a non-null projection. The WHERE digest repeats that proof at the
                // mutation boundary.
                const
                    backfillProjectionStatement = this.db.prepare(
                        `UPDATE mc_community_observation
                         SET parent_provider_entity_id = COALESCE(parent_provider_entity_id, @parentProviderEntityId),
                             provider_state            = COALESCE(provider_state, @providerState),
                             source_association        = COALESCE(source_association, @sourceAssociation)
                         WHERE tenant_id = @tenantId
                           AND source_instance_id = @sourceInstanceId
                           AND occurrence_identity = @identity
                           AND occurrence_digest = @digest
                           AND ((parent_provider_entity_id IS NULL AND @parentProviderEntityId IS NOT NULL)
                             OR (provider_state IS NULL AND @providerState IS NOT NULL)
                             OR (source_association IS NULL AND @sourceAssociation IS NOT NULL))`
                    ),
                    backfillObservationProjection = (
                        observation,
                        identity = occurrenceIdentity(sourceInstanceId, observation),
                        oDigest  = observationDigest(observation)
                    ) => backfillProjectionStatement.run({
                        digest                : oDigest,
                        identity,
                        parentProviderEntityId: observation.parentProviderEntityId ?? null,
                        providerState         : observation.providerState ?? null,
                        sourceAssociation     : observation.sourceAssociation ?? null,
                        sourceInstanceId,
                        tenantId
                    }).changes;

                // Steps 2-4 — the partition-scoped batch idempotency key.
                const existing = this.db.prepare(
                    `SELECT * FROM mc_community_batch_receipt
                     WHERE tenant_id = ? AND source_instance_id = ? AND resource_family = ? AND batch_id = ?`
                ).get(tenantId, sourceInstanceId, resourceFamily, batchId);

                if (existing) {
                    if (existing.digest === digest) {
                        observations.forEach(observation => backfillObservationProjection(observation));

                        return {status: ADMISSION_STATUS.IDEMPOTENT, receipt: this.#toReceipt(existing)}
                    }

                    return {status: ADMISSION_STATUS.CONFLICT, reason: 'DIGEST_MISMATCH', receipt: this.#toReceipt(existing)}
                }

                // Step 5 — the checkpoint CAS: the batch's declared base must equal current server state.
                const checkpoint       = this.#readCheckpoint(tenantId, sourceInstanceId, resourceFamily),
                      currentVersion   = checkpoint ? checkpoint.checkpointVersion : 0,
                      currentInventory = checkpoint ? checkpoint.inventoryHash : null;

                if (baseCheckpointVersion !== currentVersion || (baseInventoryHash ?? null) !== currentInventory) {
                    return {status: ADMISSION_STATUS.CONFLICT, reason: 'STALE_BASIS', checkpoint}
                }

                // Steps 6-8 — observations dedup by identity + digest (a genuine revision is a new identity).
                const now       = Date.now(),
                      nextSeq   = (this.db.prepare(`SELECT MAX(admitted_sequence) AS max FROM mc_community_batch_receipt WHERE tenant_id = ?`).get(tenantId).max || 0) + 1,
                      receiptId = crypto.randomUUID();

                this.db.prepare(
                    `INSERT INTO mc_community_batch_receipt (
                        receipt_id, tenant_id, source_instance_id, resource_family, batch_id, digest,
                        registration_epoch, base_checkpoint_version, next_checkpoint_version,
                        base_inventory_hash, next_inventory_hash, coverage, observation_count,
                        admitted_sequence, admitted_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                    receiptId, tenantId, sourceInstanceId, resourceFamily, batchId, digest,
                    registrationEpoch, baseCheckpointVersion, currentVersion + 1,
                    baseInventoryHash ?? null, nextInventoryHash ?? null,
                    coverage ? JSON.stringify(coverage) : null, observations.length, nextSeq, now
                );

                const insertObservation = this.db.prepare(
                    `INSERT INTO mc_community_observation (
                        observation_row_id, tenant_id, source_instance_id, occurrence_identity, occurrence_digest,
                        provider_entity_id, parent_provider_entity_id, occurrence_kind, occurrence_coordinate,
                        occurred_at, actor_id, actor_kind, provider_state, source_association, revision_of,
                        absence, deletion_evidence, attention_disposition, attention_reason, receipt_id,
                        admitted_sequence, admitted_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                for (const observation of observations) {
                    const identity = occurrenceIdentity(sourceInstanceId, observation),
                          oDigest  = observationDigest(observation),
                          prior    = this.db.prepare(
                              `SELECT occurrence_digest FROM mc_community_observation WHERE tenant_id = ? AND occurrence_identity = ?`
                          ).get(tenantId, identity);

                    if (prior) {
                        // Step 6 — same identity + same digest: keep the immutable occurrence row and
                        // repair only nullable projections that older admission code failed to materialize.
                        if (prior.occurrence_digest === oDigest) {
                            backfillObservationProjection(observation, identity, oDigest);
                            continue
                        }
                        // Step 7 — same identity + different digest: integrity conflict, abort.
                        throw new ObservationConflict('OBSERVATION_DIGEST_MISMATCH')
                    }

                    // Step 8 — a new occurrence/revision is a new immutable fact.
                    const {disposition, reason} = classifyAttention(observation, this.attentionPolicy);

                    insertObservation.run(
                        crypto.randomUUID(), tenantId, sourceInstanceId, identity, oDigest,
                        observation.providerEntityId, observation.parentProviderEntityId ?? null,
                        observation.occurrenceKind, observation.occurrenceCoordinate, observation.occurredAt,
                        observation.actorId || null, observation.actorKind, observation.providerState ?? null,
                        observation.sourceAssociation ?? null, observation.revisionOf || null, observation.absence || null,
                        observation.deletionEvidence ? JSON.stringify(observation.deletionEvidence) : null,
                        disposition, reason, receiptId, nextSeq, now
                    )
                }

                // Step 9 — advance the partition checkpoint to the batch's declared next state.
                this.db.prepare(
                    `INSERT INTO mc_community_checkpoint
                        (tenant_id, source_instance_id, resource_family, checkpoint_version, inventory_hash, provider_state, coverage, last_receipt_id, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(tenant_id, source_instance_id, resource_family) DO UPDATE SET
                        checkpoint_version = excluded.checkpoint_version,
                        inventory_hash     = excluded.inventory_hash,
                        provider_state     = excluded.provider_state,
                        coverage           = excluded.coverage,
                        last_receipt_id    = excluded.last_receipt_id,
                        updated_at         = excluded.updated_at`
                ).run(
                    tenantId, sourceInstanceId, resourceFamily, currentVersion + 1, nextInventoryHash ?? null,
                    nextProviderState ? JSON.stringify(nextProviderState) : null,
                    coverage ? JSON.stringify(coverage) : null, receiptId, now
                );

                return {status: ADMISSION_STATUS.ACCEPTED, receiptId}
            }).immediate()
        } catch (err) {
            if (err instanceof ObservationConflict) {
                return {status: ADMISSION_STATUS.CONFLICT, reason: err.reason, digest}
            }
            throw err
        }

        if (outcome.status === ADMISSION_STATUS.ACCEPTED) {
            return {
                status    : ADMISSION_STATUS.ACCEPTED,
                digest,
                receipt   : this.getReceipt(sourceInstanceId, resourceFamily, batchId),
                checkpoint: this.getCheckpoint(sourceInstanceId, resourceFamily)
            }
        }

        return {...outcome, digest}
    }

    /**
     * @summary Authenticated hosted ingress over the same neutral admission transaction as local callers.
     *
     * The remote envelope cannot carry tenantId, sourceInstanceId, or registrationEpoch. Tenant comes
     * from RequestContextService through SourceRegistryService; the neutral provider identity resolves
     * the tenant-scoped registration; and the server injects the current source id + epoch into the exact
     * canonical v1 batch before admission. Structured volume refusals happen before database mutation.
     * @param {Object} envelope `{source, batch}` hosted connector payload.
     * @param {Object} [limits] Test/operator seam for the synchronous work-volume bounds.
     * @returns {Object}
     */
    admitHostedBatch(envelope, {
        maxBytes        = MAX_HOSTED_BATCH_BYTES,
        maxObservations = MAX_HOSTED_OBSERVATIONS
    } = {}) {
        const validation = validateHostedEnvelope(envelope, {maxBytes, maxObservations});

        if (!validation.valid) {
            const volumeExceeded = validation.errors.some(error => error.endsWith('_EXCEEDED'));

            return {
                status: 'conflict',
                reason: 'HOSTED_BOUNDARY_REJECTED',
                code  : volumeExceeded ? 'COMMUNITY_BATCH_VOLUME_EXCEEDED' : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
                errors: validation.errors,
                volume: validation.volume,
                limits: {maxBytes, maxObservations}
            }
        }

        const registration = SourceRegistryService.resolveRegistration(envelope.source);

        if (!registration) {
            return {
                status: 'conflict',
                reason: 'REGISTRATION_NOT_ADMISSIBLE',
                code  : 'COMMUNITY_SOURCE_NOT_FOUND'
            }
        }

        const canonicalBatch = {
            ...envelope.batch,
            sourceInstanceId : registration.sourceInstanceId,
            registrationEpoch: registration.registrationEpoch
        };

        return {
            ...this.admitBatch(canonicalBatch),
            health: this.getHostedSourceHealth({source: envelope.source})
        }
    }

    /**
     * @summary Returns bounded, credential-free readiness for one tenant-scoped hosted source.
     *
     * `lag` is explicitly last-receipt age, not provider-head lag (the provider remains connector-owned).
     * Coverage gaps surface only as counts and stable codes so provider prose never enters a response.
     * @param {Object} request
     * @param {Object} request.source Neutral provider identity.
     * @returns {Object}
     */
    getHostedSourceHealth({source} = {}) {
        if (!source || typeof source !== 'object' || carriesHostedAuthority(source) || carriesCredentialMaterial(source)) {
            return {ready: false, code: 'COMMUNITY_SOURCE_IDENTITY_INVALID'}
        }

        const registration = SourceRegistryService.resolveRegistration(source);

        if (!registration) {
            return {ready: false, code: 'COMMUNITY_SOURCE_NOT_FOUND'}
        }

        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) {
            return {ready: false, code: 'COMMUNITY_SOURCE_TENANT_UNRESOLVED'}
        }

        const partitions = this.db.prepare(
            `SELECT checkpoint.resource_family, checkpoint.checkpoint_version, checkpoint.coverage,
                    checkpoint.last_receipt_id, checkpoint.updated_at, receipt.admitted_at
             FROM mc_community_checkpoint AS checkpoint
             LEFT JOIN mc_community_batch_receipt AS receipt
               ON receipt.tenant_id = checkpoint.tenant_id
              AND receipt.source_instance_id = checkpoint.source_instance_id
              AND receipt.resource_family = checkpoint.resource_family
              AND receipt.receipt_id = checkpoint.last_receipt_id
             WHERE checkpoint.tenant_id = ? AND checkpoint.source_instance_id = ?
             ORDER BY checkpoint.updated_at DESC, checkpoint.resource_family`
        ).all(tenantId, registration.sourceInstanceId).map(row => {
            const coverage = row.coverage ? JSON.parse(row.coverage) : null;

            return {
                resourceFamily   : row.resource_family,
                checkpointVersion: row.checkpoint_version,
                lastReceiptId    : row.last_receipt_id,
                lastReceiptAt    : row.admitted_at,
                gapCount         : Array.isArray(coverage?.gaps) ? coverage.gaps.length : 0
            }
        });

        const
            latest   = partitions[0] || null,
            gapCount = partitions.reduce((sum, partition) => sum + partition.gapCount, 0),
            ready    = registration.lifecycleState === 'ACTIVE';

        return {
            ready,
            code             : ready ? 'COMMUNITY_SOURCE_READY' : `COMMUNITY_SOURCE_${registration.lifecycleState}`,
            sourceInstanceId : registration.sourceInstanceId,
            state            : registration.lifecycleState,
            registrationEpoch: registration.registrationEpoch,
            lastReceipt      : latest ? {
                receiptId     : latest.lastReceiptId,
                resourceFamily: latest.resourceFamily,
                admittedAt    : latest.lastReceiptAt
            } : null,
            lag: latest?.lastReceiptAt ? {
                code   : 'COMMUNITY_SOURCE_LAST_RECEIPT_AGE',
                basis  : 'last-receipt-age',
                valueMs: Math.max(0, Date.now() - latest.lastReceiptAt)
            } : {
                code   : 'COMMUNITY_SOURCE_NEVER_ADMITTED',
                basis  : 'last-receipt-age',
                valueMs: null
            },
            gaps: {
                code : gapCount ? 'COMMUNITY_SOURCE_COVERAGE_GAPS' : 'COMMUNITY_SOURCE_NO_REPORTED_GAPS',
                count: gapCount
            },
            partitions
        }
    }

    /**
     * Loads one receipt, tenant + partition scoped.
     * @param {String} sourceInstanceId
     * @param {String} resourceFamily
     * @param {String} batchId
     * @returns {Object|null}
     */
    getReceipt(sourceInstanceId, resourceFamily, batchId) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return null;

        const row = this.db.prepare(
            `SELECT * FROM mc_community_batch_receipt
             WHERE tenant_id = ? AND source_instance_id = ? AND resource_family = ? AND batch_id = ?`
        ).get(tenantId, sourceInstanceId, resourceFamily, batchId);

        return row ? this.#toReceipt(row) : null;
    }

    /**
     * Reads one partition checkpoint, tenant-scoped. `null` means unset.
     * @param {String} sourceInstanceId
     * @param {String} resourceFamily
     * @returns {Object|null}
     */
    getCheckpoint(sourceInstanceId, resourceFamily) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return null;

        return this.#readCheckpoint(tenantId, sourceInstanceId, resourceFamily)
    }

    /**
     * @summary Lists admitted observations, tenant-scoped, newest sequence last. INSERT-only history —
     * a revision is a new row carrying `revisionOf`, never an update of the row it revises.
     * @param {String} sourceInstanceId
     * @param {Object} [filter]
     * @param {String} [filter.providerEntityId]
     * @returns {Object[]}
     */
    listObservations(sourceInstanceId, {providerEntityId} = {}) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return [];

        const rows = providerEntityId
            ? this.db.prepare(
                  `SELECT * FROM mc_community_observation
                   WHERE tenant_id = ? AND source_instance_id = ? AND provider_entity_id = ?
                   ORDER BY admitted_sequence, occurred_at`
              ).all(tenantId, sourceInstanceId, providerEntityId)
            : this.db.prepare(
                  `SELECT * FROM mc_community_observation
                   WHERE tenant_id = ? AND source_instance_id = ?
                   ORDER BY admitted_sequence, occurred_at`
              ).all(tenantId, sourceInstanceId);

        return rows.map(row => ({
            observationRowId      : row.observation_row_id,
            tenantId              : row.tenant_id,
            sourceInstanceId      : row.source_instance_id,
            occurrenceIdentity    : row.occurrence_identity,
            occurrenceDigest      : row.occurrence_digest,
            providerEntityId      : row.provider_entity_id,
            parentProviderEntityId: row.parent_provider_entity_id,
            occurrenceKind        : row.occurrence_kind,
            occurrenceCoordinate  : row.occurrence_coordinate,
            occurredAt            : row.occurred_at,
            actorId               : row.actor_id,
            actorKind             : row.actor_kind,
            providerState         : row.provider_state,
            sourceAssociation     : row.source_association,
            revisionOf            : row.revision_of,
            absence               : row.absence,
            deletionEvidence      : row.deletion_evidence ? JSON.parse(row.deletion_evidence) : null,
            attentionDisposition  : row.attention_disposition,
            attentionReason       : row.attention_reason,
            receiptId             : row.receipt_id,
            admittedSequence      : row.admitted_sequence,
            admittedAt            : row.admitted_at
        }))
    }

    /**
     * @param {String} tenantId
     * @param {String} sourceInstanceId
     * @param {String} resourceFamily
     * @returns {Object|null}
     * @private
     */
    #readCheckpoint(tenantId, sourceInstanceId, resourceFamily) {
        const row = this.db.prepare(
            `SELECT * FROM mc_community_checkpoint
             WHERE tenant_id = ? AND source_instance_id = ? AND resource_family = ?`
        ).get(tenantId, sourceInstanceId, resourceFamily);

        return row ? {
            tenantId         : row.tenant_id,
            sourceInstanceId : row.source_instance_id,
            resourceFamily   : row.resource_family,
            checkpointVersion: row.checkpoint_version,
            inventoryHash    : row.inventory_hash,
            providerState    : row.provider_state ? JSON.parse(row.provider_state) : null,
            coverage         : row.coverage ? JSON.parse(row.coverage) : null,
            lastReceiptId    : row.last_receipt_id,
            updatedAt        : row.updated_at
        } : null
    }

    /**
     * @param {Object} row
     * @returns {Object}
     * @private
     */
    #toReceipt(row) {
        return {
            receiptId            : row.receipt_id,
            tenantId             : row.tenant_id,
            sourceInstanceId     : row.source_instance_id,
            resourceFamily       : row.resource_family,
            batchId              : row.batch_id,
            digest               : row.digest,
            registrationEpoch    : row.registration_epoch,
            baseCheckpointVersion: row.base_checkpoint_version,
            nextCheckpointVersion: row.next_checkpoint_version,
            baseInventoryHash    : row.base_inventory_hash,
            nextInventoryHash    : row.next_inventory_hash,
            coverage             : row.coverage ? JSON.parse(row.coverage) : null,
            observationCount     : row.observation_count,
            admittedSequence     : row.admitted_sequence,
            admittedAt           : row.admitted_at
        }
    }
}

export default Neo.setupClass(CommunityBatchAdmissionService);
