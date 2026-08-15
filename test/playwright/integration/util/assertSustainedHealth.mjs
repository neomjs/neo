import {expect} from '@playwright/test';

/**
 * The smallest sample count from which a nearest-rank p95 is distinguishable from the maximum.
 *
 * `percentileIndex()` selects `ceil(0.95 · n) - 1`, which equals `n - 1` — the last element, i.e. the
 * max — for every n ≤ 19. At n = 20 it first lands on index 18, leaving one sample above it, so 20 is
 * the boundary rather than a round number chosen for comfort.
 *
 * Below it, a p95 assertion does not tolerate a slow tail; it forbids one. That is the opposite of
 * what the parameter name promises: over a five-sample window, one probe returning 501ms against a
 * 500ms budget fails the run, because that probe IS the "p95".
 *
 * Interpolating instead of refusing would not help: a linearly-interpolated p95 of five samples still
 * sits against the largest of them. Five samples do not contain a 95th percentile under any
 * definition, so the honest move is to say so rather than return the max wearing a p95 label.
 * @type {Number}
 */
export const MIN_PERCENTILE_SAMPLES = 20;

/**
 * @summary Nearest-rank index for a percentile over a sorted sample of `count` values.
 *
 * Textbook nearest-rank: `ceil(p · n) - 1`, zero-based. Exported so the degeneracy boundary is
 * assertable directly — a spec that pins this function across n = 5/10/19/20/30/60 cannot be
 * satisfied by an implementation that quietly returns `n - 1`.
 *
 * @param {Number} count Sample size.
 * @param {Number} percentile Fraction in (0, 1] — 0.95 for a p95.
 * @returns {Number} Zero-based index into the ascending-sorted sample.
 */
export function percentileIndex(count, percentile) {
    return Math.max(0, Math.ceil(count * percentile) - 1)
}

/**
 * Asserts the sustained health of the integration stack over a given window.
 *
 * **On latency budgets.** `p95Ms` asserts a genuine 95th percentile and therefore requires at least
 * `MIN_PERCENTILE_SAMPLES` observations; below that it throws rather than silently degrading into a
 * max-latency gate. A caller who wants a ceiling on the slowest probe — which is the only latency
 * statistic a short window can support — passes `maxMs` instead and gets exactly that, named for what
 * it is. Passing `p95Ms: null` opts out of the tail assertion altogether, for checks whose subject is
 * liveness rather than latency.
 *
 * @param {Object} options
 * @param {Function} options.probe - An async function that returns the healthcheck object.
 * @param {Number} [options.windowMs] - Total time to observe. Default: process.env.NEO_INTEGRATION_SUSTAINED_WINDOW_MS || 30000.
 * @param {Number} [options.intervalMs] - Polling interval. Default: process.env.NEO_INTEGRATION_SUSTAINED_INTERVAL_MS || 1000.
 * @param {Number} [options.successRate] - Minimum success rate. Default: 1.0.
 * @param {Number|null} [options.p95Ms] - Maximum p95 latency; requires >= MIN_PERCENTILE_SAMPLES samples. `null` skips it. Default: process.env.NEO_INTEGRATION_SUSTAINED_P95_MS || 500.
 * @param {Number|null} [options.maxMs] - Maximum latency of the slowest probe. Valid at any sample count. Default: null.
 * @param {Number} [options.maxConsecutiveFailures] - Max sequential failures allowed. Default: 0.
 * @param {Function} [options.onSample] - Optional callback to run custom assertions on each sample.
 * @returns {Promise<{samples: Object[], summary: {actualSuccessRate: Number, actualP95: Number|null, actualMax: Number, iterations: Number}}>}
 * The gathered samples and computed summary. `summary.actualP95` is **`null` below
 * `MIN_PERCENTILE_SAMPLES`** — the sample cannot resolve a 95th percentile, and reporting the max
 * under that name is the defect this module exists to remove. `summary.actualMax` is always present.
 */
