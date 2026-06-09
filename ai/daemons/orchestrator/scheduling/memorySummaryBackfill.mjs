/**
 * Backoff window after a `memory-summary-backfill` run completes without changing the selected
 * pending row window. This releases the exclusive-heavy lane for session summarization while keeping
 * the residual `AGENT_MEMORY` rows intact for later classification or recovery.
 *
 * @type {Number}
 */
export const NO_PROGRESS_BACKOFF_MS = 10 * 60 * 1000;

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
 * @summary Returns true when the scheduler is still seeing the same stuck pending window.
 * @param {String[]} left
 * @param {String[]} right
 * @returns {Boolean}
 */
export function samePendingWindow(left = [], right = []) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Checks whether the persisted no-progress backoff still suppresses the current pending window.
 *
 * The backoff is intentionally tied to the concrete selected ids, not just to the global pending
 * count. If new memories arrive above the stuck residual, the window changes and the scheduler lets
 * the backfill run immediately.
 *
 * @param {Object} options
 * @param {Object} options.taskState Persisted task state for `memory-summary-backfill`.
 * @param {String[]} options.pendingJobs Current selected pending ids.
 * @param {Number} options.now Epoch ms.
 * @returns {Boolean}
 */
export function isNoProgressBackoffActive({taskState = {}, pendingJobs = [], now = Date.now()} = {}) {
    const untilMs = Number(taskState.noProgressBackoffUntilMs) || 0;

    return untilMs > now && samePendingWindow(taskState.noProgressPendingIds || [], pendingJobs);
}

/**
 * Builds the success hook that records a bounded no-progress backoff when a child run exits
 * successfully but leaves the same pending window untouched.
 *
 * This deliberately does NOT mutate the memory rows. The state lives on the orchestrator task entry
 * and expires automatically, preserving possible valuable turns while preventing a tight
 * exclusive-heavy spin loop.
 *
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Object} options.taskState Mutable task state object.
 * @param {String[]} options.pendingJobs Pending ids selected before the child ran.
 * @param {Number|null} options.totalPending Uncapped pending count before the child ran.
 * @param {Function} [options.getPendingMemorySummaryBackfillJobsFn]
 * @param {Function} [options.getPendingMemorySummaryBackfillCountFn]
 * @param {Function} [options.nowFn]
 * @param {Number} [options.backoffMs]
 * @returns {Function}
 */
export function buildNoProgressBackoffHook({
    db,
    taskState = {},
    pendingJobs = [],
    totalPending,
    getPendingMemorySummaryBackfillJobsFn  = getPendingMemorySummaryBackfillJobs,
    getPendingMemorySummaryBackfillCountFn = getPendingMemorySummaryBackfillCount,
    nowFn     = () => Date.now(),
    backoffMs = NO_PROGRESS_BACKOFF_MS
} = {}) {
    return () => {
        const afterJobs  = getPendingMemorySummaryBackfillJobsFn(db, {limit: pendingJobs.length || 50});
        const afterCount = getPendingMemorySummaryBackfillCountFn(db);
        const beforeCount = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;
        const stalled = afterCount === beforeCount && samePendingWindow(afterJobs, pendingJobs);

        if (stalled) {
            const recordedAt = nowFn();

            taskState.noProgressBackoffUntilMs = recordedAt + backoffMs;
            taskState.noProgressBackoffReason  = `no-progress:${beforeCount}`;
            taskState.noProgressBackoffAt       = new Date(recordedAt).toISOString();
            taskState.noProgressPendingIds      = [...pendingJobs];
            return;
        }

        delete taskState.noProgressBackoffUntilMs;
        delete taskState.noProgressBackoffReason;
        delete taskState.noProgressBackoffAt;
        delete taskState.noProgressPendingIds;
    };
}

/**
 * Builds the task trigger for memory miniSummary backfill.
 *
 * @param {Object} options
 * @param {String[]} [options.pendingJobs=[]] Pending AGENT_MEMORY ids (capped at the fetch limit).
 * @param {Number} [options.totalPending] Uncapped backlog depth for the (logged) reason; falls back
 *     to `pendingJobs.length` when not an integer.
 * @param {Function} [options.onSuccess] Optional success hook for scheduler state maintenance.
 * @returns {Object|null}
 */
export function buildMemorySummaryBackfillTrigger({pendingJobs = [], totalPending, onSuccess} = {}) {
    if (pendingJobs.length > 0) {
        const backlog = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;

        const trigger = {
            taskName    : 'memory-summary-backfill',
            source      : 'pending-memory-minisummary',
            reason      : `pending-memory-minisummary:${backlog}`,
            pendingCount: pendingJobs.length
        };

        if (typeof onSuccess === 'function') {
            trigger.onSuccess = onSuccess;
        }

        return trigger;
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
    getPendingMemorySummaryBackfillCountFn = getPendingMemorySummaryBackfillCount,
    state = {},
    now = Date.now(),
    nowFn = () => Date.now(),
    backoffMs = NO_PROGRESS_BACKOFF_MS
}) {
    const pendingJobs = getPendingMemorySummaryBackfillJobsFn(db);
    const taskState   = state['memory-summary-backfill'] || {};

    if (pendingJobs.length > 0 && isNoProgressBackoffActive({taskState, pendingJobs, now})) {
        return null;
    }

    const totalPending = pendingJobs.length > 0 ? getPendingMemorySummaryBackfillCountFn(db) : null;

    return buildMemorySummaryBackfillTrigger({
        pendingJobs,
        totalPending,
        onSuccess: pendingJobs.length > 0
            ? buildNoProgressBackoffHook({
                db,
                taskState,
                pendingJobs,
                totalPending,
                getPendingMemorySummaryBackfillJobsFn,
                getPendingMemorySummaryBackfillCountFn,
                nowFn,
                backoffMs
            })
            : undefined
    });
}
