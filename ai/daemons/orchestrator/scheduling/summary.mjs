import {
    getUnreadSunsetHandovers,
    markSunsetHandoversSummaryProcessed
} from '../../wake/queries.mjs';
import {
    getPendingMemorySummaryBackfillJobs,
    isNoProgressBackoffActive as isMemorySummaryBackfillBackoffActive
} from './memorySummaryBackfill.mjs';

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
 * Counts sessions that have `AGENT_MEMORY` turns but no graph-visible summary evidence. The
 * summary artifact itself is `SESSION_SUMMARY` (`summary_<sessionId>`), while the REM projection
 * layer also creates `SESSION` nodes from Chroma summary rows (`session:<sessionId>` with
 * `properties.chromaId = summary_<sessionId>`). Minimal `SESSION` placeholders without a summary
 * Chroma id are deliberately excluded so they do not mask truly unsummarized sessions. Archived
 * memories are excluded too: an archived row has no recoverable content to summarize, so it is an
 * integrity concern, not summary-pending work — counting it would inflate the proxy with sessions
 * the drain can never drain.
 *
 * @summary Feeds the periodic-sweep trigger reason as a graph-backed proxy of drainable
 * session-summary work — un-archived sessions lacking summary evidence. Fail-soft: returns `null`
 * when the graph table is unavailable.
 * @param {Object} db SQLite database handle.
 * @returns {Number|null}
 */
export function getPendingSessionSummaryCount(db) {
    if (!db?.prepare) {
        return null;
    }

    try {
        // Null-safe set anti-join. `NOT IN` would still collapse to 0 if any summary row has a
        // NULL sessionId, while the former correlated NOT EXISTS plan full-scanned the summary set
        // for every memory session on live graphs. Materialize both distinct sets once instead.
        const row = db.prepare(`
            WITH memory_sessions AS (
                SELECT DISTINCT json_extract(memory.data, '$.properties.sessionId') AS sessionId
                FROM Nodes memory
                WHERE json_extract(memory.data, '$.label')                = 'AGENT_MEMORY'
                  AND json_extract(memory.data, '$.properties.sessionId') IS NOT NULL
                  -- Exclude archived/orphaned sessions: an archived memory has no recoverable
                  -- content (its vector row was GC'd or never landed), so it can never be
                  -- summarized — it is an integrity concern, not summary-pending work. A session
                  -- keeps counting while it has any un-archived memory node. Mirrors the
                  -- archived-skip the miniSummary backfill fetch applies for the same reason.
                  AND json_extract(memory.data, '$.properties.archivedAt') IS NULL
            ),
            summary_sessions AS (
                SELECT DISTINCT json_extract(summary.data, '$.properties.sessionId') AS sessionId
                FROM Nodes summary
                WHERE json_extract(summary.data, '$.label')                = 'SESSION_SUMMARY'
                  AND json_extract(summary.data, '$.properties.sessionId') IS NOT NULL
                UNION
                SELECT DISTINCT json_extract(summary.data, '$.properties.sessionId') AS sessionId
                FROM Nodes summary
                WHERE json_extract(summary.data, '$.label')                = 'SESSION'
                  -- REM/provenance projection derived from an actual Chroma summary row. Minimal
                  -- back-fill placeholders have no summary_ chromaId and remain countable.
                  AND json_extract(summary.data, '$.properties.chromaId') LIKE 'summary_%'
                  AND json_extract(summary.data, '$.properties.sessionId') IS NOT NULL
            )
            SELECT COUNT(*) AS n
            FROM memory_sessions memory
            LEFT JOIN summary_sessions summary ON summary.sessionId = memory.sessionId
            WHERE summary.sessionId IS NULL
        `).get();

        return Number.isInteger(row?.n) ? row.n : null;
    } catch {
        return null;
    }
}

/**
 * Checks whether periodic session-summary drift should yield to miniSummary backfill first.
 *
 * @summary `summarizeSession()` falls back from raw turns to per-turn `miniSummary` rows when the
 * raw prompt exceeds the safe band or times out. Periodic drift sweeps therefore depend on the
 * backfill having a chance to drain. Sunset handovers and explicit pending summarization markers
 * are handled before this guard; this predicate is only for the periodic fallback sweep.
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Object} [options.state] Orchestrator task-state map.
 * @param {Number} [options.now] Epoch milliseconds.
 * @param {Function} [options.getPendingMemorySummaryBackfillJobsFn]
 * @param {Function} [options.isMemorySummaryBackfillBackoffActiveFn]
 * @returns {Boolean}
 */
