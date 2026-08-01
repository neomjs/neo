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
 *    generation is coalesced: only the newest generation's demand survives, and EVERY waiter of
 *    a superseded generation — including joiners already attached to the in-flight run — migrates
 *    to the latest demand. A waiter therefore always receives the LATEST generation's truth,
 *    annotated by generation identity (`gate.genId` of the serving run vs `gate.demandedGenId`
 *    of the waiter's own demand; `gate.coalesced` marks the fold), never a superseded result
 *    presented as current. Every delivered result is an independent per-waiter deep copy —
 *    joined callers cannot observe each other's mutations.
 * 3. **Draining.** A superseded flight's result is dropped (never cached into any other
 *    generation); the coalesced latest demand starts immediately after the active flight
 *    settles. Callers never hang and the latest generation always gets its own run.
 * 4. **One failure predicate.** An outcome is healthy iff `status === 'healthy'`; EVERY other
 *    outcome — 'failed', 'degraded', a thrown attempt, a non-object — follows the identical
 *    failure path (streak, capped exponential backoff, terminal budget) and reports identical
 *    metadata inwardly (snapshot) and outwardly (annotated results).
 * 5. **Bounded budget.** `maxFailureStreak` exhausts into a TERMINAL cached result with a
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

    /** The one global in-flight run: `{genId, promise, waiters: [{key, genId, resolve}]}`. */
    let active = null;
    /** The coalesced latest demand during a flight: `{gen, force, waiters: [{key, genId, resolve}]}`. */
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
     * @summary THE failure predicate for the whole gate: an outcome is healthy iff
     * `status === 'healthy'`. Every other outcome follows the identical failure path, so inward
     * (snapshot) and outward (annotated result) metadata can never disagree about whether a
     * backoff exists.
     * @param {Object} result
     * @returns {Boolean}
     */
    function isHealthyOutcome(result) {
        return result?.status === 'healthy';
    }

    /**
     * @summary Wraps a raw attempt result with the gate's truth annotation. `gate.genId`/`gate.key`
     * always name the generation the underlying run (or cached settle) actually served, and
     * `checkedAt` is the ONE captured settle timestamp — the same instant the cache records.
     * @param {Object} result Raw attempt result (`{status, …}`).
     * @param {Object} gen    The generation the result belongs to.
     * @param {Object} [options]
     * @param {Boolean} [options.cached=false] True when served from cache (no run happened).
     * @param {Number}  options.checkedAt      The captured settle time of the underlying run.
     * @returns {Object}
     */
    function annotate(result, gen, {cached = false, checkedAt} = {}) {
        const failed = !isHealthyOutcome(result);

        return {
            // structuredClone: no nested object/array inside the result aliases the internal
            // cache (or any other delivered copy) — outward projections are fully isolated.
            ...structuredClone(result),
            gate: {
                key          : gen.key,
                genId        : gen.id,
                cached,
                checkedAt,
                coalesced    : false,  // per-waiter adjustment in fanout
                demandedKey  : gen.key,
                demandedGenId: gen.id,
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
     * @summary Per-waiter delivery: every waiter receives an INDEPENDENT deep copy of the serving
     * run's result — one joined caller's mutation can never reach another joined caller's
     * delivery. Marks results served by a DIFFERENT generation than the one demanded
     * (`coalesced: true` + the demanded generation identity), so a folded waiter can always tell
     * which generation's truth it received versus which it asked for.
     * @param {Object} annotated The serving run's annotated result.
     * @param {Object} waiter    `{key, genId, resolve}` — the demanded generation identity.
     */
    function fanout(annotated, waiter) {
        const body = structuredClone(annotated); // per-waiter isolation; gate fields are scalars

        body.gate = {
            ...annotated.gate,
            coalesced    : annotated.gate.genId !== waiter.genId,
            demandedKey  : waiter.key,
            demandedGenId: waiter.genId
        };

        waiter.resolve(body);
    }

    /**
     * @summary Settles the one global flight with ONE captured settle timestamp: caches into the
     * flight's OWN still-current generation (a superseded flight drains — its result is dropped),
     * fans the annotated result out to any joiners still attached (un-migrated waiters of an
     * un-rotated flight), then immediately starts the coalesced latest demand if one accumulated.
     * @param {Object} flight The flight record being settled.
     * @param {Object} gen    The flight's own generation.
     * @param {Object} result The raw attempt outcome (thrown attempts pre-converted by `startFlight`).
     * @returns {Object} The annotated result.
     */
    function settleFlight(flight, gen, result) {
        if (active === flight) {
            active = null;
        }

        const settledAt = now(); // ONE settle timestamp for the cache record, the backoff window, and the response

        if (generation && generation.id === flight.genId) {
            if (isHealthyOutcome(result)) {
                gen.cached        = {result: structuredClone(result), checkedAt: settledAt, backoffMs: 0};
                gen.failureStreak = 0;
                gen.nextAttemptAt = 0;
                gen.terminal      = false;
                gen.stopReason    = null;
            } else {
                gen.failureStreak++;

                const backoffMs = Math.min(failureTtlMaxMs, failureTtlMs * 2 ** (gen.failureStreak - 1));

                gen.cached = {result: structuredClone(result), checkedAt: settledAt, backoffMs};

                if (gen.failureStreak >= maxFailureStreak) {
                    gen.terminal      = true;
                    gen.stopReason    = `attempt budget exhausted (streak ${gen.failureStreak}, budget ${maxFailureStreak})`;
                    gen.nextAttemptAt = 0;
                } else {
                    gen.nextAttemptAt = settledAt + backoffMs;
                }
            }
        }

        const annotated = annotate(result, gen, {cached: false, checkedAt: settledAt});

        for (const waiter of flight.waiters) {
            fanout(annotated, waiter);
        }

        flight.waiters.length = 0;

        if (pending) {
            const {gen: nextGen, force, waiters} = pending;

            pending = null;

            const nextFlight = startFlight(nextGen, force);

            nextFlight.waiters.push(...waiters);
        }

        return annotated;
    }

    /**
     * @summary Launches the one global flight for `gen`. The flight record is assigned to `active`
     * SYNCHRONOUSLY, before any await, so concurrent demand joins rather than races (the
     * `RecorderService.ensureStore()` single-flight precedent). A thrown `run` converts to a
     * failure result — the gate never caches or delivers a rejection.
     * @param {Object}  gen
     * @param {Boolean} force True bypasses the failure-backoff window and the terminal state (operator demand).
     * @returns {Object} The flight record `{genId, promise, waiters}`.
     */
    function startFlight(gen, force) {
        const flight = {genId: gen.id, promise: null, waiters: []};

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

        return flight;
    }

    /**
     * @summary The single demand path behind `tick()` and `runNow()`: rotate → a same-generation
     * active flight ALWAYS wins (its settle carries fresher truth than any cached short-circuit)
     * → terminal/backoff cache short-circuit → coalesce as (or join) the latest demand, migrating
     * the superseded flight's own joiners → else start a run.
     * @param {String}  key
     * @param {Boolean} force
     * @returns {Promise<Object>}
     */
    function demand(key, force) {
        const gen = rotateIfNeeded(key);

        // A same-generation active flight wins over any cached short-circuit: its settle carries
        // fresher truth than the cache (e.g. a forced recovery in flight behind a terminal or
        // backoff state — joining it can never serve the stale cached failure it is recovering).
        if (active && active.genId === gen.id) {
            return new Promise(resolve => active.waiters.push({key, genId: gen.id, resolve}));
        }

        if (gen.terminal && !force) {
            return Promise.resolve(annotate(gen.cached.result, gen, {
                cached   : true,
                checkedAt: gen.cached.checkedAt
            }));
        }

        if (!force && gen.cached && !isHealthyOutcome(gen.cached.result) && now() < gen.nextAttemptAt) {
            // Inside the failure-backoff window: serve the cached failure, do NOT run.
            return Promise.resolve(annotate(gen.cached.result, gen, {
                cached   : true,
                checkedAt: gen.cached.checkedAt
            }));
        }

        if (active) {
            // A different generation: this demand becomes (or joins) the coalesced latest demand,
            // and the superseded flight's own joiners migrate with it — every waiter of a
            // superseded generation receives the LATEST generation's truth, marked as folded.
            if (!pending || pending.gen.id !== gen.id) {
                pending = {gen, force, waiters: pending?.waiters ?? []};
            }

            if (force) {
                pending.force = true;
            }

            pending.waiters.push(...active.waiters.splice(0));

            return new Promise(resolve => pending.waiters.push({key, genId: gen.id, resolve}));
        }

        const flight = startFlight(gen, force);

        return new Promise(resolve => flight.waiters.push({key, genId: gen.id, resolve}));
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
         * The returned `cached` record is a deep copy: mutating it cannot change live gate behavior.
         * @returns {Object} `{status: 'never-started'|'pending'|'healthy'|'failed'|'terminal', key,
         *     genId, inFlight, pendingDemand, failureStreak, backoffMs, nextAttemptAt, terminal, stopReason, cached}`
         */
        snapshot() {
            if (!generation) {
                return {
                    status       : 'never-started',
                    key          : null,
                    genId        : null,
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
                genId        : generation.id,
                inFlight     : Boolean(active && active.genId === generation.id),
                pendingDemand: pending ? pending.gen.key : null,
                failureStreak: generation.failureStreak,
                backoffMs    : generation.cached?.backoffMs ?? 0,
                nextAttemptAt: generation.nextAttemptAt || null,
                terminal     : generation.terminal,
                stopReason   : generation.stopReason,
                cached       : generation.cached ? structuredClone(generation.cached) : null
            };
        }
    };
}
