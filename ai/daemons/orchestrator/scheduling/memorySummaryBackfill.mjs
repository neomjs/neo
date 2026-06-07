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
 * Builds the task trigger for memory miniSummary backfill.
 *
 * @param {Object} options
 * @param {String[]} [options.pendingJobs=[]] Pending AGENT_MEMORY ids.
 * @returns {Object|null}
 */
export function buildMemorySummaryBackfillTrigger({pendingJobs = []} = {}) {
    if (pendingJobs.length > 0) {
        return {
            taskName    : 'memory-summary-backfill',
            source      : 'pending-memory-minisummary',
            reason      : `pending-memory-minisummary:${pendingJobs.length}`,
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
 * @param {Function} [options.getPendingMemorySummaryBackfillJobsFn] Test seam.
 * @returns {Object|null}
 */
export function getDueTask({
    db,
    getPendingMemorySummaryBackfillJobsFn = getPendingMemorySummaryBackfillJobs
}) {
    return buildMemorySummaryBackfillTrigger({
        pendingJobs: getPendingMemorySummaryBackfillJobsFn(db)
    });
}
