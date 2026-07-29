import {isDeepStrictEqual}    from 'node:util';
import {gunzipSync, gzipSync} from 'node:zlib';

import {verifyPersistedVector} from './verifyPersistedVector.mjs';

/**
 * @module ai/services/memory-core/helpers/sessionSummaryReceiptStore
 * @summary Durable, bounded replay receipts for derived session-summary rows.
 *
 * Chroma is a disposable projection and may lose a just-acknowledged write when the
 * supervisor force-recycles the daemon. The SQLite `SummarizationJobs` row therefore
 * retains exactly one compressed result envelope per session: new synthesis overwrites
 * the prior envelope, and `purgeSession()` removes it with the coordinator row. This is
 * deliberately not an append-only journal.
 */

/**
 * @summary Stable gzip/JSON transport framing for receipt envelopes.
 *
 * The encoding label remains backward-compatible for persisted rows; the decoded envelope's
 * numeric `version` owns schema evolution inside that framing.
 */
export const SESSION_SUMMARY_RECEIPT_ENCODING = 'gzip-json-v1';

/**
 * @summary Declares the complete metadata write-set owned by session-summary synthesis.
 *
 * `unclassifiedSourceCount` and `userId` are conditional at issuance; every other key is
 * required. Keeping the allowed set explicit makes a new or accidentally dropped synthesis
 * field fail at the receipt boundary instead of silently narrowing replay verification.
 * Dream-owned overlays such as `graphDigested` and `digestState` deliberately remain outside
 * this boundary.
 */
export const SESSION_SUMMARY_RECEIPT_METADATA_KEYS = Object.freeze([
    'sessionId',
    'timestamp',
    'memoryCount',
    'dreamInputRevision',
    'title',
    'category',
    'quality',
    'productivity',
    'impact',
    'complexity',
    'technologies',
    'participatingAgents',
    'models',
    'totalToolCalls',
    'toolsUsed',
    'sourceAgentIdentities',
    'sourceTrustTier',
    'provenancePolicy',
    'sourceTier',
    'degraded',
    'rawCanonical',
    'unclassifiedSourceCount',
    'userId'
]);

const DEFAULT_RECOVERY_BATCH_SIZE    = 100;
const OPTIONAL_RECEIPT_METADATA_KEYS = new Set([
    'unclassifiedSourceCount',
    'userId'
]);
export const REQUIRED_RECEIPT_METADATA_KEYS = Object.freeze(SESSION_SUMMARY_RECEIPT_METADATA_KEYS.filter(
    key => !OPTIONAL_RECEIPT_METADATA_KEYS.has(key)
));
const SESSION_SUMMARY_RECEIPT_METADATA_KEY_SET = new Set(SESSION_SUMMARY_RECEIPT_METADATA_KEYS);

/**
 * @summary Validates the stable outer structure shared by current and historical receipts.
 * @param {Object} receipt
 * @param {String} receipt.sessionId
 * @param {String} receipt.summaryId
 * @param {String} receipt.document
 * @param {Object} receipt.metadata
 * @returns {Object} The validated receipt.
 */
function validateReceiptStructure(receipt) {
    if (typeof receipt?.sessionId !== 'string' || !receipt.sessionId) {
        throw new TypeError('Session-summary receipt requires a non-empty sessionId.');
    }
    if (receipt.summaryId !== `summary_${receipt.sessionId}`) {
        throw new TypeError(`Session-summary receipt id must be summary_${receipt.sessionId}.`);
    }
    if (typeof receipt.document !== 'string') {
        throw new TypeError('Session-summary receipt document must be a string.');
    }
    if (!receipt.metadata || typeof receipt.metadata !== 'object' || Array.isArray(receipt.metadata)) {
        throw new TypeError('Session-summary receipt metadata must be an object.');
    }

    return receipt;
}

/**
 * @summary Enforces the current synthesis-owned metadata contract when issuing a receipt.
 *
 * Decode intentionally uses only structural validation because persisted version-1 envelopes
 * predate the metadata key-set contract. This strict issuance boundary prevents new drift
 * without making historical durable recovery dependent on today's metadata schema.
 *
 * @param {Object} receipt
 * @returns {Object} The validated current receipt.
 */
function validateReceiptIssuance(receipt) {
    const validated           = validateReceiptStructure(receipt);
    const unknownMetadataKeys = Object.keys(receipt.metadata)
        .filter(key => !SESSION_SUMMARY_RECEIPT_METADATA_KEY_SET.has(key));
    if (unknownMetadataKeys.length > 0) {
        throw new TypeError(`Session-summary receipt metadata contains unowned keys: ${unknownMetadataKeys.join(', ')}.`);
    }

    const missingMetadataKeys = REQUIRED_RECEIPT_METADATA_KEYS
        .filter(key => !Object.hasOwn(receipt.metadata, key));
    if (missingMetadataKeys.length > 0) {
        throw new TypeError(`Session-summary receipt metadata is missing owned keys: ${missingMetadataKeys.join(', ')}.`);
    }

    return validated;
}

