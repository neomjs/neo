import {test, expect} from '@playwright/test';
import {
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs';

test.describe('orchestrator/scheduling/swarmHeartbeat (#11859 / Epic #11831)', () => {
    test('returns a periodic-heartbeat trigger when the interval has elapsed since lastRunAt', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 900000,
            swarmHeartbeatIntervalMs: 900000
        })).toEqual({
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : 'periodic-heartbeat:900000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 899999,
            swarmHeartbeatIntervalMs: 900000
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 999999999,
            swarmHeartbeatIntervalMs: 0
        })).toBeNull();

        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 999999999,
            swarmHeartbeatIntervalMs: -1
        })).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({
            state                   : undefined,
            now                     : 900000,
            swarmHeartbeatIntervalMs: 900000
        })).toEqual({
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : 'periodic-heartbeat:900000'
        });
    });
});
