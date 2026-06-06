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
 * @param {String[]} [options.pendingJobs=[]] Pending SummarizationJobs session ids.
 * @returns {Object|null} A summary task trigger or null when no work is due.
 */
export function buildSummaryTrigger({now, lastRunAt, intervalMs, handovers = [], pendingJobs = []}) {
    if (handovers.length > 0) {
        return {
            taskName     : 'summary',
            source       : 'sunset-handover',
            reason       : `sunset-handover:${handovers.length}`,
            handoverCount: handovers.length
        };
    }

    if (pendingJobs.length > 0) {
        return {
            taskName    : 'summary',
            source      : 'pending-summarization',
            reason      : `pending-summarization:${pendingJobs.length}`,
            pendingCount: pendingJobs.length
        };
    }

    if (intervalMs > 0 && now - lastRunAt >= intervalMs) {
        return {
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : `periodic-sweep:${intervalMs}`
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
    markNodesAsReadFn          = markNodesAsRead,
    log
}) {
    const handovers = getUnreadSunsetHandoversFn(db);
    const pendingJobs = handovers.length > 0 ? [] : getPendingSummarizationJobsFn(db);
    const trigger   = buildSummaryTrigger({
        now,
        handovers,
        pendingJobs,
        intervalMs: summarySweepIntervalMs,
        lastRunAt : state.summary?.lastRunAt || 0
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
