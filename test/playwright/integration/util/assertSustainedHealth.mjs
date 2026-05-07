import {expect} from '@playwright/test';

/**
 * Asserts the sustained health of the integration stack over a given window.
 *
 * @param {Object} options
 * @param {Function} options.probe - An async function that returns the healthcheck object.
 * @param {number} [options.windowMs] - Total time to observe. Default: process.env.NEO_INTEGRATION_SUSTAINED_WINDOW_MS || 30000.
 * @param {number} [options.intervalMs] - Polling interval. Default: process.env.NEO_INTEGRATION_SUSTAINED_INTERVAL_MS || 1000.
 * @param {number} [options.successRate] - Minimum success rate. Default: 1.0.
 * @param {number} [options.p95Ms] - Maximum p95 latency. Default: process.env.NEO_INTEGRATION_SUSTAINED_P95_MS || 500.
 * @param {number} [options.maxConsecutiveFailures] - Max sequential failures allowed. Default: 0.
 * @param {Function} [options.onSample] - Optional callback to run custom assertions on each sample.
 * @returns {Promise<{samples: Object[], summary: Object}>} The gathered samples and computed summary.
 */
export async function assertSustainedHealth({
    probe,
    windowMs = Number(process.env.NEO_INTEGRATION_SUSTAINED_WINDOW_MS || 30000),
    intervalMs = Number(process.env.NEO_INTEGRATION_SUSTAINED_INTERVAL_MS || 1000),
    successRate = 1.0,
    p95Ms = Number(process.env.NEO_INTEGRATION_SUSTAINED_P95_MS || 500),
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

    let actualP95 = 0;
    if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
        actualP95 = latencies[p95Index];

        expect(actualP95, `p95 latency should be <= ${p95Ms}ms`).toBeLessThanOrEqual(p95Ms);
    }

    return {
        samples,
        summary: {
            actualSuccessRate,
            actualP95,
            iterations
        }
    };
}