/**
 * @summary Encodes one exact Chroma summary row as a compact SQLite BLOB.
 * @param {Object} receipt Exact summary row.
 * @returns {Buffer}
 */
export function encodeSessionSummaryReceipt(receipt) {
    const validated = validateReceiptIssuance(receipt);

    return gzipSync(Buffer.from(JSON.stringify({
        version  : 2,
        sessionId: validated.sessionId,
        summaryId: validated.summaryId,
        document : validated.document,
        metadata : validated.metadata
    }), 'utf8'));
}

/**
 * @summary Decodes and validates one durable session-summary result envelope.
 * @param {Buffer|Uint8Array} envelope
 * @param {String} encoding
 * @returns {{version:Number,sessionId:String,summaryId:String,document:String,metadata:Object}}
 */
export function decodeSessionSummaryReceipt(envelope, encoding) {
    if (encoding !== SESSION_SUMMARY_RECEIPT_ENCODING) {
        throw new Error(`Unsupported session-summary receipt encoding: ${String(encoding)}.`);
    }
    if (!envelope) {
        throw new Error('Session-summary receipt envelope is empty.');
    }

    let receipt;

    try {
        receipt = JSON.parse(gunzipSync(Buffer.from(envelope)).toString('utf8'));
    } catch (error) {
        throw new Error(`Session-summary receipt envelope is corrupt: ${error.message}`, {cause: error});
    }

    if (![1, 2].includes(receipt?.version)) {
        throw new Error(`Unsupported session-summary receipt version: ${String(receipt?.version)}.`);
    }

    return validateReceiptStructure(receipt);
}

/**
 * @summary Atomically stages the exact result envelope before `summarizeSession()` may return.
 *
 * The current coordinator status/lease is preserved while an active job is finishing.
 * A direct re-synthesis over an already-completed row reopens it as `pending`, preventing
 * the old completion state from acknowledging the newly staged result prematurely.
 *
 * @param {Object} options
 * @param {Object} options.db Open better-sqlite3 connection.
 * @param {String} options.sessionId
 * @param {String} options.summaryId
 * @param {String} options.document
 * @param {Object} options.metadata
 * @param {Number} [options.now=Date.now()]
 * @returns {{bytes:Number,encoding:String,stagedAt:Number}}
 */
export function stageSessionSummaryReceipt({
    db,
    sessionId,
    summaryId,
    document,
    metadata,
    now = Date.now()
} = {}) {
    if (!db?.open) {
        throw new Error('Cannot stage session-summary receipt: SQLite graph is unavailable.');
    }

    const envelope = encodeSessionSummaryReceipt({sessionId, summaryId, document, metadata});
    const stagedAt = Number(now);

    db.prepare(`
        INSERT INTO SummarizationJobs (
            session_id,
            status,
            lease_token,
            expires_at,
            retry_count,
            result_envelope,
            result_encoding,
            result_staged_at,
            result_acknowledged_at,
            result_last_replayed_at
        )
        VALUES (?, 'pending', NULL, NULL, 0, ?, ?, ?, NULL, NULL)
        ON CONFLICT(session_id) DO UPDATE SET
            status = CASE
                WHEN SummarizationJobs.status = 'completed' THEN 'pending'
                ELSE SummarizationJobs.status
            END,
            lease_token = CASE
                WHEN SummarizationJobs.status = 'completed' THEN NULL
                ELSE SummarizationJobs.lease_token
            END,
            expires_at = CASE
                WHEN SummarizationJobs.status = 'completed' THEN NULL
                ELSE SummarizationJobs.expires_at
            END,
            result_envelope         = excluded.result_envelope,
            result_encoding         = excluded.result_encoding,
            result_staged_at        = excluded.result_staged_at,
            result_acknowledged_at  = NULL,
            result_last_replayed_at = NULL
    `).run(sessionId, envelope, SESSION_SUMMARY_RECEIPT_ENCODING, stagedAt);

    return {
        bytes   : envelope.byteLength,
        encoding: SESSION_SUMMARY_RECEIPT_ENCODING,
        stagedAt
    };
}

/**
 * @summary Marks a staged result completed only when its durable envelope exists.
 * @param {Object} options
 * @param {Object} options.db Open better-sqlite3 connection.
 * @param {String} options.sessionId
 * @param {Number} [options.now=Date.now()]
 * @returns {Boolean}
 */
