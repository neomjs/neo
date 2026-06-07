import { test, expect } from '@playwright/test';
import {
    HEAVY_DELTA_SETTLE_MS,
    HEAVY_DELTA_THRESHOLD,
    MAX_FLUSH_DEFERS,
    isHeavyDeltaPoll,
    shouldDeferFlush
} from '../../../../../../ai/daemons/wake/flushDeferPolicy.mjs';

test.describe('ai/daemons/wake/flushDeferPolicy (#12479 phantom wake-flood guard)', () => {
    test.describe('isHeavyDeltaPoll', () => {
        test('flags a batch at or above the heavy threshold', () => {
            expect(isHeavyDeltaPoll(HEAVY_DELTA_THRESHOLD)).toBe(true);
            expect(isHeavyDeltaPoll(HEAVY_DELTA_THRESHOLD + 5000)).toBe(true);
        });

        test('ignores ambient (below-threshold) poll batches', () => {
            expect(isHeavyDeltaPoll(0)).toBe(false);
            expect(isHeavyDeltaPoll(HEAVY_DELTA_THRESHOLD - 1)).toBe(false);
        });
    });

    test.describe('shouldDeferFlush', () => {
        const now = 1_000_000;

        test('does not defer when no heavy delta has ever been seen (lastHeavyPollAt = 0)', () => {
            expect(shouldDeferFlush({now, lastHeavyPollAt: 0, deferCount: 0})).toBe(false);
        });

        test('defers while within the settle window after a heavy poll', () => {
            const lastHeavyPollAt = now - (HEAVY_DELTA_SETTLE_MS - 1); // 1ms inside the window
            expect(shouldDeferFlush({now, lastHeavyPollAt, deferCount: 0})).toBe(true);
        });

        test('stops deferring once the settle window has elapsed (read-state committed)', () => {
            const lastHeavyPollAt = now - HEAVY_DELTA_SETTLE_MS; // boundary = settled
            expect(shouldDeferFlush({now, lastHeavyPollAt, deferCount: 0})).toBe(false);
        });

        test('never withholds a genuine wake past the deferral cap', () => {
            const lastHeavyPollAt = now - 1; // still well inside the settle window
            expect(shouldDeferFlush({now, lastHeavyPollAt, deferCount: MAX_FLUSH_DEFERS - 1})).toBe(true);
            expect(shouldDeferFlush({now, lastHeavyPollAt, deferCount: MAX_FLUSH_DEFERS})).toBe(false);
        });

        test('defaults deferCount to 0 when omitted', () => {
            const lastHeavyPollAt = now - 1;
            expect(shouldDeferFlush({now, lastHeavyPollAt})).toBe(true);
        });
    });
});
