import crypto         from 'crypto';
import fs             from 'fs-extra';
import path           from 'path';
import Base           from '../../../src/core/Base.mjs';
import ConceptService from '../ConceptService.mjs';
import config         from '../../mcp/server/knowledge-base/config.mjs';
import logger         from '../../mcp/server/knowledge-base/logger.mjs';

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
        db: null
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

            await fs.ensureDir(path.dirname(dbPath));

            const Database = (await import('better-sqlite3')).default;

            this.db = new Database(dbPath, {verbose: null});
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
            `);

            logger.info('[KBRecorderService] Connected to Memory Core kb_query_log / kb_query_faqs.');
        } catch (err) {
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
                    firstSeen          = group.rows[0].timestamp,
                    lastSeen           = group.rows.at(-1).timestamp,
                    variants           = [...group.variants],
                    canonicalQuery     = variants.sort((a, b) => b.length - a.length)[0],
                    relatedConceptIds  = this.resolveRelatedConceptIds(canonicalQuery),
                    guideCoverage      = this.hasStrongGuideCoverage(relatedConceptIds),
                    clusterId          = crypto.createHash('sha256').update(group.normalized).digest('hex');

                return {
                    clusterId,
                    canonicalQuery,
                    normalizedQuery: group.normalized,
                    variants,
                    count          : group.rows.length,
                    failureCount   : group.failureCount,
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
            clusterId              : row.cluster_id,
            canonicalQuery         : row.canonical_query,
            normalizedQuery        : row.normalized_query,
            variants               : this.safeParse(row.variants) || [],
            count                  : row.occurrence_count,
            failureCount           : row.failure_count,
            firstSeen              : row.first_seen,
            lastSeen               : row.last_seen,
            relatedConceptIds      : this.safeParse(row.related_concept_ids) || [],
            hasStrongGuideCoverage: !!row.has_strong_guide_coverage,
            similarityThreshold    : row.similarity_threshold
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
