import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';
import Base   from '../../../src/core/Base.mjs';
import config from '../../mcp/server/neural-link/config.mjs';
import logger from '../../mcp/server/neural-link/logger.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Refuses non-data values before transaction ops are persisted for replay.
 * @param {*} value
 * @param {String} [path='transaction']
 * @param {WeakSet} [seen]
 */
const assertArchiveDataOnly = (value, path='transaction', seen=new WeakSet()) => {
    if (typeof value === 'function') {
        throw new Error(`non-data function value at ${path}`)
    }

    if (!value || typeof value !== 'object') {
        return
    }

    if (seen.has(value)) {
        throw new Error(`cyclic data at ${path}`)
    }

    seen.add(value);

    const prototype = Object.getPrototypeOf(value);

    if (!Array.isArray(value) && prototype && prototype !== Object.prototype) {
        throw new Error(`class-backed data at ${path}`)
    }

    if (Object.hasOwn(value, 'module')) {
        throw new Error(`module class reference at ${path}.module`)
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => assertArchiveDataOnly(item, `${path}[${index}]`, seen));
        return
    }

    Object.entries(value).forEach(([key, item]) => {
        assertArchiveDataOnly(item, `${path}.${key}`, seen)
    })
};

/**
 * @summary Service to intercept and persist Neural Link tool invocations to the Native Graph database.
 * @class Neo.ai.services.neural-link.RecorderService
 * @extends Neo.core.Base
 * @singleton
 */
