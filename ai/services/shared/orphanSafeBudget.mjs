/**
 * @module ai/services/shared/orphanSafeBudget
 * @summary Refuses to dispatch provider work that outlives the caller waiting for it.
 *
 * ## Why this exists
 *
 * **Ollama does not stop processing when its client disconnects** — `ollama/ollama#11889`, open (ticket-ref-ok: upstream provider behaviour, not a Neo tracking ref — the mechanism this guard exists for)
 * upstream. An `AbortController` gives up locally; the inference runs to completion regardless. So a
 * request whose budget exceeds the caller's willingness to wait is not "a request that might time
 * out". It is work we can never take back.
 *
 * On a single-slot provider (`OLLAMA_NUM_PARALLEL=1`) each orphan holds the only slot until it
 * finishes on its own, and `OLLAMA_MAX_QUEUE` (512 by default) means upstream sheds no load either.
 * Orphans therefore accumulate and the provider stays pinned at its CPU cap serving work nobody is
 * waiting for.
 *
 * **Measured in production 2026-08-11T09:18Z:** three provider operations SUCCEEDED after 961,609ms,
 * 662,615ms and 1,010,684ms — their callers had abandoned them 5-15 minutes earlier. Fresh probes
 * immediately afterwards completed in ~1.4s, because the slot had finally cleared. The provider was
 * never slow; it was busy with abandoned work.
 *
 * The configuration that produced it: healthchecks abandoned at 45s (the container `timeout`) while
 * the probe they dispatched carried a 5-minute (KB) / 15-minute (MC) server-side budget. Nothing
 * refused that pairing, because the budget leaf accepts any number and never sees the caller.
 *
 * ## The rule
 *
 * **Never dispatch a request whose budget exceeds the caller's deadline.** Clamping is not a
 * courtesy — for an uncancellable provider it is the only moment at which the work can still be
 * bounded. After dispatch there is no lever left.
 *
 * Clamping is deliberately silent-safe rather than throwing: a throw would turn a working-but-
 * over-configured deployment into a hard outage, while a clamp denies only the excess. The
 * `clamped` flag is returned so the caller can report it instead of hiding a shortened deadline.
 *
 * @see ai/services/memory-core/HealthService.mjs — embedding write canary
 * @see ai/services/knowledge-base/HealthService.mjs — embedding probe
 * @plane in-plane
 */

/**
 * Bounds a provider request budget by the deadline of whoever is waiting for it.
 *
 * `callerDeadlineMs` is the honest upper bound on how long the caller will still be listening — a
 * container healthcheck `timeout`, a request deadline, a poll interval. When it is unknown the
 * budget passes through unchanged: this guard narrows, and never invents a bound it cannot justify.
 * @param {Object} params
 * @param {Number} params.configuredMs The configured provider budget.
 * @param {Number} [params.callerDeadlineMs] How long the caller will actually wait, when known.
 * @returns {{budgetMs: Number, clamped: Boolean, reason: (String|null)}} `budgetMs` is what the
 * dispatch must use. `clamped` is true only when the configured budget was reduced, so a caller can
 * surface the shortened deadline rather than silently applying it.
 */
export function orphanSafeBudget({configuredMs, callerDeadlineMs}) {
    const configuredValid = Number.isFinite(configuredMs) && configuredMs > 0;

    if (!configuredValid) {
        return {budgetMs: configuredMs, clamped: false, reason: null};
    }

    const deadlineValid = Number.isFinite(callerDeadlineMs) && callerDeadlineMs > 0;

    // An unknown caller deadline is not a licence to invent one. Pass through: this guard exists to
    // NARROW a budget against a known bound, and a fabricated ceiling would shorten deadlines on
    // deployments whose callers genuinely wait longer.
    if (!deadlineValid || configuredMs <= callerDeadlineMs) {
        return {budgetMs: configuredMs, clamped: false, reason: null};
    }

    return {
        budgetMs: callerDeadlineMs,
        clamped : true,
        reason  : `provider budget ${configuredMs}ms exceeds the caller deadline ${callerDeadlineMs}ms; ` +
            'clamped because the provider does not cancel on client disconnect (ollama/ollama#11889), ' +
            'so the excess would run on unwatched and hold the provider slot'
    };
}
