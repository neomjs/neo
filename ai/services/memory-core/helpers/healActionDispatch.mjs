/**
 * @module ai/services/memory-core/helpers/healActionDispatch
 * @summary Pure bounded-dispatch decider for the autonomous data-recovery actuator — the autonomous
 * SAFETY core that replaces the deleted operator-escalate/ack (the v13.1 self-heal mandate). Given a heal
 * `action` (the data-integrity classifier's `terminalAction`), the recent heal-run history (for anti-thrash),
 * and the rate/cooldown bounds, it decides whether the actuator may EXECUTE the heal now — or must hold it
 * (`rate-limited` / `thrash-cooldown` / `unknown-action` / `unsafe-input` / `no-op`), with NO human and NO
 * runtime escalate.
 *
 * This is the gate that lets a fully-autonomous actuator be safe without an operator: a misconfigured
 * embedder or a flapping collection cannot drive an unbounded re-embed/restore loop, because the same
 * action on the same collection is cooldown-gated and window-rate-limited — and because a mutating heal
 * with a missing target/clock/bounds FAILS CLOSED rather than executing unbounded. The actual heal EXECUTION
 * (re-embed / restore — the privileged data mutation) is the actuator's wired concern; THIS is the pure,
 * placement-independent decision every shape of the actuator (dedicated service or extended) consumes.
 */

/**
 * The DISPATCHABLE heal actions (the classifier's `terminalAction` vocabulary). Non-mutating containment
 * (`freeze` / `quarantine`) is always safe to apply; the rest are mutating (see `MUTATING_HEAL_ACTIONS`).
 * The no-op sentinel `none` (`NO_HEAL_ACTION`) is deliberately NOT in this set — it is resolved to `no-op`
 * before the vocabulary check, never dispatched.
 * @type {String[]}
 */
export const HEAL_ACTIONS = Object.freeze(['re-embed-missing', 're-embed-rows', 'restore-delta-merge', 'quarantine', 'freeze', 'defrag']);

/**
 * The non-dispatchable no-op sentinel: the classifier emits `none` for a clean collection (nothing to heal).
 * It is intentionally OUTSIDE `HEAL_ACTIONS` — `decideHealAction` resolves it (and a nullish action) to
 * `no-op` before the dispatchable-vocabulary check, so it is never executed. The data-recovery design
 * treats `none` as the no-op terminal; this constant is the single source for that sentinel.
 * @type {String}
 */
export const NO_HEAL_ACTION = 'none';

/**
 * Mutating heal actions — rate-limited + anti-thrash-bounded (they re-embed / restore / rewrite data).
 * `freeze` + `quarantine` are non-mutating containment and are exempt.
 * @type {String[]}
 */
export const MUTATING_HEAL_ACTIONS = Object.freeze(['re-embed-missing', 're-embed-rows', 'restore-delta-merge', 'defrag']);

/**
 * Default dispatch bounds: at most 3 mutating runs of the same action+collection per hour, with a 10-minute
 * cooldown between consecutive runs.
 * @type {{maxRunsPerWindow: Number, windowMs: Number, cooldownMs: Number}}
 */
export const DEFAULT_DISPATCH_BOUNDS = Object.freeze({maxRunsPerWindow: 3, windowMs: 3600000, cooldownMs: 600000});

/**
 * @summary Decides whether the actuator may execute a heal `action` now, under the autonomous safety bounds.
 *
 * For MUTATING actions the rate + anti-thrash gate requires a target collection, a finite clock, and finite
 * bounds; any of those missing/malformed → fail CLOSED (`unsafe-input`), never a fail-open execute. Partial
 * `bounds` are normalized onto `DEFAULT_DISPATCH_BOUNDS` so an incomplete object cannot silently disable the gate.
 *
 * @param {Object} options
 * @param {String} [options.action] The heal action (the classifier's `terminalAction`).
 * @param {String} [options.collection] The target collection (the anti-thrash / rate key, with `action`).
 * @param {Object[]} [options.recentRuns=[]] Recent heal runs `[{action, collection, at}]` (epoch ms) for anti-thrash + rate.
 * @param {{maxRunsPerWindow: Number, windowMs: Number, cooldownMs: Number}} [options.bounds=DEFAULT_DISPATCH_BOUNDS]
 * @param {Number} [options.now] Epoch milliseconds (the injected clock).
 * @returns {Object} `{execute, status, reason}`. `status ∈ {execute, no-op, unknown-action, unsafe-input, thrash-cooldown, rate-limited}`.
 */
