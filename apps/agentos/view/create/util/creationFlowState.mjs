/**
 * @module AgentOS.view.create.util.creationFlowState
 * @summary The keeper creation flow's transition TABLE — the five SSOT states and which
 * transitions between them are legal, as pure data-plane logic with zero DOM.
 *
 * Consumption contract (neo-core idiom, load-bearing): the flow state itself LIVES on the
 * create-module's `state.Provider` — provider `data` (e.g. `flowState`, `flowReason`) that
 * views consume via bindings, with the transition admitted or refused by consulting
 * {@link nextCreationState} at the ONE place that writes it. A provider — rather than a config
 * on one component — because the flow state has MANY consumers across the module's tree (chat
 * surface, blueprint preview, pane chrome, promote affordance): each gets a declarative `bind`
 * to the same truth instead of locating and reaching into a specific component. All of this
 * state lives in the shared app worker either way (windows are render targets — instances and
 * their configs are naturally window-agnostic), so the promote step works across windows for
 * free; the provider's contribution is the shared-binding surface, plus `stores_` exposure of
 * the created-instances registry. This module is that writer's ORACLE (which transitions are
 * legal — domain knowledge the class system does not provide); it is never a parallel state
 * store, and the view must not re-derive "which state" from a bag of booleans.
 *
 * The oracle mirrors the pipeline's refusal vocabulary: `nextCreationState` never throws — an
 * illegal transition returns the CURRENT state plus a reason, so the hook cancels the update
 * (neo core's return-`undefined`-from-beforeSet idiom) rather than corrupting state.
 *
 * The route outcome first drives the generating→preview fork: an accepted route result parks the
 * candidate and returns to COMPOSING; a refused one advances to ERROR carrying the refusal reason.
 * The accept-path outcome later drives the generating→terminal fork: only a successfully inserted
 * instance advances to MATERIALIZED.
 */

/**
 * @summary The five keeper-flow states (SSOT §"the five states").
 * @type {Object}
 */
export const CREATION_STATES = Object.freeze({
    EMPTY       : 'empty',        // the invitation — one affordance, no chrome
    COMPOSING   : 'composing',    // intent typed; blueprint previewed, not committed
    GENERATING  : 'generating',   // the blueprint runs the route; cancellable
    MATERIALIZED: 'materialized', // the app is a live docked panel; promotable
    ERROR       : 'error'         // generation failed / safety gate refused; always recoverable
});

/**
 * @summary The transition triggers. `accepted` / `refused` are the accept-path outcome fork;
 * the rest are user/lifecycle actions from the SSOT wedge flow.
 * @type {Object}
 */
export const CREATION_EVENTS = Object.freeze({
    COMPOSE  : 'compose',   // the user starts typing an intent
    SUBMIT   : 'submit',    // the intent/candidate enters a guarded route or accept step
    PREVIEWED: 'previewed', // the route returned a validated candidate for human confirmation
    ACCEPTED : 'accepted',  // the accept path inserted the blueprint into the stage
    REFUSED  : 'refused',   // the route/validator/accept path refused (carries a reason)
    EDIT     : 'edit',      // back to composing to refine words/blueprint
    RETRY    : 'retry',     // from ERROR, edit-and-retry
    RESET    : 'reset',     // clear back to the empty invitation
    DISPOSE  : 'dispose'    // the materialized panel is disposed
});

/**
 * @summary The legal transition table: `state → {event → nextState}`. Any (state, event) pair
 * absent here is an illegal transition and leaves the state unchanged with a reason.
 * @type {Object}
 */
