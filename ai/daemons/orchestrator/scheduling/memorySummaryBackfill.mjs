/**
 * Reads pending `AGENT_MEMORY` rows that still lack `miniSummary`.
 *
 * @summary Cheap scheduler-side existence check; the supervised lifecycle child owns the actual
 * Chroma join, model call, and graph update.
 * @param {Object} db SQLite database handle.
 * @param {Object} [options]
 * @param {Number} [options.limit=50] Maximum ids to return.
 * @returns {String[]}
 */
export function getPendingMemorySummaryBackfillJobs(db, {limit = 50} = {}) {
    if (!db?.prepare) {
        return [];
    }

    const numericLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

    try {
        return db.prepare(`
            SELECT memory.id AS id
            FROM Nodes memory
            WHERE json_extract(memory.data, '$.label') = 'AGENT_MEMORY'
              AND json_extract(memory.data, '$.properties.miniSummary') IS NULL
            ORDER BY json_extract(memory.data, '$.properties.timestamp') DESC, memory.id DESC
            LIMIT ?
        `).all(numericLimit).map(row => row.id).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Counts ALL pending `AGENT_MEMORY` rows lacking `miniSummary` — the true backlog depth.
 *
 * @summary Distinct from {@link getPendingMemorySummaryBackfillJobs} (capped at the fetch limit).
 * This uncapped COUNT feeds the trigger reason so the orchestrator log reports the real backlog
 * rather than the fetch limit. Fail-soft: returns `null` when the graph table is unavailable.
 * @param {Object} db SQLite database handle.
 * @returns {Number|null}
 */
export function getPendingMemorySummaryBackfillCount(db) {
    if (!db?.prepare) {
        return null;
    }

    try {
        const row = db.prepare(`
            SELECT COUNT(*) AS n
            FROM Nodes memory
            WHERE json_extract(memory.data, '$.label') = 'AGENT_MEMORY'
              AND json_extract(memory.data, '$.properties.miniSummary') IS NULL
        `).get();

        return Number.isInteger(row?.n) ? row.n : null;
    } catch {
        return null;
    }
}

/**
 * Builds the task trigger for memory miniSummary backfill.
 *
 * @param {Object} options
 * @param {String[]} [options.pendingJobs=[]] Pending AGENT_MEMORY ids (capped at the fetch limit).
 * @param {Number} [options.totalPending] Uncapped backlog depth for the (logged) reason; falls back
 *     to `pendingJobs.length` when not an integer.
 * @returns {Object|null}
 */
export function buildMemorySummaryBackfillTrigger({pendingJobs = [], totalPending} = {}) {
    if (pendingJobs.length > 0) {
        const backlog = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;

        return {
            taskName    : 'memory-summary-backfill',
            source      : 'pending-memory-minisummary',
            reason      : `pending-memory-minisummary:${backlog}`,
            pendingCount: pendingJobs.length
        };
    }

    return null;
}

/**
 * Resolves the next memory miniSummary backfill trigger.
 *
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Function} [options.getPendingMemorySummaryBackfillJobsFn] Test seam for the limited fetch.
 * @param {Function} [options.getPendingMemorySummaryBackfillCountFn] Test seam for the uncapped count.
 * @returns {Object|null}
 */
export function getDueTask({
    db,
    getPendingMemorySummaryBackfillJobsFn  = getPendingMemorySummaryBackfillJobs,
    getPendingMemorySummaryBackfillCountFn = getPendingMemorySummaryBackfillCount
}) {
    const pendingJobs = getPendingMemorySummaryBackfillJobsFn(db);

    return buildMemorySummaryBackfillTrigger({
        pendingJobs,
        totalPending: pendingJobs.length > 0 ? getPendingMemorySummaryBackfillCountFn(db) : null
    });
}
