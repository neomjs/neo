/**
 * @module ai/scripts/benchmark/helpers/stats
 * @summary Pure statistical helpers for benchmark scripts — unit-testable without live LLM.
 *
 * Kept tiny on purpose: any benchmark script in `ai/scripts/benchmark/` that needs
 * median / percentile / summary can import from here instead of duplicating the
 * math. Lifted out of `gemma4-rem-benchmark.mjs` so the harness math is provably
 * correct independent of the (LLM-dependent) measurement loop.
 *
 * @see ai/scripts/benchmark/gemma4-rem-benchmark.mjs — primary consumer
 * @see test/playwright/unit/ai/scripts/benchmark/stats.spec.mjs — unit tests
 * @plane in-plane
 */

/**
 * Median (middle value, or average of two middles for even-length).
 * @param {number[]} xs
 * @returns {number} 0 for empty input
 */
export function median(xs) {
    if (!Array.isArray(xs) || xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Percentile via nearest-rank (NIST method, no interpolation).
 *
 * NIST nearest-rank ordinal-rank formula: `n = ceil(p * N)` (1-indexed),
 * so the 0-indexed array offset is `ceil(p * N) - 1`. For an array
 * `[1..100]` and `p = 0.95`, this returns the 95th element, which is `95`.
 *
 * Chosen over linear-interpolation because benchmark sample counts are tiny
 * (3-20 typical) and the interpolated value is misleading when N is small.
 * Nearest-rank returns an actual observed measurement, which matches the
 * "what's the 95th-percentile call I saw?" question the operator is asking.
 *
 * Edge cases:
 * - `p = 0` returns the minimum (negative raw index clamped to 0)
 * - `p = 1` returns the maximum (raw index clamped to `sorted.length - 1`)
 * - Empty / non-array input returns `0` (sentinel)
 *
 * @param {number[]} xs
 * @param {number} p Percentile in [0, 1]
 * @returns {number} 0 for empty input
 */
export function percentile(xs, p) {
    if (!Array.isArray(xs) || xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const rawIdx = Math.ceil(p * sorted.length) - 1;
    const idx = Math.max(0, Math.min(rawIdx, sorted.length - 1));
    return sorted[idx];
}

/**
 * Summarize a set of benchmark runs into median / p95 / counts.
 *
 * Adds `_p95` keys only when `runs.length >= 5` because p95 of a 3-sample set
 * is just the max — including it would be statistically dishonest.
 *
 * Filters runs with `error` set so a failed call doesn't poison the summary.
 *
 * @param {Array<{ttftMs: number, ttltMs: number, tps: number, outputChars: number, error: string}>} runs Per-run samples (`error` only set on failed runs).
 * @returns {{n: number, ttftMs_median: number, ttltMs_median: number, tps_median: number, outputChars_median: number, ttftMs_p95: number, ttltMs_p95: number}} `_p95` keys present only when `n >= 5`.
 */
export function summarize(runs) {
    const okRuns = (runs || []).filter(r => !r.error);
    const ttfts = okRuns.map(r => r.ttftMs);
    const ttlts = okRuns.map(r => r.ttltMs);
    const tpss = okRuns.map(r => r.tps);
    const outs = okRuns.map(r => r.outputChars);

    const summary = {
        n                 : okRuns.length,
        ttftMs_median     : median(ttfts),
        ttltMs_median     : median(ttlts),
        tps_median        : median(tpss),
        outputChars_median: median(outs)
    };

    if (okRuns.length >= 5) {
        summary.ttftMs_p95 = percentile(ttfts, 0.95);
        summary.ttltMs_p95 = percentile(ttlts, 0.95);
    }

    return summary;
}
