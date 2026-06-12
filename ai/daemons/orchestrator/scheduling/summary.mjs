import {
    getUnreadSunsetHandovers,
    markNodesAsRead
} from '../../wake/queries.mjs';

/**
 * Reads pending low-latency summarization markers from the coordinator table.
 *
 * @summary Keeps the scheduler's pending-lane check cheap: it only needs to know
 * whether pending rows exist, while the spawned summary child remains responsible
 * for lease-claiming and draining the actual jobs.
 * @param {Object} db SQLite database handle.
 * @param {Object} [options]
 * @param {Number} [options.limit=50] Maximum marker ids to return.
 * @returns {String[]}
 */
export function getPendingSummarizationJobs(db, {limit = 50} = {}) {
    if (!db?.prepare) {
        return [];
    }

    const numericLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

    try {
        return db.prepare(`
            SELECT session_id
            FROM SummarizationJobs
            WHERE status = 'pending'
            ORDER BY rowid ASC
            LIMIT ?
        `).all(numericLimit).map(row => row.session_id).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Counts ALL pending `SummarizationJobs` rows — the true session-summary backlog depth.
 *
 * @summary Distinct from {@link getPendingSummarizationJobs} (capped at the fetch limit). This
 * uncapped COUNT feeds the trigger reason so the orchestrator log reports the real backlog rather
 * than the fetch limit. Fail-soft: returns `null` when the table is unavailable.
 * @param {Object} db SQLite database handle.
 * @returns {Number|null}
 */
export function getPendingSummarizationCount(db) {
    if (!db?.prepare) {
        return null;
    }

    try {
        const row = db.prepare(`
            SELECT COUNT(*) AS n
            FROM SummarizationJobs
            WHERE status = 'pending'
        `).get();

        return Number.isInteger(row?.n) ? row.n : null;
    } catch {
        return null;
    }
}

/**
 * Counts sessions that have `AGENT_MEMORY` turns but no `SESSION_SUMMARY` — the real
 * unsummarized-session backlog the periodic sweep drains (parallel to the mini-summary backlog
 * count, not the capped SummarizationJobs marker fetch).
 *
 * @summary Feeds the periodic-sweep trigger reason so the orchestrator log reports the
 * session-summary backlog depth. Fail-soft: returns `null` when the graph table is unavailable.
 * @param {Object} db SQLite database handle.
 * @returns {Number|null}
 */
export function getPendingSessionSummaryCount(db) {
    if (!db?.prepare) {
        return null;
    }

    try {
        // Null-safe anti-join: a correlated NOT EXISTS rather than `NOT IN (subquery)`. A single
        // SESSION_SUMMARY row with a NULL sessionId would make `NOT IN` evaluate to NULL for every
        // row, silently collapsing the backlog count to 0; NOT EXISTS is immune to that.
        const row = db.prepare(`
            SELECT COUNT(*) AS n FROM (
                SELECT DISTINCT json_extract(memory.data, '$.properties.sessionId') AS sessionId
                FROM Nodes memory
                WHERE json_extract(memory.data, '$.label')                = 'AGENT_MEMORY'
                  AND json_extract(memory.data, '$.properties.sessionId') IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM Nodes summary
                      WHERE json_extract(summary.data, '$.label')                = 'SESSION_SUMMARY'
                        AND json_extract(summary.data, '$.properties.sessionId') = json_extract(memory.data, '$.properties.sessionId')
                  )
            )
        `).get();

        return Number.isInteger(row?.n) ? row.n : null;
    } catch {
        return null;
    }
}

/**
 * Builds the task trigger for the summarization sweep lane.
 *
 * Three wake-up sources, in priority order:
 * 1. Unread sunset handovers — priority because they unblock the next agent boot
 * 2. Pending disconnect markers — targeted low-latency session close handling
 * 3. Periodic sweep — fallback for ordinary unsummarized sessions
 *
 * Pure function. Test the scheduling contract without mounting the SQLite graph.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last summary task start timestamp.
 * @param {Number} options.intervalMs Periodic sweep interval; `0` disables the interval source.
 * @param {Object[]} [options.handovers=[]] Unread sunset-handover message nodes.
 * @param {String[]} [options.pendingJobs=[]] Pending SummarizationJobs session ids (capped at fetch limit).
 * @param {Number} [options.totalPending] Uncapped pending-summarization depth for the (logged) reason;
 *     falls back to `pendingJobs.length` when not an integer.
 * @param {Number} [options.unsummarizedCount] Uncapped unsummarized-session backlog depth; appended to
 *     the periodic-sweep reason when an integer so the log reports the session-summary backlog depth.
 * @returns {Object|null} A summary task trigger or null when no work is due.
 */
export function buildSummaryTrigger({now, lastRunAt, intervalMs, handovers = [], pendingJobs = [], totalPending, unsummarizedCount}) {
    if (handovers.length > 0) {
        return {
            taskName     : 'summary',
            source       : 'sunset-handover',
            reason       : `sunset-handover:${handovers.length}`,
            handoverCount: handovers.length
        };
    }

    if (pendingJobs.length > 0) {
        const backlog = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;

        return {
            taskName    : 'summary',
            source      : 'pending-summarization',
            reason      : `pending-summarization:${backlog}`,
            pendingCount: pendingJobs.length
        };
    }

    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : Number.isInteger(unsummarizedCount)
                ? `periodic-sweep:${intervalMs} pending-session-summary:${unsummarizedCount}`
                : `periodic-sweep:${intervalMs}`
        };
    }

    return null;
}

