/**
 * @module ai/services/memory-core/helpers/healActionDispatch
 * @summary Pure bounded-dispatch decider for the autonomous data-recovery actuator — the autonomous
 * SAFETY core that replaces the deleted operator-escalate/ack (the v13.1 self-heal mandate). Given a heal
 * `action` (the data-integrity classifier's `terminalAction`), the recent heal-run history (for anti-thrash),
 * and the rate/cooldown bounds, it decides whether the actuator may EXECUTE the heal now — or must hold it
 * (`rate-limited` / `thrash-cooldown` / `unknown-action` / `no-op`), with NO human and NO runtime escalate.
 *
 * This is the gate that lets a fully-autonomous actuator be safe without an operator: a misconfigured
 * embedder or a flapping collection cannot drive an unbounded re-embed/restore loop, because the same
 * action on the same collection is cooldown-gated and window-rate-limited. The actual heal EXECUTION
 * (re-embed / restore — the privileged data mutation) is the actuator's wired concern; THIS is the pure,
 * placement-independent decision every shape of the actuator (dedicated service or extended) consumes.
 */

/**
 * The heal actions the actuator can dispatch (the classifier's `terminalAction` vocabulary). `none` is the
 * absence of a heal; non-mutating containment (`freeze` / `quarantine`) is always safe to apply.
 * @type {String[]}
 */
export const HEAL_ACTIONS = Object.freeze(['re-embed-missing', 're-embed-rows', 'restore-delta-merge', 'quarantine', 'freeze', 'defrag']);

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
 * @param {Object} options
 * @param {String} [options.action] The heal action (the classifier's `terminalAction`).
 * @param {String} [options.collection] The target collection (the anti-thrash / rate key, with `action`).
 * @param {Object[]} [options.recentRuns=[]] Recent heal runs `[{action, collection, at}]` (epoch ms) for anti-thrash + rate.
 * @param {{maxRunsPerWindow: Number, windowMs: Number, cooldownMs: Number}} [options.bounds=DEFAULT_DISPATCH_BOUNDS]
 * @param {Number} [options.now] Epoch milliseconds (the injected clock).
 * @returns {Object} `{execute, status, reason}`. `status ∈ {execute, no-op, unknown-action, thrash-cooldown, rate-limited}`.
 */
export function decideHealAction({action, collection, recentRuns = [], bounds = DEFAULT_DISPATCH_BOUNDS, now} = {}) {
    if (action === 'none' || action == null) {
        return {execute: false, status: 'no-op', reason: 'no-heal-action'};
    }

    if (!HEAL_ACTIONS.includes(action)) {
        return {execute: false, status: 'unknown-action', reason: `unknown heal action: ${action}`};
    }

    // Non-mutating containment is always safe to apply — no rate/thrash bound.
    if (!MUTATING_HEAL_ACTIONS.includes(action)) {
        return {execute: true, status: 'execute', reason: `${action} is non-mutating containment`};
    }

    const {maxRunsPerWindow, windowMs, cooldownMs} = bounds,
          sameTarget                               = (Array.isArray(recentRuns) ? recentRuns : [])
              .filter(run => run?.action === action && run?.collection === collection);

    // Anti-thrash: a same-action+collection run inside the cooldown → hold.
    const lastAt = sameTarget.reduce((latest, run) => (Number.isFinite(run?.at) && run.at > latest ? run.at : latest), -Infinity);

    if (Number.isFinite(now) && Number.isFinite(lastAt) && now - lastAt < cooldownMs) {
        return {execute: false, status: 'thrash-cooldown', reason: `${action} on ${collection} ran ${now - lastAt}ms ago (< ${cooldownMs}ms cooldown)`};
    }

    // Rate-limit: too many runs of this action+collection inside the window → hold.
    const inWindow = sameTarget.filter(run => Number.isFinite(now) && Number.isFinite(run?.at) && now - run.at < windowMs).length;

    if (inWindow >= maxRunsPerWindow) {
        return {execute: false, status: 'rate-limited', reason: `${action} on ${collection} hit ${inWindow}/${maxRunsPerWindow} runs in ${windowMs}ms`};
    }

    return {execute: true, status: 'execute', reason: 'within bounds'};
}
