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
 * @param {Function} [options.recordRun] `async ({action, collection, at}) => void` — persists a mutating ATTEMPT for future anti-thrash. **Required for mutating actions** — absent → the heal fails closed (`unsafe-input`: no recorder, no mutation). Called before execution for every mutating heal (success OR failure), so a failed heal cannot hot-loop.
 * @returns {Promise<Object>} `outcomeRecord` = `{action, collection, status, detail, healedAt}`.
 */
export async function dispatchHeal({action, collection, evidence, recentRuns = [], bounds, now, healOperations = {}, recordRun} = {}) {
    const decision = decideHealAction({action, collection, recentRuns, bounds, now});

    if (!decision.execute) {
        return {action, collection, status: decision.status, detail: decision.reason, healedAt: now};
    }

    const operation = healOperations?.[action];

    // The action cleared the gate but its heal isn't wired yet (the "missing logic → ticket" set): record a
    // `deferred` outcome — autonomous, never a page. (Until quarantine itself is wired it defers too — the
    // interim detects + records rather than contains; containment lands with the wired containment op.)
    if (typeof operation !== 'function') {
        return {action, collection, status: 'deferred', detail: `no heal operation wired for '${action}'`, healedAt: now};
    }

    const isMutating = MUTATING_HEAL_ACTIONS.includes(action);

    // A mutating heal MUST be anti-thrash-recordable, or its loop cannot be bounded → fail CLOSED: no
    // recorder, no mutation. (Containment is unbounded and needs no recorder.) The invariant holds on EVERY
    // path, not only when a recordRun happens to be wired.
    if (isMutating && typeof recordRun !== 'function') {
        return {action, collection, status: 'unsafe-input', detail: `mutating '${action}' requires a recordRun to persist the anti-thrash attempt (no recorder, no mutation)`, healedAt: now};
    }

    // Record the mutating ATTEMPT BEFORE execution so a throwing/failing heal still enters the anti-thrash
    // history — a broken provider/store cannot immediately hot-loop. If recording itself throws, also fail
    // CLOSED rather than risk an unrecorded loop.
    if (isMutating) {
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

/**
 * @summary Detects a CHRONIC `unsafe-input` mis-wire from the heal-event ledger — the immune system observing
 * ITSELF. `dispatchHeal` fails CLOSED to `unsafe-input` on under-specified input (no collection / non-finite
 * clock / missing recordRun); that single fail-closed is correct safety. But a caller that CHRONICALLY fails to
 * satisfy the safety context (a path that never threads the clock, a permanently-absent recordRun) would
 * silently never heal — the fail-closed is right, the mis-wire is invisible unless something watches the ledger.
 * This is that watcher: it groups recent `unsafe-input` outcomes by (action, collection) and returns the groups
 * that crossed `threshold` inside `windowMs`. Pure (no I/O): the caller reads the ledger + surfaces/logs the
 * result. Detection ONLY — it never touches the fail-closed gate.
 *
 * @param {Object[]} [events=[]] Heal-event ledger entries (`{type, collection, status, at}`, oldest to newest).
 * @param {Object} options
 * @param {Number} options.threshold Minimum same-(action, collection) `unsafe-input` count in-window to flag.
 * @param {Number} options.windowMs The look-back window (an epoch-ms span ending at `now`).
 * @param {Number} options.now Epoch ms (the window's upper bound).
 * @returns {Object[]} `[{action, collection, count}]` (count >= threshold), worst-first. Empty when bounds are
 *   non-finite (indeterminate input never spuriously alerts) or nothing is chronic.
 */
export function detectChronicUnsafeInput(events = [], {threshold, windowMs, now} = {}) {
    // Indeterminate bounds -> no alert: a detector must not fire on un-evaluable input.
    if (![threshold, windowMs, now].every(Number.isFinite) || threshold <= 0) {
        return []
    }

    const lowerBound = now - windowMs,
          counts     = new Map();

    for (const event of Array.isArray(events) ? events : []) {
        if (!event || typeof event !== 'object' || event.status !== 'unsafe-input')  continue;
        if (!Number.isFinite(event.at) || event.at < lowerBound || event.at > now)   continue;
        if (typeof event.collection !== 'string' || typeof event.type !== 'string')  continue;

        // Text-safe tuple key: a JSON pair (never a raw separator byte in source). The ledger records the heal
        // ACTION under the event `type` field (mirrors healEventsToRecentRuns).
        const key = JSON.stringify([event.type, event.collection]);
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const chronic = [];

    for (const [key, count] of counts) {
        if (count >= threshold) {
            const [action, collection] = JSON.parse(key);
            chronic.push({action, collection, count})
        }
    }

    // Worst-first: descending count, then a stable JSON-key order for deterministic surfacing.
    return chronic.sort((a, b) => b.count - a.count || JSON.stringify([a.action, a.collection]).localeCompare(JSON.stringify([b.action, b.collection])))
}
