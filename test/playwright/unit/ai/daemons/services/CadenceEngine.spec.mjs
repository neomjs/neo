import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import CadenceEngine   from '../../../../../../ai/daemons/services/CadenceEngine.mjs';

test.describe('Neo.ai.daemons.services.CadenceEngine (#11051)', () => {
    test('parseInterval() returns fallback for undefined/null/empty', () => {
        expect(CadenceEngine.parseInterval(undefined, 3000)).toBe(3000);
        expect(CadenceEngine.parseInterval(null, 3000)).toBe(3000);
        expect(CadenceEngine.parseInterval('', 3000)).toBe(3000);
    });

    test('parseInterval() parses valid numbers and prevents negative intervals', () => {
        expect(CadenceEngine.parseInterval('5000', 3000)).toBe(5000);
        expect(CadenceEngine.parseInterval('0', 3000)).toBe(0);
        expect(CadenceEngine.parseInterval('-5000', 3000)).toBe(0);
    });

    test('parseInterval() returns fallback for NaN', () => {
        expect(CadenceEngine.parseInterval('not-a-number', 3000)).toBe(3000);
    });

    test('shouldRunIntervalTask() correctly evaluates due tasks', () => {
        // Disabled
        expect(CadenceEngine.shouldRunIntervalTask({now: 1000, lastRunAt: 0, intervalMs: 0})).toBe(false);

        // Not due
        expect(CadenceEngine.shouldRunIntervalTask({now: 1000, lastRunAt: 500, intervalMs: 1000})).toBe(false);

        // Exactly due
        expect(CadenceEngine.shouldRunIntervalTask({now: 1500, lastRunAt: 500, intervalMs: 1000})).toBe(true);

        // Overdue
        expect(CadenceEngine.shouldRunIntervalTask({now: 2000, lastRunAt: 500, intervalMs: 1000})).toBe(true);
    });

    test('runIfDue() executes task when trigger is truthy and handles fallback shapes', () => {
        let executed = false;
        let lastTask, lastReason, lastSuccess;
        const executeFn = (t, r, s) => { executed = true; lastTask = t; lastReason = r; lastSuccess = s; };
        const ctx = { writeLog: () => {} };

        // Test 1: Full object shape
        const successCb = () => {};
        CadenceEngine.runIfDue('testTask1', () => ({reason: 'object-reason', onSuccess: successCb}), executeFn, ctx);
        expect(executed).toBe(true);
        expect(lastTask).toBe('testTask1');
        expect(lastReason).toBe('object-reason');
        expect(lastSuccess).toBe(successCb);

        executed = false;

        // Test 2: Truthy fallback shape (e.g. true boolean returning 'periodic-sync')
        CadenceEngine.runIfDue('testTask2', () => true, executeFn, ctx);
        expect(executed).toBe(true);
        expect(lastTask).toBe('testTask2');
        expect(lastReason).toBe('periodic-sync');

        executed = false;

        // Test 3: Falsy trigger
        CadenceEngine.runIfDue('testTask3', () => false, executeFn, ctx);
        expect(executed).toBe(false);

        // Test 4: Exception in due-check isolated
        let logError = '';
        const badCtx = { writeLog: (lvl, msg) => { logError = msg; }, healthService: { recordTaskOutcome: () => {} } };
        CadenceEngine.runIfDue('testTask4', () => { throw new Error('bang'); }, executeFn, badCtx);
        expect(executed).toBe(false);
        expect(logError).toContain('testTask4 scheduling failed');
    });
});
