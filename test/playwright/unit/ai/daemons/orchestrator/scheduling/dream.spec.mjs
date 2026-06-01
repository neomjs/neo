import {test, expect} from '@playwright/test';
import {
    getCadenceAnchor,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/dream.mjs';

test.describe('orchestrator/scheduling/dream (#11858 / Epic #11831)', () => {
    test('returns a periodic-dream trigger when the interval has elapsed since lastRunAt', () => {
        expect(getDueTask({
            state                 : {lastRunAt: 0},
            now                   : 600000,
            dreamIntervalMs       : 600000,
            dreamOverflowThreshold: 0.8
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state                 : {lastRunAt: 0},
            now                   : 599999,
            dreamIntervalMs       : 600000,
            dreamOverflowThreshold: 0.8
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(getDueTask({
            state                 : {lastRunAt: 0},
            now                   : 999999999,
            dreamIntervalMs       : 0,
            dreamOverflowThreshold: 0.8
        })).toBeNull();

        expect(getDueTask({
            state                 : {lastRunAt: 0},
            now                   : 999999999,
            dreamIntervalMs       : -1,
            dreamOverflowThreshold: 0.8
        })).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({
            state                 : undefined,
            now                   : 600000,
            dreamIntervalMs       : 600000,
            dreamOverflowThreshold: 0.8
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
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
            now                   : completedAt + 13000,
            dreamIntervalMs       : intervalMs,
            dreamOverflowThreshold: 0.8
        })).toBeNull();

        expect(getDueTask({
            state,
            now                   : completedAt + intervalMs,
            dreamIntervalMs       : intervalMs,
            dreamOverflowThreshold: 0.8
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
            now                   : 3600000,
            dreamIntervalMs       : 3600000,
            dreamOverflowThreshold: 0.8
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:3600000'
        });
    });
});
