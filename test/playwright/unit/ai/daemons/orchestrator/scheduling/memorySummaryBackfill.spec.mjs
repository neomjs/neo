import {test, expect} from '@playwright/test';
import {
    buildMemorySummaryBackfillTrigger,
    getDueTask,
    getPendingMemorySummaryBackfillJobs
} from '../../../../../../../ai/daemons/orchestrator/scheduling/memorySummaryBackfill.mjs';

test.describe('orchestrator/scheduling/memorySummaryBackfill', () => {
    test('buildMemorySummaryBackfillTrigger schedules pending miniSummary rows', () => {
        expect(buildMemorySummaryBackfillTrigger({pendingJobs: ['mem-1', 'mem-2']})).toEqual({
            taskName    : 'memory-summary-backfill',
            source      : 'pending-memory-minisummary',
            reason      : 'pending-memory-minisummary:2',
            pendingCount: 2
        });
    });

    test('buildMemorySummaryBackfillTrigger returns null when no rows are pending', () => {
        expect(buildMemorySummaryBackfillTrigger({pendingJobs: []})).toBeNull();
    });

    test('getDueTask uses the pending-row finder seam', () => {
        expect(getDueTask({
            db                                      : {},
            getPendingMemorySummaryBackfillJobsFn: () => ['mem-1']
        })).toMatchObject({
            taskName: 'memory-summary-backfill',
            reason  : 'pending-memory-minisummary:1'
        });
    });

    test('getPendingMemorySummaryBackfillJobs is fail-soft when the graph table is unavailable', () => {
        const db = {
            prepare() {
                throw new Error('no graph table');
            }
        };

        expect(getPendingMemorySummaryBackfillJobs(db)).toEqual([]);
    });
});
