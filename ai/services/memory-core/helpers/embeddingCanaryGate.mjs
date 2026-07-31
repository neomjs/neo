/**
 * Embedding write-canary gate: single-flight + result cache + bounded failure backoff.
 *
 * Extracted from `HealthService` so the failure-regime semantics are unit-testable pure. The
 * previous inline cache kept ONLY healthy results ("so degraded probes still retry immediately")
 * — an assumption that inverts under provider saturation: every probe re-runs the expensive
 * canary, attempts overlap (container probe intervals are shorter than the canary deadline, and
 * Docker abandons the PROBE while the in-server canary keeps running), and the failing regime
 * sustains the very load that keeps it failing. This gate retires that rationale:
 *
 * - **Single-flight**: concurrent callers join one in-flight canary; the join point is assigned
 *   synchronously (before any await) and cleared on settle, so a failure is never cached as a
 *   rejected promise and the next window retries fresh.
 * - **Failures are cached too**, with exponential backoff: `failureTtlMs * 2^(streak-1)` capped
 *   at `failureTtlMaxMs`. A saturated provider sees attempts DECREASE instead of one per probe.
 * - **Readers never trigger work**: `readLast()` reports the latest result (or `pending`) without
 *   running anything — the liveness path performs no inference.
 *
 * @module Neo.ai.services.memory-core.helpers.embeddingCanaryGate
 */

/**
 * @summary Creates a canary gate.
 * @param {Object}   options
 * @param {Function} options.runCanary        `() => Promise<Object>` returning a canary block with `status`
 * @param {Number}   [options.healthyTtlMs=60000]    Cache window for healthy results
 * @param {Number}   [options.failureTtlMs=30000]    Base cache window for failed results
 * @param {Number}   [options.failureTtlMaxMs=600000] Backoff ceiling for failed results
 * @param {Function} [options.now=Date.now]
 * @returns {Object} `{probe, readLast, state}`
 */
export function createEmbeddingCanaryGate({
    runCanary,
    healthyTtlMs    = 60000,
    failureTtlMs    = 30000,
    failureTtlMaxMs = 600000,
    // Late-bound on purpose: `now = Date.now` would capture the function REFERENCE at
    // construction and silently ignore test clocks installed afterwards.
    now             = () => Date.now()
}) {
    if (typeof runCanary !== 'function') {
        throw new Error('createEmbeddingCanaryGate: runCanary is required');
    }

    let cache         = null; // {key, checkedAt, ttlMs, result}
    let flight        = null; // in-flight promise (single-flight join point)
    let failureStreak = 0;

    const failureTtlFor = streak =>
        Math.min(failureTtlMs * 2 ** Math.max(0, streak - 1), failureTtlMaxMs);

    /**
     * Annotates a cached/fresh result with gate observability so a degraded verdict can
     * distinguish "saturated, backing off" from "failing right now".
     */
    const annotate = (result, {cached}) => ({
        ...result,
        gate: {
            cached,
            checkedAt    : cache?.checkedAt ?? null,
            failureStreak,
            backoffMs    : result.status === 'healthy' ? 0 : failureTtlFor(failureStreak),
            nextAttemptAt: cache ? cache.checkedAt + cache.ttlMs : null
        }
    });

    return {
        /**
         * Returns the latest known result WITHOUT ever running the canary. Liveness probes use
         * this: a probe must perform no inference.
         * @returns {Object} Last canary block, or `{status: 'pending'}` before the first run
         */
        readLast() {
            if (!cache) {
                return {status: 'pending', gate: {cached: true, checkedAt: null, failureStreak, backoffMs: 0, nextAttemptAt: null}};
            }
            return annotate(cache.result, {cached: true});
        },

        /**
         * Returns a fresh-enough result, running the canary at most once concurrently and at
         * most once per cache window (healthy: `healthyTtlMs`; failed: backoff window).
         * @param {Object} [options]
         * @param {String} [options.key=''] Cache identity (provider/dimension/timeout tuple)
         * @returns {Promise<Object>}
         */
        async probe({key = ''} = {}) {
            const at = now();

            if (cache && cache.key === key && at - cache.checkedAt < cache.ttlMs) {
                return annotate(cache.result, {cached: true});
            }

            if (!flight) {
                // Assigned synchronously — every concurrent caller below joins THIS promise, so a
                // probe storm produces one attempt. Cleared on settle either way: failures retry
                // fresh at the next window instead of pinning callers to a cached rejection.
                flight = (async () => {
                    let result;

                    try {
                        result = await runCanary();
                    } catch (error) {
                        // A thrown canary is still a failed attempt: convert it so the failure is
                        // CACHED and backed off — a rejection bypassing the backoff would recreate
                        // the retry-per-probe regime for exactly the noisiest failure mode.
                        result = {status: 'failed', error: error?.message || String(error)};
                    }

                    if (result?.status === 'healthy') {
                        failureStreak = 0;
                        cache = {key, checkedAt: now(), ttlMs: healthyTtlMs, result: {...result}};
                    } else {
                        failureStreak += 1;
                        cache = {key, checkedAt: now(), ttlMs: failureTtlFor(failureStreak), result: {...(result ?? {status: 'failed', error: 'canary returned no result'})}};
                    }

                    return annotate(cache.result, {cached: false});
                })().finally(() => { flight = null });
            }

            return flight;
        },

        /** Test/diagnostic snapshot of the gate internals. */
        state() {
            return {hasCache: Boolean(cache), failureStreak, inFlight: Boolean(flight)};
        }
    };
}
