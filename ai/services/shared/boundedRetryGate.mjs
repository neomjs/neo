/**
 * @module ai/services/shared/boundedRetryGate
 * @summary Shared "bounded retry that records why it stopped" primitive — one global in-flight
 * run, both-outcome cache, capped exponential failure backoff, and an optional bounded attempt
 * budget with a retained terminal stop reason and named resumption paths.
 *
 * The family primitive for bounded-retry-with-reason: three independently-discovered failures
 * (an uncached canary retrying at probe frequency, a sync lane in infinite backoff, a backfill in
 * infinite retry) are one missing notion — retry with a bounded attempt budget, a recorded stop
 * reason, and a guaranteed resumption condition. This module is that notion, consumer-agnostic:
 * the embedding write canary (`HealthService`) is the first adopter; the other two poles adopt
 * in their own lanes.
 *
 * Concurrency contract (the falsifiers this module's spec encodes as its floor):
 *
 * 1. **Immutable generation identity.** A generation is a unique object (`{id, key, …}`), never
 *    a reusable key string: A→B→A starts a NEW A generation, and a superseded flight's settle
 *    can only write into its own (unreachable) generation — old results cannot contaminate a
 *    later same-named generation.
 * 2. **One global flight, one coalesced latest demand.** At most one `run()` is active at any
 *    moment, across all keys and rotations. Demand arriving during a flight for a DIFFERENT
 *    generation is coalesced: only the newest generation's demand survives, and folded waiters
 *    receive the serving run's own result — truthfully annotated (`gate.key` = the generation
 *    that actually ran, `gate.coalesced` = the waiter was folded), never an old result wearing
 *    a new key.
 * 3. **Draining.** A superseded flight's result is dropped (never cached into any other
 *    generation); the coalesced latest demand starts immediately after the active flight
 *    settles. Callers never hang and the latest generation always gets its own run.
 * 4. **Bounded budget.** `maxFailureStreak` exhausts into a TERMINAL cached result with a
 *    retained `stopReason` and named resumption (`runNow()` / key rotation). `Infinity` keeps
 *    liveness semantics: probe forever at the capped backoff.
 *
 * Sibling of `storeWriteGuard.mjs`: a plain module with named exports and no Neo coupling, so
 * specs import it directly with injected seams (clock, run body) instead of mutating shared
 * config.
 */

/**
 * @summary Creates one bounded-retry gate.
 *
 * The gate owns retry STATE only; scheduling belongs to the consumer (the canary producer ticks
 * on its cadence; the gate suppresses attempts inside a failure-backoff window and never lets
 * two runs overlap). `run` is invoked as `run({key, force})` and its outcome is NEVER allowed to
 * escape as a rejection: a thrown attempt converts to a cached failure result, so callers can
 * never pin to a rejected promise.
 *
 * @param {Object}   options
 * @param {Function} options.run                             Attempt body: `({key, force}) => Promise<{status: String, …}>`.
 * @param {Number}   options.failureTtlMs                    Base failure-backoff window in ms; doubles per consecutive failure.
 * @param {Number}   options.failureTtlMaxMs                 Backoff ceiling in ms.
 * @param {Number}   [options.maxFailureStreak=Infinity]     Attempt budget; exhaustion yields a TERMINAL cached result. `Infinity` = liveness semantics.
 * @param {Function} [options.now=Date.now]                  Time source (injectable for deterministic specs).
 * @returns {{tick: Function, runNow: Function, snapshot: Function}}
 */
