import {test, expect} from '@playwright/test';
import Neo from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import {getDueTask} from '../../../../../../../ai/daemons/orchestrator/scheduling/graphLogCompaction.mjs';

test.describe('orchestrator/scheduling/graphLogCompaction (#12394)', () => {
    test('getDueTask fires when the interval has elapsed', () => {
        expect(getDueTask({state: {}, now: 86400000, graphLogCompactionIntervalMs: 86400000})).toEqual({
            taskName: 'graphlog-compaction',
            source  : 'periodic-sweep',
            reason  : 'periodic-graphlog-compaction:86400000'
        });
    });

    test('getDueTask returns null when the interval has not elapsed', () => {
        expect(getDueTask({
            state: {'graphlog-compaction': {lastRunAt: 0}},
            now  : 86399999,
            graphLogCompactionIntervalMs: 86400000
        })).toBeNull();
    });

    test('getDueTask treats disabled lanes and intervalMs <= 0 as disabled', () => {
        expect(getDueTask({
            state: {},
            now  : 999999999,
            graphLogCompactionIntervalMs: 86400000,
            enabled                     : false
        })).toBeNull();
        expect(getDueTask({state: {}, now: 999999999, graphLogCompactionIntervalMs: 0})).toBeNull();
    });

    test('getDueTask maps prior graphlog-compaction state into the due check', () => {
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
