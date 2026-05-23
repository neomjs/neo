import {test, expect} from '@playwright/test';
import {
    buildSummaryTrigger,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/summary.mjs';

test.describe('orchestrator/scheduling/summary (#11864 / Epic #11831)', () => {
    test('buildSummaryTrigger prioritizes unread sunset handovers over the periodic sweep', () => {
        expect(buildSummaryTrigger({
            now       : 1200000,
            lastRunAt : 0,
            intervalMs: 600000,
            handovers : [{id: 'MESSAGE:1'}, {id: 'MESSAGE:2'}]
        })).toEqual({
            taskName     : 'summary',
            source       : 'sunset-handover',
            reason       : 'sunset-handover:2',
            handoverCount: 2
        });
    });

    test('buildSummaryTrigger returns a periodic sweep trigger only when the interval is due', () => {
        expect(buildSummaryTrigger({now: 599999, lastRunAt: 0, intervalMs: 600000, handovers: []})).toBeNull();

        expect(buildSummaryTrigger({now: 600000, lastRunAt: 0, intervalMs: 600000, handovers: []})).toEqual({
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:600000'
        });
    });

    test('buildSummaryTrigger does not schedule disabled periodic sweeps', () => {
        expect(buildSummaryTrigger({now: 600000, lastRunAt: 0, intervalMs: 0, handovers: []})).toBeNull();
    });

    test('getDueTask returns null when no handovers and interval not elapsed', () => {
        const result = getDueTask({
            db                        : 'mock-db',
            state                     : {summary: {lastRunAt: 0}},
            now                       : 100,
            summarySweepIntervalMs    : 600000,
            getUnreadSunsetHandoversFn: () => []
        });
        expect(result).toBeNull();
    });

    test('getDueTask returns periodic-sweep trigger (no onSuccess) when interval elapsed', () => {
        const result = getDueTask({
            db                        : 'mock-db',
            state                     : {summary: {lastRunAt: 0}},
            now                       : 600000,
            summarySweepIntervalMs    : 600000,
            getUnreadSunsetHandoversFn: () => []
        });
        expect(result).toEqual({
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:600000'
        });
        expect(result.onSuccess).toBeUndefined();
    });

    test('getDueTask returns sunset-handover trigger with onSuccess callback', () => {
        const markCalls = [];
        const handovers = [{id: 'MESSAGE:1'}, {id: 'MESSAGE:2'}];
        const result = getDueTask({
            db                        : 'mock-db',
            state                     : {summary: {lastRunAt: 0}},
            now                       : 100,
            summarySweepIntervalMs    : 600000,
            getUnreadSunsetHandoversFn: () => handovers,
            markNodesAsReadFn         : (db, nodes) => markCalls.push({db, nodes}),
            log                       : () => {}
        });
        expect(result.source).toBe('sunset-handover');
        expect(result.handoverCount).toBe(2);
        expect(typeof result.onSuccess).toBe('function');

        result.onSuccess();
        expect(markCalls).toEqual([{db: 'mock-db', nodes: handovers}]);
    });
});
