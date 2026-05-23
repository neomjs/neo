// Neo + core/_export bootstrap belongs to the orchestrator-daemon entry point
// (`ai/scripts/orchestrator-daemon.mjs`). Class files rely on `globalThis.Neo`
// populated by the entry-point bootstrap.
import Base from '../../../../src/core/Base.mjs';
import {
    getUnreadSunsetHandovers,
    markNodesAsRead
} from '../../bridge/queries.mjs';

/**
 * @summary Builds the task trigger for the summarization sweep lane (#11009).
 *
 * The summarization lane has two wake-up sources: unread sunset handovers get priority
 * because they unblock the next agent boot, and the interval sweep is the fallback that
 * catches ordinary unsummarized sessions. Keeping this projection pure lets the
 * orchestrator test the scheduling contract without mounting the SQLite graph.
 *
 * @param {Object} options
 * @param {Number} options.now        Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt  Last summary task start timestamp.
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
 * @summary Coordinates the Piece C summarization sweep trigger for the v13 orchestrator (#11009).
 *
 * This service owns the summarization-specific decision tree that was incorrectly embedded
 * in `ai/scripts/orchestrator-daemon.mjs` by #11008. The `Orchestrator` daemon asks this
 * service whether a summary task is due; the service returns a trigger object plus a success
 * hook for marking sunset-handover messages as read only after the summarizer exits cleanly.
 *
 * @class Neo.ai.daemons.services.SummarizationCoordinatorService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/daemons/Orchestrator.mjs
 * @see ai/daemons/bridge/queries.mjs#getUnreadSunsetHandovers
 * @see #11009
 */
class SummarizationCoordinatorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.SummarizationCoordinatorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.SummarizationCoordinatorService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the next summary task trigger, including the post-success handover mark-read hook.
     * @param {Object} options
     * @param {Object} options.db SQLite database handle.
     * @param {Object} options.state Current orchestrator task state.
     * @param {Number} options.now Current timestamp in milliseconds.
     * @param {Number} options.summarySweepIntervalMs Periodic summary sweep interval.
     * @param {Function} [options.getUnreadSunsetHandoversFn] Test seam for handover reads.
     * @param {Function} [options.markNodesAsReadFn] Test seam for handover mark-read writes.
     * @param {Function} [options.log] Optional orchestrator log function.
     * @returns {Object|null} Task trigger with optional `onSuccess` callback.
     */
    getDueTask({
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
}

export default Neo.setupClass(SummarizationCoordinatorService);
