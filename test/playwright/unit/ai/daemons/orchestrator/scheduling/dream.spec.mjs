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
});