export function hasDrainableMemorySummaryBackfill({
    db,
    state = {},
    now = Date.now(),
    getPendingMemorySummaryBackfillJobsFn = getPendingMemorySummaryBackfillJobs,
    isMemorySummaryBackfillBackoffActiveFn = isMemorySummaryBackfillBackoffActive
} = {}) {
    const pendingBackfillJobs = getPendingMemorySummaryBackfillJobsFn(db);
    if (!Array.isArray(pendingBackfillJobs) || pendingBackfillJobs.length === 0) {
        return false;
    }

    const taskState = state['memory-summary-backfill'] || {};
    return !isMemorySummaryBackfillBackoffActiveFn({taskState, now});
}

/**
 * Builds the task trigger for the summarization sweep lane.
 *
 * Three wake-up sources, in priority order:
 * 1. Unread sunset handovers — priority because they unblock the next agent boot
 * 2. Pending disconnect markers — targeted low-latency session close handling
 * 3. Periodic sweep — fallback for ordinary unsummarized sessions. The optional
 *    `unsummarizedCount` is graph-backed observability, not Chroma drainability.
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
            taskName: 'summary',
            source  : 'sunset-handover',
            reason       : `sunset-handover:${handovers.length}`,
            handoverCount: handovers.length
        };
    }

    if (pendingJobs.length > 0) {
        const backlog = Number.isInteger(totalPending) ? totalPending : pendingJobs.length;

        return {
            taskName: 'summary',
            source  : 'pending-summarization',
            reason      : `pending-summarization:${backlog}`,
            pendingCount: pendingJobs.length
        };
    }

    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : Number.isInteger(unsummarizedCount)
                ? `periodic-sweep:${intervalMs} graph-pending-session-summary:${unsummarizedCount}`
                : `periodic-sweep:${intervalMs}`
        };
    }

    return null;
}

/**
 * Resolves the next summary task trigger, including the post-success handover summary-processed
 * hook when the trigger source is sunset-handover.
 *
 * @param {Object} options
 * @param {Object} options.db SQLite database handle.
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.summarySweepIntervalMs Periodic summary sweep interval.
 * @param {Function} [options.getUnreadSunsetHandoversFn] Test seam for handover reads.
 * @param {Function} [options.getPendingSummarizationJobsFn] Test seam for pending marker reads.
 * @param {Function} [options.getPendingMemorySummaryBackfillJobsFn] Test seam for miniSummary backlog.
 * @param {Function} [options.isMemorySummaryBackfillBackoffActiveFn] Test seam for miniSummary backoff.
 * @param {Function} [options.markSunsetHandoversSummaryProcessedFn] Test seam for handover
 *     summary-consumed writes.
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
    getPendingMemorySummaryBackfillJobsFn = getPendingMemorySummaryBackfillJobs,
    isMemorySummaryBackfillBackoffActiveFn = isMemorySummaryBackfillBackoffActive,
    markSunsetHandoversSummaryProcessedFn = markSunsetHandoversSummaryProcessed,
    log
}) {
    const handovers   = getUnreadSunsetHandoversFn(db);
    const pendingJobs = handovers.length > 0 ? [] : getPendingSummarizationJobsFn(db);
    const lastRunAt   = state.summary?.lastRunAt || 0;
    // Only count the unsummarized-session backlog when the periodic sweep is the path that will
    // fire (no handover, no marked jobs, interval due) — so the COUNT query runs at most once per
    // sweep, never on every poll.
    const periodicSweepDue = handovers.length === 0 && pendingJobs.length === 0 &&
        summarySweepIntervalMs > 0 && now - lastRunAt >= summarySweepIntervalMs;
    const periodicSweepBlockedByBackfill = periodicSweepDue && hasDrainableMemorySummaryBackfill({
        db,
        state,
        now,
        getPendingMemorySummaryBackfillJobsFn,
        isMemorySummaryBackfillBackoffActiveFn
    });

    if (periodicSweepBlockedByBackfill) {
        return null;
    }

    const trigger = buildSummaryTrigger({
        now,
        handovers,
        pendingJobs,
        totalPending     : pendingJobs.length > 0 ? getPendingSummarizationCountFn(db) : null,
        unsummarizedCount: periodicSweepDue ? getPendingSessionSummaryCountFn(db) : null,
        intervalMs       : summarySweepIntervalMs,
        lastRunAt
    });

    if (!trigger) {
        return null;
    }

    if (trigger.source === 'sunset-handover') {
        return {
            ...trigger,
            onSuccess: () => {
                markSunsetHandoversSummaryProcessedFn(db, handovers);
                log?.('INFO', `[Orchestrator] Marked ${handovers.length} sunset handovers as summary-processed.`);
            }
        };
    }

    return trigger;
}
