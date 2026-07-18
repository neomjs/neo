import fs                                                                           from 'fs-extra';
import path                                                                         from 'path';
import crypto                                                                       from 'crypto';
import Base                                                                         from '../../../src/core/Base.mjs';
import config                                                                       from '../../mcp/server/memory-core/config.mjs';
import logger                                                                       from '../../mcp/server/memory-core/logger.mjs';
import SourceRegistryService                                                        from './SourceRegistryService.mjs';
import {classifyAttention}                                                          from './communityAttentionClassifier.mjs';
import {canonicalBatchDigest, validateBatch, occurrenceIdentity, observationDigest} from './communityBatchContract.mjs';

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

            this.ensureSchema();
            logger.info('[CommunityBatchAdmissionService] Connected to Memory Core community admission tables.');
        } catch (err) {
            logger.warn('[CommunityBatchAdmissionService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Creates the admission tables if absent. Receipt identity is scoped by `resourceFamily` (the CAS
     * partition), so a `batchId` reused across families never collides.
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
                occurrence_kind       TEXT    NOT NULL,
                occurrence_coordinate TEXT    NOT NULL,
                occurred_at           TEXT    NOT NULL,
                actor_id              TEXT,
                actor_kind            TEXT    NOT NULL,
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
    }

    /**
     * @summary Validates, fences, and atomically admits one batch in a single serialized transaction.
     *
     * Never throws for an ordinary protocol outcome — a conflict is a returned status. The transaction
     * runs the nine admission steps in order: (1) verify the ACTIVE registration + epoch INSIDE the
     * boundary; (2) check the partition-scoped `batchId` receipt; (3) return the prior result for the
     * same digest; (4) fail closed for the same `batchId` with a different digest; (5) verify the base
     * checkpoint version + inventory hash; (6) dedup overlapping observations by occurrence identity +
     * digest; (7) fail closed when the same occurrence carries a different digest; (8) admit a genuinely
     * new occurrence as an immutable fact; (9) persist provider state/inventory/coverage/receipt and
     * advance the partition.
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
            outcome = this.db.transaction(() => {
                // Step 1 — the epoch fence, inside the serialized boundary (not a pre-transaction read).
                if (!SourceRegistryService.canAdmit(sourceInstanceId, registrationEpoch)) {
                    return {status: ADMISSION_STATUS.CONFLICT, reason: 'REGISTRATION_NOT_ADMISSIBLE'}
                }

                // Steps 2-4 — the partition-scoped batch idempotency key.
                const existing = this.db.prepare(
                    `SELECT * FROM mc_community_batch_receipt
                     WHERE tenant_id = ? AND source_instance_id = ? AND resource_family = ? AND batch_id = ?`
                ).get(tenantId, sourceInstanceId, resourceFamily, batchId);

                if (existing) {
                    return existing.digest === digest
                        ? {status: ADMISSION_STATUS.IDEMPOTENT, receipt: this.#toReceipt(existing)}
                        : {status: ADMISSION_STATUS.CONFLICT, reason: 'DIGEST_MISMATCH', receipt: this.#toReceipt(existing)}
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
                        provider_entity_id, occurrence_kind, occurrence_coordinate, occurred_at, actor_id,
                        actor_kind, revision_of, absence, deletion_evidence, attention_disposition,
                        attention_reason, receipt_id, admitted_sequence, admitted_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                for (const observation of observations) {
                    const identity = occurrenceIdentity(sourceInstanceId, observation),
                          oDigest  = observationDigest(observation),
                          prior    = this.db.prepare(
                              `SELECT occurrence_digest FROM mc_community_observation WHERE tenant_id = ? AND occurrence_identity = ?`
                          ).get(tenantId, identity);

                    if (prior) {
                        // Step 6 — same identity + same digest: already durable, dedup silently.
                        if (prior.occurrence_digest === oDigest) continue;
                        // Step 7 — same identity + different digest: integrity conflict, abort.
                        throw new ObservationConflict('OBSERVATION_DIGEST_MISMATCH')
                    }

                    // Step 8 — a new occurrence/revision is a new immutable fact.
                    const {disposition, reason} = classifyAttention(observation, this.attentionPolicy);

                    insertObservation.run(
                        crypto.randomUUID(), tenantId, sourceInstanceId, identity, oDigest,
                        observation.providerEntityId, observation.occurrenceKind, observation.occurrenceCoordinate,
                        observation.occurredAt, observation.actorId || null, observation.actorKind,
                        observation.revisionOf || null, observation.absence || null,
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
            })()
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
            observationRowId    : row.observation_row_id,
            tenantId            : row.tenant_id,
            sourceInstanceId    : row.source_instance_id,
            occurrenceIdentity  : row.occurrence_identity,
            occurrenceDigest    : row.occurrence_digest,
            providerEntityId    : row.provider_entity_id,
            occurrenceKind      : row.occurrence_kind,
            occurrenceCoordinate: row.occurrence_coordinate,
            occurredAt          : row.occurred_at,
            actorId             : row.actor_id,
            actorKind           : row.actor_kind,
            revisionOf          : row.revision_of,
            absence             : row.absence,
            deletionEvidence    : row.deletion_evidence ? JSON.parse(row.deletion_evidence) : null,
            attentionDisposition: row.attention_disposition,
            attentionReason     : row.attention_reason,
            receiptId           : row.receipt_id,
            admittedSequence    : row.admitted_sequence,
            admittedAt          : row.admitted_at
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
