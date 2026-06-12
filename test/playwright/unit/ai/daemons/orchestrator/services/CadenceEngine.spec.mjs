import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import CadenceEngine   from '../../../../../../../ai/daemons/orchestrator/services/CadenceEngine.mjs';

test.describe('Neo.ai.daemons.services.CadenceEngine (#11051)', () => {
    let ce;
    test.beforeEach(() => { ce = Neo.create(CadenceEngine); });

    test('shouldRunIntervalTask() correctly evaluates due tasks', () => {
        // Disabled
        expect(ce.shouldRunIntervalTask({now: 1000, lastRunAt: 0, intervalMs: 0})).toBe(false);

        // Not due
        expect(ce.shouldRunIntervalTask({now: 1000, lastRunAt: 500, intervalMs: 1000})).toBe(false);

        // Exactly due
        expect(ce.shouldRunIntervalTask({now: 1500, lastRunAt: 500, intervalMs: 1000})).toBe(true);

        // Overdue
        expect(ce.shouldRunIntervalTask({now: 2000, lastRunAt: 500, intervalMs: 1000})).toBe(true);
    });

    test('does not own task execution dispatch', () => {
        expect(ce.runIfDue).toBeUndefined();
    });
});
