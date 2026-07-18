import fs                                    from 'fs-extra';
import path                                  from 'path';
import crypto                                from 'crypto';
import Base                                  from '../../../src/core/Base.mjs';
import config                                from '../../mcp/server/memory-core/config.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import SourceRegistryService                 from './SourceRegistryService.mjs';
import {canonicalBatchDigest, validateBatch} from './communityBatchContract.mjs';
import {classifyAttention}                   from './communityAttentionClassifier.mjs';

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
 * @summary Checkpoint-advance outcomes. A conflict is a normal race result, not an error: the loser
 * re-reads the returned server state and retries from it.
 * @member {Object<String,String>}
 */
export const CHECKPOINT_STATUS = {
    ADVANCED: 'advanced',
    CONFLICT: 'conflict'
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
        db: null,
        /**
         * @member {Object|null} attentionPolicy=null
         * @summary The injected attention-classification policy — response-bearing kinds, rostered
         * actors, known bots, and any recorded bot dispositions.
         *
         * Required, never defaulted: an accepted row must carry an evidence-backed disposition, so
         * admitting without a policy would either fabricate one or write dispositionless history.
         * Both are worse than refusing, hence the loud failure in {@link #admitBatch}.
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
                revision_of          TEXT,
                absence              TEXT,
                actor_id             TEXT,
                attention_disposition TEXT NOT NULL,
                attention_reason      TEXT NOT NULL,
                receipt_id           TEXT    NOT NULL,
                admitted_sequence    INTEGER NOT NULL,
                admitted_at          INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_attention
                ON mc_community_occurrence(tenant_id, attention_disposition);
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_entity
                ON mc_community_occurrence(tenant_id, source_instance_id, provider_entity_id);
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_receipt
                ON mc_community_occurrence(tenant_id, receipt_id);
            CREATE INDEX IF NOT EXISTS idx_mc_community_occurrence_revision
                ON mc_community_occurrence(tenant_id, revision_of);

            CREATE TABLE IF NOT EXISTS mc_community_checkpoint (
                tenant_id          TEXT    NOT NULL,
                source_instance_id TEXT    NOT NULL,
                partition          TEXT    NOT NULL,
                basis              TEXT    NOT NULL,
                last_receipt_id    TEXT    NOT NULL,
                admitted_sequence  INTEGER NOT NULL,
                updated_at         INTEGER NOT NULL,
                PRIMARY KEY (tenant_id, source_instance_id, partition)
            );
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

        // Fail loud rather than admit history without an evidence-backed disposition.
        if (!this.attentionPolicy) {
            throw new Error('ATTENTION_POLICY_NOT_CONFIGURED');
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
                    occurred_at, revision_of, absence, actor_id, attention_disposition,
                    attention_reason, receipt_id, admitted_sequence, admitted_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            occurrences.forEach(occurrence => {
                // occurrence_id is OURS — deliberately distinct from the provider entity id, the
                // delivering batch/receipt, and the admitted sequence, so no consumer can conflate
                // "which thing happened", "how it reached us", and "in what order we accepted it".
                // Classification happens INSIDE the admission transaction, so an accepted row can
                // never exist without its evidence-backed disposition. Its output is server policy
                // and stays out of the digest, so revising policy cannot look like corruption.
                const {disposition, reason} = classifyAttention(occurrence, this.attentionPolicy);

                insertOccurrence.run(
                    crypto.randomUUID(), tenantId, sourceInstanceId, occurrence.providerEntityId,
                    occurrence.occurrenceKind, occurrence.occurredAt, occurrence.revisionOf || null,
                    occurrence.absence || null, occurrence.actorId || null, disposition, reason,
                    receiptId, nextSequence, now
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
     * @summary Advances a partition checkpoint as a compare-and-swap against the basis the caller read.
     *
     * Two preconditions, both refusals rather than best-effort writes:
     *
     * 1. **Durable acceptance.** The cited receipt must already be committed for this tenant, source
     *    and partition — a cursor may only move to a basis some accepted batch actually established.
     *    Advancing before durable receipt is exactly how events get skipped.
     * 2. **Expected basis.** The UPDATE predicate carries the basis the caller observed, so a writer
     *    whose view was superseded matches zero rows. A losing writer gets the CURRENT server state
     *    back and never advances destructively — a regressed or forked cursor is worse than a retry.
     * @param {String} sourceInstanceId
     * @param {String} partition
     * @param {Object} advance
     * @param {String|null} [advance.expectedBasis=null] The observed basis; `null` claims an unset checkpoint.
     * @param {String} advance.toBasis
     * @param {String} advance.receiptId The durably-accepted receipt establishing `toBasis`.
     * @returns {Object} `{status, reason?, checkpoint}`
     * @throws {Error} `BATCH_ADMISSION_NO_TENANT` | `CHECKPOINT_ADVANCE_ARGUMENTS_REQUIRED`
     */
    advanceCheckpoint(sourceInstanceId, partition, {expectedBasis = null, toBasis, receiptId} = {}) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) {
            throw new Error('BATCH_ADMISSION_NO_TENANT');
        }

        if (!toBasis || !receiptId) {
            throw new Error('CHECKPOINT_ADVANCE_ARGUMENTS_REQUIRED');
        }

        const receipt = this.db.prepare(
            `SELECT admitted_sequence FROM mc_community_batch_receipt
             WHERE tenant_id = ? AND source_instance_id = ? AND receipt_id = ? AND partition = ?`
        ).get(tenantId, sourceInstanceId, receiptId, partition);

        if (!receipt) {
            return {
                status    : CHECKPOINT_STATUS.CONFLICT,
                reason    : 'RECEIPT_NOT_DURABLE',
                checkpoint: this.getCheckpoint(sourceInstanceId, partition)
            }
        }

        const
            now    = Date.now(),
            result = expectedBasis === null
                // Claiming an unset checkpoint: OR IGNORE makes the race decidable — a second
                // claimant changes zero rows instead of clobbering the first.
                ? this.db.prepare(
                      `INSERT OR IGNORE INTO mc_community_checkpoint
                          (tenant_id, source_instance_id, partition, basis, last_receipt_id, admitted_sequence, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`
                  ).run(tenantId, sourceInstanceId, partition, toBasis, receiptId, receipt.admitted_sequence, now)
                : this.db.prepare(
                      `UPDATE mc_community_checkpoint
                          SET basis = ?, last_receipt_id = ?, admitted_sequence = ?, updated_at = ?
                        WHERE tenant_id = ? AND source_instance_id = ? AND partition = ? AND basis = ?`
                  ).run(toBasis, receiptId, receipt.admitted_sequence, now, tenantId, sourceInstanceId, partition, expectedBasis);

        return result.changes === 1
            ? {status: CHECKPOINT_STATUS.ADVANCED, checkpoint: this.getCheckpoint(sourceInstanceId, partition)}
            : {status: CHECKPOINT_STATUS.CONFLICT, reason: 'BASIS_MISMATCH', checkpoint: this.getCheckpoint(sourceInstanceId, partition)}
    }

    /**
     * Reads one partition checkpoint, tenant-scoped. `null` means unset — distinct from a checkpoint
     * whose basis happens to be empty.
     * @param {String} sourceInstanceId
     * @param {String} partition
     * @returns {Object|null}
     */
    getCheckpoint(sourceInstanceId, partition) {
        const tenantId = SourceRegistryService.resolveTenantId();

        if (!tenantId) return null;

        const row = this.db.prepare(
            `SELECT * FROM mc_community_checkpoint
             WHERE tenant_id = ? AND source_instance_id = ? AND partition = ?`
        ).get(tenantId, sourceInstanceId, partition);

        return row ? {
            tenantId        : row.tenant_id,
            sourceInstanceId: row.source_instance_id,
            partition       : row.partition,
            basis           : row.basis,
            lastReceiptId   : row.last_receipt_id,
            admittedSequence: row.admitted_sequence,
            updatedAt       : row.updated_at
        } : null
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
            occurrenceId        : row.occurrence_id,
            tenantId            : row.tenant_id,
            sourceInstanceId    : row.source_instance_id,
            providerEntityId    : row.provider_entity_id,
            occurrenceKind      : row.occurrence_kind,
            occurredAt          : row.occurred_at,
            revisionOf          : row.revision_of,
            absence             : row.absence,
            actorId             : row.actor_id,
            attentionDisposition: row.attention_disposition,
            attentionReason     : row.attention_reason,
            receiptId           : row.receipt_id,
            admittedSequence    : row.admitted_sequence,
            admittedAt          : row.admitted_at
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
