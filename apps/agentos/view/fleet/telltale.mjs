/**
 * @summary The S2 telltale contract: two orthogonal observation axes, one compound chip.
 *
 * The incident this answers had BOTH failures at once — the wake daemon hand-disabled AND a session
 * rate limit — and neither was visible in the cockpit. That is why the axes are orthogonal and never
 * collapse into one enum: a single state field can only report one of two simultaneous truths, and
 * the operator needed both.
 *
 * Three values, three different facts, and the whole contract is keeping them apart:
 *
 * - **nominal** (`wake: on` · `throttle: none`) earns ZERO card pixels — the density contract's rule.
 * - **`unknown` is an OBSERVATION, not a default**: the producer looked and could not see. It is
 *   non-nominal and earns a chip, because "we cannot see this agent's wake state" is a fact the
 *   operator must be told, and rendering it as healthy is the failure mode the whole taxonomy exists
 *   to prevent.
 * - **`null` is the absence of an observation** — the roster row carried no axis at all. Not a state,
 *   nothing to report, no chip. Same tri-state honesty as `openLaneCount`: un-stamped renders nothing
 *   rather than a fabricated zero.
 *
 * The distinction between the last two is the reason this module exists rather than a `?? 'unknown'`
 * at the call site: defaulting an absent axis to `unknown` would manufacture an observation nobody
 * made, and the card would report blindness the producer never claimed.
 */

/**
 * @summary The nominal value per axis — the only states that earn no pixels.
 * @type {Object}
 */
export const TELLTALE_NOMINAL = Object.freeze({
    throttle: 'none',
    wake    : 'on'
});

/**
 * @summary Reads one axis' observed state, or `null` when the row carried no observation.
 * @param {Object|null} axis The record's `{source, state, confidence, reason?}` observation.
 * @returns {String|null}
 * @private
 */
function observedState(axis) {
    const state = axis?.state;

    return typeof state === 'string' && state.length ? state : null
}

/**
 * @summary Describes the compound telltale chip for one record's two axes.
 *
 * Exactly ONE chip regardless of how many axes are non-nominal — the card's density contract buys
 * pixels with exceptions, so two exceptions must not cost two chips. The full two-axis readout
 * belongs in the detail view, where there is room to say more than a chip can.
 *
 * @param {Object} options={}
 * @param {Object|null} [options.throttle] The record's throttle observation.
 * @param {Object|null} [options.wake] The record's wake observation.
 * @returns {{hidden: Boolean, text: String}} `hidden` when nothing is worth reporting.
 */
export function describeTelltale({throttle = null, wake = null} = {}) {
    const
        wakeState     = observedState(wake),
        throttleState = observedState(throttle),
        // An axis is reportable only when it was OBSERVED and the observation is not nominal. The two
        // guards are separate on purpose: `null` short-circuits because there is no observation to
        // judge, while a present-but-nominal state is judged and found unremarkable.
        reportable    = [
            wakeState !== null && wakeState !== TELLTALE_NOMINAL.wake ? `wake ${wakeState}` : null,
            throttleState !== null && throttleState !== TELLTALE_NOMINAL.throttle ? throttleState : null
        ].filter(Boolean);

    return {
        hidden: reportable.length === 0,
        text  : reportable.join(' · ')
    }
}
