import {test, expect} from '@playwright/test';
import {
    buildNoProgressBackoffHook,
    buildMemorySummaryBackfillTrigger,
    getDueTask,
    getPendingMemorySummaryBackfillCount,
    getPendingMemorySummaryBackfillJobs,
    getStillPendingMemorySummaryBackfillJobs,
    isNoProgressBackoffActive,
    NO_PROGRESS_BACKOFF_MS
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

    test('#12943: getStillPendingMemorySummaryBackfillJobs is fail-soft + empty-safe', () => {
        expect(getStillPendingMemorySummaryBackfillJobs(null, ['a'])).toEqual([]);
        expect(getStillPendingMemorySummaryBackfillJobs({prepare() { throw new Error('no table'); }}, ['a'])).toEqual([]);
        expect(getStillPendingMemorySummaryBackfillJobs({prepare() {}}, [])).toEqual([]);
    });

    test('#12943: active no-progress backoff holds for its full window regardless of new arrivals', () => {
        const taskState = {
            noProgressBackoffUntilMs: 20_000,
            noProgressPendingIds    : ['mem-1', 'mem-2']
        };

        // Held while unexpired. The prior window-identity gate let a fresh miniSummary:NULL arrival
        // shift the window and bypass this, re-firing the backfill every tick (the bug).
        expect(isNoProgressBackoffActive({taskState, now: 10_000})).toBe(true);

        // Released once the window expires (strict >).
        expect(isNoProgressBackoffActive({taskState, now: 20_000})).toBe(false);
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

    test('#12943: getDueTask stays backed off even when new pending work arrives (no re-fire)', () => {
        // The prior design ran immediately on any window change — but the newest arrivals are the
        // un-summarizable head, so "run immediately" meant a re-fire every scheduler tick. The
        // backoff now holds for its full window, yielding the heavy lane to session-summary + REM.
        expect(getDueTask({
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
        })).toBeNull();
    });

    test('getDueTask returns a trigger carrying an onSuccess backoff hook when not backed off', () => {
        const trigger = getDueTask({
            db                                     : {},
            getPendingMemorySummaryBackfillJobsFn  : () => ['mem-1', 'mem-2'],
            getPendingMemorySummaryBackfillCountFn : () => 3334
        });

        expect(trigger).toMatchObject({taskName: 'memory-summary-backfill', pendingCount: 2});
        expect(typeof trigger.onSuccess).toBe('function');
    });

    test('#12943: success hook arms the backoff when the run drains NONE of the attempted rows (a fresh row arriving is irrelevant)', () => {
        const taskState = {};
        const hook = buildNoProgressBackoffHook({
            db                                         : {},
            taskState,
            pendingJobs                                : ['mem-1', 'mem-2'],
            totalPending                               : 3333,
            nowFn                                      : () => 100_000,
            // Both attempted rows are STILL pending after the run = zero progress. A fresh new-3 may
            // have landed at the DESC top — irrelevant; we re-query the specific attempted ids.
            getStillPendingMemorySummaryBackfillJobsFn : () => ['mem-1', 'mem-2']
        });

        hook();

        expect(taskState.noProgressBackoffUntilMs).toBe(100_000 + NO_PROGRESS_BACKOFF_MS);
        expect(taskState.noProgressBackoffReason).toBe('no-progress:3333');
        expect(taskState.noProgressBackoffAt).toBe('1970-01-01T00:01:40.000Z');
        expect(taskState.noProgressPendingIds).toEqual(['mem-1', 'mem-2']);
    });

    test('#12943: success hook clears the backoff when the run drains at least one attempted row', () => {
        const taskState = {
            noProgressBackoffUntilMs: 20_000,
            noProgressBackoffReason : 'no-progress:3333',
            noProgressBackoffAt     : '2026-06-09T19:00:00.000Z',
            noProgressPendingIds    : ['mem-1', 'mem-2']
        };
        const hook = buildNoProgressBackoffHook({
            db                                         : {},
            taskState,
            pendingJobs                                : ['mem-1', 'mem-2'],
            totalPending                               : 3283,
            // mem-1 drained (only mem-2 still pending) = real progress → clear any stale backoff.
            getStillPendingMemorySummaryBackfillJobsFn : () => ['mem-2']
        });

        hook();

        expect(taskState.noProgressBackoffUntilMs).toBeUndefined();
        expect(taskState.noProgressBackoffReason).toBeUndefined();
        expect(taskState.noProgressBackoffAt).toBeUndefined();
        expect(taskState.noProgressPendingIds).toBeUndefined();
    });

    test('#13566: archived rows are excluded from fetch, count, and the no-progress re-check', () => {
        const captured  = [],
              captureDb = (rows = []) => ({
                  prepare(sql) {
                      captured.push(sql);
                      return {all: () => rows, get: () => ({n: rows.length})};
                  }
              });

        expect(getPendingMemorySummaryBackfillJobs(captureDb([{id: 'a'}]))).toEqual(['a']);
        expect(getPendingMemorySummaryBackfillCount(captureDb([{}, {}]))).toBe(2);
        expect(getStillPendingMemorySummaryBackfillJobs(captureDb([{id: 'a'}]), ['a'])).toEqual(['a']);

        // All three pending surfaces must skip rows archived as structurally un-summarizable,
        // so an archived no-content row stops inflating the metric + counts as backoff progress.
        expect(captured).toHaveLength(3);
        for (const sql of captured) {
            expect(sql).toContain("'$.properties.archivedAt') IS NULL");
        }
    });
});
