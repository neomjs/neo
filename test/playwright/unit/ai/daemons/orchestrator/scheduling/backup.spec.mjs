import {test, expect} from '@playwright/test';
import {
    buildBackupTrigger,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/backup.mjs';

test.describe('orchestrator/scheduling/backup (#11864 / Epic #11831)', () => {
    test('buildBackupTrigger fires when the interval has elapsed', () => {
        expect(buildBackupTrigger({now: 86400000, lastRunAt: 0, intervalMs: 86400000})).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });

    test('buildBackupTrigger returns null when the interval has not elapsed', () => {
        expect(buildBackupTrigger({now: 86399999, lastRunAt: 0, intervalMs: 86400000})).toBeNull();
    });

    test('buildBackupTrigger treats intervalMs <= 0 as disabled', () => {
        expect(buildBackupTrigger({now: 999999999, lastRunAt: 0, intervalMs: 0})).toBeNull();
    });

    test('getDueTask wraps buildBackupTrigger with state mapping', () => {
        expect(getDueTask({
            state           : {backup: {lastRunAt: 1000}},
            now             : 1000 + 86400000,
            backupIntervalMs: 86400000
        })).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });

    test('getDueTask handles missing state.backup gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({state: {}, now: 86400000, backupIntervalMs: 86400000})).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });
});
