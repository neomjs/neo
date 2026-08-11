/**
 * @module ai/services/shared/probeDutyCycle
 * @summary The bound that keeps a periodic liveness probe from becoming its provider's steady-state
 * load: after each attempt the producer stays idle in proportion to what that attempt cost.
 *
 * **The defect this exists for.** A probe producer ticks on a fixed cadence while its subject answers
 * at a variable rate. Single-flighting and failure backoff both leave the SUCCEEDING-slowly case
 * unbounded — correctly, a healthy provider should be re-probed — so when an attempt's duration
 * approaches its cadence the producer runs effectively back-to-back. Measured on a live deployment:
 * cadence 60s against a 264s attempt, ~88% provider occupancy, reported healthy throughout.
 *
 * Cadence cannot fix that. A probe whose duration approaches its cadence runs back-to-back at ANY
 * cadence value — 264s against 300s is 88% exactly as 264s against 60s is. The floor has to derive
 * from the observed cost, which also makes it self-scaling: a fast probe never reaches it.
 *
 * **What it does and does not guarantee.** Each instance bounds ITS OWN producer. It is process-local
 * state, so N producers sharing one provider give up to N · `maxDutyCycle` combined — a service and
 * its sibling each holding to 20% put 40% on the shared provider between them. Size the leaf for the
 * number of producers a deployment actually runs; a provider-wide bound would need coordination these
 * processes do not have. Stating this is the point: the previous version of this comment would have
 * called 20% a provider guarantee, and it never was one.
 *
 * Sibling of `boundedRetryGate.mjs`, and deliberately separate from it: the gate owns retry STATE
 * (has this failed, how long until we may retry), while this owns SCHEDULING pressure (may we afford
 * another attempt at all). A plain module with named exports and no Neo coupling, so specs drive it
 * with injected seams instead of mutating shared config.
 */

/**
 * @summary Creates one duty-cycle floor.
 *
 * Every numeric is a GETTER, not a value: cadence, timeout and duty all re-resolve on a producer
 * re-arm, and a floor bound to the values present at construction would silently keep enforcing a
 * retired configuration.
 *
 * @param {Object}   options
 * @param {Function} options.clock        `() => Number` — the producer's time source.
 * @param {Function} options.maxDutyCycle `() => Number` — share of wall-clock the probe may occupy its provider. Outside `(0, 1)` disables the floor.
 * @param {Function} options.timeoutMs    `() => Number` — the per-attempt budget actually issued.
 * @param {Function} options.cadenceMs    `() => Number` — the producer's configured period, for the cost projection only.
 * @returns {{run: Function, eligible: Function, noteSkipped: Function, rebaseClock: Function, describe: Function}}
 */
