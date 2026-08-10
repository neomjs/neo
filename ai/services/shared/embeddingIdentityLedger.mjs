import crypto from 'crypto';

/**
 * @module ai/services/shared/embeddingIdentityLedger
 * @summary Cross-process, content-safe accounting for repeated batch-embedding submissions.
 *
 * Knowledge Base and Memory Core embed in different containers but share one telemetry SQLite
 * database. The ratio therefore belongs in that shared artifact: a process-local counter in
 * `kb-server` cannot be read by the `mc-server` tool that publishes the observation.
 *
 * Only truncated fingerprints and low-cardinality source labels are stored. Raw embedding input
 * never enters telemetry. Retention is row-bounded; the eviction watermark lets a caller distinguish
 * a complete requested lookback from a retained tail.
 */

/**
 * @summary Maximum retained batch-embedding submissions across all recorder processes.
 * @type {Number}
 */
export const EMBEDDING_IDENTITY_RETENTION_LIMIT = 2048;

const SOURCES = new Set(['knowledge-base', 'memory-core', 'orchestrator', 'unknown']);

/**
 * @summary Fingerprints one embedding input without retaining corpus text.
 *
 * A collision would overstate repetition by collapsing two distinct inputs. A 128-bit prefix keeps
 * that probability negligible for the bounded 2,048-row ledger without retaining corpus text.
 * @param {String} text Embedding input.
 * @returns {String} 32-hex-character fingerprint.
 */
export function fingerprintEmbeddingInput(text) {
    return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 32)
}

/**
 * @summary Creates the shared embedding-identity tables and the durable coverage boundary.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} [options]
 * @param {Function} [options.now=Date.now] Injectable clock used only when the schema is first seen.
 * @returns {void}
 */
