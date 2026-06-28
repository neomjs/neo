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

/**
 * @summary Runs one re-probe tick across every frozen collection: for each record it makes a cheap pre-decision
 * (skipping a probe entirely when the collection is within its back-off, contained, or has a bad record), then
 * probes only the ones actually due, re-decides with the live probe, and executes the disposition via INJECTED
 * operations — returning a uniform outcome per collection. Pure orchestration: the health probe, the privileged
 * unfreeze + re-heal, and the freeze-record persistence are all injected, so this is fully testable without a
 * live daemon (mirrors `dispatchHeal`). No operator, no escalate.
 *
 * **Anti-hot-loop:** an unfreeze bumps `unfreezeAttempts` + `lastProbeAt` via `persistProbe` BEFORE executing the
 * unfreeze, so a collection that unfreezes then immediately re-freezes keeps a climbing attempt count and is
 * eventually `contained` rather than thrashing. A failed unfreeze leaves the record (the attempt is already
 * recorded); a successful one is handed to `clearFreeze` — whose wired implementation RELEASES the record to a
 * tombstone (not a delete), so that climbing count survives the re-freeze and the flap is what eventually caps.
 *
 * @param {Object} options
 * @param {Object} [options.freezeRecords={}] The keyed freeze-record map (`{[collectionName]: record}`) — the caller reads it from the store.
 * @param {Function} [options.probe] `async (collectionName) => {embedderHealthy, dimensionConsistent}` — the injected health probe. A throw / missing probe is treated as inconclusive (stay frozen).
 * @param {Number} [options.now] Epoch milliseconds (injected clock).
 * @param {Object} [options.bounds] Re-probe bounds (defaults to `DEFAULT_REPROBE_BOUNDS` in `decideFreezeReprobe`).
 * @param {Function} [options.unfreezeAndReheal] `async (collectionName) => any` — the injected privileged unfreeze + re-enter-heal. Absent → an `unfreeze` disposition is recorded `deferred` (not executed).
 * @param {Function} [options.persistProbe] `async ({collectionName, lastProbeAt, unfreezeAttempts?}) => void` — persists the re-probe bookkeeping.
 * @param {Function} [options.clearFreeze] `async (collectionName) => void` — releases the freeze-record on a successful unfreeze. The wired runner tombstones it (`unfrozenAt` set, fence lifted) rather than deleting, so the climbing `unfreezeAttempts` survives a re-freeze (the anti-thrash count); a tombstone is excluded from the active set, so it is not re-probed.
 * @returns {Promise<Object[]>} `[{collectionName, status, reason, unfroze}]` per frozen collection.
 */
export async function runFreezeReprobeCycle({freezeRecords = {}, probe, now, bounds, unfreezeAndReheal, persistProbe, clearFreeze} = {}) {
    const records  = freezeRecords && typeof freezeRecords === 'object' ? freezeRecords : {},
          outcomes = [];

    for (const collectionName of Object.keys(records)) {
        const freezeRecord = records[collectionName];

        // Cheap pre-decision (no probe): a within-back-off `defer`, a `contained` cap, or an `unsafe-input` bad
        // record needs no probe — only a past-back-off collection (which reads `stay-frozen` against a null probe)
        // is actually due for a live re-probe.
        const preDecision = decideFreezeReprobe({freezeRecord, probe: null, bounds, now});

        if (preDecision.status !== 'stay-frozen') {
            outcomes.push({collectionName, status: preDecision.status, reason: preDecision.reason, unfroze: false});
            continue;
        }

        let probeResult = null;
        if (typeof probe === 'function') {
            try {
                probeResult = await probe(collectionName);
            } catch (probeError) {
                probeResult = null; // a failed probe is inconclusive → the decider stays frozen
            }
        }

        const decision = decideFreezeReprobe({freezeRecord, probe: probeResult, bounds, now});

        if (decision.status === 'unfreeze') {
            // Record the unfreeze ATTEMPT before executing — a re-freeze then keeps the climbing count (anti-thrash).
            const attempts = (Number.isFinite(freezeRecord?.unfreezeAttempts) ? freezeRecord.unfreezeAttempts : 0) + 1;

            if (typeof persistProbe === 'function') {
                try {
                    await persistProbe({collectionName, lastProbeAt: now, unfreezeAttempts: attempts});
                } catch (persistError) {
                    outcomes.push({collectionName, status: 'failed', reason: `persist pre-unfreeze failed: ${persistError?.message ?? String(persistError)}`, unfroze: false});
                    continue;
                }
            }

            if (typeof unfreezeAndReheal !== 'function') {
                outcomes.push({collectionName, status: 'deferred', reason: 'no unfreezeAndReheal operation wired', unfroze: false});
                continue;
            }

            try {
                await unfreezeAndReheal(collectionName);
                if (typeof clearFreeze === 'function') {
                    await clearFreeze(collectionName);
                }
                outcomes.push({collectionName, status: 'unfrozen', reason: decision.reason, unfroze: true});
            } catch (unfreezeError) {
                // Unfreeze / re-heal failed — the attempt is already recorded; stays frozen, re-probed next cycle.
                outcomes.push({collectionName, status: 'failed', reason: `unfreeze/re-heal failed: ${unfreezeError?.message ?? String(unfreezeError)}`, unfroze: false});
            }
            continue;
        }

        // stay-frozen after a real probe: advance the probe clock so the back-off measures from this tick.
        if (decision.status === 'stay-frozen' && typeof persistProbe === 'function') {
            try {
                await persistProbe({collectionName, lastProbeAt: now});
            } catch (persistError) {
                // best-effort clock update — a missed bookkeeping write just re-probes a touch sooner next tick
            }
        }

        outcomes.push({collectionName, status: decision.status, reason: decision.reason, unfroze: false});
    }

    return outcomes;
}
