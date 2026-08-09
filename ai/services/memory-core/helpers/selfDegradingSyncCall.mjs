/**
 * @summary Self-degrading guard for a SYNCHRONOUS call on a latency-sensitive path: runs the call,
 * measures it, and — when a run exceeds its budget — skips subsequent runs for a cooldown window
 * instead of paying the cost again.
 *
 * Exists for the class of work `withTimeout` cannot bound: a synchronous call (better-sqlite3
 * queries are the canonical case) blocks the event loop for its full duration — no race can
 * interrupt it, and every in-flight response on the process pays the delay. The only safe budget
 * for sync work is retrospective: pay once, learn, and stop paying while the underlying surface is
 * known-slow. Callers get an honest `skipped` + reason instead of a silently expensive value —
 * absence of a nicety over a taxed mandatory path.
 *
 * State is caller-owned (a plain mutable object) so the guard stays pure and hermetically
 * testable: no module-level state, no clock dependency (`now` injected), one guard instance per
 * call site.
 */

/**
 * @summary Runs `fn` under the self-degrading contract.
 *
 * Outcomes:
 * - **cooldown active** → `{value: null, skipped: true, reason, lastDurationMs}` — `fn` not called.
 * - **ran within budget** → `{value, skipped: false, durationMs}`.
 * - **ran OVER budget** → the value is still returned (it was already paid for), but the cooldown
 *   arms: `{value, skipped: false, durationMs, cooldownArmed: true}`.
 * - **threw** → rethrows; a failure is the caller's contract to handle (this guard prices latency,
 *   never swallows errors).
 *
 * @param {Object}   options
 * @param {Function} options.fn Synchronous producer to guard.
 * @param {Number}   options.budgetMs Duration above which the cooldown arms.
 * @param {Number}   options.cooldownMs How long to skip after an over-budget run.
 * @param {Object}   options.state Caller-owned guard state; mutated in place
 *     (`{skipUntil, lastDurationMs}` — pass the same object every call).
 * @param {Function} [options.now=Date.now] Clock seam for tests.
 * @returns {{value: *, skipped: Boolean, reason: (String|undefined), durationMs: (Number|undefined),
 *     lastDurationMs: (Number|undefined), cooldownArmed: (Boolean|undefined)}}
 */
export function runSelfDegradingSyncCall({fn, budgetMs, cooldownMs, state, now = Date.now}) {
    const at = now();

    if (state.skipUntil && at < state.skipUntil) {
        return {
            value         : null,
            skipped       : true,
            reason        : `skipped for ${Math.max(0, state.skipUntil - at)}ms more: previous run took ${state.lastDurationMs}ms (budget ${budgetMs}ms)`,
            lastDurationMs: state.lastDurationMs
        };
    }

    const value      = fn();
    const durationMs = now() - at;

    state.lastDurationMs = durationMs;

    if (durationMs > budgetMs) {
        state.skipUntil = at + cooldownMs;

        return {value, skipped: false, durationMs, cooldownArmed: true};
    }

    state.skipUntil = 0;

    return {value, skipped: false, durationMs};
}
