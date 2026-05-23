import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import CadenceEngine   from '../../../../../../ai/daemons/services/CadenceEngine.mjs';

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

    test('runIfDue() executes task when trigger is truthy and handles fallback shapes', () => {
        let executed = false;
        let lastTask, lastReason, lastSuccess;
        const executeFn = (t, r, s) => { executed = true; lastTask = t; lastReason = r; lastSuccess = s; };
        const ctx = { writeLog: () => {} };

        // Test 1: Full object shape
        const successCb = () => {};
        ce.runIfDue('testTask1', () => ({reason: 'object-reason', onSuccess: successCb}), executeFn, ctx);
        expect(executed).toBe(true);
        expect(lastTask).toBe('testTask1');
        expect(lastReason).toBe('object-reason');
        expect(lastSuccess).toBe(successCb);

        executed = false;

        // Test 2: Truthy fallback shape (e.g. true boolean returning 'periodic-sync')
        ce.runIfDue('testTask2', () => true, executeFn, ctx);
        expect(executed).toBe(true);
        expect(lastTask).toBe('testTask2');
        expect(lastReason).toBe('periodic-sync');

        executed = false;

        // Test 3: Falsy trigger
        ce.runIfDue('testTask3', () => false, executeFn, ctx);
        expect(executed).toBe(false);

        // Test 4: Exception in due-check isolated
        let logError = '';
        const badCtx = { writeLog: (lvl, msg) => { logError = msg; }, healthService: { recordTaskOutcome: () => {} } };
        ce.runIfDue('testTask4', () => { throw new Error('bang'); }, executeFn, badCtx);
        expect(executed).toBe(false);
        expect(logError).toContain('testTask4 scheduling failed');
    });
});
