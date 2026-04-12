import crypto from 'crypto';
import fs     from 'fs-extra';
import path   from 'path';
import Base   from '../../../../../src/core/Base.mjs';
import config from '../config.mjs';

/**
 * @summary Service to intercept and persist Neural Link tool invocations to the Native Graph database.
 * @class Neo.ai.mcp.server.neural-link.services.RecorderService
 * @extends Neo.core.Base
 * @singleton
 */
class RecorderService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.RecorderService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.RecorderService',
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
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        
        try {
            const dbPath = config.memoryCoreDbPath;
            if (!dbPath) {
                console.warn('[RecorderService] memoryCoreDbPath not configured. Disabling logging.');
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
            `);
            
            console.log('[RecorderService] Connected to Memory Core nl_action_log.');
        } catch (err) {
            console.warn('[RecorderService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * @param {Object} entry 
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
            console.error('[RecorderService] Failed to append log entry:', err);
        }
    }

    /**
     * @param {Object} config 
     * @returns {Array}
     */
    querySequences({ sinceTimestamp = 0, minSuccessRate, limit } = {}) {
        if (!this.db) return [];
        
        try {
            let sql = `SELECT * FROM nl_action_log WHERE timestamp >= ?`;
            const args = [sinceTimestamp];
            
            sql += ` ORDER BY timestamp DESC`;
            
            if (limit) {
                sql += ` LIMIT ?`;
                args.push(limit);
            }
            
            return this.db.prepare(sql).all(...args);
        } catch (err) {
            console.error('[RecorderService] Failed to query sequences:', err);
            return [];
        }
    }

    /**
     * @param {Number} days 
     */
    pruneOlderThan(days) {
        if (!this.db) return;
        
        try {
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            const dropStmt = this.db.prepare(`DELETE FROM nl_action_log WHERE timestamp < ?`);
            dropStmt.run(cutoff);
        } catch (err) {
            console.error('[RecorderService] Failed to prune logs:', err);
        }
    }
}

export default Neo.setupClass(RecorderService);
