import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import CadenceEngine  from '../../../../../../ai/daemons/services/CadenceEngine.mjs';

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
});
