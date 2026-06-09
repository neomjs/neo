import {test, expect} from '@playwright/test';
import {
    buildNoProgressBackoffHook,
    buildMemorySummaryBackfillTrigger,
    getDueTask,
    getPendingMemorySummaryBackfillJobs,
    isNoProgressBackoffActive,
    NO_PROGRESS_BACKOFF_MS,
    samePendingWindow
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

    test('#12809: buildMemorySummaryBackfillTrigger reports the TRUE backlog depth, not the fetch limit', () => {
        // 50 fetched (the LIMIT), but 1842 actually pending — the logged reason must show the true depth.
        const fetched = Array.from({length: 50}, (_, i) => `mem-${i}`);
        expect(buildMemorySummaryBackfillTrigger({pendingJobs: fetched, totalPending: 1842})).toEqual({
            taskName    : 'memory-summary-backfill',
            source      : 'pending-memory-minisummary',
            reason      : 'pending-memory-minisummary:1842',
            pendingCount: 50
        });
    });

    test('#12809: getDueTask threads the uncapped count into the reason', () => {
        expect(getDueTask({
            db                                     : {},
            getPendingMemorySummaryBackfillJobsFn  : () => ['mem-1', 'mem-2'],
            getPendingMemorySummaryBackfillCountFn : () => 1842
        })).toMatchObject({
            reason      : 'pending-memory-minisummary:1842',
            pendingCount: 2
        });
    });

    test('#12828: samePendingWindow pins ordered selected ids', () => {
        expect(samePendingWindow(['mem-1', 'mem-2'], ['mem-1', 'mem-2'])).toBe(true);
        expect(samePendingWindow(['mem-1', 'mem-2'], ['mem-2', 'mem-1'])).toBe(false);
        expect(samePendingWindow(['mem-1'], ['mem-1', 'mem-2'])).toBe(false);
    });

    test('#12828: active no-progress backoff suppresses the unchanged pending window only', () => {
        const taskState = {
            noProgressBackoffUntilMs: 20_000,
            noProgressPendingIds    : ['mem-1', 'mem-2']
        };

        expect(isNoProgressBackoffActive({
            taskState,
            pendingJobs: ['mem-1', 'mem-2'],
            now        : 10_000
        })).toBe(true);

        expect(isNoProgressBackoffActive({
            taskState,
            pendingJobs: ['newer-mem', 'mem-1'],
            now        : 10_000
        })).toBe(false);

        expect(isNoProgressBackoffActive({
            taskState,
            pendingJobs: ['mem-1', 'mem-2'],
            now        : 20_000
        })).toBe(false);
    });

    test('#12828: getDueTask returns null while the same stuck window is backed off', () => {
        expect(getDueTask({
            db                                     : {},
            now                                    : 10_000,
            state                                  : {
                'memory-summary-backfill': {
                    noProgressBackoffUntilMs: 20_000,
                    noProgressPendingIds    : ['mem-1', 'mem-2']
                }
            },
            getPendingMemorySummaryBackfillJobsFn  : () => ['mem-1', 'mem-2'],
            getPendingMemorySummaryBackfillCountFn : () => 3333
        })).toBeNull();
    });

    test('#12828: getDueTask runs immediately when new pending work changes the backed-off window', () => {
        const trigger = getDueTask({
            db                                     : {},
            now                                    : 10_000,
            state                                  : {
                'memory-summary-backfill': {
                    noProgressBackoffUntilMs: 20_000,
                    noProgressPendingIds    : ['old-1', 'old-2']
                }
            },
            getPendingMemorySummaryBackfillJobsFn  : () => ['new-1', 'old-1'],
            getPendingMemorySummaryBackfillCountFn : () => 3334
        });

        expect(trigger).toMatchObject({
            taskName    : 'memory-summary-backfill',
            reason      : 'pending-memory-minisummary:3334',
            pendingCount: 2
        });
        expect(typeof trigger.onSuccess).toBe('function');
    });

    test('#12828: success hook records a bounded backoff when the selected window makes no progress', () => {
        const taskState = {};
        const hook = buildNoProgressBackoffHook({
            db                                     : {},
            taskState,
            pendingJobs                            : ['mem-1', 'mem-2'],
            totalPending                           : 3333,
            nowFn                                  : () => 100_000,
            getPendingMemorySummaryBackfillJobsFn  : () => ['mem-1', 'mem-2'],
            getPendingMemorySummaryBackfillCountFn : () => 3333
        });

        hook();

        expect(taskState.noProgressBackoffUntilMs).toBe(100_000 + NO_PROGRESS_BACKOFF_MS);
        expect(taskState.noProgressBackoffReason).toBe('no-progress:3333');
        expect(taskState.noProgressBackoffAt).toBe('1970-01-01T00:01:40.000Z');
        expect(taskState.noProgressPendingIds).toEqual(['mem-1', 'mem-2']);
    });

    test('#12828: success hook clears stale backoff state once progress resumes', () => {
        const taskState = {
            noProgressBackoffUntilMs: 20_000,
            noProgressBackoffReason : 'no-progress:3333',
            noProgressBackoffAt     : '2026-06-09T19:00:00.000Z',
            noProgressPendingIds    : ['mem-1', 'mem-2']
        };
        const hook = buildNoProgressBackoffHook({
            db                                     : {},
            taskState,
            pendingJobs                            : ['mem-1', 'mem-2'],
            totalPending                           : 3333,
            getPendingMemorySummaryBackfillJobsFn  : () => ['mem-3', 'mem-4'],
            getPendingMemorySummaryBackfillCountFn : () => 3283
        });

        hook();

        expect(taskState.noProgressBackoffUntilMs).toBeUndefined();
        expect(taskState.noProgressBackoffReason).toBeUndefined();
        expect(taskState.noProgressBackoffAt).toBeUndefined();
        expect(taskState.noProgressPendingIds).toBeUndefined();
    });
});
