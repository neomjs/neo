import {setup} from '../../../../setup.mjs';

const appName = 'GoldenPathTimestampTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('goldenPathTimestamp — pure capture-timestamp formatter (GoldenPathSynthesizer SRP extraction)', () => {
    let formatGoldenPathCapturedAt;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/goldenPathTimestamp.mjs');
        formatGoldenPathCapturedAt = mod.formatGoldenPathCapturedAt;
    });

    test('formats a Date as `YYYY-MM-DD HH:MM UTC` (minute precision, no seconds)', () => {
        expect(formatGoldenPathCapturedAt(new Date('2026-06-28T00:35:09.000Z'))).toBe('2026-06-28 00:35 UTC');
    });

    test('accepts an ISO date string', () => {
        expect(formatGoldenPathCapturedAt('2026-06-28T12:05:30.000Z')).toBe('2026-06-28 12:05 UTC');
    });

    test('returns "unknown" for a non-finite / unparseable input', () => {
        expect(formatGoldenPathCapturedAt('not-a-date')).toBe('unknown');
        expect(formatGoldenPathCapturedAt(NaN)).toBe('unknown');
        expect(formatGoldenPathCapturedAt(undefined)).toBe('unknown');
    });
});
