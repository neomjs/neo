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

        test('keeps deferring through a sustained heavy op while polls stay hot (capped only by the backstop)', () => {
            // lastHeavyPollAt refreshes on every heavy poll, so a long-but-active sync stays within the
            // settle window; deferral continues until the op stops (settle) or the stuck-signal cap.
            const lastHeavyPollAt  = now - 1; // a heavy poll just landed
            const midRunDeferCount = Math.floor(MAX_FLUSH_DEFERS / 2);
            expect(shouldDeferFlush({now, lastHeavyPollAt, deferCount: midRunDeferCount})).toBe(true);
        });

        test('absolute backstop comfortably exceeds a multi-minute heavy op (operator: "a heavy OP can easily take 15m")', () => {
            // The cap is a stuck-signal net, so it must dwarf a real heavy op — otherwise it would
            // force-flush mid-sync and re-expose the leak this guards. Encode the floor: >= 2x a 15-min op.
            const fifteenMinutes = 15 * 60 * 1000;
            expect(MAX_FLUSH_DEFERS * HEAVY_DELTA_SETTLE_MS).toBeGreaterThanOrEqual(2 * fifteenMinutes);
        });
    });
});
