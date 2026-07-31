/**
 * Bounded retry gate — the shared "bounded retry that records why it stopped" primitive.
 *
 * Three independently-discovered failure families exposed the same missing shape: an expensive,
 * failure-prone async operation retried either unboundedly (each caller re-runs it), never
 * (a suppression flag no pass ever clears), or forever (an empty result re-queued for eternity).
 * This gate is the one primitive under all three: it runs the operation at a caller-owned cadence,
 * caches BOTH outcomes, backs failures off exponentially up to a cap, and annotates every result
 * with why the gate did or did not run — so a consumer can distinguish "saturated, backing off"
 * from "failing right now" without re-running anything.
 *
 * Contract:
 * - **Single-flight**: concurrent `tick()`/`runNow()` callers join one in-flight run. The join
 *   point is assigned before the run settles and cleared on settle, so a failure is never cached
 *   as a rejected promise.
 * - **Failure backoff**: a failed result caches for `failureTtlMs * 2^(streak-1)` capped at
 *   `failureTtlMaxMs`; `tick()` inside that window returns the cached failure without running.
 *   A struggling dependency sees attempts DECREASE, never one per caller.
 * - **Cadence-accurate when healthy**: `tick()` on a healthy gate always runs — the caller's
 *   scheduler owns the period; the gate imposes no second TTL on top of it.
 * - **Generation-keyed**: a `key` change is a hard generation boundary. The previous generation's
 *   in-flight run keeps executing but DRAINS — its settle writes only into its own unreachable
 *   generation, its result is never delivered to the new key, and the new generation starts with
 *   a clean failure streak. At most one legacy flight can coexist with the current generation's
 *   (rotation is a config-change event, not a steady state).
 * - **Readers never trigger work**: `readLast()` reports the latest result (or `pending`) without
 *   running anything — liveness paths perform no work on the caller's clock.
 *
 * @module Neo.ai.services.shared.boundedRetryGate
 */

/**
 * @summary Creates a bounded-retry gate around an expensive async operation.
 * @param {Object}   options
 * @param {Function} options.run              `() => Promise<Object>` resolving to a result with `status`
 *                                            (`'healthy'` resets the streak; anything else is a failure)
 * @param {Number}   [options.failureTtlMs=30000]     Base backoff window for failed results
 * @param {Number}   [options.failureTtlMaxMs=600000] Backoff ceiling for failed results
 * @param {Function} [options.now] Clock seam for tests; late-bound so an injected clock always wins
 * @returns {Object} `{readLast, tick, runNow, state}`
 */
export function createBoundedRetryGate({
    run,
    failureTtlMs    = 30000,
    failureTtlMaxMs = 600000,
    now             = () => Date.now()
}) {
    if (typeof run !== 'function') {
        throw new Error('createBoundedRetryGate: run is required');
    }

    let gen = null; // {key, cache: {checkedAt, ttlMs, result}|null, flight, flightToken, failureStreak}

    const failureTtlFor = streak =>
        Math.min(failureTtlMs * 2 ** Math.max(0, streak - 1), failureTtlMaxMs);

    const generationFor = key => {
        if (!gen || gen.key !== key) {
            gen = {key, cache: null, flight: null, flightToken: null, failureStreak: 0};
        }
        return gen;
    };

    /**
     * Annotates a result with gate observability: cache identity, streak, backoff window, and
     * when the next attempt is permitted — the "why it stopped" record consumers read instead of
     * re-deriving retry state.
     */
    const annotate = (g, result, {cached}) => ({
        ...result,
        gate: {
            key          : g.key,
            cached,
            checkedAt    : g.cache?.checkedAt ?? null,
            failureStreak: g.failureStreak,
            backoffMs    : result.status === 'healthy' ? 0 : failureTtlFor(g.failureStreak),
            nextAttemptAt: g.cache ? g.cache.checkedAt + g.cache.ttlMs : null
        }
    });

    const launch = g => {
        // The token is assigned BEFORE the run starts: every concurrent caller joins this flight,
        // and the settle path can verify it is still the current flight of the current generation.
        const token = {};

        g.flightToken = token;

        const flight = (async () => {
            let result;

            try {
                result = await run();
            } catch (error) {
                // A thrown run is still a failed attempt: convert it so the failure is CACHED and
                // backed off — a rejection bypassing the backoff would recreate the run-per-caller
                // regime for exactly the noisiest failure mode.
                result = {status: 'failed', error: error?.message || String(error)};
            }

            result ??= {status: 'failed', error: 'run returned no result'};

            // Generation drain: deliver into the cache only if this flight still belongs to the
            // CURRENT generation. A rotated key or replaced flight means this result is stale
            // provider-config output — dropped, never cached, never inherited.
            if (gen === g && g.flightToken === token) {
                if (result.status === 'healthy') {
                    g.failureStreak = 0;
                    g.cache         = {checkedAt: now(), ttlMs: 0, result: {...result}};
                } else {
                    g.failureStreak += 1;
                    g.cache          = {checkedAt: now(), ttlMs: failureTtlFor(g.failureStreak), result: {...result}};
                }
            }

            return annotate(g, result, {cached: false});
        })().finally(() => {
            if (g.flightToken === token) {
                g.flight      = null;
                g.flightToken = null;
            }
        });

        g.flight = flight;

        return flight;
    };

    return {
        /**
         * Returns the latest known result WITHOUT ever running the operation. Liveness probes use
         * this: a read must perform no work.
         * @returns {Object} Last annotated result, or `{status: 'pending'}` before the first settle
         */
        readLast() {
            if (!gen?.cache) {
                return {
                    status: 'pending',
                    gate  : {key: gen?.key ?? null, cached: true, checkedAt: null, failureStreak: gen?.failureStreak ?? 0, backoffMs: 0, nextAttemptAt: null}
                };
            }
            return annotate(gen, gen.cache.result, {cached: true});
        },

        /**
         * The scheduled attempt boundary — call this from the owning cadence loop, never from a
         * read path. Joins an in-flight run; skips inside a failure-backoff window (returning the
         * cached failure); otherwise runs. Healthy results do not suppress the next tick: the
         * caller's cadence IS the exercise period.
         * @param {Object} [options]
         * @param {String} [options.key=''] Generation identity (provider/dimension/timeout tuple)
         * @returns {Promise<Object>}
         */
        tick({key = ''} = {}) {
            const g = generationFor(key);

            if (g.flight) {
                return g.flight;
            }

            const c = g.cache;

            if (c && c.result.status !== 'healthy' && now() - c.checkedAt < c.ttlMs) {
                return Promise.resolve(annotate(g, c.result, {cached: true}));
            }

            return launch(g);
        },

        /**
         * Explicit on-demand run (operator diagnostics): joins an in-flight run, otherwise runs
         * immediately — deliberately ignoring the failure-backoff window. Never overlaps.
         * @param {Object} [options]
         * @param {String} [options.key=''] Generation identity
         * @returns {Promise<Object>}
         */
        runNow({key = ''} = {}) {
            const g = generationFor(key);

            return g.flight ?? launch(g);
        },

        /** Test/diagnostic snapshot of the gate internals. */
        state() {
            return {
                key          : gen?.key ?? null,
                hasCache     : Boolean(gen?.cache),
                failureStreak: gen?.failureStreak ?? 0,
                inFlight     : Boolean(gen?.flight)
            };
        }
    };
}
