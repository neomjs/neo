import {test, expect} from '@playwright/test';
import {
    buildPrimaryRepoSyncTrigger,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/primaryDevSync.mjs';

test.describe('orchestrator/scheduling/primaryDevSync (#11864 / Epic #11831)', () => {
    test('buildPrimaryRepoSyncTrigger fires when enabled + interval elapsed', () => {
        expect(buildPrimaryRepoSyncTrigger({enabled: true, now: 60000, lastRunAt: 0, intervalMs: 60000})).toEqual({
            taskName: 'primary-dev-sync',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:60000'
        });
    });

    test('buildPrimaryRepoSyncTrigger returns null when disabled', () => {
        expect(buildPrimaryRepoSyncTrigger({enabled: false, now: 999999999, lastRunAt: 0, intervalMs: 60000})).toBeNull();
    });

    test('buildPrimaryRepoSyncTrigger returns null when interval has not elapsed', () => {
        expect(buildPrimaryRepoSyncTrigger({enabled: true, now: 59999, lastRunAt: 0, intervalMs: 60000})).toBeNull();
    });

    test('buildPrimaryRepoSyncTrigger treats intervalMs <= 0 as disabled', () => {
        expect(buildPrimaryRepoSyncTrigger({enabled: true, now: 999999999, lastRunAt: 0, intervalMs: 0})).toBeNull();
    });

    test('getDueTask wraps buildPrimaryRepoSyncTrigger with state mapping (keyed by primary-dev-sync)', () => {
        expect(getDueTask({
            state     : {['primary-dev-sync']: {lastRunAt: 1000}},
            now       : 1000 + 60000,
            intervalMs: 60000,
            enabled   : true
        })).toEqual({
            taskName: 'primary-dev-sync',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:60000'
        });
    });

    test('getDueTask returns null when not enabled', () => {
        expect(getDueTask({
            state     : {['primary-dev-sync']: {lastRunAt: 0}},
            now       : 60000,
            intervalMs: 60000,
            enabled   : false
        })).toBeNull();
    });
});