class RecorderService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.RecorderService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.RecorderService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @protected
         */
        db: null
    }

    /**
     * Initializes the SQLite connection to the Memory Core and ensures the physical nl_action_log
     * schema and indices exist. Uses WAL journal mode to support non-blocking concurrent writes.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        try {
            // Gated OFF by default: no connection is opened, so `this.db` stays null and `log()`
            // no-ops on its existing guard. Quiet by design — one line at boot, never one per tool
            // call about telemetry the seat was never asked to collect.
            //
            // The line is emitted through the Neural Link logger deliberately. That logger is
            // imported at module scope into every process hosting this service, including servers
            // where the Neural Link itself never runs, so a misconfigured sink degrades there
            // silently. A positive marker on the disabled path keeps that failure observable —
            // without it, an empty log stream would satisfy any negative sink assertion.
            if (!config.actionLoggingEnabled) {
                logger.info('[RecorderService] Action logging disabled; nl_action_log not opened.');
                return;
            }

            const dbPath = config.memoryCoreDbPath;
            if (!dbPath) {
                logger.warn('[RecorderService] memoryCoreDbPath not configured. Disabling logging.');
                return;
            }

            await fs.ensureDir(path.dirname(dbPath));
            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, { verbose: null });
            this.db.pragma('journal_mode = WAL');

            // System table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS nl_action_log (
                    id          TEXT PRIMARY KEY,
                    agent_id    TEXT NOT NULL,
                    session_id  TEXT,
                    sequence_id TEXT NOT NULL,
                    timestamp   INTEGER NOT NULL,
                    tool        TEXT NOT NULL,
                    args        TEXT NOT NULL,
                    result      TEXT,
                    success     INTEGER DEFAULT 0,
                    duration_ms INTEGER,
                    app_name    TEXT,
                    reward      REAL DEFAULT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_nl_action_log_sequence  ON nl_action_log(sequence_id);
                CREATE INDEX IF NOT EXISTS idx_nl_action_log_session   ON nl_action_log(session_id);
                CREATE INDEX IF NOT EXISTS idx_nl_action_log_timestamp ON nl_action_log(timestamp);

                CREATE TABLE IF NOT EXISTS nl_transaction_archive (
                    archive_id              TEXT PRIMARY KEY,
                    name                    TEXT,
                    source_tx_id            TEXT NOT NULL,
                    source_agent_id         TEXT,
                    source_agent_session_id TEXT,
                    app_session_id          TEXT,
                    origin_writer           TEXT NOT NULL,
                    committed_at            INTEGER,
                    archived_at             INTEGER NOT NULL,
                    ops                     TEXT NOT NULL,
                    replay_count            INTEGER DEFAULT 0,
                    last_replayed_at        INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_nl_transaction_archive_source_tx
                    ON nl_transaction_archive(source_tx_id);
                CREATE INDEX IF NOT EXISTS idx_nl_transaction_archive_archived
                    ON nl_transaction_archive(archived_at);
            `);

            logger.info('[RecorderService] Connected to Memory Core nl_action_log.');
        } catch (err) {
            logger.warn('[RecorderService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Synchronously persists a specific Neural Link tool invocation into the shared memory core.
     * Guaranteed not to throw or block the main execution thread on persistence failures.
     * @param {Object} entry The invocation payload containing sequences, tool metadata, args, and execution times.
     */
    log(entry) {
        if (!this.db) return;

        try {
            const insertStmt = this.db.prepare(`
                INSERT INTO nl_action_log (
                    id, agent_id, session_id, sequence_id, timestamp,
                    tool, args, result, success, duration_ms, app_name
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `);

            insertStmt.run(
                crypto.randomUUID(),
                entry.agent_id || 'unknown',
                entry.session_id || null,
                entry.sequence_id,
                entry.timestamp,
                entry.tool,
                entry.args,
                entry.result,
                entry.success ? 1 : 0,
                entry.duration_ms,
                entry.app_name || null
            );
        } catch (err) {
            // Swallowing exceptions so it never disrupts the main logic
            logger.error('[RecorderService] Failed to append log entry:', err);
        }
    }

    /**
     * Executes queries against the internal Action Log. Principally used by DreamService triggers
     * to harvest execution chains for automated Playwright test synthesis.
     * @param {Object} config Query parameters and offsets.
     * @param {Number} [config.sinceTimestamp=0] Return logs after this epoch.
     * @param {Number} [config.minSuccessRate] (Not yet implemented) Flattens metrics filtering.
     * @param {Number} [config.limit] Optional hard limit.
     * @returns {Array} An array of matched SQLite row objects.
     */
    querySequences({ sinceTimestamp = 0, minSuccessRate, limit } = {}) {
        if (!this.db) return [];

        try {
            let   sql  = `SELECT * FROM nl_action_log WHERE timestamp >= ?`;
            const args = [sinceTimestamp];

            sql += ` ORDER BY timestamp DESC`;

            if (limit) {
                sql += ` LIMIT ?`;
                args.push(limit);
            }

            return this.db.prepare(sql).all(...args);
        } catch (err) {
            logger.error('[RecorderService] Failed to query sequences:', err);
            return [];
        }
    }

    /**
     * Permanently drops legacy Neural Link action records from the SQLite db to prevent unbounded disk growth.
     * @param {Number} [days=config.pruneLogsAfterDays] The rolling window in days beyond which older records are permanently discarded.
     */
    pruneOlderThan(days = config.pruneLogsAfterDays) {
        if (!this.db) return;

        try {
            const cutoff   = Date.now() - (days * MS_PER_DAY);
            const dropStmt = this.db.prepare(`DELETE FROM nl_action_log WHERE timestamp < ?`);
            dropStmt.run(cutoff);
        } catch (err) {
            logger.error('[RecorderService] Failed to prune logs:', err);
        }
    }

    /**
     * Persists one committed App Worker transaction snapshot as an archive-replay source.
     * @param {Object} params
     * @param {String} [params.appSessionId]
     * @param {String} [params.name]
     * @param {Object} params.transaction
     * @returns {Object} `{saved:Boolean, archiveId?:String, sourceTxId?:String, archivedAt?:Number, opCount?:Number, reason?:String}`
     */
    saveTransactionArchive({appSessionId, name, transaction} = {}) {
        if (!this.db) {
            return {saved: false, reason: 'archive-store-unavailable'}
        }

        if (!transaction || transaction.status !== 'committed' || !Array.isArray(transaction.ops) || transaction.ops.length === 0) {
            return {saved: false, reason: 'invalid-transaction'}
        }

        const originWriter = transaction.originWriter ?? transaction.ops[0]?.originWriter;

        if (!originWriter?.agentId || !originWriter?.sessionId) {
            return {saved: false, reason: 'missing-origin-writer'}
        }

        let opsJson, originWriterJson;

        try {
            assertArchiveDataOnly(transaction.ops, 'transaction.ops');
            opsJson          = JSON.stringify(transaction.ops);
            originWriterJson = JSON.stringify(originWriter)
        } catch (error) {
            return {saved: false, reason: `transaction-not-data-only: ${error.message}`}
        }

        const
            archiveId  = crypto.randomUUID(),
            archivedAt = Date.now();

        try {
            this.db.prepare(`
                INSERT INTO nl_transaction_archive (
                    archive_id, name, source_tx_id, source_agent_id, source_agent_session_id,
                    app_session_id, origin_writer, committed_at, archived_at, ops
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                archiveId,
                typeof name === 'string' && name.trim() ? name.trim() : null,
                transaction.txId,
                originWriter.agentId,
                originWriter.sessionId,
                appSessionId || null,
                originWriterJson,
                Number.isFinite(transaction.committedAt) ? transaction.committedAt : null,
                archivedAt,
                opsJson
            );

            return {
                saved      : true,
                archiveId,
                sourceTxId : transaction.txId,
                archivedAt,
                opCount    : transaction.ops.length,
                originWriter,
                committedAt: Number.isFinite(transaction.committedAt) ? transaction.committedAt : null
            }
        } catch (err) {
            logger.error('[RecorderService] Failed to save transaction archive:', err);
            return {saved: false, reason: 'archive-save-failed'}
        }
    }

    /**
     * Reads one archived transaction for replay.
     * @param {Object} params
     * @param {String} params.archiveId
     * @returns {Object|null}
     */
    getTransactionArchive({archiveId} = {}) {
        if (!this.db || typeof archiveId !== 'string' || archiveId === '') {
            return null
        }

        try {
            const row = this.db.prepare(`
                SELECT * FROM nl_transaction_archive WHERE archive_id = ?
            `).get(archiveId);

            if (!row) {
                return null
            }

            return {
                archiveId     : row.archive_id,
                name          : row.name,
                sourceTxId    : row.source_tx_id,
                appSessionId  : row.app_session_id,
                originWriter  : JSON.parse(row.origin_writer),
                committedAt   : row.committed_at,
                archivedAt    : row.archived_at,
                ops           : JSON.parse(row.ops),
                replayCount   : row.replay_count,
                lastReplayedAt: row.last_replayed_at
            }
        } catch (err) {
            logger.error('[RecorderService] Failed to read transaction archive:', err);
            return null
        }
    }

    /**
     * Records that an archived transaction replay landed successfully.
     * @param {Object} params
     * @param {String} params.archiveId
     * @returns {{updated:Boolean}}
     */
    recordTransactionReplay({archiveId} = {}) {
        if (!this.db || typeof archiveId !== 'string' || archiveId === '') {
            return {updated: false}
        }

        try {
            const result = this.db.prepare(`
                UPDATE nl_transaction_archive
                   SET replay_count = replay_count + 1,
                       last_replayed_at = ?
                 WHERE archive_id = ?
            `).run(Date.now(), archiveId);

            return {updated: result.changes > 0}
        } catch (err) {
            logger.error('[RecorderService] Failed to record transaction replay:', err);
            return {updated: false}
        }
    }
}

export default Neo.setupClass(RecorderService);
