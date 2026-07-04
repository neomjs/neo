import {test, expect} from '@playwright/test';
import {
    getCadenceAnchor,
    getDueTask,
    isRemBacklogCatchupEligible
} from '../../../../../../../ai/daemons/orchestrator/scheduling/dream.mjs';

test.describe('orchestrator/scheduling/dream (#11858 / Epic #11831)', () => {
    test('returns a periodic-dream trigger when the interval has elapsed since lastRunAt', () => {
        expect(getDueTask({
            state                      : {lastRunAt: 0},
            now                        : 600000,
            dreamIntervalMs            : 600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state                      : {lastRunAt: 0},
            now                        : 599999,
            dreamIntervalMs            : 600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(getDueTask({
            state                      : {lastRunAt: 0},
            now                        : 999999999,
            dreamIntervalMs            : 0,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toBeNull();

        expect(getDueTask({
            state                      : {lastRunAt: 0},
            now                        : 999999999,
            dreamIntervalMs            : -1,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({
            state                      : undefined,
            now                        : 600000,
            dreamIntervalMs            : 600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('fails loud when the REM catch-up cooldown is not wired (#13971)', () => {
        expect(() => getDueTask({
            state                 : {lastRunAt: 0},
            now                   : 600000,
            dreamIntervalMs       : 600000,
            dreamOverflowThreshold: 0.8
        })).toThrow(/remBacklogCatchupCooldownMs/);
    });

    test('uses completion-time cooldown after a cadence-overflowing REM cycle (#12289)', () => {
        const intervalMs  = 3600000;
        const runtimeMs   = 5262119;
        const completedAt = runtimeMs;
        const state       = {
            lastRunAt    : 0,
            lastSuccessAt: new Date(completedAt).toISOString()
        };

        expect(getCadenceAnchor({
            state,
            dreamIntervalMs       : intervalMs,
            dreamOverflowThreshold: 0.8
        })).toBe(completedAt);

        expect(getDueTask({
            state,
            now                        : completedAt + 13000,
            dreamIntervalMs            : intervalMs,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toBeNull();

        expect(getDueTask({
            state,
            now                        : completedAt + intervalMs,
            dreamIntervalMs            : intervalMs,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:3600000'
        });
    });

    test('preserves start-time cadence for non-overflowing REM cycles (#12289)', () => {
        const state = {
            lastRunAt    : 0,
            lastSuccessAt: new Date(600000).toISOString()
        };

        expect(getCadenceAnchor({
            state,
            dreamIntervalMs       : 3600000,
            dreamOverflowThreshold: 0.8
        })).toBe(0);

        expect(getDueTask({
            state,
            now                        : 3600000,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:3600000'
        });
    });

    test('schedules short catch-up after a saturated non-overflowing REM cycle (#13971)', () => {
        const state = {
            lastRunAt     : 0,
            lastSuccessAt : new Date(120000).toISOString(),
            lastCompletion: {
                rem: {
                    batchSaturated: true
                }
            }
        };

        expect(isRemBacklogCatchupEligible({
            state,
            dreamIntervalMs       : 3600000,
            dreamOverflowThreshold: 0.8
        })).toBe(true);

        expect(getDueTask({
            state,
            now                        : 420000,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 300000
        })).toEqual({
            taskName: 'dream',
            source  : 'rem-backlog-catchup',
            reason  : 'rem-backlog-catchup:300000'
        });
    });

    test('does not catch up after non-saturated, overflowed, or disabled REM cycles (#13971)', () => {
        const baseState = {
            lastRunAt     : 0,
            lastSuccessAt : new Date(120000).toISOString(),
            lastCompletion: {
                rem: {
                    batchSaturated: false
                }
            }
        };

        expect(getDueTask({
            state                      : baseState,
            now                        : 420000,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 300000
        })).toBeNull();

        expect(getDueTask({
            state: {
                lastRunAt     : 0,
                lastSuccessAt : new Date(3000000).toISOString(),
                lastCompletion: {
                    rem: {
                        batchSaturated: true
                    }
                }
            },
            now                        : 3300000,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 300000
        })).toBeNull();

        expect(getDueTask({
            state                      : {...baseState, lastCompletion: {rem: {batchSaturated: true}}},
            now                        : 420000,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.8,
            remBacklogCatchupCooldownMs: 0
        })).toBeNull();
    });

    test('starvation-breaker forces one cycle when REM is stale past the threshold WITH a backlog (#14708)', () => {
        const now = 14400000; // 4h; last SUCCESS at epoch (stale), last RUN 3 min ago (periodic holds; past the re-fire bound)
        expect(getDueTask({
            state                      : {lastRunAt: now - 180000, lastSuccessAt: new Date(0).toISOString()},
            now,
            dreamIntervalMs            : 3600000,   // 1h — not elapsed since lastRunAt
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,    // 2min re-fire bound — the 3-min-old run is past it
            remStarvationBreakerMs     : 10800000,  // 3h — exceeded by the 4h-since-success staleness
            undigestedBacklog          : 5
        })).toEqual({taskName: 'dream', source: 'rem-starvation-breaker', reason: 'rem-starvation-breaker:10800000'});
    });

    test('starvation-breaker holds when there is no undigested backlog — nothing to rescue (#14708)', () => {
        const now = 14400000;
        expect(getDueTask({
            state                      : {lastRunAt: now - 60000, lastSuccessAt: new Date(0).toISOString()},
            now,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,
            remStarvationBreakerMs     : 10800000,
            undigestedBacklog          : 0
        })).toBeNull();
    });

    test('starvation-breaker holds within the staleness threshold — normal contention-yielding untouched (#14708)', () => {
        const now = 3600000; // 1h; success 1 min ago — well within the 3h breaker threshold
        expect(getDueTask({
            state                      : {lastRunAt: now - 60000, lastSuccessAt: new Date(now - 60000).toISOString()},
            now,
            dreamIntervalMs            : 7200000,   // 2h — periodic holds
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,
            remStarvationBreakerMs     : 10800000,  // 3h — not yet exceeded
            undigestedBacklog          : 5
        })).toBeNull();
    });

    test('starvation-breaker is disabled when unwired (remStarvationBreakerMs omitted) — fail-open, no behavior change (#14708)', () => {
        const now = 14400000;
        expect(getDueTask({
            state                      : {lastRunAt: now - 60000, lastSuccessAt: new Date(0).toISOString()},
            now,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,
            undigestedBacklog          : 5
            // remStarvationBreakerMs omitted → defaults 0 → disabled
        })).toBeNull();
    });

    test('starvation-breaker does NOT re-fire within the catch-up cooldown — a failed forced cycle retries at cooldown cadence, not every tick (#14708)', () => {
        const now = 14400000; // 4h; success still stale (the forced cycle FAILED to update it), but a run happened 1s ago
        expect(getDueTask({
            state                      : {lastRunAt: now - 1000, lastSuccessAt: new Date(0).toISOString()},
            now,
            dreamIntervalMs            : 3600000,
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,    // 2min re-fire bound — 1s since the failed run is well within it
            remStarvationBreakerMs     : 10800000,  // stale past 3h, but the bound holds the hammer
            undigestedBacklog          : 5
        })).toBeNull();
    });

    test('starvation-breaker fires post-restart when task state carries no lastSuccessAt yet — the S4 scenario is not locked out (#14708)', () => {
        const now = 14400000; // a restart nulled lastSuccessAt; a cycle ran 3 min ago but never succeeded, backlog persists
        expect(getDueTask({
            state                      : {lastRunAt: now - 180000, lastSuccessAt: null},
            now,
            dreamIntervalMs            : 3600000,   // periodic holds (run 3 min ago)
            dreamOverflowThreshold     : 0.5,
            remBacklogCatchupCooldownMs: 120000,    // 3-min-old run is past the re-fire bound
            remStarvationBreakerMs     : 10800000,
            undigestedBacklog          : 5
        })).toEqual({taskName: 'dream', source: 'rem-starvation-breaker', reason: 'rem-starvation-breaker:10800000'});
    });
});
