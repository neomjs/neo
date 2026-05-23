import {test, expect} from '@playwright/test';
import {
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/services/DreamCoordinatorService.mjs';

test.describe('DreamCoordinatorService (#11858 / Epic #11831)', () => {
    test('returns a periodic-dream trigger when the interval has elapsed since lastRunAt', () => {
        expect(getDueTask({
            state          : {lastRunAt: 0},
            now            : 600000,
            dreamIntervalMs: 600000
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state          : {lastRunAt: 0},
            now            : 599999,
            dreamIntervalMs: 600000
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(getDueTask({
            state          : {lastRunAt: 0},
            now            : 999999999,
            dreamIntervalMs: 0
        })).toBeNull();

        expect(getDueTask({
            state          : {lastRunAt: 0},
            now            : 999999999,
            dreamIntervalMs: -1
        })).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({
            state          : undefined,
            now            : 600000,
            dreamIntervalMs: 600000
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });
});
