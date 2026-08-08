/**
 * @summary Pure policy for the wake receiver's delivery-time context gate: whether a
 * signed wake digest may be injected into the target session NOW, or must wait for the session to
 * shrink or rotate.
 *
 * **The failure mode this guards (the budget cliff):** injecting a wake into a marathon session
 * starts a turn that re-processes the session's entire context. Measured cross-harness
 * (cross-harness harness-ledger measurement, 2026-08-08): 61% of one seat's lifetime processed tokens came from turns above
 * 500K context, and a provider prompt-cache TTL cliff (~30–60 min idle on K3; 5m/1h on Anthropic)
 * means a stale large session re-bills that context at ~0% cache hits. One wake delivered into a
 * >1h-idle ~700K session moved a weekly budget 97% → 100% in a single turn. The wake is only a
 * notification — the A2A mailbox stays the authority — so deferring the notification never loses
 * the message.
 *
 * **Why the policy reads CURRENT state only:** the probe always evaluates the session as it is
 * NOW, so both flush conditions collapse into the size read — a compacted session reports a small
 * context, and a rotated (fresh) session reports a fresh boot's context. There is deliberately NO
 * time-based flush: a session that stays large forever must never receive the deferred wake,
 * because flushing into a stale large session is precisely the cliff event. The provider warm
 * window is therefore documented rationale here, not a consumed input: delivering a
 * sub-threshold wake immediately already beats any warm-window deadline, and a deferred wake must
 * outlast any window.
 *
 * **Unknown context fails OPEN** (deliver + loud warn): a probe that cannot read the session must
 * never silently withhold coordination — silent non-delivery is the dead-realm failure mode. The gate
 * exists to shave the cliff, not to become a second mailbox.
 *
 * Kept pure (no timers, fs, or fetch) so the policy is unit-testable in isolation, mirroring
 * `flushDeferPolicy.mjs`.
 *
 * @module ai/daemons/wake/contextGatePolicy
 */

/**
 * Default size ceiling, in tokens (last assistant turn's `input + cache.read`), above which a
 * wake defers. Sized from the 2026-08-08 telemetry: sub-250K turns are rounding error (~7.5% of
 * lifetime processed tokens), while the 500K–1M band alone carried 61% — so the gate sits at the
 * top of the cheap band, not at the cliff's edge.
 * @type {Number}
 */
export const DEFAULT_CONTEXT_GATE_MAX_TOKENS = 250_000;

/**
 * Default warn level, in tokens, at which a delivered wake logs that the session is approaching
 * the gate. A seat that sees this warning should sunset before the next wake defers.
 * @type {Number}
 */
export const DEFAULT_CONTEXT_GATE_WARN_TOKENS = 200_000;

/**
 * @summary Evaluates one wake against the target session's probed context.
 *
 * @param {Object}        opts
 * @param {Object|null}   opts.probe               Probe result: `{contextTokens, lastActivityAt,
 *   sessionId}`, or `null` when the adapter cannot read the session.
 * @param {Number}        opts.maxContextTokens    Defer above this size (T1).
 * @param {Number}        opts.warnContextTokens   Warn-and-deliver at or above this size (T2).
 * @returns {{action: 'deliver'|'defer', gateOutcome: 'unknown'|'within'|'warn'|'deferred', contextTokens: Number|null}}
 */
export function evaluateContextGate({probe, maxContextTokens, warnContextTokens}) {
    if (!probe || !Number.isFinite(probe.contextTokens)) {
        return {action: 'deliver', gateOutcome: 'unknown', contextTokens: null};
    }

    const {contextTokens} = probe;

    if (contextTokens > maxContextTokens) {
        return {action: 'defer', gateOutcome: 'deferred', contextTokens};
    }
    if (contextTokens >= warnContextTokens) {
        return {action: 'deliver', gateOutcome: 'warn', contextTokens};
    }

    return {action: 'deliver', gateOutcome: 'within', contextTokens};
}
