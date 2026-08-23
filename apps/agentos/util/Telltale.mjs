import Base from '../../../src/core/Base.mjs';

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
 * - **`unknown` is an OBSERVATION, not a default**: the producer looked and could not see. It is a
 *   fact the operator must be told and is rendered verbatim — **in the DETAIL**. It is card-SILENT.
 * - **`null` is the absence of an observation** — the roster row carried no axis at all. Not a state,
 *   nothing to report. Same tri-state honesty as `openLaneCount`: un-stamped renders nothing rather
 *   than a fabricated zero.
 *
 * The distinction between the last two is the reason this module exists rather than a `?? 'unknown'`
 * at the call site: defaulting an absent axis to `unknown` would manufacture an observation nobody
 * made, and the detail would report blindness the producer never claimed.
 *
 * **Why `unknown` is card-silent:** a chip on `unknown` inverts the very density contract the chip
 * exists to serve. The throttle adapter ships a CONTRACT and a SEAM — it documents that no trustworthy
 * throttle truth source exists in the platform yet — so with no reader injected it honestly answers
 * `unknown` for EVERY row. Measured against the default adapter across three agents: three `unknown`s,
 * three chips, permanently. **A producer having landed is not the same as a producer being able to
 * see.** The honest-unknown rule is satisfied by the detail readout, which states every axis
 * unconditionally and has room for the producer's reason.
 *
 * The card therefore chips on an explicitly ENUMERATED deviation ({@link TELLTALE_CARD_DEVIANT}), not
 * on "not nominal". The difference is the whole point: "not nominal" silently promotes every future
 * state — and every state a producer cannot resolve — into a fleet-wide chip.
 */

/**
 * @summary The nominal value per axis — the only states that earn no pixels.
 * @type {Object}
 */
const TELLTALE_NOMINAL = Object.freeze({
    throttle: 'none',
    wake    : 'on'
});

/**
 * @summary The states that earn card pixels — an OBSERVED deviation the operator can act on.
 *
 * Enumerated rather than derived as "everything but nominal", because the two are only equivalent in
 * a world where every axis has a working truth source. `unknown` is a real observation and belongs in
 * the detail; on the card it would mean every agent chips until a throttle producer can see, which is
 * the density inversion the exception-based rule exists to prevent.
 * @type {Object}
 */
const TELLTALE_CARD_DEVIANT = Object.freeze({
    throttle: Object.freeze(['overage', 'rate-limited']),
    wake    : Object.freeze(['off', 'suppressed'])
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
 * Static Fleet wake/throttle telltale presentation utilities.
 * @class AgentOS.util.Telltale
 * @extends Neo.core.Base
 */
class Telltale extends Base {
    static TELLTALE_CARD_DEVIANT = TELLTALE_CARD_DEVIANT
    static TELLTALE_NOMINAL      = TELLTALE_NOMINAL

    static config = {
        /**
         * @member {String} className='AgentOS.util.Telltale'
         * @protected
         */
        className: 'AgentOS.util.Telltale'
    }

    /**
     * @summary Describes the FULL two-axis readout for the detail view.
     *
     * The card and the detail answer different questions, which is why this is not the chip with more
     * words. The card is **exception-based** — nominal earns zero pixels, because a roster of 20 cards
     * cannot spend one line each on "fine". The detail is showing ONE resident, so it states both axes
     * unconditionally: an operator who drilled in is asking "what is this agent's wake and throttle
     * state", and answering only the broken half leaves them unable to tell "wake is on" from "nobody
     * looked at wake".
     *
     * `reason` travels here and nowhere else. It is the producer's evidence — why it could not see — and
     * the chip has no room for it, so a degraded axis on the card is a prompt to drill in rather than a
     * dead end.
     *
     * @param {Object} options={}
     * @param {Object|null} [options.throttle] The record's throttle observation.
     * @param {Object|null} [options.wake] The record's wake observation.
     * @returns {Object[]} `[{axis, state, nominal, reported, reason}]` — always both axes, wake first.
     */
    static describeTelltaleReadout({throttle = null, wake = null} = {}) {
        return [
            ['wake', wake, Telltale.TELLTALE_NOMINAL.wake],
            ['throttle', throttle, Telltale.TELLTALE_NOMINAL.throttle]
        ].map(([axis, observation, nominalState]) => {
            const state = observedState(observation);

            return {
                axis,
                // `reported: false` is NOT a state — it says no observation exists for this axis, which
                // is why the view must render it as its own thing rather than borrowing 'unknown'. The
                // producer's 'unknown' means it looked; this means nobody did.
                reported: state !== null,
                state,
                nominal : state !== null && state === nominalState,
                reason  : observation?.reason ?? null
            }
        })
    }

    /**
     * @summary Describes the compound telltale chip for one record's two axes.
     *
     * Exactly ONE chip regardless of how many axes deviate — the card's density contract buys pixels with
     * exceptions, so two exceptions must not cost two chips. The full two-axis readout belongs in the
     * detail view, where there is room to say more than a chip can.
     *
     * Chips on an ENUMERATED deviation only ({@link TELLTALE_CARD_DEVIANT}). `unknown` and `null` are both
     * card-silent — for different reasons the detail keeps apart, and neither is a deviation the operator
     * can act on from a roster.
     *
     * **Every deviation names its axis**, in a fixed wake-before-throttle order. A bare `rate-limited`
     * saves six characters and costs the reader the question the chip exists to answer — and with two
     * axes drawing from disjoint vocabularies, an unlabelled state is only decodable by someone who has
     * memorised which words belong to which axis.
     *
     * `ariaLabel` names the deviations for a screen reader; `title` carries the FULL two-axis readout, so
     * the hover answers what the chip had no room for without a drill-in. Both are the Contract Ledger's
     * a11y row, and both are derived here rather than in the view: they are statements about the
     * taxonomy, and a second renderer must not be able to word them differently.
     *
     * @param {Object} options={}
     * @param {Object|null} [options.throttle] The record's throttle observation.
     * @param {Object|null} [options.wake] The record's wake observation.
     * @returns {{ariaLabel: String|null, hidden: Boolean, text: String, title: String|null}} `hidden`
     *     when nothing is worth reporting; `ariaLabel`/`title` are `null` exactly when hidden.
     */
    static describeTelltale({throttle = null, wake = null} = {}) {
        const
            wakeState     = observedState(wake),
            throttleState = observedState(throttle),
            // Membership, not negation. `state !== NOMINAL` reads as the same rule and is not: it chips on
            // `unknown`, on any out-of-contract producer value, and on every state added later — each of
            // which lands on every card at once. An enumerated set fails silent on the card and loud in
            // the detail, which is the right way round for a surface whose budget is pixels.
            reportable    = [
                Telltale.TELLTALE_CARD_DEVIANT.wake.includes(wakeState) ? `wake ${wakeState}` : null,
                Telltale.TELLTALE_CARD_DEVIANT.throttle.includes(throttleState) ? `throttle ${throttleState}` : null
            ].filter(Boolean),
            hidden        = reportable.length === 0;

        return {
            ariaLabel: hidden ? null : `Telltale: ${reportable.join(', ')}`,
            hidden,
            text     : reportable.join(' · '),
            // The full readout the chip could not fit — both axes, including the nominal and the blind
            // ones, worded exactly as the detail words them.
            title    : hidden ? null : Telltale.describeTelltaleReadout({throttle, wake})
                .map(({axis, reported, state}) => `${axis}: ${reported ? state : 'not reported'}`)
                .join(' · ')
        }
    }
}

export default Neo.setupClass(Telltale);