export function acknowledgeSessionSummaryReceipt({db, sessionId, now = Date.now()} = {}) {
    if (!db?.open) {
        throw new Error('Cannot acknowledge session-summary receipt: SQLite graph is unavailable.');
    }

    const result = db.prepare(`
        UPDATE SummarizationJobs
        SET status                 = 'completed',
            lease_token            = NULL,
            expires_at             = NULL,
            result_acknowledged_at = ?
        WHERE session_id = ?
          AND result_envelope IS NOT NULL
          AND result_encoding = ?
    `).run(Number(now), sessionId, SESSION_SUMMARY_RECEIPT_ENCODING);

    if (result.changes !== 1) {
        throw new Error(`Cannot acknowledge session summary ${sessionId}: no durable result envelope exists.`);
    }

    return true;
}

/**
 * @summary Compares one Chroma row with the synthesis-owned fields in its durable receipt.
 *
 * DreamService legitimately adds graph-digestion lifecycle fields to the same metadata
 * object after synthesis. Those downstream-owned overlays do not make the acknowledged
 * synthesis result stale. The receipt remains exact for its document and the metadata key set
 * owned by its envelope version: version 1 uses its frozen issuance-era keys, while current
 * envelopes enforce the full declared synthesis-owned key set. A missing or changed
 * receipt-owned value still requires replay.
 *
 * @param {Object|undefined} row
 * @param {Object} receipt
 * @returns {Boolean}
 */
function matchesSessionSummaryReceipt(row, receipt) {
    if (row?.document !== receipt.document || !row.metadata) {
        return false;
    }

    // Version 1 is a closed issuance schema, so its own frozen metadata keys are authoritative.
    // Applying the current declared set would require dreamInputRevision, which v1 cannot carry:
    // recovery would replay, Chroma would preserve that newer overlay, and the next sweep would
    // mismatch again — #16110's retained-v1 non-convergent loop (ticket-ref-ok: exact failure anchor).
    const ownedKeys = receipt.version === 1
        ? Object.keys(receipt.metadata)
        : SESSION_SUMMARY_RECEIPT_METADATA_KEYS;

    return ownedKeys.every(key => {
        const receiptHasKey = Object.hasOwn(receipt.metadata, key),
              rowHasKey     = Object.hasOwn(row.metadata, key);

        return receiptHasKey === rowHasKey &&
            (!receiptHasKey || isDeepStrictEqual(row.metadata[key], receipt.metadata[key]));
    });
}

/**
 * @summary Converts Chroma's parallel result arrays into an id-keyed row map.
 * @param {Object} result
 * @returns {Map<String,{document:String,metadata:Object}>}
 */
function mapSummaryRows(result) {
    const rows = new Map();

    for (let index = 0; index < (result?.ids?.length || 0); index++) {
        rows.set(result.ids[index], {
            document: result.documents?.[index],
            metadata: result.metadatas?.[index]
        });
    }

    return rows;
}

/**
 * @summary Finalizes one recovered receipt without overwriting a newer staged result.
 * @param {Object} options
 * @param {Object} options.db
 * @param {Object} options.row SQLite receipt row.
 * @param {Boolean} options.replayed
 * @param {Number} options.now
 * @returns {Boolean} Whether this exact receipt still owned the coordinator row.
 */
function finalizeRecoveredReceipt({db, row, replayed, now}) {
    const result = db.prepare(`
        UPDATE SummarizationJobs
        SET status                  = 'completed',
            lease_token             = NULL,
            expires_at              = NULL,
            result_acknowledged_at  = COALESCE(result_acknowledged_at, ?),
            result_last_replayed_at = CASE WHEN ? = 1 THEN ? ELSE result_last_replayed_at END
        WHERE session_id = ?
          AND result_envelope = ?
          AND result_encoding = ?
          AND result_staged_at = ?
    `).run(
        now,
        replayed ? 1 : 0,
        now,
        row.session_id,
        row.result_envelope,
        row.result_encoding,
        row.result_staged_at
    );

    return result.changes === 1;
}

/**
 * @summary Replays durable summary envelopes into Chroma without model synthesis.
 *
 * Recovery skips a still-live `in_progress` lease to avoid racing the writer between
 * staging and its immediate acknowledgement. Completed, pending, failed, and expired
 * staged receipts are exact-replayed as needed, strictly read back, and finalized.
 * Corrupt envelopes or failed read-backs throw while retaining the only replay copy.
 *
 * @param {Object} options
 * @param {Object} options.db Open better-sqlite3 connection.
 * @param {Object} options.collection Chroma summary collection.
 * @param {String|null} [options.sessionId=null] Optional single-session recovery scope.
 * @param {Number} [options.expectedDimension] Expected vector dimension for the existing
 *     fail-soft vector integrity check.
 * @param {Object} [options.log]
 * @param {Number} [options.now=Date.now()]
 * @param {Number} [options.batchSize=100]
 * @returns {Promise<{scanned:Number,present:Number,replayed:Number,completed:Number,skippedActive:Number,superseded:Number}>}
 */
