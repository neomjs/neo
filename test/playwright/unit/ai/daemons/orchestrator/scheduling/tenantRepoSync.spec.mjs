import {test, expect} from '@playwright/test';
import {buildTenantRepoSyncTrigger, getDueTask} from '../../../../../../../ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs';
import {TENANT_REPO_SYNC_TASK_NAME} from '../../../../../../../ai/daemons/orchestrator/TaskDefinitions.mjs';

test.describe('tenantRepoSync trigger (#11790)', () => {
    test('returns null when disabled', () => {
        expect(buildTenantRepoSyncTrigger({enabled: false, now: 1000, lastRunAt: 0, intervalMs: 60000})).toBeNull();
    });

    test('returns null when intervalMs <= 0', () => {
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 1000, lastRunAt: 0, intervalMs: 0})).toBeNull();
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 1000, lastRunAt: 0, intervalMs: -100})).toBeNull();
    });

    test('returns null when interval not yet elapsed', () => {
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 5000, lastRunAt: 4000, intervalMs: 60000})).toBeNull();
    });

    test('returns trigger when enabled + interval elapsed', () => {
        const trigger = buildTenantRepoSyncTrigger({enabled: true, now: 70000, lastRunAt: 0, intervalMs: 60000});
        expect(trigger).toEqual({
            taskName: TENANT_REPO_SYNC_TASK_NAME,
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:60000'
        });
    });

    test('getDueTask derives lastRunAt from state', () => {
        const state = {[TENANT_REPO_SYNC_TASK_NAME]: {lastRunAt: 5000}};
        const trigger = getDueTask({state, now: 70000, intervalMs: 60000, enabled: true});
        expect(trigger).not.toBeNull();
        expect(trigger.taskName).toBe(TENANT_REPO_SYNC_TASK_NAME);
    });

    test('getDueTask handles missing task state (bootstrap, lastRunAt=0)', () => {
        const trigger = getDueTask({state: {}, now: 70000, intervalMs: 60000, enabled: true});
        expect(trigger).not.toBeNull();
    });
});
