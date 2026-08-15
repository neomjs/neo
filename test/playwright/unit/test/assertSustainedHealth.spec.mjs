import {test, expect} from '@playwright/test';

import {
    MIN_PERCENTILE_SAMPLES,
    assertSustainedHealth,
    percentileIndex
} from '../../integration/util/assertSustainedHealth.mjs';

/**
 * The helper's latency budget is the subject here, not the plane it probes.
 *
 * A p95 assertion exists to tolerate a slow tail. Over a small sample it does the opposite: the
 * nearest-rank index lands on the last element, so the "p95" is the maximum and a single slow probe
 * fails the run under a budget that reads as tolerant — 501ms against a 500ms budget, on a
 * five-sample window, in a spec whose own name calls it a composability check.
 *
 * These arms pin the boundary rather than the symptom. `percentileIndex` is exported precisely so the
 * degeneracy is assertable as arithmetic — an implementation that quietly returns `n - 1` cannot
 * satisfy the table below, and no amount of CI-runner luck can make it pass.
 */

// Probes fast enough that Date.now() deltas stay at 0-1ms, so sample COUNT is what the arms vary.
// windowFor: iterations === floor(windowMs / intervalMs), and an intervalMs of 1 keeps the
// inter-sample sleep negligible, so a 20-sample arm still runs in milliseconds.
const
    fastProbe = () => Promise.resolve({status: 'healthy'}),
    slowProbe = ms => () => new Promise(resolve => setTimeout(() => resolve({status: 'healthy'}), ms)),
    windowFor = sampleCount => ({windowMs: sampleCount, intervalMs: 1});

test.describe('integration/util/assertSustainedHealth — the latency budget must mean what it says', () => {
    test.describe('percentileIndex — nearest-rank, and where it degenerates', () => {
        // The load-bearing table. Rank is 1-based from smallest; `above` is how many samples the
        // budget tolerates over the selected value, which is the whole point of a percentile.
        //
        // 19 -> 20 is the boundary: at 19 the index is the last element (tolerates nothing), at 20 it
        // finally steps back one. MIN_PERCENTILE_SAMPLES is derived from exactly this transition, so
        // if someone "rounds" that constant to 25 or 10, these arms answer for it.
        const CASES = [
            {n: 1,  index: 0,  above: 0},
            {n: 5,  index: 4,  above: 0},
            {n: 10, index: 9,  above: 0},
            {n: 19, index: 18, above: 0},
            {n: 20, index: 18, above: 1},
            {n: 30, index: 28, above: 1},
            {n: 60, index: 56, above: 3}
        ];

        CASES.forEach(({n, index, above}) => {
            test(`n=${n} selects index ${index}, tolerating ${above} sample(s) above it`, () => {
                expect(percentileIndex(n, 0.95)).toBe(index);
                expect(n - index - 1).toBe(above);
            });
        });

        test('below MIN_PERCENTILE_SAMPLES the p95 index IS the last element — the max', () => {
            for (let n = 1; n < MIN_PERCENTILE_SAMPLES; n++) {
                expect(percentileIndex(n, 0.95), `n=${n} should degenerate to the max`).toBe(n - 1);
            }
        });

        test('MIN_PERCENTILE_SAMPLES is the SMALLEST n where p95 differs from the max', () => {
            // Both halves matter. The first proves the constant is not larger than it needs to be;
            // the second proves it is not smaller. A constant justified only from one side drifts.
            expect(percentileIndex(MIN_PERCENTILE_SAMPLES, 0.95)).toBeLessThan(MIN_PERCENTILE_SAMPLES - 1);
            expect(percentileIndex(MIN_PERCENTILE_SAMPLES - 1, 0.95)).toBe(MIN_PERCENTILE_SAMPLES - 2);
        });

        test('never returns a negative index for an empty sample', () => {
            expect(percentileIndex(0, 0.95)).toBe(0);
        });
    });

    test.describe('the p95 budget refuses a sample it cannot resolve', () => {
        test('throws on a five-sample window rather than gating on the slowest probe', async () => {
            const run = assertSustainedHealth({probe: fastProbe, ...windowFor(5), p95Ms: 500});

            await expect(run).rejects.toThrow(/cannot assert a p95 from 5 sample\(s\)/);
        });

        test('the refusal names the sample count AND the remedies', async () => {
            const run = assertSustainedHealth({probe: fastProbe, ...windowFor(5), p95Ms: 500});

            // A guard that refuses without saying what to do instead gets routed around.
            await expect(run).rejects.toThrow(/maxMs/);
            await expect(assertSustainedHealth({probe: fastProbe, ...windowFor(5), p95Ms: 500}))
                .rejects.toThrow(/p95Ms: null/);
        });

        test('accepts the sample at exactly MIN_PERCENTILE_SAMPLES — the positive control', async () => {
            // Without this arm the refusal could be unconditional and every arm above would still pass.
            const {summary} = await assertSustainedHealth({
                probe: fastProbe, ...windowFor(MIN_PERCENTILE_SAMPLES), p95Ms: 500
            });

            expect(summary.iterations).toBe(MIN_PERCENTILE_SAMPLES);
        });

        test('p95Ms: null opts out entirely, so a liveness check can use a short window', async () => {
            const {summary} = await assertSustainedHealth({probe: fastProbe, ...windowFor(5), p95Ms: null});

            expect(summary.iterations).toBe(5);
            expect(summary.actualSuccessRate).toBe(1);
        });
    });

    test.describe('maxMs — the statistic a short window CAN support', () => {
        test('passes when every probe is under the ceiling', async () => {
            const {summary} = await assertSustainedHealth({
                probe: fastProbe, ...windowFor(5), p95Ms: null, maxMs: 5000
            });

            expect(summary.actualMax).toBeLessThanOrEqual(5000);
        });

        test('fails on the slowest probe, and says so in the max\'s own words', async () => {
            const run = assertSustainedHealth({
                probe: slowProbe(40), ...windowFor(3), p95Ms: null, maxMs: 1
            });

            // The message must not say "p95" — mislabelling is the defect this file exists to pin.
            await expect(run).rejects.toThrow(/slowest probe should be <= 1ms/);
        });

        test('composes with a resolvable p95 rather than replacing it', async () => {
            const {summary} = await assertSustainedHealth({
                probe: fastProbe, ...windowFor(MIN_PERCENTILE_SAMPLES), p95Ms: 5000, maxMs: 5000
            });

            expect(summary.actualP95).toBeLessThanOrEqual(summary.actualMax);
        });
    });

    test.describe('the summary reports both statistics', () => {
        test('actualMax is the largest observed latency, not the percentile', async () => {
            const {summary} = await assertSustainedHealth({
                probe: slowProbe(20), ...windowFor(3), p95Ms: null, maxMs: 5000
            });

            expect(summary.actualMax).toBeGreaterThanOrEqual(summary.actualP95);
            expect(summary.actualMax).toBeGreaterThan(0);
        });
    });
});