export async function recoverSessionSummaryReceipts({
    db,
    collection,
    sessionId = null,
    expectedDimension,
    log,
    now = Date.now(),
    batchSize = DEFAULT_RECOVERY_BATCH_SIZE
} = {}) {
    if (!db?.open) {
        throw new Error('Cannot recover session-summary receipts: SQLite graph is unavailable.');
    }
    if (!collection?.get || !collection?.upsert) {
        throw new TypeError('Cannot recover session-summary receipts: Chroma summary collection is unavailable.');
    }

    const numericBatchSize = Number.isInteger(batchSize) && batchSize > 0
        ? batchSize
        : DEFAULT_RECOVERY_BATCH_SIZE;
    const stats = {
        scanned      : 0,
        present      : 0,
        replayed     : 0,
        completed    : 0,
        skippedActive: 0,
        superseded   : 0
    };
    let afterRowId = 0;

    while (true) {
        const rows = sessionId
            ? db.prepare(`
                SELECT rowid AS receipt_rowid, *
                FROM SummarizationJobs
                WHERE session_id = ?
                  AND result_envelope IS NOT NULL
                LIMIT 1
            `).all(sessionId)
            : db.prepare(`
                SELECT rowid AS receipt_rowid, *
                FROM SummarizationJobs
                WHERE rowid > ?
                  AND result_envelope IS NOT NULL
                ORDER BY rowid ASC
                LIMIT ?
            `).all(afterRowId, numericBatchSize);

        if (rows.length === 0) break;
        afterRowId = rows.at(-1).receipt_rowid;
        stats.scanned += rows.length;

        const recoverable = [];

        for (const row of rows) {
            if (row.status === 'in_progress' && Number(row.expires_at) >= Number(now)) {
                stats.skippedActive++;
                continue;
            }

            const receipt = decodeSessionSummaryReceipt(row.result_envelope, row.result_encoding);

            if (receipt.sessionId !== row.session_id) {
                throw new Error(`Session-summary receipt row ${row.session_id} contains payload for ${receipt.sessionId}.`);
            }

            recoverable.push({row, receipt});
        }

        if (recoverable.length > 0) {
            const liveResult = await collection.get({
                ids    : recoverable.map(item => item.receipt.summaryId),
                include: ['documents', 'metadatas']
            });
            let liveRows = mapSummaryRows(liveResult);

            const toReplay = recoverable.filter(item =>
                !matchesSessionSummaryReceipt(liveRows.get(item.receipt.summaryId), item.receipt)
            );

            if (toReplay.length > 0) {
                await collection.upsert({
                    ids      : toReplay.map(item => item.receipt.summaryId),
                    documents: toReplay.map(item => item.receipt.document),
                    metadatas: toReplay.map(item => item.receipt.metadata)
                });

                const readBack = await collection.get({
                    ids    : toReplay.map(item => item.receipt.summaryId),
                    include: ['documents', 'metadatas']
                });
                liveRows = mapSummaryRows(readBack);

                for (const item of toReplay) {
                    if (!matchesSessionSummaryReceipt(liveRows.get(item.receipt.summaryId), item.receipt)) {
                        throw new Error(`Session-summary receipt replay verification failed for ${item.receipt.summaryId}.`);
                    }

                    await verifyPersistedVector(
                        collection,
                        item.receipt.summaryId,
                        expectedDimension,
                        log,
                        'replayed session summary'
                    );
                }
            }

            const replayedIds = new Set(toReplay.map(item => item.receipt.summaryId));

            for (const item of recoverable) {
                const replayed = replayedIds.has(item.receipt.summaryId);

                if (replayed) {
                    stats.replayed++;
                    log?.info?.(`[sessionSummaryReceiptStore] Replayed durable session summary ${item.receipt.summaryId}.`);
                } else {
                    stats.present++;
                }

                if (finalizeRecoveredReceipt({db, row: item.row, replayed, now: Number(now)})) {
                    stats.completed++;
                } else {
                    stats.superseded++;
                    log?.warn?.(`[sessionSummaryReceiptStore] Receipt ${item.receipt.summaryId} was superseded during recovery; left for the next pass.`);
                }
            }
        }

        if (sessionId || rows.length < numericBatchSize) break;
    }

    return stats;
}
