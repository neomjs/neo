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
/**
 * Fewest items the mini-summary sweep must still be able to attempt for the backfill to be draining
 * rather than crawling. Named rather than inlined so the ceiling it produces reads as a throughput trade
 * instead of a magic number a later reader will "tune".
 * @type {Number}
 */
const MINISUMMARY_MIN_ITEMS_PER_SWEEP = 4;

/**
 * The autonomous band for the store's memory ceiling, in bytes. Both ends are DERIVED, not preferred,
 * and the derivation is the load-bearing content:
 *
 * - **Floor = the compose default (8 GiB).** Resident-vector arithmetic measured on the live plane:
 *   `rows x 4096 dims x 4 B x ~1.38 index overhead` puts a complete ~96k-row corpus at ~2.02 GiB, and
 *   8 GiB admits ~370k rows — about 4x the measured corpus. A request below the derived default is not
 *   a raise, and this knob expresses exactly one intent: raise.
 * - **Cap = 2x the default (16 GiB).** At ~34% of the 47 GiB Docker VM the sizing was measured
 *   against, a store that still saturates has outgrown ceiling-raising as a heal: the next move is a
 *   corpus-architecture decision (sharding, a second store, the dimension trade recorded on the
 *   ticket), which is design work, not actuation. The cap is where autonomy ENDS on purpose — a
 *   refusal here is the signal that forces that conversation, so it must never be widened casually to
 *   silence the refusal.
 * @type {Number}
 */
const CONTAINER_MEMORY_CEILING_MIN_BYTES = 8  * 1024 ** 3;
const CONTAINER_MEMORY_CEILING_MAX_BYTES = 16 * 1024 ** 3;

