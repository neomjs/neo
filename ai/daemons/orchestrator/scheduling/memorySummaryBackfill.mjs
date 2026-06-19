/**
 * Backoff window after a `memory-summary-backfill` run drains none of the rows it attempted.
 * This releases the exclusive-heavy lane for session summarization + REM digestion while
 * keeping the residual `AGENT_MEMORY` rows intact for later classification or recovery.
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
              -- exclude rows archived as structurally un-summarizable (no recoverable content)
              AND json_extract(memory.data, '$.properties.archivedAt') IS NULL
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
              -- exclude rows archived as structurally un-summarizable (no recoverable content)
              AND json_extract(memory.data, '$.properties.archivedAt') IS NULL
        `).get();

        return Number.isInteger(row?.n) ? row.n : null;
    } catch {
        return null;
    }
}

/**
 * Of a given id set, returns the subset still lacking `miniSummary` — the rows a run TRIED but did
 * not drain.
 *
 * @summary Robust no-progress detection. Unlike {@link getPendingMemorySummaryBackfillJobs}
 * (the shifting newest-N window), this checks the SPECIFIC ids a run attempted, so a fresh
 * `miniSummary: NULL` arrival on a busy session cannot mask zero progress. Fail-soft: returns [].
 * @param {Object} db SQLite database handle.
 * @param {String[]} [ids=[]] Candidate ids (the rows a run attempted).
 * @returns {String[]} The subset of `ids` still pending.
 */
export function getStillPendingMemorySummaryBackfillJobs(db, ids = []) {
    if (!db?.prepare || !Array.isArray(ids) || ids.length === 0) {
        return [];
    }

    try {
        const placeholders = ids.map(() => '?').join(',');

        return db.prepare(`
            SELECT memory.id AS id
            FROM Nodes memory
            WHERE json_extract(memory.data, '$.label') = 'AGENT_MEMORY'
              AND json_extract(memory.data, '$.properties.miniSummary') IS NULL
              -- an archived row is no longer pending: it counts as progress, not a stuck attempt
              AND json_extract(memory.data, '$.properties.archivedAt') IS NULL
              AND memory.id IN (${placeholders})
        `).all(...ids).map(row => row.id).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Checks whether the persisted no-progress backoff still suppresses the backfill.
 *
 * @summary The backoff holds for its full window regardless of new arrivals. It was previously
 * gated on a `samePendingWindow(noProgressPendingIds, pendingJobs)` check, but every agent
 * turn's `add_memory` writes a fresh `miniSummary: NULL` row at the DESC top — shifting the window
 * and letting the backfill bypass the backoff and re-fire every scheduler tick while the newest
 * rows stayed un-summarizable. Holding the window IS the heavy-lane yield (AC3): session
 * summarization + REM digestion run while the backfill backs off.
 * @param {Object} options
 * @param {Object} options.taskState Persisted task state for `memory-summary-backfill`.
 * @param {Number} options.now Epoch ms.
 * @returns {Boolean}
 */
export function isNoProgressBackoffActive({taskState = {}, now = Date.now()} = {}) {
    return (Number(taskState.noProgressBackoffUntilMs) || 0) > now;
}

/**
 * Builds the success hook that records a bounded no-progress backoff when a child run drains NONE
 * of the rows it attempted.
 *
 * @summary "No progress" = zero of the attempted `pendingJobs` were summarized (re-queried by id),
 * NOT "the newest-N window is byte-identical". The old window check armed only when no new
 * `miniSummary: NULL` row had arrived — impossible on a busy session, so the backfill re-fired every
 * tick. This does NOT mutate the memory rows; the state lives on the orchestrator task entry and
 * expires automatically.
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Object} options.taskState Mutable task state object.
 * @param {String[]} options.pendingJobs Pending ids selected before the child ran (the attempted set).
 * @param {Number|null} options.totalPending Uncapped pending count before the child ran (logged reason).
 * @param {Function} [options.getStillPendingMemorySummaryBackfillJobsFn] Test seam: still-pending subset.
 * @param {Function} [options.nowFn]
 * @param {Number} [options.backoffMs]
 * @returns {Function}
 */
export function buildNoProgressBackoffHook({
    db,
    taskState = {},
    pendingJobs = [],
    totalPending,
    getStillPendingMemorySummaryBackfillJobsFn = getStillPendingMemorySummaryBackfillJobs,
    nowFn     = () => Date.now(),
    backoffMs = NO_PROGRESS_BACKOFF_MS
} = {}) {
    return () => {
        // Arm on REAL no-progress: did the run drain ANY of the rows it tried? Re-query the SPECIFIC
        // attempted ids, so a fresh miniSummary:NULL arrival at the DESC top can't mask zero progress.
        const stillStuck = pendingJobs.length > 0
            ? getStillPendingMemorySummaryBackfillJobsFn(db, pendingJobs)
            : [];
        const noProgress = pendingJobs.length > 0 && stillStuck.length === pendingJobs.length;

        if (noProgress) {
            const recordedAt = nowFn();
            const backlog    = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;

            taskState.noProgressBackoffUntilMs = recordedAt + backoffMs;
            taskState.noProgressBackoffReason  = `no-progress:${backlog}`;
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
    getPendingMemorySummaryBackfillJobsFn      = getPendingMemorySummaryBackfillJobs,
    getPendingMemorySummaryBackfillCountFn     = getPendingMemorySummaryBackfillCount,
    getStillPendingMemorySummaryBackfillJobsFn = getStillPendingMemorySummaryBackfillJobs,
    state = {},
    now = Date.now(),
    nowFn = () => Date.now(),
    backoffMs = NO_PROGRESS_BACKOFF_MS
}) {
    const pendingJobs = getPendingMemorySummaryBackfillJobsFn(db);
    const taskState   = state['memory-summary-backfill'] || {};

    if (pendingJobs.length > 0 && isNoProgressBackoffActive({taskState, now})) {
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
                getStillPendingMemorySummaryBackfillJobsFn,
                nowFn,
                backoffMs
            })
            : undefined
    });
}
