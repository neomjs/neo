/**
 * @module ai/services/memory-core/helpers/freezeReprobeDecision
 * @summary Pure decider for the autonomous freeze → re-probe → auto-unfreeze / re-heal cycle. `freeze` is the
 * actuator's safe containment for a systemic / dimension-systemic fault, but in a cloud deployment there is no
 * operator to lift it — so a TRANSIENT fault (a briefly-down or briefly-misconfigured embedder) that tripped
 * `freeze` would otherwise kill a collection permanently, defeating the weeks-bar. This decider is the
 * counterpart that makes `freeze` recoverable WITHOUT a human: given a frozen collection's durable freeze-record,
 * a current health probe, the back-off / thrash bounds, and the injected clock, it decides whether to
 * `unfreeze` (the fault cleared → re-enter the heal path), `defer` (still inside the re-probe back-off),
 * `stay-frozen` (the fault persists), or treat it as `contained` (the unfreeze-attempt cap is exhausted — a
 * persistent fault that must stay frozen + ledgered, never thrash freeze↔unfreeze).
 *
 * **Safety inversion vs the heal dispatcher.** In `healActionDispatch` a mutating heal fails CLOSED to
 * "do not execute". Here the contained-safe state is *frozen*, and unfreezing is the risky act — so this
 * decider fails CLOSED to `stay-frozen`: a missing record, a non-finite clock, or an inconclusive probe never
 * auto-unfreezes. Only an affirmatively-cleared fault, inside the bounds, lifts containment.
 *
 * Pure + deterministic (no I/O, no time/randomness): the durable freeze-record persistence, the live health
 * probe, and the unfreeze + re-heal execution are separate wired consumers.
 */

/**
 * The freeze-reprobe dispositions. `unfreeze` lifts containment and re-enters the heal path; `defer` waits out
 * the back-off; `stay-frozen` keeps containment for a still-present fault; `contained` is the terminal
 * thrash-capped state (persistent fault, ledgered, no further auto-unfreeze); `unsafe-input` is the
 * fail-closed-to-frozen guard.
 * @type {String[]}
 */
export const FREEZE_REPROBE_STATUSES = Object.freeze(['unfreeze', 'defer', 'stay-frozen', 'contained', 'unsafe-input']);

/**
 * Default re-probe bounds: a 10-minute base interval between probes, at most 3 auto-unfreeze attempts before a
 * collection is treated as a persistent fault (contained), and a 2x exponential widening of the probe interval
 * per prior unfreeze attempt (so a flapping collection is probed ever less often — the anti-thrash back-off).
 * @type {{minReprobeIntervalMs: Number, maxUnfreezeAttempts: Number, backoffMultiplier: Number}}
 */
export const DEFAULT_REPROBE_BOUNDS = Object.freeze({minReprobeIntervalMs: 600000, maxUnfreezeAttempts: 3, backoffMultiplier: 2});

/**
 * @summary Decides whether a frozen collection should auto-unfreeze now, under the autonomous back-off +
 * anti-thrash bounds. Fails CLOSED to `stay-frozen` (never auto-unfreezes on missing/ambiguous input).
 *
 * @param {Object} options
 * @param {Object} [options.freezeRecord] The durable freeze-record `{collectionName, frozenAt, faultFingerprint, unfreezeAttempts, lastProbeAt}`. Missing → `unsafe-input` (stay frozen).
 * @param {Object} [options.probe] The current health probe `{embedderHealthy, dimensionConsistent}`. Both strictly `true` → fault cleared. Either strictly `false` → fault persists. Otherwise inconclusive → stay frozen.
 * @param {{minReprobeIntervalMs: Number, maxUnfreezeAttempts: Number, backoffMultiplier: Number}} [options.bounds=DEFAULT_REPROBE_BOUNDS] Partial bounds are normalized onto the defaults so an incomplete object cannot disable the gate.
 * @param {Number} [options.now] Epoch milliseconds (the injected clock). Non-finite → `unsafe-input` (stay frozen).
 * @returns {Object} `{unfreeze, status, reason, nextProbeAfterMs}`. `unfreeze` is true only for `status: 'unfreeze'`. `nextProbeAfterMs` is the back-off-widened interval the re-probe loop should wait before the next tick.
 */
