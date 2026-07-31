/**
 * Bounded retry gate — the shared "bounded retry that records why it stopped" primitive.
 *
 * Three independently-discovered failure families exposed the same missing shape: an expensive,
 * failure-prone async operation retried either unboundedly (each caller re-runs it), never
 * (a suppression flag no pass ever clears), or forever (an empty result re-queued for eternity).
 * This gate is the one primitive under all three: it runs the operation at a caller-owned cadence,
 * caches BOTH outcomes, backs failures off exponentially up to a cap, can exhaust a bounded
 * attempt budget with a retained terminal reason, and annotates every result with why the gate
 * did or did not run — so a consumer can distinguish "saturated, backing off" from "failing right
 * now" from "stopped, here is how it resumes" without re-running anything.
 *
 * Contract:
 * - **Global single-flight**: at most ONE run exists at any moment, across ALL keys and callers.
 *   `tick()`/`runNow()` during a run join the active flight (even for a different key — the
 *   settled result may then belong to a superseded generation; scheduled callers ignore results
 *   and converge on the next tick).
 * - **Failure backoff**: a failed result caches for `failureTtlMs * 2^(streak-1)` capped at
 *   `failureTtlMaxMs`; `tick()` inside that window returns the cached failure without running.
 *   A struggling dependency sees attempts DECREASE, never one per caller.
 * - **Bounded attempt budget** (`maxFailureStreak`, default Infinity): when the consecutive
 *   failure streak reaches the budget, the gate goes TERMINAL for that generation — `tick()`
 *   returns the cached failure annotated `terminal: true` with a retained `stopReason` and never
 *   runs. **Resumption is guaranteed and named**: `runNow()` (explicit operator action) bypasses
 *   both backoff and exhaustion, and a key rotation starts a clean generation. Infinity keeps
 *   liveness-style consumers probing forever at the capped backoff — their resumption predicate
 *   is the next window.
 * - **Cadence-accurate when healthy**: `tick()` on a healthy gate always runs — the caller's
 *   scheduler owns the period; the gate imposes no second TTL on top of it.
 * - **Coalesced generation rotation**: a `key` change rotates the STATE generation immediately
 *   (clean streak, no inherited cache) but never launches beside the active flight; repeated
 *   rotations coalesce to the latest key. A drained flight delivers its result only if the
 *   current generation still has its key.
 * - **Readers never trigger work**: `readLast()` reports the latest result (or `pending`)
 *   without running anything.
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
 * @param {Number}   [options.maxFailureStreak=Infinity] Attempt budget: consecutive failures before terminal
 * @param {Function} [options.now] Clock seam for tests; late-bound so an injected clock always wins
 * @returns {Object} `{readLast, tick, runNow, state}`
 */
export function createBoundedRetryGate({
    run,
    failureTtlMs     = 30000,
    failureTtlMaxMs  = 600000,
    maxFailureStreak = Infinity,
    now              = () => Date.now()
}) {
    if (typeof run !== 'function') {
        throw new Error('createBoundedRetryGate: run is required');
    }

    let gen    = null; // current STATE generation: {key, cache: {checkedAt, ttlMs, result}|null, failureStreak}
    let active = null; // the ONE expensive run, global across generations: {key, flight}

    const failureTtlFor = streak =>
        Math.min(failureTtlMs * 2 ** Math.max(0, streak - 1), failureTtlMaxMs);

    const isExhausted = g => g.failureStreak >= maxFailureStreak;

    const generationFor = key => {
        if (!gen || gen.key !== key) {
            gen = {key, cache: null, failureStreak: 0};
        }
        return gen;
    };

    /**
     * Annotates a result with gate observability: cache identity, streak, backoff window, when
     * the next attempt is permitted, and — once the attempt budget is exhausted — the retained
     * terminal stop reason plus the named resumption paths. This is the "why it stopped" record
     * consumers read instead of re-deriving retry state.
     */
    const annotate = (g, result, {cached}) => {
        const terminal = result.status !== 'healthy' && isExhausted(g);

        return {
            ...result,
            gate: {
                key          : g.key,
                cached,
                checkedAt    : g.cache?.checkedAt ?? null,
                failureStreak: g.failureStreak,
                backoffMs    : result.status === 'healthy' ? 0 : failureTtlFor(g.failureStreak),
                nextAttemptAt: terminal ? null : (g.cache ? g.cache.checkedAt + g.cache.ttlMs : null),
                ...(terminal && {
                    terminal  : true,
                    stopReason: `attempt budget exhausted (${g.failureStreak} consecutive failures, budget ${maxFailureStreak})`,
                    resumeVia : 'runNow() or key rotation'
                })
            }
        };
    };

    const launch = g => {
        const entry = {key: g.key, flight: null};

        entry.flight = (async () => {
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

            // Coalesced delivery: the result lands only if the CURRENT generation still carries
            // this flight's key. A rotation that happened mid-flight drains this result — its
            // provider-config context is superseded, so it is dropped, never cached, never able
            // to poison the new generation's streak.
            const target = gen?.key === entry.key ? gen : null;

            if (target) {
                if (result.status === 'healthy') {
                    target.failureStreak = 0;
                    target.cache         = {checkedAt: now(), ttlMs: 0, result: {...result}};
                } else {
                    target.failureStreak += 1;
                    target.cache          = {checkedAt: now(), ttlMs: failureTtlFor(target.failureStreak), result: {...result}};
                }
            }

            return annotate(target ?? gen ?? g, result, {cached: false});
        })().finally(() => {
            if (active === entry) {
                active = null;
            }
        });

        active = entry;

        return entry.flight;
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
         * read path. Joins the single active flight (any key); skips inside a failure-backoff
         * window or once the attempt budget is exhausted (returning the annotated cached failure);
         * otherwise runs. Healthy results do not suppress the next tick: the caller's cadence IS
         * the exercise period.
         * @param {Object} [options]
         * @param {String} [options.key=''] Generation identity (provider/dimension/timeout tuple)
         * @returns {Promise<Object>}
         */
        tick({key = ''} = {}) {
            const g = generationFor(key);

            if (active) {
                return active.flight;
            }

            const c = g.cache;

            if (c && c.result.status !== 'healthy' && (isExhausted(g) || now() - c.checkedAt < c.ttlMs)) {
                return Promise.resolve(annotate(g, c.result, {cached: true}));
            }

            return launch(g);
        },

        /**
         * Explicit on-demand run — THE named resumption path (operator diagnostics): joins the
         * single active flight, otherwise runs immediately, deliberately ignoring both the
         * failure-backoff window and an exhausted attempt budget. A healthy settle resets the
         * streak and un-exhausts the generation. Never overlaps.
         * @param {Object} [options]
         * @param {String} [options.key=''] Generation identity
         * @returns {Promise<Object>}
         */
        runNow({key = ''} = {}) {
            const g = generationFor(key);

            return active ? active.flight : launch(g);
        },

        /** Test/diagnostic snapshot of the gate internals. */
        state() {
            return {
                key          : gen?.key ?? null,
                hasCache     : Boolean(gen?.cache),
                failureStreak: gen?.failureStreak ?? 0,
                inFlight     : Boolean(active),
                terminal     : Boolean(gen && gen.cache && gen.cache.result.status !== 'healthy' && isExhausted(gen))
            };
        }
    };
}