const TRANSITIONS = Object.freeze({
    [CREATION_STATES.EMPTY]: Object.freeze({
        [CREATION_EVENTS.COMPOSE]: CREATION_STATES.COMPOSING
    }),
    [CREATION_STATES.COMPOSING]: Object.freeze({
        [CREATION_EVENTS.SUBMIT]: CREATION_STATES.GENERATING,
        [CREATION_EVENTS.EDIT]  : CREATION_STATES.COMPOSING, // refine in place
        [CREATION_EVENTS.RESET] : CREATION_STATES.EMPTY
    }),
    [CREATION_STATES.GENERATING]: Object.freeze({
        [CREATION_EVENTS.PREVIEWED]: CREATION_STATES.COMPOSING,
        [CREATION_EVENTS.ACCEPTED] : CREATION_STATES.MATERIALIZED,
        [CREATION_EVENTS.REFUSED]  : CREATION_STATES.ERROR,
        [CREATION_EVENTS.RESET]    : CREATION_STATES.EMPTY   // the cancellable path
    }),
    [CREATION_STATES.MATERIALIZED]: Object.freeze({
        [CREATION_EVENTS.EDIT]   : CREATION_STATES.COMPOSING, // mutate the live app via a follow-up
        [CREATION_EVENTS.DISPOSE]: CREATION_STATES.EMPTY,
        [CREATION_EVENTS.RESET]  : CREATION_STATES.EMPTY
    }),
    [CREATION_STATES.ERROR]: Object.freeze({
        [CREATION_EVENTS.RETRY]: CREATION_STATES.COMPOSING, // edit-and-retry — never a dead-end
        [CREATION_EVENTS.RESET]: CREATION_STATES.EMPTY
    })
});

const STATE_VALUES = Object.freeze(new Set(Object.values(CREATION_STATES)));
const EVENT_VALUES = Object.freeze(new Set(Object.values(CREATION_EVENTS)));

/**
 * @summary Pure transition: returns the next flow state for `(current, event)`, or the current
 * state plus a reason for an illegal / unknown transition. Never throws.
 *
 * When the event is `refused`, the caller's `reason` (the pipeline's refusal reason) is carried
 * through to the result so the ERROR render can show "always a reason"; on any legal transition
 * `reason` is null.
 *
 * @param {String} current One of {@link CREATION_STATES}
 * @param {String} event One of {@link CREATION_EVENTS}
 * @param {Object} [options]
 * @param {String} [options.reason] The refusal reason to carry on a `refused` transition
 * @returns {{state: String, reason: String|null, changed: Boolean}}
 */
export function nextCreationState(current, event, {reason} = {}) {
    if (!STATE_VALUES.has(current)) {
        return {state: CREATION_STATES.EMPTY, reason: `unknown state "${current}" — resetting to empty`, changed: true};
    }

    if (!EVENT_VALUES.has(event)) {
        return {state: current, reason: `unknown event "${event}"`, changed: false};
    }

    const target = TRANSITIONS[current][event];

    if (target === undefined) {
        return {state: current, reason: `"${event}" is not legal from "${current}"`, changed: false};
    }

    if (event === CREATION_EVENTS.REFUSED) {
        return {state: target, reason: reason || 'generation refused', changed: target !== current};
    }

    return {state: target, reason: null, changed: target !== current};
}

/**
 * @summary Maps an emit-side route outcome (`{accepted, reason, blueprint}`) to the preview fork
 * from GENERATING. Accepted means a validated candidate can render for human confirmation; refused
 * means the route/validator blocked it and the flow lands in ERROR with the refusal reason.
 * @param {String} current Should be GENERATING; any other state returns unchanged with a reason
 * @param {{accepted: Boolean, reason: String|null}} outcome The route result
 * @returns {{state: String, reason: String|null, changed: Boolean}}
 */
export function applyPreviewOutcome(current, outcome) {
    if (current !== CREATION_STATES.GENERATING) {
        return {state: current, reason: `preview outcome only resolves from generating, not "${current}"`, changed: false};
    }

    return outcome?.accepted
        ? nextCreationState(current, CREATION_EVENTS.PREVIEWED)
        : nextCreationState(current, CREATION_EVENTS.REFUSED, {reason: outcome?.reason});
}

/**
 * @summary Maps an accept-path / route outcome (`{accepted, reason}`) to the terminal transition
 * from GENERATING — the single fork the flow's whole safety story hinges on. A convenience over
 * `nextCreationState` so the Controller never re-implements the accepted/refused branch.
 * @param {String} current Should be GENERATING; any other state returns unchanged with a reason
 * @param {{accepted: Boolean, reason: String|null}} outcome The route/accept-path result
 * @returns {{state: String, reason: String|null, changed: Boolean}}
 */
export function applyRouteOutcome(current, outcome) {
    if (current !== CREATION_STATES.GENERATING) {
        return {state: current, reason: `route outcome only resolves from generating, not "${current}"`, changed: false};
    }

    return outcome?.accepted
        ? nextCreationState(current, CREATION_EVENTS.ACCEPTED)
        : nextCreationState(current, CREATION_EVENTS.REFUSED, {reason: outcome?.reason});
}
