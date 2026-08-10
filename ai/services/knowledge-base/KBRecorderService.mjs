import crypto         from 'crypto';
import fs             from 'fs-extra';
import path           from 'path';
import Base           from '../../../src/core/Base.mjs';
import ConceptService from '../ConceptService.mjs';
import config         from '../../mcp/server/knowledge-base/config.mjs';
import logger         from '../../mcp/server/knowledge-base/logger.mjs';
import {
    ensureEmbeddingIdentitySchema,
    recordEmbeddingSubmissions as persistEmbeddingSubmissions
}                     from '../shared/embeddingIdentityLedger.mjs';
import {
    beginProviderActivity,
    completeProviderActivity,
    ensureProviderActivitySchema,
    PROVIDER_ACTIVITY_BUSY_TIMEOUT_MS,
    refineProviderActivity,
    startProviderActivity
}                     from '../shared/providerActivityLedger.mjs';
import {createProviderActivityStatusWriter} from '../shared/providerActivityStatusStore.mjs';

/**
 * @summary Captures Knowledge Base query telemetry and materializes Agent FAQ demand clusters.
 *
 * The Knowledge Base recorder is the KB-server sibling of Neural Link's `RecorderService`.
 * It persists every KB MCP tool invocation into the shared Memory Core SQLite database, then
 * projects repeated `ask_knowledge_base` / `query_documents` questions into `kb_query_faqs`.
 * Those FAQ rows are the durable "agent question" signal consumed by `GapInferenceEngine` as
 * `[KB_DEMAND_GAP]` evidence for the Concept Ontology and Golden Path loop.
 *
 * @class Neo.ai.services.knowledge-base.KBRecorderService
 * @extends Neo.core.Base
 * @see Neo.ai.services.neural-link.RecorderService
 * @see Neo.ai.daemons.services.GapInferenceEngine
 * @singleton
 */
