import {test, expect} from '@playwright/test';
import CadenceEngine from '../../../../../../ai/daemons/services/CadenceEngine.mjs';

test.describe('ai/daemons/services/CadenceEngine.mjs (#11051)', () => {
    test('parses interval env values while preserving zero as disabled', () => {
        expect(CadenceEngine.parseInterval(undefined, 3000)).toBe(3000);
        expect(CadenceEngine.parseInterval('', 600000)).toBe(600000);
        expect(CadenceEngine.parseInterval('0', 1800000)).toBe(0);
        expect(CadenceEngine.parseInterval('-10', 1800000)).toBe(0);
        expect(CadenceEngine.parseInterval('900000', 1800000)).toBe(900000);
        expect(CadenceEngine.parseInterval('not-a-number', 1800000)).toBe(1800000);
    });

    test('does not schedule disabled or not-yet-due interval tasks', () => {
        expect(CadenceEngine.shouldRunIntervalTask({
            now       : 1000,
            lastRunAt : 0,
            intervalMs: 0
        })).toBe(false);

        expect(CadenceEngine.shouldRunIntervalTask({
            now       : 599999,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBe(false);

        expect(CadenceEngine.shouldRunIntervalTask({
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBe(true);
    });

    test('getIntervalTrigger returns trigger object only when task is due', () => {
        // Not due
        expect(CadenceEngine.getIntervalTrigger({
            taskName    : 'testTask',
            now         : 500,
            lastRunAt   : 0,
            intervalMs  : 1000,
            reasonPrefix: 'periodic-sync'
        })).toBe(null);

        // Due
        expect(CadenceEngine.getIntervalTrigger({
            taskName    : 'testTask',
            now         : 1000,
            lastRunAt   : 0,
            intervalMs  : 1000,
            reasonPrefix: 'periodic-sync'
        })).toEqual({
            taskName: 'testTask',
            source  : 'periodic-sweep',
            reason  : 'periodic-sync:1000'
        });
    });
});