export async function assertSustainedHealth({
    probe,
    windowMs = Number(process.env.NEO_INTEGRATION_SUSTAINED_WINDOW_MS || 30000),
    intervalMs = Number(process.env.NEO_INTEGRATION_SUSTAINED_INTERVAL_MS || 1000),
    successRate = 1.0,
    p95Ms = Number(process.env.NEO_INTEGRATION_SUSTAINED_P95_MS || 500),
    maxMs = null,
    maxConsecutiveFailures = 0,
    onSample
}) {
    const samples = [];
    const latencies = [];
    let consecutiveFailures = 0;

    const iterations = Math.max(1, Math.floor(windowMs / intervalMs));

    for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        try {
            const result = await probe();
            const latency = Date.now() - start;

            samples.push(result);
            latencies.push(latency);
            consecutiveFailures = 0;

            if (onSample) {
                await onSample(result, samples);
            }
        } catch (error) {
            consecutiveFailures++;
            if (consecutiveFailures > maxConsecutiveFailures) {
                throw new Error(`assertSustainedHealth: Exceeded max consecutive failures (${maxConsecutiveFailures}). Last error: ${error.message}`);
            }
        }

        const elapsed = Date.now() - start;
        const sleepTime = Math.max(0, intervalMs - elapsed);
        if (i < iterations - 1 && sleepTime > 0) {
            await new Promise(r => setTimeout(r, sleepTime));
        }
    }

    const actualSuccessRate = samples.length / iterations;
    expect(actualSuccessRate, `Success rate should be >= ${successRate}`).toBeGreaterThanOrEqual(successRate);

    // `null`, not `0`. A p95 the sample cannot resolve is not reported at all — see the guard below.
    // Zero would be a plausible-looking latency; null cannot be mistaken for one.
    let actualP95 = null,
        actualMax = 0;

    if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);

        actualMax = latencies[latencies.length - 1];

        // The refusal has to cover the REPORTED value too, not just the assertion. Computing
        // `latencies[percentileIndex(n, 0.95)]` unconditionally republishes, as data, exactly the
        // conflation this module refuses to assert: below MIN_PERCENTILE_SAMPLES that index IS the
        // last element, so a consumer charting `summary.actualP95` over short windows would be
        // charting the maximum under a p95 label — the original defect, one layer out.
        if (latencies.length >= MIN_PERCENTILE_SAMPLES) {
            actualP95 = latencies[percentileIndex(latencies.length, 0.95)];
        }

        if (maxMs !== null) {
            expect(actualMax, `slowest probe should be <= ${maxMs}ms`).toBeLessThanOrEqual(maxMs);
        }

        if (p95Ms !== null && p95Ms !== undefined) {
            // Refuse rather than mislead. A p95 over fewer than MIN_PERCENTILE_SAMPLES samples IS the
            // max, so asserting one here would gate on the single slowest probe while reporting itself
            // as a tail-tolerant budget — the failure is then indistinguishable from a real latency
            // regression, which is how an unrelated author ends up debugging a plane they never touched.
            if (latencies.length < MIN_PERCENTILE_SAMPLES) {
                throw new Error(
                    `assertSustainedHealth: cannot assert a p95 from ${latencies.length} sample(s) — ` +
                    `below ${MIN_PERCENTILE_SAMPLES} the nearest-rank p95 is the maximum, so the budget ` +
                    'would forbid a slow tail rather than tolerate one.\n' +
                    'Either widen the window (windowMs / intervalMs) until it yields enough samples, ' +
                    'pass `maxMs` to bound the slowest probe instead, or pass `p95Ms: null` if the ' +
                    'check\'s subject is liveness rather than latency.'
                );
            }

            expect(actualP95, `p95 latency should be <= ${p95Ms}ms`).toBeLessThanOrEqual(p95Ms);
        }
    }

    return {
        samples,
        summary: {
            actualSuccessRate,
            actualP95,
            actualMax,
            iterations
        }
    };
}