/**
 * Resolves the next summary task trigger, including the post-success handover mark-read hook
 * when the trigger source is sunset-handover.
 *
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.summarySweepIntervalMs Periodic summary sweep interval.
 * @param {Function} [options.getUnreadSunsetHandoversFn] Test seam for handover reads.
 * @param {Function} [options.getPendingSummarizationJobsFn] Test seam for pending marker reads.
 * @param {Function} [options.markNodesAsReadFn] Test seam for handover mark-read writes.
 * @param {Function} [options.log] Optional orchestrator log function.
 * @returns {Object|null} Task trigger with optional `onSuccess` callback, or null.
 */
export function getDueTask({
    db,
    state,
    now,
    summarySweepIntervalMs,
    getUnreadSunsetHandoversFn = getUnreadSunsetHandovers,
    getPendingSummarizationJobsFn = getPendingSummarizationJobs,
    getPendingSummarizationCountFn = getPendingSummarizationCount,
    getPendingSessionSummaryCountFn = getPendingSessionSummaryCount,
    markNodesAsReadFn          = markNodesAsRead,
    log
}) {
    const handovers = getUnreadSunsetHandoversFn(db);
    const pendingJobs = handovers.length > 0 ? [] : getPendingSummarizationJobsFn(db);
    const lastRunAt   = state.summary?.lastRunAt || 0;
    // Only count the unsummarized-session backlog when the periodic sweep is the path that will
    // fire (no handover, no marked jobs, interval due) — so the COUNT query runs at most once per
    // sweep, never on every poll.
    const periodicSweepDue = handovers.length === 0 && pendingJobs.length === 0 &&
        summarySweepIntervalMs > 0 && now - lastRunAt >= summarySweepIntervalMs;
    const trigger   = buildSummaryTrigger({
        now,
        handovers,
        pendingJobs,
        totalPending     : pendingJobs.length > 0 ? getPendingSummarizationCountFn(db) : null,
        unsummarizedCount: periodicSweepDue ? getPendingSessionSummaryCountFn(db) : null,
        intervalMs: summarySweepIntervalMs,
        lastRunAt
    });

    if (!trigger) {
        return null;
    }

    if (trigger.source === 'sunset-handover') {
        return {
            ...trigger,
            onSuccess: () => {
                markNodesAsReadFn(db, handovers);
                log?.('INFO', `[Orchestrator] Marked ${handovers.length} sunset handovers as read.`);
            }
        };
    }

    return trigger;
}