export const RECOVERY_KNOBS = Object.freeze({
    'container-memory-ceiling': Object.freeze({
        description: 'Raise a store-backed service\'s memory ceiling. For a store the corpus IS the ' +
                     'workload — resident memory tracks rows already persisted — so shedding relieves ' +
                     'nothing and a restart mid-ingestion is the harm itself. The only coherent heal is ' +
                     'more ceiling, bounded here. Values are BYTES; the env binding carries a Docker ' +
                     'size string ("8g"), and the deploy layer that consumes the overlay owns that ' +
                     'unit translation.',
        /**
         * The one service this knob addresses. The actuator refuses a knob/target mismatch against
         * this declaration, so a controller cannot aim the store's ceiling intent at a different
         * container. Widening to another service is a deliberate registry edit with its own sizing
         * derivation — per-service ceilings are explicitly out of scope on the origin ticket.
         */
        serviceKey: 'chroma',
        /**
         * The LIVE ceiling, resolved by the caller from the runtime (Docker inspect
         * `HostConfig.Memory`) rather than from any config leaf. Config cannot answer this bound: a
         * plane that predates the parameterised compose default runs a live 2 GiB cap under an 8 GiB
         * config story, and the raise-not-lower invariant must bind against what the container
         * actually enforces. Routing this knob through a channel that resolves context from config
         * only (`reconfigure`) therefore fails closed on missing context — which is correct, because
         * that channel couples the mutation to a restart this knob exists to avoid.
         */
        requires: Object.freeze(['runtime.chroma.liveMemoryLimitBytes']),
        leaves  : Object.freeze([
            // `resource` is load-bearing rather than descriptive. `role: 'ceiling'` says a leaf is an
            // upper bound; it does not say of WHAT. The envelope boundary in
            // `DeploymentRuntimeAccessService` matched on the role alone, so any future ceiling leaf
            // governing a different resource — a process-internal V8 old-space cap, say — would have
            // silently become a legal target for a cgroup move. Declared here so that guard can
            // REQUIRE it; a leaf omitting it matches nothing rather than defaulting to envelope.
            Object.freeze({
                path    : 'deploy.chroma.memoryCeilingBytes',
                env     : 'NEO_CHROMA_MEMORY_LIMIT',
                role    : 'ceiling',
                resource: 'container-memory',
                type    : 'number',
                min     : CONTAINER_MEMORY_CEILING_MIN_BYTES,
                max     : CONTAINER_MEMORY_CEILING_MAX_BYTES
            })
        ]),
        /**
         * Delivery reconciliation is not actuation admission. The actuator must only propose a
         * strict raise, but after that raise has landed an ordinary redeploy sees equality and must
         * keep delivering the same desired state. This predicate lets the host materializer
         * distinguish that idempotent equality from a now-lower, dangerous stale prescription
         * without weakening `raise-not-lower` for any producer or actuator caller.
         * @param {Object} values
         * @param {Object} context
         * @returns {Boolean}
         */
        matchesCurrentDeployment: (values, context = {}) =>
            values['deploy.chroma.memoryCeilingBytes'] ===
            context['runtime.chroma.liveMemoryLimitBytes'],
        invariants: Object.freeze([
            Object.freeze({
                id    : 'raise-not-lower',
                reason: 'Lowering a store\'s ceiling below or to its live limit is an OOM ' +
                        'instruction with extra steps: the corpus does not shrink to fit. Docker ' +
                        'reports 0 for an UNLIMITED ceiling, and raising an unlimited ceiling is ' +
                        'incoherent, so a non-finite, non-positive, or unresolved live value refuses ' +
                        'rather than passes — an unknown bound is a refusal, never an absent one.',
                holds : (values, context = {}) => {
                    const live = context['runtime.chroma.liveMemoryLimitBytes'];

                    if (!Number.isFinite(live) || live <= 0) return false;

                    return values['deploy.chroma.memoryCeilingBytes'] > live
                }
            })
        ])
    }),
    'minisummary-generation-window': Object.freeze({
        description: 'Nested generation timeouts for mini-summary backfill. Widened when generation ' +
                     'starvation is diagnosed; the inner bound guards a single generate call, the outer ' +
                     'bound guards the sweep that wraps it.',
        /**
         * Leaves this knob does NOT change but whose values bound it. The caller resolves these from the
         * live config and passes them as `context`, so a bound derived from another leaf stays correct
         * when that leaf moves — a hardcoded ceiling would silently go stale the moment it did.
         */
        requires        : Object.freeze(['memoryService.miniSummaryBackfillMaxRunMs']),
        minItemsPerSweep: MINISUMMARY_MIN_ITEMS_PER_SWEEP,
        leaves          : Object.freeze([
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
                holds : values => values['memoryService.generateMiniSummaryTimeoutMs'] <
                                  values['memoryService.miniSummaryTimeoutMs']
            }),
            Object.freeze({
                id    : 'outer-leaves-room-for-a-draining-sweep',
                reason: 'The sweep has a fixed wall-clock budget, so a wider per-item timeout buys ' +
                        'per-item success by spending the number of items a sweep can attempt. Past a ' +
                        'point the sweep goes single-item and the backlog stops draining — while every ' +
                        'individual widening still looks like an improvement, because per-item success ' +
                        'rate rises as total output collapses. This refuses the step where the action ' +
                        'starts working against the outcome it is being taken for.',
                holds : (values, context = {}) => {
                    const budget = context['memoryService.miniSummaryBackfillMaxRunMs'];

                    // Unresolvable budget is not a licence to widen without limit. Refusing here is the
                    // same fail-closed rule the rest of this module follows: an unknown bound is a
                    // refusal, never an absent one.
                    if (!Number.isFinite(budget)) return false;

                    return values['memoryService.miniSummaryTimeoutMs'] <=
                           budget / MINISUMMARY_MIN_ITEMS_PER_SWEEP
                }
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
 * @summary The leaf→environment bindings a knob delivers through, resolved from the registry.
 *
 * **This exists so a consumer never has to take an env key from a record it was handed.** The renderer
 * downstream accepts any uppercase identifier, so a record carrying its own `env` field would let a
 * forged prescription for one knob write an arbitrary numeric config key. The binding is registry
 * property, and this accessor is the only sanctioned way to learn it — same reason
 * {@link knobRequiredContext} exists: adding or rebinding a leaf must not require editing the caller.
 * @param {String} knob
 * @returns {Array<{path: String, env: String}>} Empty for an unknown knob — gate on {@link isKnownKnob}.
 */
export function knobEnvBindings(knob) {
    return isKnownKnob(knob)
        ? RECOVERY_KNOBS[knob].leaves.map(leaf => ({path: leaf.path, env: leaf.env}))
        : []
}

/**
 * @summary The leaf paths a caller must resolve and pass as `context` before a knob can be validated.
 *
 * These are leaves the knob does not change but is bounded by. Exposed so the actuator can resolve
 * exactly what it needs without knowing which invariants exist — adding a bound to a knob therefore does
 * not require editing its caller.
 * @param {String} knob
 * @returns {String[]}
 */
export function knobRequiredContext(knob) {
    return isKnownKnob(knob) ? [...(RECOVERY_KNOBS[knob].requires ?? [])] : []
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
 * @param {Object} [options.context] Resolved values for the knob's `requires` leaves — the ones it does
 * not change but is bounded by. Supplied by the caller rather than read here, so this module stays pure
 * and a bound derived from another leaf is evaluated against that leaf's live value.
 * @returns {{valid: Boolean, violations: String[]}}
 */
export function validateKnobTransaction({knob, values, context} = {}) {
    const violations = [];

    if (!isKnownKnob(knob)) {
        return {valid: false, violations: [`unknown knob '${knob}' — the actuator turns only: ${Object.keys(RECOVERY_KNOBS).join(', ')}`]}
    }

    const {leaves, invariants, requires = []} = RECOVERY_KNOBS[knob],
          proposed                            = values  && typeof values  === 'object' ? values  : {},
          resolved                            = context && typeof context === 'object' ? context : {};

    // A bound the caller could not resolve is refused, not skipped. Silently dropping an unevaluable
    // invariant would make the widest transactions the easiest to authorize, which is backwards.
    for (const path of requires) {
        if (resolved[path] === undefined) {
            violations.push(`missing context '${path}' — knob '${knob}' is bounded by it and cannot be validated without it`);
        }
    }

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
            if (!invariant.holds(proposed, resolved)) {
                violations.push(`invariant '${invariant.id}' violated — ${invariant.reason}`);
            }
        }
    }

    return {valid: violations.length === 0, violations}
}
