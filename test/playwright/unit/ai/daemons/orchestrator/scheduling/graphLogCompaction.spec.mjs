import {test, expect} from '@playwright/test';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import {
    buildGraphLogCompactionTrigger,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/graphLogCompaction.mjs';

test.describe('orchestrator/scheduling/graphLogCompaction (#12394)', () => {
    test('buildGraphLogCompactionTrigger fires when the interval has elapsed', () => {
        expect(buildGraphLogCompactionTrigger({now: 86400000, lastRunAt: 0, intervalMs: 86400000})).toEqual({
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : 'periodic-graphlog-compaction:86400000'
        });
    });

    test('buildGraphLogCompactionTrigger returns null when the interval has not elapsed', () => {
        expect(buildGraphLogCompactionTrigger({now: 86399999, lastRunAt: 0, intervalMs: 86400000})).toBeNull();
    });

    test('buildGraphLogCompactionTrigger treats disabled lanes and intervalMs <= 0 as disabled', () => {
        expect(buildGraphLogCompactionTrigger({
            now      : 999999999,
            lastRunAt: 0,
            intervalMs: 86400000,
            enabled  : false
        })).toBeNull();
        expect(buildGraphLogCompactionTrigger({now: 999999999, lastRunAt: 0, intervalMs: 0})).toBeNull();
    });

    test('getDueTask wraps buildGraphLogCompactionTrigger with state mapping', () => {
        expect(getDueTask({
            state                       : {'graphlog-compaction': {lastRunAt: 1000}},
            now                         : 1000 + 86400000,
            graphLogCompactionIntervalMs: 86400000
        })).toEqual({
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : 'periodic-graphlog-compaction:86400000'
        });
    });

    test('getDueTask handles missing state.graphlog-compaction gracefully', () => {
        expect(getDueTask({state: {}, now: 86400000, graphLogCompactionIntervalMs: 86400000})).toEqual({
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : 'periodic-graphlog-compaction:86400000'
        });
    });
});
