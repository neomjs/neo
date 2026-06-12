import {test, expect} from '@playwright/test';

import {
    median,
    percentile,
    summarize
} from '../../../../../../ai/scripts/benchmark/helpers/stats.mjs';

/**
 * @summary Coverage for `ai/scripts/benchmark/helpers/stats.mjs` — the pure
 * statistical helpers consumed by `gemma4-rem-benchmark.mjs` (Epic #12065 Sub 8 /
 * #12074).
 *
 * The benchmark harness loops over LLM calls and reports per-bucket median /
 * p95. The math has to be provably right independent of whether a live gemma4
 * server is reachable, so these helpers live in their own module and get
 * exercised here without touching providers, sockets, or `.neo-ai-data/`.
 *
 * Test axes:
 * - `median` — odd/even length, empty, single, unsorted input non-mutation
 * - `percentile` — nearest-rank semantic (NIST), boundary cases (0 / 1), empty
 * - `summarize` — n=0 / n<5 (no p95) / n≥5 (p95 included) / error runs filtered
 */
test.describe('ai/scripts/benchmark/helpers/stats', () => {
    test.describe('median', () => {
        test('odd-length returns the middle element', () => {
            expect(median([3, 1, 2])).toBe(2);
            expect(median([5])).toBe(5);
        });

        test('even-length returns the average of the two middles', () => {
            expect(median([1, 2, 3, 4])).toBe(2.5);
            expect(median([1, 10])).toBe(5.5);
        });

        test('empty returns 0 (sentinel, not NaN)', () => {
            expect(median([])).toBe(0);
        });

        test('non-array returns 0 (defensive)', () => {
            expect(median(null)).toBe(0);
            expect(median(undefined)).toBe(0);
        });

        test('does not mutate input', () => {
            const xs = [5, 3, 1, 4, 2];
            median(xs);
            expect(xs).toEqual([5, 3, 1, 4, 2]);
        });
    });

    test.describe('percentile', () => {
        test('nearest-rank semantic: p95 of 1..100 is 95 (NIST ordinal-rank: ceil(0.95 * 100) = 95th element)', () => {
            const xs = Array.from({length: 100}, (_, i) => i + 1);
            expect(percentile(xs, 0.95)).toBe(95); // ceil(0.95 * 100) - 1 = 94 → sorted[94] = 95
        });

        test('p50 matches median for odd lengths', () => {
            // Nearest-rank p50 with N=5: ceil(0.5 * 5) - 1 = 2 → sorted[2] = 30 (the middle)
            expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
        });

        test('p=0 returns the minimum', () => {
            expect(percentile([3, 1, 4, 1, 5, 9, 2, 6], 0)).toBe(1);
        });

        test('p=1 returns the maximum (clamped)', () => {
            expect(percentile([3, 1, 4, 1, 5, 9, 2, 6], 1)).toBe(9);
        });

        test('empty returns 0 (sentinel)', () => {
            expect(percentile([], 0.95)).toBe(0);
        });

        test('single element returns that element for any p', () => {
            expect(percentile([42], 0)).toBe(42);
            expect(percentile([42], 0.5)).toBe(42);
            expect(percentile([42], 1)).toBe(42);
        });
    });

    test.describe('summarize', () => {
        const mkRun = (ttftMs, ttltMs, tps, outputChars) => ({ttftMs, ttltMs, tps, outputChars});

        test('n=0 returns zeroed summary without _p95 keys', () => {
            const s = summarize([]);
            expect(s).toEqual({
                n                 : 0,
                ttftMs_median     : 0,
                ttltMs_median     : 0,
                tps_median        : 0,
                outputChars_median: 0
            });
            expect(s.ttftMs_p95).toBeUndefined();
            expect(s.ttltMs_p95).toBeUndefined();
        });

        test('n<5 omits _p95 keys (statistically dishonest otherwise)', () => {
            const runs = [
                mkRun(100, 500, 50, 200),
                mkRun(110, 510, 51, 210),
                mkRun(120, 520, 52, 220)
            ];
            const s = summarize(runs);
            expect(s.n).toBe(3);
            expect(s.ttftMs_median).toBe(110);
            expect(s.ttltMs_median).toBe(510);
            expect(s.tps_median).toBe(51);
            expect(s.outputChars_median).toBe(210);
            expect(s.ttftMs_p95).toBeUndefined();
            expect(s.ttltMs_p95).toBeUndefined();
        });

        test('n>=5 includes _p95 keys', () => {
            const runs = [
                mkRun(100, 500, 50, 200),
                mkRun(110, 510, 51, 210),
                mkRun(120, 520, 52, 220),
                mkRun(130, 530, 53, 230),
                mkRun(140, 540, 54, 240)
            ];
            const s = summarize(runs);
            expect(s.n).toBe(5);
            expect(s.ttftMs_median).toBe(120);
            expect(s.ttftMs_p95).toBeDefined();
            expect(s.ttltMs_p95).toBeDefined();
            // nearest-rank: Math.floor(0.95 * 5) = 4 → index 4 = 140 (max)
            expect(s.ttftMs_p95).toBe(140);
            expect(s.ttltMs_p95).toBe(540);
        });

        test('filters runs with `error` set so failures do not poison the summary', () => {
            const runs = [
                mkRun(100, 500, 50, 200),
                {ttftMs: 0, ttltMs: 0, tps: 0, outputChars: 0, error: 'connection refused'},
                mkRun(120, 520, 52, 220)
            ];
            const s = summarize(runs);
            expect(s.n).toBe(2); // error run excluded
            expect(s.ttftMs_median).toBe(110); // average of 100 and 120, not contaminated by 0
        });

        test('handles undefined runs array defensively', () => {
            const s = summarize(undefined);
            expect(s.n).toBe(0);
            expect(s.ttftMs_median).toBe(0);
        });
    });
});