export function createBoundedRetryGate({
    run,
    failureTtlMs,
    failureTtlMaxMs,
    maxFailureStreak = Infinity,
    now = Date.now
} = {}) {
    if (typeof run !== 'function') {
        throw new Error('boundedRetryGate: `run` must be a function');
    }

    /** The one global in-flight run, if any: `{genId, promise}`. */
    let active = null;
    /** The coalesced latest demand during a flight: `{gen, force, waiters: [{key, resolve}]}`. */
    let pending = null;
    /** The current generation. Identity is the OBJECT (monotonically increasing id), never the key string. */
    let generation = null;
    let genCounter = 0;

    /**
     * @summary Returns the current generation for `key`, rotating to a FRESH generation object on
     * any key change. A rotated generation inherits nothing: clean streak, empty cache, no backoff.
     * @param {String} key
     * @returns {Object}
     */
    function rotateIfNeeded(key) {
        if (!generation || generation.key !== key) {
            generation = {
                id           : ++genCounter,
                key,
                cached       : null, // {result, checkedAt, backoffMs}
                failureStreak: 0,
                nextAttemptAt: 0,
                terminal     : false,
                stopReason   : null
            };
        }

        return generation;
    }

    /**
     * @summary Wraps a raw attempt result with the gate's truth annotation. `gate.key` always names
     * the generation the underlying run actually served — substitution is impossible by construction.
     * @param {Object} result Raw attempt result (`{status, …}`).
     * @param {Object} gen    The generation the result belongs to.
     * @param {Object} [options]
     * @param {Boolean} [options.cached=false]    True when served from cache (no run happened).
     * @param {Number}  [options.checkedAt=now()] Settle time of the underlying run.
     * @returns {Object}
     */
    function annotate(result, gen, {cached = false, checkedAt = now()} = {}) {
        const failed = result.status === 'failed';

        return {
            ...result,
            gate: {
                key          : gen.key,
                cached,
                checkedAt,
                coalesced    : false,
                failureStreak: gen.failureStreak,
                backoffMs    : failed ? (gen.cached?.backoffMs ?? 0) : 0,
                nextAttemptAt: failed && !gen.terminal ? gen.nextAttemptAt : null,
                terminal     : gen.terminal,
                stopReason   : gen.stopReason,
                resumeVia    : gen.terminal ? 'runNow() or key rotation' : null
            }
        };
    }

    /**
     * @summary Per-waiter delivery wrapper: marks results served by a DIFFERENT generation than the
     * one demanded (`coalesced: true` + `demandedKey`), so a folded waiter can always tell which
     * generation's truth it received.
     * @param {Promise<Object>} promise
     * @param {String} demandedKey
     * @returns {Promise<Object>}
     */
    function deliver(promise, demandedKey) {
        return promise.then(annotated => ({
            ...annotated,
            gate: {
                ...annotated.gate,
                coalesced  : annotated.gate.key !== demandedKey,
                demandedKey
            }
        }));
    }

    /**
     * @summary Settles the one global flight: caches into the flight's OWN still-current generation
     * (a superseded flight drains — its result is dropped), then immediately starts the coalesced
     * latest demand if one accumulated. Resolves (never rejects) the flight's joiners with the
     * flight's own annotated result.
     * @param {Object} flight The flight record being settled.
     * @param {Object} gen    The flight's own generation.
     * @param {Object} result The raw attempt outcome (thrown attempts pre-converted by `startFlight`).
     * @returns {Object} The annotated result for this flight's joiners.
     */
    function settleFlight(flight, gen, result) {
        if (active === flight) {
            active = null;
        }

        if (generation && generation.id === flight.genId) {
            const checkedAt = now();

            if (result.status === 'healthy') {
                gen.cached        = {result, checkedAt, backoffMs: 0};
                gen.failureStreak = 0;
                gen.nextAttemptAt = 0;
                gen.terminal      = false;
                gen.stopReason    = null;
            } else {
                gen.failureStreak++;

                const backoffMs = Math.min(failureTtlMaxMs, failureTtlMs * 2 ** (gen.failureStreak - 1));

                gen.cached = {result, checkedAt, backoffMs};

                if (gen.failureStreak >= maxFailureStreak) {
                    gen.terminal      = true;
                    gen.stopReason    = `attempt budget exhausted (streak ${gen.failureStreak}, budget ${maxFailureStreak})`;
                    gen.nextAttemptAt = 0;
                } else {
                    gen.nextAttemptAt = checkedAt + backoffMs;
                }
            }
        }

        if (pending) {
            const {gen: nextGen, force, waiters} = pending;

            pending = null;

            const nextFlight = startFlight(nextGen, force);

            for (const waiter of waiters) {
                waiter.resolve(deliver(nextFlight, waiter.key));
            }
        }

        return annotate(result, gen, {cached: false});
    }

    /**
     * @summary Launches the one global flight for `gen`. The flight record is assigned to `active`
     * SYNCHRONOUSLY, before any await, so concurrent demand joins rather than races (the
     * `RecorderService.ensureStore()` single-flight precedent). A thrown `run` converts to a failure
     * result — the gate never caches or delivers a rejection.
     * @param {Object}  gen
     * @param {Boolean} force True bypasses the failure-backoff window (operator demand).
     * @returns {Promise<Object>} The flight's annotated result promise.
     */
    function startFlight(gen, force) {
        const flight = {genId: gen.id, promise: null};

        flight.promise = Promise.resolve()
            .then(() => run({key: gen.key, force}))
            .then(
                result => settleFlight(flight, gen, result && typeof result === 'object'
                    ? result
                    : {status: 'failed', error: 'boundedRetryGate: run() returned a non-object result'}),
                error => settleFlight(flight, gen, {
                    status: 'failed',
                    error : `boundedRetryGate: run() threw — ${error?.message || error}`
                })
            );

        active = flight;

        return flight.promise;
    }

    /**
     * @summary The single demand path behind `tick()` and `runNow()`: rotate → terminal/backoff
     * short-circuit → join the active flight or coalesce as the latest demand → else start a run.
     * @param {String}  key
     * @param {Boolean} force
     * @returns {Promise<Object>}
     */
    function demand(key, force) {
        const gen = rotateIfNeeded(key);

        if (gen.terminal && !force) {
            return deliver(Promise.resolve(annotate(gen.cached.result, gen, {
                cached   : true,
                checkedAt: gen.cached.checkedAt
            })), key);
        }

        if (!force && gen.cached?.result.status === 'failed' && now() < gen.nextAttemptAt) {
            // Inside the failure-backoff window: serve the cached failure, do NOT run.
            return deliver(Promise.resolve(annotate(gen.cached.result, gen, {
                cached   : true,
                checkedAt: gen.cached.checkedAt
            })), key);
        }

        if (active) {
            if (active.genId === gen.id) {
                return deliver(active.promise, key); // join the one global flight
            }

            // Coalesce: only the newest generation's demand survives; folded waiters migrate and
            // receive the serving run's own truthfully-annotated result.
            if (!pending || pending.gen.id !== gen.id) {
                pending = {gen, force, waiters: pending?.waiters ?? []};
            }

            if (force) {
                pending.force = true;
            }

            return new Promise(resolve => pending.waiters.push({key, resolve}));
        }

        return deliver(startFlight(gen, force), key);
    }

    return {
        /**
         * @summary Scheduled demand (the consumer's cadence tick). Joins the active flight, serves
         * the cached failure inside its backoff window, never overlaps, and never runs after the
         * attempt budget is exhausted.
         * @param {Object} options
         * @param {String} options.key Generation identity key (e.g. a config fingerprint).
         * @returns {Promise<Object>} The annotated result.
         */
        tick: ({key}) => demand(key, false),

        /**
         * @summary Operator demand. Bypasses the failure-backoff window and the terminal state (the
         * named resumption path), still without ever overlapping the active flight.
         * @param {Object} options
         * @param {String} options.key Generation identity key.
         * @returns {Promise<Object>} The annotated result.
         */
        runNow: ({key}) => demand(key, true),

        /**
         * @summary Read-only projection of the gate's current truth for health surfaces. Never
         * starts, joins, schedules, or mutates anything — liveness reads perform zero inference.
         * @returns {Object} `{status: 'never-started'|'pending'|'healthy'|'failed'|'terminal', key,
         *     inFlight, pendingDemand, failureStreak, backoffMs, nextAttemptAt, terminal, stopReason, cached}`
         */
        snapshot() {
            if (!generation) {
                return {
                    status       : 'never-started',
                    key          : null,
                    inFlight     : false,
                    pendingDemand: null,
                    failureStreak: 0,
                    backoffMs    : 0,
                    nextAttemptAt: null,
                    terminal     : false,
                    stopReason   : null,
                    cached       : null
                };
            }

            return {
                status       : generation.terminal ? 'terminal' : generation.cached ? generation.cached.result.status : 'pending',
                key          : generation.key,
                inFlight     : Boolean(active && active.genId === generation.id),
                pendingDemand: pending ? pending.gen.key : null,
                failureStreak: generation.failureStreak,
                backoffMs    : generation.cached?.backoffMs ?? 0,
                nextAttemptAt: generation.nextAttemptAt || null,
                terminal     : generation.terminal,
                stopReason   : generation.stopReason,
                cached       : generation.cached ? {...generation.cached} : null
            };
        }
    };
}
