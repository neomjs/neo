import crypto                from 'crypto';
import fs                    from 'fs-extra';
import path                  from 'path';
import Base                  from '../../../src/core/Base.mjs';
import config                from '../../mcp/server/memory-core/config.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';
import {
    ensureEmbeddingIdentitySchema,
    getEmbeddingIdentityWindow,
    recordEmbeddingSubmissions as persistEmbeddingSubmissions
}                            from '../shared/embeddingIdentityLedger.mjs';
import {
    beginProviderActivity,
    completeProviderActivity,
    ensureProviderActivitySchema,
    getProviderActivityMetrics,
    PROVIDER_ACTIVITY_BUSY_TIMEOUT_MS,
    refineProviderActivity,
    startProviderActivity
}                            from '../shared/providerActivityLedger.mjs';
import {
    createProviderActivityStatusWriter,
    inspectProviderActivityStatus
}                            from '../shared/providerActivityStatusStore.mjs';

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
 * @summary Maximum SQLite lock wait allowed on the best-effort telemetry path.
 * @type {Number}
 */
export const TOOL_TELEMETRY_BUSY_TIMEOUT_MS = PROVIDER_ACTIVITY_BUSY_TIMEOUT_MS;

/**
 * @summary Builds an explicit empty re-embed-ratio state.
 *
 * `ratio` stays null on every arm — never 1. One is the value of a CONVERGING run, so defaulting it
 * would tell an operator "no repetition" for a process that has not looked, which is the same false
 * zero the drain receipt above refuses. Every field the response declares is present on every arm,
 * because a required field omitted on a status branch is a wire break a schema check cannot see.
 * @param {'disabled'|'unavailable'|'partial'} status Availability state.
 * @param {String} reason Why no observation is available.
 * @returns {Object}
 */
function emptyReembedRatio(status, reason) {
    return {
        status,
        reason,
        coverageStartedAt: null,
        distinct         : null,
        oldestRetainedAt : null,
        ratio            : null,
        submissions      : null,
        truncated        : null
    }
}

/**
 * @summary Builds the no-observation WAL-drain shape, in full.
 *
 * Every field the response declares is present — a required field omitted on a status arm is a wire
 * contract break that schema checks cannot see, because they validate the declaration and not the
 * runtime branch. Counts stay null rather than zero: an unknown backlog must never read as an empty
 * one, since zero pending against live provider load IS the alarm condition.
 * @param {'disabled'|'unavailable'|'partial'} status Availability state.
 * @param {String} reason Why no observation is available.
 * @returns {Object}
 */
function emptyWalDrain(status, reason) {
    return {
        status,
        state       : null,
        drainedClean: null,
        reason,
        counts      : null,
        observedAt  : null,
        inProgress  : null,
        window      : null
    }
}

/**
 * @summary Builds an explicit empty provider-activity observer state.
 * @param {'disabled'|'unavailable'|'partial'} status Availability state.
 * @returns {Object}
 */
