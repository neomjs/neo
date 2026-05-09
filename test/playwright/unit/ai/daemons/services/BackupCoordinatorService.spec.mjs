import {test, expect} from '@playwright/test';
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import {
    buildBackupTrigger
} from '../../../../../../ai/daemons/services/BackupCoordinatorService.mjs';

test.describe('BackupCoordinatorService (#11062)', () => {
    test('returns a periodic sweep trigger only when the interval is due', () => {
        expect(buildBackupTrigger({
            now       : 86399999,
            lastRunAt : 0,
            intervalMs: 86400000
        })).toBeNull();

        expect(buildBackupTrigger({
            now       : 86400000,
            lastRunAt : 0,
            intervalMs: 86400000
        })).toEqual({
            taskName: 'backup',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:86400000'
        });
    });

    test('does not schedule disabled periodic sweeps', () => {
        expect(buildBackupTrigger({
            now       : 86400000,
            lastRunAt : 0,
            intervalMs: 0
        })).toBeNull();
    });
});