export function decideHealAction({action, collection, recentRuns = [], bounds = DEFAULT_DISPATCH_BOUNDS, now} = {}) {
    if (action === NO_HEAL_ACTION || action == null) {
        return {execute: false, status: 'no-op', reason: 'no-heal-action'};
    }

    if (!HEAL_ACTIONS.includes(action)) {
        return {execute: false, status: 'unknown-action', reason: `unknown heal action: ${action}`};
    }

    // Non-mutating containment is always safe to apply — no rate/thrash bound.
    if (!MUTATING_HEAL_ACTIONS.includes(action)) {
        return {execute: true, status: 'execute', reason: `${action} is non-mutating containment`};
    }

    // A mutating heal MUST carry the full safety context or the rate + anti-thrash gate cannot bind. Fail
    // CLOSED on a missing target/clock — an under-specified mutating heal must never execute unbounded.
    if (typeof collection !== 'string' || collection.length === 0) {
        return {execute: false, status: 'unsafe-input', reason: `mutating '${action}' requires a non-empty collection (the anti-thrash key)`};
    }
    if (!Number.isFinite(now)) {
        return {execute: false, status: 'unsafe-input', reason: `mutating '${action}' requires a finite 'now' (cooldown/window clock)`};
    }

    // Normalize partial/empty bounds onto the safe defaults so an incomplete `{}` can't disable the gate,
    // then fail closed if any resolved bound is still non-finite.
    const {maxRunsPerWindow, windowMs, cooldownMs} = {...DEFAULT_DISPATCH_BOUNDS, ...(bounds && typeof bounds === 'object' ? bounds : {})};

    if (![maxRunsPerWindow, windowMs, cooldownMs].every(Number.isFinite)) {
        return {execute: false, status: 'unsafe-input', reason: `mutating '${action}' requires finite bounds {maxRunsPerWindow, windowMs, cooldownMs}`};
    }

    const sameTarget = (Array.isArray(recentRuns) ? recentRuns : [])
        .filter(run => run?.action === action && run?.collection === collection);

    // Anti-thrash: a same-action+collection run inside the cooldown → hold.
    const lastAt = sameTarget.reduce((latest, run) => (Number.isFinite(run?.at) && run.at > latest ? run.at : latest), -Infinity);

    if (Number.isFinite(lastAt) && now - lastAt < cooldownMs) {
        return {execute: false, status: 'thrash-cooldown', reason: `${action} on ${collection} ran ${now - lastAt}ms ago (< ${cooldownMs}ms cooldown)`};
    }

    // Rate-limit: too many runs of this action+collection inside the window → hold.
    const inWindow = sameTarget.filter(run => Number.isFinite(run?.at) && now - run.at < windowMs).length;

    if (inWindow >= maxRunsPerWindow) {
        return {execute: false, status: 'rate-limited', reason: `${action} on ${collection} hit ${inWindow}/${maxRunsPerWindow} runs in ${windowMs}ms`};
    }

    return {execute: true, status: 'execute', reason: 'within bounds'};
}

/**
 * @summary The actuator's core dispatch: run the bounded-dispatch safety gate, and if it clears, execute the
 * heal via an INJECTED operation — returning a uniform `outcomeRecord`. Pure orchestration: the privileged
 * data-mutation primitives (re-embed / restore / defrag) are injected as `healOperations`, so this dispatcher
 * is fully testable without touching a real store, and the wired actuator (its placement decided separately)
 * supplies the real operations. No operator, no escalate — a held / unwired / failed heal is RECORDED in the
 * outcome, never paged.
 *
 * **Anti-hot-loop:** a mutating ATTEMPT is recorded (via `recordRun`) BEFORE execution, so a throwing/failing
 * heal still enters the anti-thrash history — a broken provider cannot immediately re-run. If the attempt
 * cannot be recorded, the dispatch fails CLOSED (no unrecorded mutation).
 *
 * @param {Object} options
 * @param {String} [options.action] The heal action (the classifier's `terminalAction`).
 * @param {String} [options.collection] The target collection.
 * @param {Object} [options.evidence] The diagnosis evidence passed through to the operation.
 * @param {Object[]} [options.recentRuns=[]] Recent heal runs for the safety gate (anti-thrash + rate).
 * @param {Object} [options.bounds] The dispatch bounds (defaults to `DEFAULT_DISPATCH_BOUNDS` in `decideHealAction`).
 * @param {Number} [options.now] Epoch milliseconds (injected clock).
 * @param {Object} [options.healOperations={}] `{ '<action>': async ({collection, evidence, now}) => ({status?, detail?}) }` — the injected privileged operations.
 * @param {Function} [options.recordRun] `async ({action, collection, at}) => void` — persists a mutating ATTEMPT for future anti-thrash. Called before execution for every mutating heal (success OR failure), so a failed heal cannot hot-loop.
 * @returns {Promise<Object>} `outcomeRecord` = `{action, collection, status, detail, healedAt}`.
 */
export async function dispatchHeal({action, collection, evidence, recentRuns = [], bounds, now, healOperations = {}, recordRun} = {}) {
    const decision = decideHealAction({action, collection, recentRuns, bounds, now});

    if (!decision.execute) {
        return {action, collection, status: decision.status, detail: decision.reason, healedAt: now};
    }

    const operation = healOperations?.[action];

    // The action cleared the gate but its heal isn't wired yet (the "missing logic → ticket" set): record a
    // `deferred` outcome — autonomous, never a page. The runner's safe-default (quarantine) covers the gap.
    if (typeof operation !== 'function') {
        return {action, collection, status: 'deferred', detail: `no heal operation wired for '${action}'`, healedAt: now};
    }

    // Record the mutating ATTEMPT BEFORE execution so a throwing/failing heal still enters the anti-thrash
    // history — a broken provider/store cannot immediately hot-loop. Containment is unbounded and unrecorded.
    // If the attempt can't be recorded, fail CLOSED rather than risk an unrecorded loop.
    if (MUTATING_HEAL_ACTIONS.includes(action) && typeof recordRun === 'function') {
        try {
            await recordRun({action, collection, at: now});
        } catch (recordError) {
            return {action, collection, status: 'failed', detail: `anti-thrash recordRun failed pre-execution: ${recordError?.message ?? String(recordError)}`, healedAt: now};
        }
    }

    try {
        const result = await operation({collection, evidence, now});
        return {action, collection, status: result?.status ?? 'healed', detail: result?.detail ?? result ?? null, healedAt: now};
    } catch (error) {
        // A failed heal is already recorded (above) — never escalated; autonomous self-heal degrades to a recorded fault.
        return {action, collection, status: 'failed', detail: error?.message ?? String(error), healedAt: now};
    }
}
