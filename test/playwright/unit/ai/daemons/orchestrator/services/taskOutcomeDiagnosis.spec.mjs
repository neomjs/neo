import {setup} from '../../../../../setup.mjs';

const appName = 'TaskOutcomeDiagnosisTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import {
    buildSupervisedTaskDiagnosis,
    detectTaskOverdue
} from '../../../../../../../ai/daemons/orchestrator/services/taskOutcomeDiagnosis.mjs';

test.describe('taskOutcomeDiagnosis — supervised-task failure/overdue producer (#14030 AC1)', () => {
    test('detectTaskOverdue: overdue past interval+grace, not within, disabled when interval<=0', () => {
        const base = 1_000_000;

        // within interval+grace (due at base+1500) → not overdue
        expect(detectTaskOverdue({lastRunAt: base, intervalMs: 1000, graceMs: 500, now: base + 1400}))
            .toEqual({overdue: false, overdueByMs: 0});

        // past due (base+1500) by 500ms → overdue
        expect(detectTaskOverdue({lastRunAt: base, intervalMs: 1000, graceMs: 500, now: base + 2000}))
            .toEqual({overdue: true, overdueByMs: 500});

        // periodic disabled (interval <= 0) → never overdue
        expect(detectTaskOverdue({lastRunAt: base, intervalMs: 0, now: base + 1_000_000}))
            .toEqual({overdue: false, overdueByMs: 0});

        // never-run (lastRunAt absent → 0) past interval → overdue
        expect(detectTaskOverdue({intervalMs: 1000, now: 2000}).overdue).toBe(true);
    });

    test('buildSupervisedTaskDiagnosis: failed+overdue→ambiguous (record-only), supervised-task identity + record (#14030 AC1)', () => {
        const failed = buildSupervisedTaskDiagnosis({
            taskName     : 'backup', outcome: 'failed', observedAt: 1_700_000_000_000,
            evidenceFacts: [{type: 'task-failure', code: 1}], details: {code: 1}
        });

        expect(failed.type).toBe('recovery-diagnosis');
        expect(failed.recoveryClass).toBe('ambiguous');
        expect(failed.targetIdentity).toEqual({kind: 'supervised-task', id: 'backup'});
        expect(failed.details.actionClass).toBe('record');
        expect(failed.details.outcome).toBe('failed');
        expect(failed.details.code).toBe(1);
        expect(failed.confidence).toBe(1);
        expect(failed.evidenceFacts).toEqual([{type: 'task-failure', code: 1}]);

        const overdue = buildSupervisedTaskDiagnosis({
            taskName: 'backup', outcome: 'overdue', observedAt: 1_700_000_000_000
        });

        expect(overdue.recoveryClass).toBe('ambiguous');
        expect(overdue.details.actionClass).toBe('record');
        expect(overdue.targetIdentity.kind).toBe('supervised-task');

        expect(() => buildSupervisedTaskDiagnosis({taskName: 'backup', outcome: 'bogus', observedAt: 1}))
            .toThrow(/outcome must be/);
        expect(() => buildSupervisedTaskDiagnosis({outcome: 'failed', observedAt: 1}))
            .toThrow(/taskName is required/);
    });
});