export function createProbeDutyCycle({clock, maxDutyCycle, timeoutMs, cadenceMs} = {}) {
    for (const [name, seam] of Object.entries({clock, maxDutyCycle, timeoutMs, cadenceMs})) {
        if (typeof seam !== 'function') {
            throw new TypeError(`probeDutyCycle: \`${name}\` must be a getter function`);
        }
    }

    let chargedMs      = 0,
        lastRunMs      = 0,
        nextEligibleAt = 0,
        skippedTicks   = 0;

    /** @returns {Boolean} True when a floor is actually in force. */
    function bounded() {
        const duty = maxDutyCycle();

        return duty > 0 && duty < 1;
    }

    /**
     * @summary The idle a given cost buys. `charged · (1 - d) / d` — at `d = 0.2`, four times the
     * attempt's own cost, so attempt-plus-idle is five times it and the probe holds one fifth.
     * @param {Number} cost
     * @returns {Number}
     */
    function idleFor(cost) {
        const duty = maxDutyCycle();

        return bounded() ? Math.round(cost * (1 - duty) / duty) : 0;
    }

    return {
        /**
         * @summary Runs one attempt and charges its provider occupancy, arming the idle the next
         * attempt must wait out. Returns (or rethrows) whatever the attempt did, unchanged.
         *
         * **The charge is not the measured span.** A consumer timeout aborts the CLIENT, not the
         * provider — Ollama runs an abandoned request to completion.
         * (`ollama/ollama#11889`, open upstream — ticket-ref-ok: third-party defect this model needs.)
         * So the instant we give up measures OUR patience, not the provider's occupancy.
         *
         * The discriminator is therefore whether we gave up, NOT whether the attempt succeeded. One
         * that returned inside its budget is done either way — a connection refused in 5ms cost the
         * provider nothing, and charging it the full budget would slow recovery on exactly the plane
         * we most want to re-probe. One that consumed its whole budget is charged its span plus a
         * further budget: it ran at least that long, it is still running, and nothing tells us when
         * it stops.
         *
         * The error direction is deliberate. Overcharging costs probe frequency, which `describe()`
         * reports; undercharging re-issues work onto a provider still executing the last attempt,
         * which is silent — and silent is how this froze four cores for a month.
         *
         * @param {Function} attempt `() => Promise<*>`
         * @returns {Promise<*>}
         */
        async run(attempt) {
            const startedAt = clock();

            try {
                return await attempt();
            } finally {
                const budget    = timeoutMs(),
                      measured  = Math.max(0, clock() - startedAt),
                      abandoned = budget > 0 && measured >= budget;

                lastRunMs      = measured;
                chargedMs      = abandoned ? measured + budget : measured;
                nextEligibleAt = bounded() ? clock() + idleFor(chargedMs) : 0;
            }
        },

        /** @returns {Boolean} True when the provider is no longer owed idle for the last attempt. */
        eligible() {
            return clock() >= nextEligibleAt;
        },

        /** @summary Records a tick the floor suppressed. Counted, never silent. @returns {void} */
        noteSkipped() {
            skippedTicks++;
        },

        /**
         * @summary Re-bases the eligibility instant onto a replaced time source.
         *
         * `nextEligibleAt` is absolute and is only meaningful in the clock that produced it. The
         * REMAINING idle carries over rather than being dropped, so a re-arm with a fresh clock cannot
         * be used to bypass the floor, and a stale instant from the old source cannot outlive it.
         *
         * @param {Number} previousNow The old clock's reading, taken BEFORE the swap.
         * @param {Number} nextNow     The new clock's reading.
         * @returns {void}
         */
        rebaseClock(previousNow, nextNow) {
            const remainingMs = Math.max(0, nextEligibleAt - previousNow);

            nextEligibleAt = remainingMs > 0 ? nextNow + remainingMs : 0;
        },

        /**
         * @summary The probe's own cost projection, plus named warnings when it is out of scale with
         * its own schedule.
         *
         * This exists because the defect it describes was INVISIBLE. A probe slower than its cadence
         * reported healthy while occupying its provider ~88% of the time: the probe worked, the retry
         * gate worked, every projection was green, and the deployment was saturated by its own health
         * check. A cost the health surface never states is a cost nobody can act on.
         *
         * @returns {Object} `{chargedMs, lastRunMs, idleFloorMs, effectivePeriodMs, skippedTicks, warnings}`
         */
        describe() {
            const cadence     = cadenceMs(),
                  budget      = timeoutMs(),
                  idleFloorMs = idleFor(chargedMs),
                  warnings    = [];

            // `>=`, not `>`: an attempt costing EXACTLY its cadence is the worst case, not an exempt
            // one — without the floor the next tick lands on the settle instant, at 100% occupancy.
            if (chargedMs >= cadence) {
                warnings.push(`attempt cost ${chargedMs}ms exceeds the ${cadence}ms cadence — without the duty-cycle floor this probe would run back-to-back`);
            }

            // Abandoning a request does not stop it upstream, so a budget larger than the period means
            // an attempt we gave up on is still executing when the next one is due. The floor charges
            // for that, but the CONFIG is the thing to fix.
            if (budget > cadence) {
                warnings.push(`attempt budget ${budget}ms exceeds the ${cadence}ms cadence — an abandoned attempt outlives its own period and the provider keeps executing it`);
            }

            if (!bounded()) {
                warnings.push(`duty-cycle floor disabled (maxDutyCycle ${maxDutyCycle()}) — attempts are bounded by cadence alone, which cannot bound a probe slower than its cadence`);
            }

            return {
                chargedMs,
                lastRunMs,
                idleFloorMs,
                effectivePeriodMs: Math.max(cadence, chargedMs + idleFloorMs),
                skippedTicks,
                warnings
            };
        }
    };
}
