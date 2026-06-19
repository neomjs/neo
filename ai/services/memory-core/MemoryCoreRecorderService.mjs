import crypto                from 'crypto';
import fs                    from 'fs-extra';
import path                  from 'path';
import Base                  from '../../../src/core/Base.mjs';
import config                from '../../mcp/server/memory-core/config.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';

const SENSITIVE_PAYLOAD_KEYS = new Set([
    'body',
    'content',
    'message',
    'prompt',
    'response',
    'text',
    'thought'
]);

/**
 * @summary Persists redacted Memory Core MCP tool-call telemetry.
 *
 * This is the Memory Core sibling of the Knowledge Base and Neural Link recorder services,
 * but it deliberately stores operational metadata only. Memory Core tool arguments can carry
 * prompts, thoughts, responses, and A2A message bodies; duplicating those payloads into a
 * telemetry table would violate the recorder's diagnostic purpose and increase leakage risk.
 *
 * @class Neo.ai.services.memory-core.MemoryCoreRecorderService
 * @extends Neo.core.Base
 * @singleton
 */
class MemoryCoreRecorderService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.MemoryCoreRecorderService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.MemoryCoreRecorderService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @summary SQLite connection to the Memory Core graph database.
         * @protected
         */
        db: null
    }

    /**
     * Initializes the SQLite schema for Memory Core MCP tool telemetry.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.db) return;

        try {
            const dbPath = config.storagePaths.graph;
            if (!dbPath) {
                logger.warn('[MemoryCoreRecorderService] storagePaths.graph not configured. Disabling tool telemetry.');
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
            logger.info('[MemoryCoreRecorderService] Connected to Memory Core mc_tool_call_log.');
        } catch (err) {
            logger.warn('[MemoryCoreRecorderService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * Creates the telemetry table and indexes if absent.
     * @returns {void}
     */
    ensureSchema() {
        if (!this.db) return;

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS mc_tool_call_log (
                id            TEXT PRIMARY KEY,
                agent_id      TEXT,
                user_id       TEXT,
                session_id    TEXT,
                sequence_id   TEXT NOT NULL,
                timestamp     INTEGER NOT NULL,
                tool          TEXT NOT NULL,
                success       INTEGER DEFAULT 0,
                duration_ms   INTEGER,
                failure_stage TEXT,
                error_code    TEXT,
                error_name    TEXT,
                error_message TEXT,
                args_bytes    INTEGER DEFAULT 0,
                result_bytes  INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_mc_tool_call_log_timestamp ON mc_tool_call_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_mc_tool_call_log_tool      ON mc_tool_call_log(tool);
            CREATE INDEX IF NOT EXISTS idx_mc_tool_call_log_success   ON mc_tool_call_log(success);
            CREATE INDEX IF NOT EXISTS idx_mc_tool_call_log_session   ON mc_tool_call_log(session_id);
        `);
    }

    /**
     * Safely measures JSON payload size without storing the payload.
     * @param {*} value Value to measure.
     * @returns {Number}
     */
    measureBytes(value) {
        if (value === undefined) return 0;

        try {
            return Buffer.byteLength(JSON.stringify(value), 'utf8');
        } catch {
            return Buffer.byteLength(String(value), 'utf8');
        }
    }

    /**
     * Collects sensitive string values from known Memory Core payload fields so error
     * messages can redact direct echoes without storing the raw tool args.
     * @param {*} value Candidate payload tree.
     * @param {Set<String>} [values=new Set()] Accumulator.
     * @returns {Set<String>}
     */
    collectSensitiveValues(value, values = new Set()) {
        if (!value || typeof value !== 'object') return values;

        for (const [key, child] of Object.entries(value)) {
            if (typeof child === 'string' && SENSITIVE_PAYLOAD_KEYS.has(key) && child) {
                values.add(child);
            } else if (child && typeof child === 'object') {
                this.collectSensitiveValues(child, values);
            }
        }

        return values;
    }

    /**
     * Redacts sensitive direct-echo values and bounds the retained error message.
     * @param {Error|Object|null} error Error object.
     * @param {Object} args Tool arguments.
     * @returns {String|null}
     */
    buildErrorMessage(error, args) {
        if (!error?.message) return null;

        const maxChars = config.toolTelemetry.errorMaxChars;
        if (!Number.isFinite(maxChars) || maxChars < 1) return null;

        let message = String(error.message);

        for (const value of this.collectSensitiveValues(args)) {
            message = message.split(value).join('[redacted]');
        }

        return message.length > maxChars ? `${message.slice(0, maxChars)}...` : message;
    }

    /**
     * Persists one redacted tool-call telemetry row. Best-effort only.
     * @param {Object} entry Tool-call metadata.
     * @returns {void}
     */
    logToolCall(entry = {}) {
        if (!config.toolTelemetry.enabled || !this.db) return;

        try {
            const
                timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : (Number.isFinite(entry.t0) ? entry.t0 : Date.now()),
                context   = RequestContextService.get?.() || {},
                agentId   = context.agentIdentityNodeId || process.env.NEO_AGENT_IDENTITY || process.env.NEO_AGENT_ID || process.env.USER || 'unknown',
                userId    = context.userId || null,
                sessionId = entry.args?.sessionId || context.sessionId || process.env.NEO_SESSION_ID || null,
                duration  = Number.isFinite(entry.duration_ms)
                    ? Math.max(0, entry.duration_ms)
                    : Math.max(0, Date.now() - (entry.t0 || timestamp)),
                error    = entry.error || null,
                id       = entry.id || crypto.randomUUID?.() || `${timestamp}-${Math.random()}`,
                sequence = entry.sequence_id || `${agentId}_${timestamp}_${id}`;

            this.db.prepare(`
                INSERT INTO mc_tool_call_log (
                    id, agent_id, user_id, session_id, sequence_id, timestamp,
                    tool, success, duration_ms, failure_stage, error_code,
                    error_name, error_message, args_bytes, result_bytes
                )
                VALUES (
                    @id, @agent_id, @user_id, @session_id, @sequence_id, @timestamp,
                    @tool, @success, @duration_ms, @failure_stage, @error_code,
                    @error_name, @error_message, @args_bytes, @result_bytes
                )
            `).run({
                id,
                agent_id     : agentId,
                user_id      : userId,
                session_id   : sessionId,
                sequence_id  : sequence,
                timestamp,
                tool         : entry.toolName || entry.tool || 'unknown',
                success      : entry.success ? 1 : 0,
                duration_ms  : duration,
                failure_stage: entry.failureStage || entry.failure_stage || null,
                error_code   : error?.code || null,
                error_name   : error?.name || null,
                error_message: this.buildErrorMessage(error, entry.args),
                args_bytes   : this.measureBytes(entry.args),
                result_bytes : this.measureBytes(entry.result)
            });
        } catch (err) {
            logger.warn('[MemoryCoreRecorderService] Failed to persist tool telemetry:', err.message);
        }
    }

    /**
     * Returns aggregate Memory Core MCP tool-call metrics without exposing raw payloads.
     * @param {Object} options
     * @param {Number} [options.sinceMs=config.toolTelemetry.aggregateWindowMs] Lookback window.
     * @param {Number} [options.limit=config.toolTelemetry.aggregateLimit] Max grouped tools.
     * @returns {Object}
     */
    getMemoryCoreToolMetrics({
        sinceMs = config.toolTelemetry.aggregateWindowMs,
        limit   = config.toolTelemetry.aggregateLimit
    } = {}) {
        if (!config.toolTelemetry.enabled) {
            return {status: 'disabled', sinceMs, limit, totalCalls: 0, tools: []};
        }

        if (!this.db) {
            return {status: 'unavailable', sinceMs, limit, totalCalls: 0, tools: []};
        }

        this.ensureSchema();

        const
            safeSinceMs = Number.isFinite(sinceMs) && sinceMs > 0 ? sinceMs : config.toolTelemetry.aggregateWindowMs,
            safeLimit   = Number.isFinite(limit) && limit > 0 ? limit : config.toolTelemetry.aggregateLimit,
            sinceTs     = Date.now() - safeSinceMs,
            rows        = this.db.prepare(`
                SELECT tool,
                       COUNT(*) AS calls,
                       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                       MIN(duration_ms) AS min_duration_ms,
                       MAX(duration_ms) AS max_duration_ms,
                       ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
                       MAX(timestamp) AS last_seen_at
                  FROM mc_tool_call_log
                 WHERE timestamp >= @sinceTs
                 GROUP BY tool
                 ORDER BY calls DESC, tool ASC
                 LIMIT @limit
            `).all({sinceTs, limit: safeLimit}),
            total = this.db.prepare(`
                SELECT COUNT(*) AS total
                  FROM mc_tool_call_log
                 WHERE timestamp >= @sinceTs
            `).get({sinceTs})?.total || 0;

        return {
            status    : 'ok',
            sinceMs   : safeSinceMs,
            limit     : safeLimit,
            totalCalls: total,
            tools     : rows.map(row => ({
                tool         : row.tool,
                calls        : row.calls,
                failures     : row.failures || 0,
                minDurationMs: row.min_duration_ms ?? null,
                avgDurationMs: row.avg_duration_ms ?? null,
                maxDurationMs: row.max_duration_ms ?? null,
                lastSeenAt   : row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null
            }))
        };
    }
}

export default Neo.setupClass(MemoryCoreRecorderService);