class KBRecorderService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.KBRecorderService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.KBRecorderService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @summary SQLite connection to the shared Memory Core database.
         * @protected
         */
        db: null,
        /**
         * @member {Object|null} providerActivityStatusWriter=null
         * @summary Recorder-owned atomic failure-status sidecar writer.
         * @protected
         */
        providerActivityStatusWriter: null
    }

    /**
     * @summary Initializes the SQLite schema for Knowledge Base query telemetry and Agent FAQs.
     *
     * Creates `kb_query_log` and `kb_query_faqs` beside the existing Memory Core / Neural Link
     * telemetry tables. WAL journal mode mirrors the Neural Link recorder so KB query capture
     * stays non-blocking for concurrent MCP readers and daemon consumers.
     *
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.db) return;

        try {
            const dbPath = config.memoryCoreDbPath;
            if (!dbPath) {
                logger.warn('[KBRecorderService] memoryCoreDbPath not configured. Disabling KB query telemetry.');
                return;
            }

            this.providerActivityStatusWriter = createProviderActivityStatusWriter({
                dbPath,
                recorder: 'knowledge-base'
            });

            await fs.ensureDir(path.dirname(dbPath));

            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, {
                timeout: PROVIDER_ACTIVITY_BUSY_TIMEOUT_MS,
                verbose: null
            });
            this.db.pragma('journal_mode = WAL');
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS kb_query_log (
                    id          TEXT PRIMARY KEY,
                    agent_id    TEXT NOT NULL,
                    session_id  TEXT,
                    sequence_id TEXT NOT NULL,
                    timestamp   INTEGER NOT NULL,
                    tool        TEXT NOT NULL,
                    query_text  TEXT,
                    args        TEXT NOT NULL,
                    result      TEXT,
                    success     INTEGER DEFAULT 0,
                    duration_ms INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_kb_query_log_sequence  ON kb_query_log(sequence_id);
                CREATE INDEX IF NOT EXISTS idx_kb_query_log_session   ON kb_query_log(session_id);
                CREATE INDEX IF NOT EXISTS idx_kb_query_log_timestamp ON kb_query_log(timestamp);
                CREATE INDEX IF NOT EXISTS idx_kb_query_log_tool      ON kb_query_log(tool);
                CREATE INDEX IF NOT EXISTS idx_kb_query_log_query     ON kb_query_log(query_text);

                CREATE TABLE IF NOT EXISTS kb_query_faqs (
                    cluster_id                TEXT PRIMARY KEY,
                    canonical_query           TEXT NOT NULL,
                    normalized_query          TEXT NOT NULL,
                    variants                  TEXT NOT NULL,
                    occurrence_count          INTEGER NOT NULL,
                    failure_count             INTEGER DEFAULT 0,
                    first_seen                INTEGER NOT NULL,
                    last_seen                 INTEGER NOT NULL,
                    related_concept_ids       TEXT NOT NULL,
                    has_strong_guide_coverage INTEGER DEFAULT 0,
                    similarity_threshold      REAL NOT NULL,
                    updated_at                INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_kb_query_faqs_count     ON kb_query_faqs(occurrence_count);
                CREATE INDEX IF NOT EXISTS idx_kb_query_faqs_last_seen ON kb_query_faqs(last_seen);
                CREATE INDEX IF NOT EXISTS idx_kb_query_faqs_coverage  ON kb_query_faqs(has_strong_guide_coverage);

                CREATE TABLE IF NOT EXISTS kb_ingestion_metrics (
                    id              TEXT PRIMARY KEY,
                    timestamp       INTEGER NOT NULL,
                    tenant_id       TEXT NOT NULL,
                    repo_slug       TEXT NOT NULL,
                    origin_agent    TEXT,
                    event_type      TEXT NOT NULL,
                    chunks_total    INTEGER DEFAULT 0,
                    chunks_embedded INTEGER DEFAULT 0,
                    chunks_deleted  INTEGER DEFAULT 0,
                    duration_ms     INTEGER,
                    error_code      TEXT,
                    detail          TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_kb_ingestion_metrics_tenant    ON kb_ingestion_metrics(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_kb_ingestion_metrics_timestamp ON kb_ingestion_metrics(timestamp);
                CREATE INDEX IF NOT EXISTS idx_kb_ingestion_metrics_event     ON kb_ingestion_metrics(event_type);
            `);

            ensureProviderActivitySchema(this.db);
            ensureEmbeddingIdentitySchema(this.db);
            await this.providerActivityStatusWriter.publishSuccess(Date.now());

            logger.info('[KBRecorderService] Connected to Memory Core kb_query_log / kb_query_faqs.');
        } catch (err) {
            await this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to initialize SQLite connection:', err.message);
        }
    }

    /**
     * @summary Safely serializes a value for durable telemetry storage.
     * @param {*} value Value to encode.
     * @returns {String}
     * @protected
     */
    safeStringify(value) {
        try {
            return JSON.stringify(value ?? null);
        } catch {
            return JSON.stringify({error: 'Unserializable Value'});
        }
    }

    /**
     * @summary Parses a JSON string without letting malformed telemetry block aggregation.
     * @param {String|Object} value Candidate JSON string or object.
     * @returns {Object|null}
     * @protected
     */
    safeParse(value) {
        if (value && typeof value === 'object') return value;
        if (typeof value !== 'string') return null;

        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }

    /**
     * @summary Extracts the natural-language KB query from MCP tool arguments.
     *
     * Denormalizing `query_text` keeps the FAQ read path independent from the full JSON `args`
     * payload and lets SQLite index the agent-question signal directly.
     *
     * @param {Object|String} args MCP arguments object or serialized argument JSON.
     * @returns {String|null}
     * @protected
     */
    extractQueryText(args) {
        const parsed = this.safeParse(args),
              query  = parsed?.query;

        return typeof query === 'string' && query.trim()
            ? query.trim()
            : null;
    }

    /**
     * @summary Normalizes agent questions into conservative first-pass FAQ cluster keys.
     *
     * This is intentionally exact-match clustering after punctuation/whitespace normalization.
     * The `kbFaqSimilarityThreshold` config documents the calibration target for the later
     * embedding-backed phase; until real traffic is measured, exact grouping avoids false merges
     * between subtly different framework concepts.
     *
     * @param {String} queryText Raw agent question.
     * @returns {String}
     * @protected
     */
    normalizeQueryText(queryText) {
        return String(queryText || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * @summary Persists a KB MCP tool invocation into `kb_query_log`.
     *
     * Logging is a best-effort observability side channel. It never throws back into the MCP
     * tool call path, preserving Knowledge Base availability even when telemetry storage is
     * unavailable or temporarily locked.
     *
     * @param {Object} entry Invocation metadata captured by the KB `toolService` wrapper.
     * @returns {void}
     */
    log(entry) {
        if (!this.db) return;

        try {
            const
                timestamp  = entry.timestamp || Date.now(),
                agentId    = entry.agent_id || process.env.NEO_AGENT_ID || process.env.USER || 'unknown',
                sequenceId = entry.sequence_id || `${agentId}_${timestamp}`,
                args       = typeof entry.args === 'string' ? entry.args : this.safeStringify(entry.args ?? {}),
                result     = typeof entry.result === 'string' ? entry.result : this.safeStringify(entry.result ?? null),
                queryText  = entry.query_text ?? this.extractQueryText(args);

            this.db.prepare(`
                INSERT INTO kb_query_log (
                    id, agent_id, session_id, sequence_id, timestamp,
                    tool, query_text, args, result, success, duration_ms
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `).run(
                crypto.randomUUID(),
                agentId,
                entry.session_id || null,
                sequenceId,
                timestamp,
                entry.tool,
                queryText,
                args,
                result,
                entry.success ? 1 : 0,
                entry.duration_ms ?? null
            );
        } catch (err) {
            logger.error('[KBRecorderService] Failed to append KB query log entry:', err);
        }
    }

    /**
     * @summary Persists a per-tenant ingestion telemetry event into `kb_ingestion_metrics`.
     *
     * This is the durable per-tenant contract the cross-tenant ingestion service calls after
     * each push / tombstone / reconcile / error event.
     * Like {@link log}, persistence is a best-effort observability side channel — it never
     * throws back into the ingestion path, preserving ingestion availability even when the
     * telemetry store is unavailable or temporarily locked.
     *
     * Per-tenant rollup consumers (Phase 4A-β observability daemon, Phase 4D alerting) read
     * via {@link getTenantIngestionRollup}. The schema is intentionally event-shaped (one row
     * per ingestion event) rather than pre-aggregated — rollup is the daemon's job, keeping
     * this write path O(1) and contention-free.
     *
     * @param {Object}  entry
     * @param {String}  entry.tenantId        Authoritative server-stamped tenant id.
     * @param {String}  entry.repoSlug        Authoritative repo slug.
     * @param {String} [entry.originAgentIdentity] Authenticated agent identity that triggered the event.
     * @param {String}  entry.eventType       One of `'ingest'`, `'tombstone'`, `'reconcile'`, `'error'`.
     * @param {Number} [entry.chunksTotal=0]    Chunks seen in the event payload.
     * @param {Number} [entry.chunksEmbedded=0] Chunks newly embedded.
     * @param {Number} [entry.chunksDeleted=0]  Chunks deleted (tombstone / stale-id sweep).
     * @param {Number} [entry.durationMs]       Event wall-clock duration.
     * @param {String} [entry.errorCode]        Stable error code when `eventType === 'error'`.
     * @param {Object} [entry.detail]           Free-form per-event detail (JSON-serialized).
     * @param {Number} [entry.timestamp]        Event timestamp; defaults to `Date.now()`.
     * @returns {void}
     */
    recordIngestionMetric(entry = {}) {
        if (!this.db) return;

        try {
            const
                timestamp = entry.timestamp || Date.now(),
                tenantId  = entry.tenantId || 'neo-shared',
                repoSlug  = entry.repoSlug || 'neo',
                eventType = entry.eventType || 'ingest',
                detail    = entry.detail == null ? null : this.safeStringify(entry.detail);

            this.db.prepare(`
                INSERT INTO kb_ingestion_metrics (
                    id, timestamp, tenant_id, repo_slug, origin_agent,
                    event_type, chunks_total, chunks_embedded, chunks_deleted,
                    duration_ms, error_code, detail
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `).run(
                crypto.randomUUID(),
                timestamp,
                tenantId,
                repoSlug,
                entry.originAgentIdentity || null,
                eventType,
                entry.chunksTotal    ?? 0,
                entry.chunksEmbedded ?? 0,
                entry.chunksDeleted  ?? 0,
                entry.durationMs     ?? null,
                entry.errorCode      || null,
                detail
            );
        } catch (err) {
            logger.error('[KBRecorderService] Failed to append KB ingestion metric:', err);
        }
    }

    /**
     * @summary Persists one bounded provider admission boundary in the shared telemetry artifact.
     * @param {Object} entry Provider activity descriptor.
     * @returns {String|null}
     */
    beginProviderActivity(entry = {}) {
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return null;
        }

        try {
            return beginProviderActivity(this.db, entry);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to persist provider admission telemetry:', error.message);
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
        if (!activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            startProviderActivity(this.db, activityId, startedAt);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to persist provider-start telemetry:', error.message);
        }
    }

    /**
     * @summary Persists the model selected by provider-owned dispatch code.
     * @param {String} activityId Opaque activity id.
     * @param {Object} activity Dispatch-bound activity refinement.
     * @returns {void}
     */
    refineProviderActivity(activityId, activity) {
        if (!activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            refineProviderActivity(this.db, activityId, activity);
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to persist provider-dispatch telemetry:', error.message);
        }
    }

    /**
     * @summary Persists the bounded completion outcome for one provider activity.
     * @param {String} activityId Opaque activity id.
     * @param {Object} outcome Completion metadata.
     * @returns {void}
     */
    completeProviderActivity(activityId, outcome = {}) {
        if (!activityId) return;
        if (!this.db) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            return;
        }

        try {
            completeProviderActivity(this.db, activityId, outcome);
            this.providerActivityStatusWriter?.publishSuccess(Date.now());
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to persist provider completion telemetry:', error.message);
        }
    }

    /**
     * @summary Persists identities for batch embedding work admitted by Knowledge Base.
     *
     * The recorder owns the low-cardinality source stamp. Text is reduced to fingerprints by the
     * shared ledger and telemetry failure remains behavior-neutral for the embedding call.
     * @param {Object} options Batch identity options.
     * @param {String[]} [options.texts=[]] Admitted batch inputs.
     * @param {Number} [options.submittedAt=Date.now()] Admission instant.
     * @returns {void}
     */
    recordEmbeddingSubmissions({texts = [], submittedAt = Date.now()} = {}) {
        if (!this.db) return;

        try {
            persistEmbeddingSubmissions(this.db, {
                source: 'knowledge-base',
                submittedAt,
                texts
            });
            this.providerActivityStatusWriter?.publishSuccess(Date.now());
        } catch (error) {
            this.providerActivityStatusWriter?.publishFailure(Date.now());
            logger.warn('[KBRecorderService] Failed to persist embedding identity telemetry:', error.message);
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
     * @summary Rolls up `kb_ingestion_metrics` rows into per-tenant aggregate counters.
     *
     * Consumed by the observability daemon (rollup + persist) and alerting threshold checks.
     * Returns one aggregate row per tenant
     * for events within the `sinceMs` window — push/tombstone/reconcile/error event counts,
     * total chunk volumes, and error rate.
     *
     * @param {Object}  [options]
     * @param {Number}  [options.sinceMs]   Lower-bound timestamp; only events at-or-after are counted. Omit for all-time.
     * @param {String}  [options.tenantId]  Restrict the rollup to a single tenant. Omit for all tenants.
     * @returns {Array<{tenantId: String, repoSlug: String, eventCount: Number, ingestEvents: Number, tombstoneEvents: Number, reconcileEvents: Number, errorEvents: Number, chunksEmbedded: Number, chunksDeleted: Number, errorRate: Number}>}
     */
    getTenantIngestionRollup({sinceMs, tenantId} = {}) {
        if (!this.db) return [];

        try {
            const conditions = [];
            const params     = [];

            if (Number.isFinite(sinceMs)) {
                conditions.push('timestamp >= ?');
                params.push(sinceMs);
            }
            if (tenantId) {
                conditions.push('tenant_id = ?');
                params.push(tenantId);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const rows = this.db.prepare(`
                SELECT
                    tenant_id,
                    repo_slug,
                    COUNT(*)                                                      AS event_count,
                    SUM(CASE WHEN event_type = 'ingest'    THEN 1 ELSE 0 END)      AS ingest_events,
                    SUM(CASE WHEN event_type = 'tombstone' THEN 1 ELSE 0 END)      AS tombstone_events,
                    SUM(CASE WHEN event_type = 'reconcile' THEN 1 ELSE 0 END)      AS reconcile_events,
                    SUM(CASE WHEN event_type = 'error'     THEN 1 ELSE 0 END)      AS error_events,
                    SUM(chunks_embedded)                                          AS chunks_embedded,
                    SUM(chunks_deleted)                                           AS chunks_deleted
                FROM kb_ingestion_metrics
                ${whereClause}
                GROUP BY tenant_id, repo_slug
                ORDER BY tenant_id, repo_slug
            `).all(...params);

            return rows.map(row => ({
                tenantId       : row.tenant_id,
                repoSlug       : row.repo_slug,
                eventCount     : row.event_count,
                ingestEvents   : row.ingest_events,
                tombstoneEvents: row.tombstone_events,
                reconcileEvents: row.reconcile_events,
                errorEvents    : row.error_events,
                chunksEmbedded : row.chunks_embedded ?? 0,
                chunksDeleted  : row.chunks_deleted  ?? 0,
                errorRate      : row.event_count > 0 ? row.error_events / row.event_count : 0
            }));
        } catch (err) {
            logger.error('[KBRecorderService] Failed to roll up KB ingestion metrics:', err);
            return [];
        }
    }

    /**
     * @summary Resolves likely Concept Ontology anchors for an Agent FAQ query.
     * @param {String} queryText Canonical FAQ question text.
     * @param {Number} [limit=config.kbFaqConceptLimit] Maximum concepts to return.
     * @returns {String[]} Concept IDs.
     * @protected
     */
    resolveRelatedConceptIds(queryText, limit = config.kbFaqConceptLimit) {
        try {
            return ConceptService.findConceptsRelevantTo(queryText, {limit})
                .map(concept => concept.id)
                .filter(Boolean);
        } catch (err) {
            logger.debug('[KBRecorderService] Concept lookup skipped for Agent FAQ:', err.message);
            return [];
        }
    }

    /**
     * @summary Checks whether any related concept already has guide coverage.
     * @param {String[]} conceptIds Concept Ontology node IDs.
     * @returns {Boolean}
     * @protected
     */
    hasStrongGuideCoverage(conceptIds) {
        return conceptIds.some(conceptId => {
            try {
                return ConceptService.getConceptCoverage(conceptId).explainedBy.length > 0;
            } catch {
                return false;
            }
        });
    }

    /**
     * @summary Builds `kb_query_faqs` from repeated Knowledge Base query telemetry.
     *
     * Rebuilds the materialized FAQ table from `kb_query_log` using conservative normalized
     * query clustering. The similarity threshold is stored on each row as a calibration
     * artifact so future embedding-backed clustering can compare exact-match output against
     * measured cosine thresholds without changing the read path.
     *
     * @param {Object} [options]
     * @param {Number} [options.minCount=config.kbFaqMinCount] Minimum occurrences per FAQ.
     * @param {Number} [options.limit=100] Maximum clusters to persist.
     * @param {Number} [options.sinceTimestamp=0] Lower timestamp bound for source logs.
     * @param {Number} [options.similarityThreshold=config.kbFaqSimilarityThreshold] Calibration threshold.
     * @returns {{count: Number, faqs: Object[]}}
     */
    buildAgentFaqs({
        minCount            = config.kbFaqMinCount,
        limit               = 100,
        sinceTimestamp      = 0,
        similarityThreshold = config.kbFaqSimilarityThreshold
    } = {}) {
        if (!this.db) return {count: 0, faqs: []};

        const rows = this.db.prepare(`
            SELECT *
              FROM kb_query_log
             WHERE timestamp >= ?
               AND query_text IS NOT NULL
               AND TRIM(query_text) != ''
               AND tool IN ('ask_knowledge_base', 'query_documents')
             ORDER BY timestamp ASC
        `).all(sinceTimestamp);

        const groups = new Map();

        for (const row of rows) {
            const normalized = this.normalizeQueryText(row.query_text);
            if (!normalized) continue;

            if (!groups.has(normalized)) {
                groups.set(normalized, {
                    normalized,
                    variants    : new Set(),
                    rows        : [],
                    failureCount: 0
                });
            }

            const group = groups.get(normalized);
            group.variants.add(row.query_text);
            group.rows.push(row);
            if (!row.success) group.failureCount++;
        }

        const faqs = [...groups.values()]
            .filter(group => group.rows.length >= minCount)
            .sort((a, b) => {
                const countDelta = b.rows.length - a.rows.length;
                if (countDelta) return countDelta;
                return b.rows.at(-1).timestamp - a.rows.at(-1).timestamp;
            })
            .slice(0, limit)
            .map(group => {
                const
                    firstSeen         = group.rows[0].timestamp,
                    lastSeen          = group.rows.at(-1).timestamp,
                    variants          = [...group.variants],
                    canonicalQuery    = variants.sort((a, b) => b.length - a.length)[0],
                    relatedConceptIds = this.resolveRelatedConceptIds(canonicalQuery),
                    guideCoverage     = this.hasStrongGuideCoverage(relatedConceptIds),
                    clusterId         = crypto.createHash('sha256').update(group.normalized).digest('hex');

                return {
                    clusterId,
                    canonicalQuery,
                    normalizedQuery       : group.normalized,
                    variants,
                    count                 : group.rows.length,
                    failureCount          : group.failureCount,
                    firstSeen,
                    lastSeen,
                    relatedConceptIds,
                    hasStrongGuideCoverage: guideCoverage,
                    similarityThreshold
                };
            });

        const rebuild = this.db.transaction(() => {
            this.db.prepare('DELETE FROM kb_query_faqs').run();

            const insert = this.db.prepare(`
                INSERT INTO kb_query_faqs (
                    cluster_id, canonical_query, normalized_query, variants,
                    occurrence_count, failure_count, first_seen, last_seen,
                    related_concept_ids, has_strong_guide_coverage,
                    similarity_threshold, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `);

            for (const faq of faqs) {
                insert.run(
                    faq.clusterId,
                    faq.canonicalQuery,
                    faq.normalizedQuery,
                    this.safeStringify(faq.variants),
                    faq.count,
                    faq.failureCount,
                    faq.firstSeen,
                    faq.lastSeen,
                    this.safeStringify(faq.relatedConceptIds),
                    faq.hasStrongGuideCoverage ? 1 : 0,
                    faq.similarityThreshold,
                    Date.now()
                );
            }
        });

        rebuild();

        return {count: faqs.length, faqs};
    }

    /**
     * @summary Lists materialized Agent FAQs for MCP readers and daemon consumers.
     * @param {Object} [options]
     * @param {Number} [options.limit=25] Maximum rows to return.
     * @param {Number} [options.minCount=config.kbFaqMinCount] Minimum occurrences.
     * @param {Boolean} [options.refresh=false] Whether to rebuild the FAQ table first.
     * @param {Number} [options.sinceTimestamp=0] Source-log lower bound used only when refreshing.
     * @returns {{count: Number, minCount: Number, similarityThreshold: Number, faqs: Object[]}}
     */
    listAgentFaqs({
        limit          = 25,
        minCount       = config.kbFaqMinCount,
        refresh        = false,
        sinceTimestamp = 0
    } = {}) {
        if (!this.db) {
            return {
                count              : 0,
                minCount,
                similarityThreshold: config.kbFaqSimilarityThreshold,
                faqs               : []
            };
        }

        if (refresh) {
            this.buildAgentFaqs({limit: Math.max(limit, 100), minCount, sinceTimestamp});
        }

        const rows = this.db.prepare(`
            SELECT *
              FROM kb_query_faqs
             WHERE occurrence_count >= ?
             ORDER BY occurrence_count DESC, last_seen DESC
             LIMIT ?
        `).all(minCount, limit);

        const faqs = rows.map(row => ({
            clusterId             : row.cluster_id,
            canonicalQuery        : row.canonical_query,
            normalizedQuery       : row.normalized_query,
            variants              : this.safeParse(row.variants) || [],
            count                 : row.occurrence_count,
            failureCount          : row.failure_count,
            firstSeen             : row.first_seen,
            lastSeen              : row.last_seen,
            relatedConceptIds     : this.safeParse(row.related_concept_ids) || [],
            hasStrongGuideCoverage: !!row.has_strong_guide_coverage,
            similarityThreshold   : row.similarity_threshold
        }));

        return {
            count              : faqs.length,
            minCount,
            similarityThreshold: config.kbFaqSimilarityThreshold,
            faqs
        };
    }
}

export default Neo.setupClass(KBRecorderService);