export function ensureEmbeddingIdentitySchema(db, {now = Date.now} = {}) {
    if (!db?.exec || !db?.prepare) {
        throw new TypeError('embeddingIdentityLedger requires an open SQLite connection');
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS embedding_identity_log (
            submission_id TEXT PRIMARY KEY,
            source        TEXT NOT NULL,
            submitted_at  INTEGER NOT NULL,
            fingerprint   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_embedding_identity_log_submitted
            ON embedding_identity_log(submitted_at, submission_id);
        CREATE INDEX IF NOT EXISTS idx_embedding_identity_log_fingerprint
            ON embedding_identity_log(fingerprint);

        CREATE TABLE IF NOT EXISTS embedding_identity_state (
            key   TEXT PRIMARY KEY,
            value INTEGER NOT NULL
        );
    `);

    db.prepare(`
        INSERT INTO embedding_identity_state (key, value)
        VALUES ('coverage_started_at', @value)
        ON CONFLICT(key) DO UPDATE SET value = MIN(value, excluded.value)
    `).run({value: now()});
}

/**
 * @summary Appends one admitted batch's identities and atomically enforces bounded retention.
 *
 * The call is intentionally made before provider settlement: failed work still consumed a submission
 * and is the non-convergence shape the ratio exists to expose. Pre-aborted or invalid requests must
 * not call this ingress because they never reached the provider path.
 * @param {Object} db Open better-sqlite3 connection shared by the recorder processes.
 * @param {Object} [entry]
 * @param {String[]} [entry.texts=[]] Batch inputs admitted to an embedding provider path.
 * @param {String} [entry.source='unknown'] Closed low-cardinality process/service source.
 * @param {Number} [entry.submittedAt=Date.now()] Admission timestamp.
 * @param {Number} [entry.retentionLimit=EMBEDDING_IDENTITY_RETENTION_LIMIT] Row cap.
 * @returns {{evicted: Number, recorded: Number}}
 */
export function recordEmbeddingSubmissions(db, {
    texts = [],
    source = 'unknown',
    submittedAt = Date.now(),
    retentionLimit = EMBEDDING_IDENTITY_RETENTION_LIMIT
} = {}) {
    if (!Array.isArray(texts)) {
        throw new TypeError('embeddingIdentityLedger texts must be an array');
    }
    if (!Number.isFinite(submittedAt)) {
        throw new TypeError('embeddingIdentityLedger submittedAt must be a finite epoch');
    }
    if (!Number.isInteger(retentionLimit) || retentionLimit < 1) {
        throw new TypeError('embeddingIdentityLedger retentionLimit must be a positive integer');
    }

    ensureEmbeddingIdentitySchema(db, {now: () => submittedAt});

    if (texts.length === 0) {
        return {evicted: 0, recorded: 0};
    }

    const
        safeSource = SOURCES.has(source) ? source : 'unknown',
        insert     = db.prepare(`
            INSERT INTO embedding_identity_log (
                submission_id, source, submitted_at, fingerprint
            ) VALUES (
                @submissionId, @source, @submittedAt, @fingerprint
            )
        `),
        remove     = db.prepare('DELETE FROM embedding_identity_log WHERE submission_id = ?'),
        write      = db.transaction(() => {
            for (const text of texts) {
                insert.run({
                    submissionId: crypto.randomUUID(),
                    source      : safeSource,
                    submittedAt,
                    fingerprint : fingerprintEmbeddingInput(text)
                });
            }

            const
                total    = db.prepare('SELECT COUNT(*) AS count FROM embedding_identity_log').get().count,
                overflow = Math.max(0, total - retentionLimit),
                evicted  = overflow === 0 ? [] : db.prepare(`
                    SELECT submission_id, submitted_at
                      FROM embedding_identity_log
                     ORDER BY submitted_at ASC, submission_id ASC
                     LIMIT ?
                `).all(overflow);

            for (const row of evicted) {
                remove.run(row.submission_id);
            }

            if (evicted.length > 0) {
                const evictedThrough = Math.max(...evicted.map(row => row.submitted_at));

                db.prepare(`
                    INSERT INTO embedding_identity_state (key, value)
                    VALUES ('evicted_through', @value)
                    ON CONFLICT(key) DO UPDATE SET value = MAX(value, excluded.value)
                `).run({value: evictedThrough});
            }

            return {evicted: evicted.length, recorded: texts.length}
        });

    return write()
}

/**
 * @summary Reads the re-embed ratio over the caller's exact lookback.
 *
 * `truncated` is coverage, not capacity: it is true when instrumentation began after the requested
 * lower bound or when retained rows were evicted inside that bound. Old rows outside the requested
 * interval neither influence the ratio nor poison later complete windows.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} options
 * @param {Number} options.sinceTs Inclusive epoch lower bound.
 * @returns {{coverageStartedAt: Number, distinct: Number, oldestRetainedAt: Number|null, ratio: Number|null, submissions: Number, truncated: Boolean}}
 */
export function getEmbeddingIdentityWindow(db, {sinceTs} = {}) {
    if (!Number.isFinite(sinceTs)) {
        throw new TypeError('embeddingIdentityLedger sinceTs must be a finite epoch');
    }

    const readSnapshot = db.transaction(() => {
        const
            coverageStartedAt = db.prepare(`
                SELECT value FROM embedding_identity_state WHERE key = 'coverage_started_at'
            `).get()?.value,
            evictedThrough = db.prepare(`
                SELECT value FROM embedding_identity_state WHERE key = 'evicted_through'
            `).get()?.value ?? null,
            retained = db.prepare(`
                SELECT MIN(submitted_at) AS oldest_retained_at
                  FROM embedding_identity_log
            `).get(),
            aggregate = db.prepare(`
                SELECT COUNT(*) AS submissions,
                       COUNT(DISTINCT fingerprint) AS distinct_count
                  FROM embedding_identity_log
                 WHERE submitted_at >= @sinceTs
            `).get({sinceTs}),
            submissions = aggregate?.submissions || 0,
            distinct    = aggregate?.distinct_count || 0;

        if (!Number.isFinite(coverageStartedAt)) {
            throw new Error('embedding identity coverage boundary is missing');
        }

        return {
            coverageStartedAt,
            distinct,
            oldestRetainedAt: retained?.oldest_retained_at ?? null,
            ratio           : distinct === 0 ? null : submissions / distinct,
            submissions,
            truncated       : sinceTs < coverageStartedAt ||
                              (evictedThrough !== null && sinceTs <= evictedThrough)
        }
    });

    return readSnapshot()
}