export function decideFreezeReprobe({freezeRecord, probe, bounds = DEFAULT_REPROBE_BOUNDS, now} = {}) {
    // Fail CLOSED to frozen: a frozen collection is the contained-safe state, so any missing safety context
    // must keep it frozen rather than risk an unfreeze on bad input.
    if (!freezeRecord || typeof freezeRecord !== 'object' || typeof freezeRecord.collectionName !== 'string' || freezeRecord.collectionName.length === 0) {
        return {unfreeze: false, status: 'unsafe-input', reason: 'freezeRecord with a collectionName is required (stay frozen)', nextProbeAfterMs: null};
    }
    if (!Number.isFinite(now)) {
        return {unfreeze: false, status: 'unsafe-input', reason: 'a finite now (re-probe clock) is required (stay frozen)', nextProbeAfterMs: null};
    }

    // Normalize partial/empty bounds onto the safe defaults, then fail closed if any resolved bound is non-finite.
    const {minReprobeIntervalMs, maxUnfreezeAttempts, backoffMultiplier} = {...DEFAULT_REPROBE_BOUNDS, ...(bounds && typeof bounds === 'object' ? bounds : {})};

    if (![minReprobeIntervalMs, maxUnfreezeAttempts, backoffMultiplier].every(Number.isFinite)) {
        return {unfreeze: false, status: 'unsafe-input', reason: 'finite bounds {minReprobeIntervalMs, maxUnfreezeAttempts, backoffMultiplier} are required (stay frozen)', nextProbeAfterMs: null};
    }

    const attempts = Number.isFinite(freezeRecord.unfreezeAttempts) && freezeRecord.unfreezeAttempts > 0 ? freezeRecord.unfreezeAttempts : 0,
          // Back-off widens the probe interval by backoffMultiplier^attempts so a flapping collection is
          // probed ever less often — the anti-thrash cadence guard (AC: freeze↔unfreeze is bounded).
          nextProbeAfterMs = minReprobeIntervalMs * Math.pow(backoffMultiplier, attempts);

    // Thrash cap: a collection that has been auto-unfrozen maxUnfreezeAttempts times and keeps re-freezing is a
    // persistent fault — stay contained (frozen + ledgered), no further auto-unfreeze. A later capability change
    // (the residue-fingerprint reopen path) can still reopen it; this only stops the autonomous unfreeze loop.
    if (attempts >= maxUnfreezeAttempts) {
        return {unfreeze: false, status: 'contained', reason: `unfreeze-attempt cap reached (${attempts}/${maxUnfreezeAttempts}) — persistent fault, stays frozen`, nextProbeAfterMs};
    }

    // Back-off: too soon since the last probe → defer (no re-probe this tick).
    const lastProbeAt = Number.isFinite(freezeRecord.lastProbeAt) ? freezeRecord.lastProbeAt : -Infinity,
          sinceProbe  = now - lastProbeAt;

    if (Number.isFinite(lastProbeAt) && sinceProbe < nextProbeAfterMs) {
        return {unfreeze: false, status: 'defer', reason: `within re-probe back-off (${sinceProbe}ms < ${nextProbeAfterMs}ms)`, nextProbeAfterMs};
    }

    // Probe assessment. Both signals strictly true → fault cleared → unfreeze + re-heal. Either strictly false →
    // fault persists → stay frozen. Anything else (missing/partial probe) is inconclusive → stay frozen (safe).
    const healthy  = probe?.embedderHealthy === true && probe?.dimensionConsistent === true,
          persists = probe?.embedderHealthy === false || probe?.dimensionConsistent === false;

    if (healthy) {
        return {unfreeze: true, status: 'unfreeze', reason: 'fault cleared (embedder healthy + dimensions consistent) — unfreeze + re-heal', nextProbeAfterMs};
    }
    if (persists) {
        return {unfreeze: false, status: 'stay-frozen', reason: 'fault persists (embedder unhealthy or dimensions inconsistent)', nextProbeAfterMs};
    }
    return {unfreeze: false, status: 'stay-frozen', reason: 'probe inconclusive — stay frozen (fail closed)', nextProbeAfterMs};
}