function emptyProviderActivity(status) {
    return {
        status,
        totalActivities           : 0,
        totalInFlight             : 0,
        totalRecentCompletions    : 0,
        inFlightTruncated         : false,
        recentCompletionsTruncated: false,
        aggregates                : [],
        inFlight                  : [],
        recentCompletions         : []
    };
}

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
        db: null,
        /**
         * @member {Object|null} providerActivityStatusWriter=null
         * @summary Recorder-owned atomic failure-status sidecar writer.
         * @protected
         */
        providerActivityStatusWriter: null,
        /**
         * @member {Function|null} walDrainDispositionProvider=null
         * @summary Reads this process's WAL drain receipt, when this process hosts the drain.
         *
         * Registered by the host that calls `startDrainLoop`. Absent when the drain runs out of
         * process, which is a reportable state and NOT an absence of pending work — see
         * `getWalDrainProjection`.
         * @protected
         */
        walDrainDispositionProvider: null,
        /**
         * @member {Function|null} walDrainInProgressProvider=null
         * @summary Reads the work the currently-running drain cycle selected, before it completes.
         *
         * The receipt alone cannot report a cycle that is still waiting on the provider, which is
         * precisely the interval a load observer needs to interpret.
         * @protected
         */
        walDrainInProgressProvider: null,
        /**
         * @member {Function|null} walDrainWindowProvider=null
         * @summary Aggregates completed drain cycles over the caller's lookback.
         *
         * Takes `sinceTs` so the workload aggregate covers the SAME interval as the provider-activity
         * aggregate it sits beside. Without it the pairing is a last-value latch against a window.
         * @protected
         */
        walDrainWindowProvider: null
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

            this.providerActivityStatusWriter = createProviderActivityStatusWriter({
                dbPath,
                recorder: 'memory-core'
            });

            if (dbPath !== ':memory:') {
                await fs.ensureDir(path.dirname(dbPath));
            }

            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, {
                timeout: TOOL_TELEMETRY_BUSY_TIMEOUT_MS,
                verbose: null
            });
            if (dbPath !== ':memory:') {
                this.db.pragma('journal_mode = WAL');
            }

            this.ensureSchema();
            await this.providerActivityStatusWriter.publishSuccess(Date.now());
            logger.info('[MemoryCoreRecorderService] Connected to Memory Core mc_tool_call_log.');
        } catch (err) {
            await this.providerActivityStatusWriter?.publishFailure(Date.now());
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
                completed_at  INTEGER,
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

        const columns = new Set(
            this.db.prepare('PRAGMA table_info(mc_tool_call_log)').all().map(column => column.name)
        );

        if (!columns.has('completed_at')) {
            this.db.exec('ALTER TABLE mc_tool_call_log ADD COLUMN completed_at INTEGER;');
        }

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_mc_tool_call_log_completed_at
                ON mc_tool_call_log(completed_at);
        `);

        const hasCompletedLegacyRow = this.db.prepare(`
            SELECT 1
              FROM mc_tool_call_log
             WHERE completed_at IS NULL
               AND duration_ms IS NOT NULL
             LIMIT 1
        `).get();

        if (hasCompletedLegacyRow) {
            // Rows written before the start boundary shipped are completed calls. The existence
            // probe keeps this idempotent across a crash between ALTER TABLE and the backfill.
            this.db.prepare(`
                UPDATE mc_tool_call_log
                   SET completed_at = timestamp + COALESCE(duration_ms, 0)
                 WHERE completed_at IS NULL
                   AND duration_ms IS NOT NULL
            `).run();
        }

        ensureProviderActivitySchema(this.db);
        ensureEmbeddingIdentitySchema(this.db);
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
     * Builds the shared redacted row shape for both the start and completion boundaries.
     * @param {Object} entry Tool-call metadata.
     * @param {Number|null} completedAt Completion timestamp, or null while the call is in flight.
     * @returns {Object}
     */
    buildToolCallRecord(entry = {}, completedAt = null) {
        const
            timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : (Number.isFinite(entry.t0) ? entry.t0 : Date.now()),
            context   = RequestContextService.get?.() || {},
            agentId   = context.agentIdentityNodeId || process.env.NEO_AGENT_IDENTITY || process.env.NEO_AGENT_ID || process.env.USER || 'unknown',
            userId    = context.userId || null,
            sessionId = entry.args?.sessionId || context.sessionId || process.env.NEO_SESSION_ID || null,
            duration  = completedAt === null
                ? null
                : (Number.isFinite(entry.duration_ms)
                    ? Math.max(0, entry.duration_ms)
                    : Math.max(0, completedAt - (entry.t0 || timestamp))),
            error    = entry.error || null,
            id       = entry.id || crypto.randomUUID?.() || `${timestamp}-${Math.random()}`,
            sequence = entry.sequence_id || `${agentId}_${timestamp}_${id}`;

        return {
            id,
            agent_id     : agentId,
            user_id      : userId,
            session_id   : sessionId,
            sequence_id  : sequence,
            timestamp,
            tool         : entry.toolName || entry.tool || 'unknown',
            success      : entry.success ? 1 : 0,
            duration_ms  : duration,
            completed_at : completedAt,
            failure_stage: entry.failureStage || entry.failure_stage || null,
            error_code   : error?.code || null,
            error_name   : error?.name || null,
            error_message: this.buildErrorMessage(error, entry.args),
            args_bytes   : this.measureBytes(entry.args),
            result_bytes : this.measureBytes(entry.result)
        };
    }

    /**
     * Persists the redacted start boundary before Memory Core begins tool dispatch.
     *
     * A call that wedges the process never reaches the existing completion-only recorder. The
     * unfinished row is therefore the durable evidence: tool identity, start time, and opaque call
     * id, with arguments measured but never stored. Best-effort failure keeps dispatch available.
     *
     * @param {Object} entry Tool-call metadata.
     * @returns {String|null} Opaque call id used to complete the same row.
     */
    beginToolCall(entry = {}) {
        if (!config.toolTelemetry.enabled || !this.db) return null;

        try {
            const record = this.buildToolCallRecord(entry);

            this.db.prepare(`
                INSERT INTO mc_tool_call_log (
                    id, agent_id, user_id, session_id, sequence_id, timestamp,
                    tool, success, duration_ms, completed_at, failure_stage, error_code,
                    error_name, error_message, args_bytes, result_bytes
                )
                VALUES (
                    @id, @agent_id, @user_id, @session_id, @sequence_id, @timestamp,
                    @tool, @success, @duration_ms, @completed_at, @failure_stage, @error_code,
                    @error_name, @error_message, @args_bytes, @result_bytes
                )
            `).run(record);

            return record.id;
        } catch (err) {
            logger.warn('[MemoryCoreRecorderService] Failed to persist tool start telemetry:', err.message);
            return null;
        }
    }

    /**
     * Persists one redacted tool-call completion, updating its start row when available.
     * Best-effort only.
     * @param {Object} entry Tool-call metadata.
     * @returns {void}
     */
    logToolCall(entry = {}) {
        if (!config.toolTelemetry.enabled || !this.db) return;

        try {
            const record = this.buildToolCallRecord(entry, Date.now());

            this.db.prepare(`
                INSERT INTO mc_tool_call_log (
                    id, agent_id, user_id, session_id, sequence_id, timestamp,
                    tool, success, duration_ms, completed_at, failure_stage, error_code,
                    error_name, error_message, args_bytes, result_bytes
                )
                VALUES (
                    @id, @agent_id, @user_id, @session_id, @sequence_id, @timestamp,
                    @tool, @success, @duration_ms, @completed_at, @failure_stage, @error_code,
                    @error_name, @error_message, @args_bytes, @result_bytes
                )
                ON CONFLICT(id) DO UPDATE SET
                    success       = excluded.success,
                    duration_ms   = excluded.duration_ms,
                    completed_at  = excluded.completed_at,
                    failure_stage = excluded.failure_stage,
                    error_code    = excluded.error_code,
                    error_name    = excluded.error_name,
                    error_message = excluded.error_message,
                    result_bytes  = excluded.result_bytes
            `).run(record);
        } catch (err) {
            logger.warn('[MemoryCoreRecorderService] Failed to persist tool telemetry:', err.message);
        }
    }

    /**
     * @summary Persists one bounded provider admission boundary in the shared telemetry artifact.
     * @param {Object} entry Provider activity descriptor.
     * @returns {String|null}
     */
    beginProviderActivity(entry = {}) {
        if (!config.toolTelemetry.enabled) return null;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return null;
        }

        try {
            return beginProviderActivity(this.db, entry);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[MemoryCoreRecorderService] Failed to persist provider admission telemetry:', error.message);
            return null;
        }
    }

    /**
     * @summary Persists the execution-start boundary for one provider activity.
     * @param {String} activityId Opaque activity id.
     * @param {Number} startedAt Provider-start timestamp.
     * @returns {void}
     */
    startProviderActivity(activityId, startedAt) {
        if (!config.toolTelemetry.enabled || !activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            startProviderActivity(this.db, activityId, startedAt);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[MemoryCoreRecorderService] Failed to persist provider-start telemetry:', error.message);
        }
    }

    /**
     * @summary Persists the model selected by provider-owned dispatch code.
     * @param {String} activityId Opaque activity id.
     * @param {Object} activity Dispatch-bound activity refinement.
     * @returns {void}
     */
    refineProviderActivity(activityId, activity) {
        if (!config.toolTelemetry.enabled || !activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            refineProviderActivity(this.db, activityId, activity);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[MemoryCoreRecorderService] Failed to persist provider-dispatch telemetry:', error.message);
        }
    }

    /**
     * @summary Persists the bounded completion outcome for one provider activity.
     * @param {String} activityId Opaque activity id.
     * @param {Object} outcome Completion metadata.
     * @returns {void}
     */
    completeProviderActivity(activityId, outcome = {}) {
        if (!config.toolTelemetry.enabled || !activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            completeProviderActivity(this.db, activityId, outcome);
            this.providerActivityStatusWriter?.publishSuccess(Date.now());
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[MemoryCoreRecorderService] Failed to persist provider completion telemetry:', error.message);
        }
    }

    /**
     * @summary Persists identities for batch embedding work admitted by Memory Core.
     *
     * The recorder owns the low-cardinality source stamp. Text is reduced to fingerprints by the
     * shared ledger and telemetry failure remains behavior-neutral for the embedding call.
     * @param {Object} options Batch identity options.
     * @param {String[]} [options.texts=[]] Admitted batch inputs.
     * @param {Number} [options.submittedAt=Date.now()] Admission instant.
     * @returns {void}
     */
    recordEmbeddingSubmissions({texts = [], submittedAt = Date.now()} = {}) {
        if (!config.toolTelemetry.enabled || !this.db) return;

        try {
            persistEmbeddingSubmissions(this.db, {
                source: 'memory-core',
                submittedAt,
                texts
            });
            this.providerActivityStatusWriter?.publishSuccess(Date.now());
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[MemoryCoreRecorderService] Failed to persist embedding identity telemetry:', error.message);
        }
    }

    /**
     * @summary Awaits queued atomic provider-status publication for deterministic tests and shutdowns.
     * @returns {Promise<void>}
     */
    async flushProviderActivityStatus() {
        await this.providerActivityStatusWriter?.flush();
    }

    /**
     * @summary Returns tool-call and bounded provider-stage metrics without exposing raw payloads or
     * caller identity. A completed slow tool row preserves the exact timeline after it disappears
     * from `unfinishedCalls`; it proves server code returned, never that a timed-out client received
     * the response. Provider rows independently separate Neo-owned queue wait from execution.
     * @param {Object} options
     * @param {Number} [options.sinceMs=config.toolTelemetry.aggregateWindowMs] Lookback window.
     * @param {Number} [options.limit=config.toolTelemetry.aggregateLimit] Max rows per projection.
     * @param {Number} [options.slowAfterMs=config.toolTelemetry.slowAfterMs] Minimum completed-call
     *     duration included in `recentSlowCalls`; the resolved leaf defaults to the canonical MCP
     *     client request deadline, so a matching server call may have outlived its caller.
     * @returns {Object}
     */
    getMemoryCoreToolMetrics({
        sinceMs     = config.toolTelemetry.aggregateWindowMs,
        limit       = config.toolTelemetry.aggregateLimit,
        slowAfterMs = config.toolTelemetry.slowAfterMs
    } = {}) {
        const safeSlowAfterMs = Number.isFinite(slowAfterMs) && slowAfterMs > 0
            ? slowAfterMs
            : config.toolTelemetry.slowAfterMs;

        if (!config.toolTelemetry.enabled) {
            return {
                status          : 'disabled',
                sinceMs,
                limit,
                slowAfterMs     : safeSlowAfterMs,
                totalCalls      : 0,
                totalUnfinished : 0,
                tools           : [],
                unfinishedCalls : [],
                recentSlowCalls : [],
                providerActivity: emptyProviderActivity('disabled'),
                walDrain        : emptyWalDrain('disabled', 'tool-telemetry-disabled'),
                reembedRatio    : emptyReembedRatio('disabled', 'tool-telemetry-disabled')
            };
        }

        if (!this.db) {
            return {
                status          : 'unavailable',
                sinceMs,
                limit,
                slowAfterMs     : safeSlowAfterMs,
                totalCalls      : 0,
                totalUnfinished : 0,
                tools           : [],
                unfinishedCalls : [],
                recentSlowCalls : [],
                providerActivity: emptyProviderActivity('unavailable'),
                walDrain        : emptyWalDrain('unavailable', 'tool-telemetry-unavailable'),
                reembedRatio    : emptyReembedRatio('unavailable', 'tool-telemetry-unavailable')
            };
        }

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
                   AND completed_at IS NOT NULL
                 GROUP BY tool
                 ORDER BY calls DESC, tool ASC
                 LIMIT @limit
            `).all({sinceTs, limit: safeLimit}),
            total = this.db.prepare(`
                SELECT COUNT(*) AS total
                  FROM mc_tool_call_log
                 WHERE timestamp >= @sinceTs
                   AND completed_at IS NOT NULL
            `).get({sinceTs})?.total || 0,
            totalUnfinished = this.db.prepare(`
                SELECT COUNT(*) AS total
                  FROM mc_tool_call_log
                 WHERE timestamp >= @sinceTs
                   AND completed_at IS NULL
            `).get({sinceTs})?.total || 0,
            unfinishedRows = this.db.prepare(`
                SELECT id, timestamp, tool
                  FROM mc_tool_call_log
                 WHERE timestamp >= @sinceTs
                   AND completed_at IS NULL
                 ORDER BY timestamp ASC, id ASC
                 LIMIT @limit
            `).all({sinceTs, limit: safeLimit}),
            slowRows = this.db.prepare(`
                SELECT id, timestamp, completed_at, duration_ms, tool, success, failure_stage
                  FROM mc_tool_call_log
                 WHERE completed_at >= @sinceTs
                   AND completed_at IS NOT NULL
                   AND duration_ms >= @slowAfterMs
                 ORDER BY completed_at DESC, id ASC
                 LIMIT @limit
            `).all({sinceTs, slowAfterMs: safeSlowAfterMs, limit: safeLimit}),
            now = Date.now();

        let providerActivity;

        try {
            providerActivity = getProviderActivityMetrics(this.db, {
                limit  : safeLimit,
                now,
                sinceTs,
                // The cap is READ HERE, at the use site, and injected. The ledger is shared with the
                // Knowledge Base and must not import a Memory Core config; and it must never
                // fabricate a cap, because `0` reads as "admission is closed" — the most alarming
                // value — when the truth would only be that provenance was unavailable.
                nativeAdmissionCaps: {ollama: config.ollama.maxInFlightEmbeddings}
            });
        } catch (error) {
            logger.warn('[MemoryCoreRecorderService] Failed to read provider activity telemetry:', error.message);
            providerActivity = emptyProviderActivity('partial');
        }

        const walDrain     = this.getWalDrainProjection({sinceTs, now});
        let   reembedRatio = this.getReembedRatioProjection({sinceTs});

        const sidecarStatus = inspectProviderActivityStatus({
            dbPath: config.storagePaths.graph,
            sinceTs
        }).status;

        if (sidecarStatus === 'unavailable') {
            providerActivity = emptyProviderActivity('unavailable');
            reembedRatio = emptyReembedRatio('unavailable', 'embedding-identity-writer-unavailable');
        } else if (sidecarStatus === 'partial') {
            if (providerActivity.status === 'ok') {
                providerActivity.status = 'partial';
            }
            if (reembedRatio.status === 'ok') {
                reembedRatio = {
                    ...reembedRatio,
                    status: 'partial',
                    reason: 'embedding-identity-writer-partial'
                };
            }
        }

        return {
            status     : 'ok',
            sinceMs    : safeSinceMs,
            limit      : safeLimit,
            slowAfterMs: safeSlowAfterMs,
            totalCalls : total,
            totalUnfinished,
            tools      : rows.map(row => ({
                tool         : row.tool,
                calls        : row.calls,
                failures     : row.failures || 0,
                minDurationMs: row.min_duration_ms ?? null,
                avgDurationMs: row.avg_duration_ms ?? null,
                maxDurationMs: row.max_duration_ms ?? null,
                lastSeenAt   : row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null
            })),
            unfinishedCalls: unfinishedRows.map(row => ({
                callId   : row.id,
                tool     : row.tool,
                startedAt: new Date(row.timestamp).toISOString(),
                elapsedMs: Math.max(0, now - row.timestamp)
            })),
            recentSlowCalls: slowRows.map(row => ({
                callId      : row.id,
                tool        : row.tool,
                startedAt   : new Date(row.timestamp).toISOString(),
                completedAt : new Date(row.completed_at).toISOString(),
                durationMs  : row.duration_ms,
                success     : row.success === 1,
                failureStage: row.failure_stage ?? null
            })),
            providerActivity,
            walDrain,
            reembedRatio
        };
    }

    /**
     * @summary Projects this process's WAL drain receipt beside its provider activity.
     *
     * The disproportion this answers — *"is this provider load explained by pending work?"* — needs a
     * numerator and a denominator in ONE reading. The numerator (`providerActivity`) is a SQLite
     * projection over `sinceTs`; the denominator is the drain's own per-cycle receipt, already computed
     * every sweep and, until now, reaching no surface at all: a caller could read four cores of
     * embedding attribution and had no way to learn that nothing was pending.
     *
     * Two honesty properties, both load-bearing:
     *
     * **Absence is never zero.** When this process does not host the drain, `counts` stays `null` and
     * the status says so. Reporting `pending: 0` there would not be a conservative default — zero
     * pending against live provider load IS the alarm condition, so a defaulted zero manufactures the
     * exact alarm the projection exists to detect.
     *
     * **Comparability is built, not asserted** (corrected 2026-08-09 after @neo-gpt's review of the
     * first implementation). That version reported the LAST completed cycle plus a `withinWindow`
     * timestamp check, and called the pair comparable. It is not: a timestamp inside the lookback
     * proves only where one cycle landed, never that it produced the lookback's provider activity.
     * Two ordinary healthy sequences defeated it — a cycle that had selected an item and was still
     * waiting on the provider (the tracker cannot speak until the call returns, so live work read as
     * `pending: 0`), and a work-bearing cycle whose receipt an idle poll overwrote while its activity
     * was still inside the window. Both licensed dividing real provider load by zero, which is the
     * alarm this projection exists to prevent rather than manufacture.
     *
     * So the projection now carries two things that are actually about the same interval:
     * `inProgress` — what the currently-running cycle selected, visible before it completes — and
     * `window` — the cycles that completed inside the SAME `sinceTs` lookback the provider aggregate
     * uses. `window.truncated` marks a lookback this process cannot fully attest — it began before
     * `window.coverageStartedAt`, or it reaches a cycle the ring evicted — because a partial answer
     * presented as a total is the same false zero one level down. Coverage, not capacity: a fresh
     * tracker after a restart can attest nothing, and must say so rather than report a clean zero.
     *
     * @param {Object} options
     * @param {Number} options.sinceTs Lookback boundary shared with the provider-activity projection.
     * @param {Number} options.now Current epoch ms.
     * @returns {Object} `{status, state, drainedClean, reason, counts, observedAt, inProgress, window}`
     */
    getWalDrainProjection({sinceTs, now} = {}) {
        const provider = this.walDrainDispositionProvider;

        if (typeof provider !== 'function') {
            return emptyWalDrain('unavailable', 'wal-drain-not-hosted-in-this-process');
        }

        let receipt, inProgress, window;

        try {
            receipt    = provider();
            inProgress = this.walDrainInProgressProvider?.() ?? null;
            window     = this.walDrainWindowProvider?.(sinceTs) ?? null
        } catch (error) {
            logger.warn('[MemoryCoreRecorderService] Failed to read WAL drain disposition:', error.message);

            return emptyWalDrain('partial', `wal-drain-receipt-unreadable: ${error.message}`);
        }

        const at = Number.isFinite(receipt?.at) ? receipt.at : null;

        return {
            status      : 'ok',
            state       : receipt?.state ?? null,
            drainedClean: receipt?.drainedClean ?? null,
            reason      : receipt?.reason ?? null,
            counts      : receipt?.counts ?? null,
            observedAt  : at === null ? null : new Date(at).toISOString(),
            inProgress  : inProgress ? {
                pendingAtStart: inProgress.pendingAtStart ?? null,
                selectedCount : inProgress.selectedCount  ?? null,
                startedAt     : Number.isFinite(inProgress.startedAt) ? new Date(inProgress.startedAt).toISOString() : null
            } : null,
            window      : window ? {
                // `truncated` says the aggregate is partial; this says WHICH part is missing, and
                // without it a consumer can only distrust the totals, never bound them.
                coverageStartedAt: Number.isFinite(window.coverageStartedAt) ? new Date(window.coverageStartedAt).toISOString() : null,
                cycles           : window.cycles,
                oldestRetainedAt : Number.isFinite(window.oldestRetainedAt) ? new Date(window.oldestRetainedAt).toISOString() : null,
                totals           : window.totals,
                truncated        : window.truncated === true
            } : null
        };
    }

    /**
     * @summary The re-embed ratio, or an explicit reason there is none.
     *
     * Fails closed exactly like the drain projection: missing shared coverage reports an explicit
     * degraded state, never a ratio of 1. One can describe a no-repeat window, so defaulting it would
     * report "no repetition" for a plane that never looked.
     *
     * The ratio is a denominator for a judgement, never the judgement. Read it with `truncated` and
     * `coverageStartedAt`: a bounded window that evicted, or one younger than the caller's interest,
     * is a partial answer. A value above 1 is normal for a corpus with honestly duplicated content.
     * @param {Object} options Projection options.
     * @param {Number} options.sinceTs Inclusive lookback boundary shared with provider activity.
     * @returns {Object}
     */
    getReembedRatioProjection({sinceTs} = {}) {
        try {
            const window = getEmbeddingIdentityWindow(this.db, {sinceTs});

            return {
                status           : 'ok',
                reason           : null,
                coverageStartedAt: Number.isFinite(window.coverageStartedAt)
                    ? new Date(window.coverageStartedAt).toISOString()
                    : null,
                distinct        : window.distinct,
                oldestRetainedAt: Number.isFinite(window.oldestRetainedAt)
                    ? new Date(window.oldestRetainedAt).toISOString()
                    : null,
                ratio      : window.ratio,
                submissions: window.submissions,
                truncated  : window.truncated === true
            }
        } catch (error) {
            logger.warn('[MemoryCoreRecorderService] Failed to read the re-embed ratio:', error.message);

            return emptyReembedRatio('partial', `reembed-ratio-unreadable: ${error.message}`);
        }
    }
}

export default Neo.setupClass(MemoryCoreRecorderService);
