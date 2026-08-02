/**
 * @module ai/services/memory-core/helpers/recoveryKnobRegistry
 * @summary The closed set of configuration knobs the recovery actuator may turn.
 *
 * A **knob** is the unit, not a config leaf. Several leaves can only move together — a nested timeout
 * window has an inner and an outer bound with an ordering invariant between them — and applying such a
 * pair one leaf at a time passes through a state that violates the invariant. For the generation window
 * that intermediate state inverts which branch a timeout takes, so a detector reading branch identity
 * goes blind exactly while actuation is in flight.
 *
 * Keying the set by knob rather than by leaf also keeps the transaction boundary here rather than in the
 * controller. A controller asks to *widen the mini-summary window*; it never names leaves, and so cannot
 * compose an arbitrary set of them. That is what keeps a recovery action a bounded config-and-lifecycle
 * change rather than an arbitrary config-write primitive: the actuator's authority is the enumerated set
 * below, and widening it is a deliberate edit here rather than an emergent property of a caller.
 *
 * This module is pure: no filesystem, no graph, no actuator coupling. It answers *what may be turned and
 * to what*, so the answer can be tested, and so a controller can bind against it before any actuator code
 * exists.
 */

/**
 * Every knob the actuator may turn. Adding an entry is a deliberate widening of the actuator's authority
 * and belongs in a ticket with a reason — which is the point of the set being closed and enumerated in
 * one place rather than inferred from call sites.
 *
 * `leaves` is ORDERED: entries are applied and validated in the sequence given, and `invariants` are
 * expressed over the resolved values by leaf path.
 * @type {Object}
 */
export const RECOVERY_KNOBS = Object.freeze({
    'mini-summary-window': Object.freeze({
        description: 'Nested generation timeouts for mini-summary backfill. Widened when generation ' +
                     'starvation is diagnosed; the inner bound guards a single generate call, the outer ' +
                     'bound guards the sweep that wraps it.',
        leaves: Object.freeze([
            Object.freeze({
                path: 'memoryService.generateMiniSummaryTimeoutMs',
                env : 'NEO_MC_GENERATE_MINI_SUMMARY_TIMEOUT_MS',
                role: 'inner',
                type: 'number',
                min : 1000,
                max : 600000
            }),
            Object.freeze({
                path: 'memoryService.miniSummaryTimeoutMs',
                env : 'NEO_MC_MINI_SUMMARY_TIMEOUT_MS',
                role: 'outer',
                type: 'number',
                min : 1000,
                max : 600000
            })
        ]),
        invariants: Object.freeze([
            Object.freeze({
                id    : 'inner-strictly-below-outer',
                reason: 'The outer timeout wraps the inner one. At inner >= outer the outer fires first, ' +
                          'so every failure moves from the inner falsy branch to the sweep\'s thrown branch ' +
                          'and a branch-reading detector loses its signal mid-actuation.',
                holds   : values => values['memoryService.generateMiniSummaryTimeoutMs'] <
                                    values['memoryService.miniSummaryTimeoutMs']
            })
        ])
    })
});

/**
 * @summary Whether a name is a member of the closed set.
 * @param {String} knob
 * @returns {Boolean}
 */
export function isKnownKnob(knob) {
    return typeof knob === 'string' && Object.hasOwn(RECOVERY_KNOBS, knob)
}

/**
 * @summary The leaf paths a knob moves, in application order.
 * @param {String} knob
 * @returns {String[]} Empty for an unknown knob — callers must gate on {@link isKnownKnob} first.
 */
export function knobLeafPaths(knob) {
    return isKnownKnob(knob) ? RECOVERY_KNOBS[knob].leaves.map(leaf => leaf.path) : []
}

/**
 * @summary Validates a proposed knob transaction, returning every reason it is refused.
 *
 * Returns ALL violations rather than the first, because an operator or controller reading a refusal
 * needs to know what a valid proposal would look like, not just the earliest thing wrong with this one.
 *
 * Refusal is by name and total: a transaction that violates anything applies nothing. Partial
 * application is the failure this knob abstraction exists to prevent, so it must not be reachable
 * through validation either.
 * @param {Object} options
 * @param {String} options.knob Knob name.
 * @param {Object} options.values Proposed values, keyed by leaf path.
 * @returns {{valid: Boolean, violations: String[]}}
 */
export function validateKnobTransaction({knob, values} = {}) {
    const violations = [];

    if (!isKnownKnob(knob)) {
        return {valid: false, violations: [`unknown knob '${knob}' — the actuator turns only: ${Object.keys(RECOVERY_KNOBS).join(', ')}`]}
    }

    const {leaves, invariants} = RECOVERY_KNOBS[knob],
          proposed             = values && typeof values === 'object' ? values : {};

    // A knob is atomic, so a partial proposal is refused rather than merged with current values. Merging
    // would make the resulting state depend on what the target happens to hold right now, which is
    // exactly the read the actuator cannot safely perform across a process boundary.
    for (const key of Object.keys(proposed)) {
        if (!leaves.some(leaf => leaf.path === key)) {
            violations.push(`'${key}' is not part of knob '${knob}'`);
        }
    }

    for (const leaf of leaves) {
        const value = proposed[leaf.path];

        if (value === undefined) {
            violations.push(`missing '${leaf.path}' — knob '${knob}' is applied whole, never leaf by leaf`);
            continue
        }
        if (leaf.type === 'number') {
            if (!Number.isFinite(value)) {
                violations.push(`'${leaf.path}' must be a finite number, received ${JSON.stringify(value)}`);
                continue
            }
            if (value < leaf.min || value > leaf.max) {
                violations.push(`'${leaf.path}' must be within ${leaf.min}..${leaf.max}, received ${value}`);
            }
        }
    }

    // Invariants are evaluated only once every leaf is present and individually sound, so a bounds
    // violation cannot surface as a confusing invariant failure.
    if (violations.length === 0) {
        for (const invariant of invariants) {
            if (!invariant.holds(proposed)) {
                violations.push(`invariant '${invariant.id}' violated — ${invariant.reason}`);
            }
        }
    }

    return {valid: violations.length === 0, violations}
}
