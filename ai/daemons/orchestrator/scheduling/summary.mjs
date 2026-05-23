import {
    getUnreadSunsetHandovers,
    markNodesAsRead
} from '../../bridge/queries.mjs';

/**
 * Builds the task trigger for the summarization sweep lane.
 *
 * Two wake-up sources, in priority order:
 * 1. Unread sunset handovers — priority because they unblock the next agent boot
 * 2. Periodic sweep — fallback for ordinary unsummarized sessions
 *
 * Pure function. Test the scheduling contract without mounting the SQLite graph.
 *
 * @param {Object} options
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last summary task start timestamp.
 * @param {Number} options.intervalMs Periodic sweep interval; `0` disables the interval source.
 * @param {Object[]} [options.handovers=[]] Unread sunset-handover message nodes.
 * @returns {Object|null} A summary task trigger or null when no work is due.
 */
export function buildSummaryTrigger({now, lastRunAt, intervalMs, handovers = []}) {
    if (handovers.length > 0) {
        return {
            taskName     : 'summary',
            source       : 'sunset-handover',
            reason       : `sunset-handover:${handovers.length}`,
            handoverCount: handovers.length
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
    markNodesAsReadFn          = markNodesAsRead,
    log
}) {
    const handovers = getUnreadSunsetHandoversFn(db);
    const trigger   = buildSummaryTrigger({
        now,
        handovers,
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
