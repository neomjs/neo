import fs                                    from 'fs-extra';
import path                                  from 'path';
import crypto                                from 'crypto';
import Base                                  from '../../../src/core/Base.mjs';
import config                                from '../../mcp/server/memory-core/config.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import SourceRegistryService                 from './SourceRegistryService.mjs';
import {canonicalBatchDigest, validateBatch} from './communityBatchContract.mjs';

/**
 * @summary Admission outcomes. These are RESULTS, not exceptions, because all three are ordinary
 * protocol states a connector must be able to act on: retry safely, stop, or investigate.
 * @member {Object<String,String>}
 */
export const ADMISSION_STATUS = {
    ACCEPTED  : 'accepted',
    IDEMPOTENT: 'idempotent',
    CONFLICT  : 'conflict'
};

/**
 * @summary Atomically admits reproducible community-activity batches into durable history.
 *
 * Providers acquire and normalize; this service validates and admits. Three properties carry the
 * weight:
 *
 * 1. **Admission is epoch-fenced.** A batch is admitted only while its source registration is
 *    `ACTIVE` at the exact epoch the batch declares, so a revoked or reprovisioned source cannot
 *    keep writing under stale authority.
 * 2. **Idempotency is digest-keyed.** The same scoped `batchId` with the same digest is a retry and
 *    changes nothing; the same `batchId` with a DIFFERENT digest is an integrity conflict, never a
 *    silent overwrite — that distinction is the whole reason the digest exists.
 * 3. **Admission is one transaction.** Validation, the fence check, the receipt, and the admitted
 *    sequence commit together or not at all, so a crash cannot leave a receipt without its sequence
 *    or a sequence without its receipt.
 *
 * Tenant scope is server-derived and re-applied in every statement; this table is not covered by
 * GraphService RLS.
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
        db: null
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
            logger.info('[CommunityBatchAdmissionService] Connected to Memory Core mc_community_batch_receipt.');
        } catch (err) {
            logger.warn('[CommunityBatchAdmissionService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Creates the receipt table if absent. The UNIQUE index on `(tenant_id, source_instance_id,
     * batch_id)` is the idempotency key itself — batch identity is scoped, so two tenants may use the
     * same provider-side batch id without colliding.
     * @returns {void}
     */
    ensureSchema() {
        if (!this.db) return;

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS mc_community_batch_receipt (
                receipt_id         TEXT    PRIMARY KEY,
                tenant_id          TEXT    NOT NULL,
                source_instance_id TEXT    NOT NULL,
                batch_id           TEXT    NOT NULL,
                digest             TEXT    NOT NULL,
                partition          TEXT    NOT NULL,
                registration_epoch INTEGER NOT NULL,
                occurrence_count   INTEGER NOT NULL,
                admitted_sequence  INTEGER NOT NULL,
                admitted_at        INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_community_batch_receipt_identity
                ON mc_community_batch_receipt(tenant_id, source_instance_id, batch_id);
            CREATE INDEX IF NOT EXISTS idx_mc_community_batch_receipt_sequence
                ON mc_community_batch_receipt(tenant_id, admitted_sequence);

            CREATE TABLE IF NOT EXISTS mc_community_occurrence (
                occurrence_id      TEXT    PRIMARY KEY,
                tenant_id          TEXT    NOT NULL,
                source_instance_id TEXT    NOT NULL,
                provider_entity_id TEXT    NOT NULL,
                occurrence_kind    TEXT    NOT NULL,
                occurred_at        TEXT    NOT NULL,
                revision_of        TEXT,
                absence            TEXT,
                receipt_id         TEXT    NOT NULL,
                admitted_sequence  INTEGER NOT NULL,
                admitted_at        INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_entity
                ON mc_community_occurrence(tenant_id, source_instance_id, provider_entity_id);
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_receipt
                ON mc_community_occurrence(tenant_id, receipt_id);
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_revision
                ON mc_community_occurrence(tenant_id, revision_of);
        `);
    }

    /**
     * @summary Validates, fences, and atomically admits one batch.
     *
     * Never throws for an ordinary protocol outcome — a conflict is a returned status, because a
     * connector must be able to distinguish "your retry was fine" from "your payload disagrees with
     * what we already durably accepted" without exception-shaped control flow.
     * @param {Object} batch A `community-activity-batch.v1` payload.
     * @returns {Object} `{status, digest, receipt?, errors?}`
     * @throws {Error} `BATCH_ADMISSION_NO_TENANT` when no server tenant resolves (fail closed).
     */
    admitBatch(batch) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) {
            throw new Error('BATCH_ADMISSION_NO_TENANT');
        }

        const {valid, errors} = validateBatch(batch);

        if (!valid) {
            return {status: ADMISSION_STATUS.CONFLICT, reason: 'SCHEMA_INVALID', errors};
        }

        const {batchId, sourceInstanceId, registrationEpoch, partition, occurrences} = batch,
              digest                                                                 = canonicalBatchDigest(batch);

        // The epoch fence: only an ACTIVE registration at this exact epoch may write. A revoked or
        // reprovisioned source fails closed here rather than at the storage layer.
        if (!SourceRegistryService.canAdmit(sourceInstanceId, registrationEpoch)) {
            return {status: ADMISSION_STATUS.CONFLICT, reason: 'REGISTRATION_NOT_ADMISSIBLE', digest};
        }

        const existing = this.db.prepare(
            `SELECT * FROM mc_community_batch_receipt
             WHERE tenant_id = ? AND source_instance_id = ? AND batch_id = ?`
        ).get(tenantId, sourceInstanceId, batchId);

        if (existing) {
            // Same scoped id: a retry only if the payload is byte-identical by digest.
            return existing.digest === digest
                ? {status: ADMISSION_STATUS.IDEMPOTENT, digest, receipt: this.#toCamel(existing)}
                : {status: ADMISSION_STATUS.CONFLICT, reason: 'DIGEST_MISMATCH', digest, receipt: this.#toCamel(existing)};
        }

        const admit = this.db.transaction(() => {
            // Sequence is assigned INSIDE the transaction, so it can never be handed out without a
            // committed receipt (and never skipped by a rolled-back one).
            const nextSequence = (this.db.prepare(
                      `SELECT MAX(admitted_sequence) AS max FROM mc_community_batch_receipt WHERE tenant_id = ?`
                  ).get(tenantId).max || 0) + 1,
                  receiptId = crypto.randomUUID(),
                  now       = Date.now();

            this.db.prepare(
                `INSERT INTO mc_community_batch_receipt (
                    receipt_id, tenant_id, source_instance_id, batch_id, digest, partition,
                    registration_epoch, occurrence_count, admitted_sequence, admitted_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(receiptId, tenantId, sourceInstanceId, batchId, digest, partition,
                  registrationEpoch, occurrences.length, nextSequence, now);

            // The ledger commits with its receipt: a crash can never leave occurrences without the
            // receipt that authorizes them, nor a receipt whose occurrence_count is a lie.
            const insertOccurrence = this.db.prepare(
                `INSERT INTO mc_community_occurrence (
                    occurrence_id, tenant_id, source_instance_id, provider_entity_id, occurrence_kind,
                    occurred_at, revision_of, absence, receipt_id, admitted_sequence, admitted_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            occurrences.forEach(occurrence => {
                // occurrence_id is OURS — deliberately distinct from the provider entity id, the
                // delivering batch/receipt, and the admitted sequence, so no consumer can conflate
                // "which thing happened", "how it reached us", and "in what order we accepted it".
                insertOccurrence.run(
                    crypto.randomUUID(), tenantId, sourceInstanceId, occurrence.providerEntityId,
                    occurrence.occurrenceKind, occurrence.occurredAt, occurrence.revisionOf || null,
                    occurrence.absence || null, receiptId, nextSequence, now
                )
            });

            return receiptId
        });

        return {
            status : ADMISSION_STATUS.ACCEPTED,
            digest,
            receipt: this.getReceipt(sourceInstanceId, batchId, admit())
        }
    }

    /**
     * Loads one receipt, always scoped by the server tenant so a caller cannot read across tenants.
     * @param {String} sourceInstanceId
     * @param {String} batchId
     * @param {String} [receiptId] Unused selector kept for call-site clarity at the admit boundary.
     * @returns {Object|null}
     */
    getReceipt(sourceInstanceId, batchId, receiptId) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return null;

        const row = this.db.prepare(
            `SELECT * FROM mc_community_batch_receipt
             WHERE tenant_id = ? AND source_instance_id = ? AND batch_id = ?`
        ).get(tenantId, sourceInstanceId, batchId);

        return row ? this.#toCamel(row) : null;
    }

    /**
     * @summary Lists admitted occurrences, tenant-scoped, newest sequence last.
     *
     * The ledger is INSERT-only: a revision is a new occurrence carrying `revisionOf`, never an
     * update of the row it revises, so history stays reconstructible rather than overwritten.
     * @param {String} sourceInstanceId
     * @param {Object} [filter]
     * @param {String} [filter.providerEntityId] Narrow to one provider entity's history.
     * @returns {Object[]}
     */
    listOccurrences(sourceInstanceId, {providerEntityId} = {}) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return [];

        const rows = providerEntityId
            ? this.db.prepare(
                  `SELECT * FROM mc_community_occurrence
                   WHERE tenant_id = ? AND source_instance_id = ? AND provider_entity_id = ?
                   ORDER BY admitted_sequence, occurred_at`
              ).all(tenantId, sourceInstanceId, providerEntityId)
            : this.db.prepare(
                  `SELECT * FROM mc_community_occurrence
                   WHERE tenant_id = ? AND source_instance_id = ?
                   ORDER BY admitted_sequence, occurred_at`
              ).all(tenantId, sourceInstanceId);

        return rows.map(row => ({
            occurrenceId    : row.occurrence_id,
            tenantId        : row.tenant_id,
            sourceInstanceId: row.source_instance_id,
            providerEntityId: row.provider_entity_id,
            occurrenceKind  : row.occurrence_kind,
            occurredAt      : row.occurred_at,
            revisionOf      : row.revision_of,
            absence         : row.absence,
            receiptId       : row.receipt_id,
            admittedSequence: row.admitted_sequence,
            admittedAt      : row.admitted_at
        }))
    }

    /**
     * Maps a snake_case receipt row to the camelCase contract shape.
     * @param {Object} row
     * @returns {Object}
     * @private
     */
    #toCamel(row) {
        return {
            receiptId        : row.receipt_id,
            tenantId         : row.tenant_id,
            sourceInstanceId : row.source_instance_id,
            batchId          : row.batch_id,
            digest           : row.digest,
            partition        : row.partition,
            registrationEpoch: row.registration_epoch,
            occurrenceCount  : row.occurrence_count,
            admittedSequence : row.admitted_sequence,
            admittedAt       : row.admitted_at
        }
    }
}

export default Neo.setupClass(CommunityBatchAdmissionService);
