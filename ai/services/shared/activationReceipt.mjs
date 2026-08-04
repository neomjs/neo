/**
 * @module ai/services/shared/activationReceipt
 * @summary The closure that decides whether a plane may be mutated: an activation is authorized only
 * by a receipt proving a fresh restorable result was observed BEFORE the first mutation, and every
 * other input refuses.
 *
 * **A guard that is merely reachable is bypassable.** `redeployPreflight` already decides correctly,
 * but it decides and returns — it leaves behind no artifact, so nothing downstream can tell "the
 * preflight passed" from "the preflight was never run". Any mutation path that simply does not call
 * it inherits no refusal. This module supplies the missing half: a receipt that must be produced and
 * presented, so the absence of proof is itself a refusal rather than a silence.
 *
 * **Scope boundary — this is enforceable, not yet enforced.** Everything here is a pure predicate
 * over values handed in. It does not write a receipt, store one, read a clock, or compel any caller
 * to consult it. Emission, durable storage and mandatory consumption live in the deploy path that
 * calls this; nothing in this module should be read as providing durability or provenance.
 *
 * **Two states, never three.** {@link authorizeActivation} returns `authorize` or `refuse` and
 * nothing else. Malformed receipts, unparsable timestamps, missing bindings and unrecognised verdicts
 * all map to `refuse` under distinct reasons. A "warn and proceed" outcome is not a weaker
 * authorization, it is the defect this exists to remove: the incident behind this work was a
 * destructive path that ran because nothing positively said no.
 *
 * **The receipt binds the CONTAINER CONFIG, not the image digest.** `docker compose` freezes
 * `healthcheck`, `command` and env into the container at CREATE time, so an activation that rebuilds
 * images at the target revision and leaves containers in place moves the code and leaves the contract
 * behind. Measured on our own plane: the image carried a merged healthcheck flag, the checkout carried
 * it, the revision label read current — and the running container's healthcheck predated the change,
 * because the container was created before it. A receipt bound to an image digest is SATISFIED by that
 * half-applied state, which is the third state this module's closure would otherwise admit through the
 * binding rather than through the decision.
 *
 * @see https://github.com/neomjs/neo/issues/16452
 */

/**
 * The only two outcomes. There is deliberately no `warn`, no `proceed-with-caution`, and no value
 * meaning "undecided" — an activation gate that can express uncertainty will eventually express it
 * into a running plane.
 * @type {Object}
 */
export const ACTIVATION_DECISION = Object.freeze({
    authorize: 'authorize',
    refuse   : 'refuse'
});

/**
 * Why an activation was refused. Distinct values because "no receipt was presented" and "a receipt was
 * presented and it was stale" are different operational facts, and an audit that cannot tell them
 * apart cannot answer whether a guard was bypassed or merely unsatisfied.
 * @type {Object}
 */
export const REFUSAL_REASON = Object.freeze({
    noReceipt             : 'no-receipt',
    preflightNotRestorable: 'preflight-not-restorable',
    receiptMalformed      : 'receipt-malformed',
    receiptNotPreMutation : 'receipt-not-pre-mutation',
    receiptStale          : 'receipt-stale',
    stageBindingMismatch  : 'stage-binding-mismatch',
    targetBindingMismatch : 'target-binding-mismatch'
});

/**
 * The single preflight verdict that can carry an activation. Any other code — and any absence of a
 * code — refuses.
 * @type {String}
 */
export const RESTORABLE_VERDICT = 'RESTORABLE';

/**
 * A complete ISO-8601 instant: full calendar date, full time, and an EXPLICIT zone designator.
 * Optional fractional seconds. Nothing shorter and nothing locale-shaped.
 * @type {RegExp}
 */
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

/**
 * @summary Whether these calendar fields describe a day that exists.
 *
 * Checked arithmetically rather than by round-tripping through `Date`, because the thing being
 * defended against is precisely `Date`'s willingness to normalize — and a validator built from the
 * normalizer inherits its blind spot.
 *
 * @param {Number} year
 * @param {Number} month 1-12.
 * @param {Number} day
 * @returns {Boolean}
 */
function isRealCalendarDay(year, month, day) {
    if (month < 1 || month > 12 || day < 1) {
        return false
    }

    const leap      = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0,
          monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    return day <= monthDays[month - 1]
}

/**
 * @summary Parses a PORTABLE ISO-8601 instant into epoch milliseconds, or `null` when the value is
 * not one.
 *
 * **`Date.parse` is not an instant validator and must not be used as one here.** It answers "can this
 * engine normalize the string", which is a different and much weaker question, and it fails this
 * module's contract in three ways that all end in `authorize`:
 *
 * - **It normalizes impossible dates rather than rejecting them.** `2026-02-30T10:00:00.000Z` — a day
 *   that does not exist — becomes `2026-03-02T10:00:00.000Z`, which is fresh against a March 2 clock.
 * - **It accepts locale and partial forms.** `'August 4, 2026 10:00:00 UTC'` parses; so does the bare
 *   string `'2026'`.
 * - **It reads a zone-less string as LOCAL time**, so the identical receipt authorizes on a UTC host
 *   and refuses on a UTC+2 one. Measured. A mutation-authority decision that depends on the
 *   consumer's `TZ` is not a decision.
 *
 * So the grammar is enforced first, the calendar day is verified arithmetically, and `Date.parse` is
 * used only to convert a value already proven well-formed.
 *
 * `null` rather than `NaN` or `0`, because both of those compare as numbers and would let an
 * unparsable timestamp participate in a freshness or ordering comparison instead of failing it.
 *
 * @param {String} value
 * @returns {Number|null}
 */
export function parseInstant(value) {
    if (typeof value !== 'string') {
        return null
    }

    const match = INSTANT_PATTERN.exec(value);

    if (!match) {
        return null
    }

    const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;

    if (!isRealCalendarDay(Number(year), Number(month), Number(day))) {
        return null
    }

    // Leap seconds are rejected rather than normalized: `Date` silently rolls `:60` into the next
    // minute, which would make two distinct written instants compare equal.
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
        return null
    }

    if (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) {
        return null
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @summary Assembles the receipt payload from what was actually observed.
 *
 * **In-memory only.** This constructs and shapes a value; it does not write, store, or timestamp
 * anything. Durability, provenance, and the clock that supplies `observedAt` belong to the emitting
 * caller, so calling this payload "durable" here would claim a guarantee no code in this module
 * provides.
 *
 * Takes no decision argument, for the same reason {@link module:ai/services/shared/captureReceipt}
 * does not: callers report observations, and the single derivation stays here so a second consumer
 * cannot invent a different reading of the same facts.
 *
 * @param {Object}       options
 * @param {String}       options.verdictCode           A `verifyLatestBackupRestorable` code.
 * @param {String}       options.observedAt            ISO instant the preflight result was observed.
 * @param {String}       options.stageReceiptId        Identity of the selected cohort candidate.
 * @param {String}       options.targetConfigDigest    Digest over the RESOLVED CONTAINER CONFIG.
 * @param {String|null} [options.bundleRoot=null]      Bundle the verdict was decided on.
 * @param {String|null} [options.composeProject=null]  Compose project the activation targets.
 * @returns {Object}
 */
export function buildActivationReceipt({
    verdictCode,
    observedAt,
    stageReceiptId,
    targetConfigDigest,
    bundleRoot     = null,
    composeProject = null
} = {}) {
    return {
        bundleRoot,
        composeProject,
        observedAt,
        preflightRestorable: verdictCode === RESTORABLE_VERDICT,
        stageReceiptId,
        targetConfigDigest,
        verdictCode        : verdictCode ?? null
    }
}

/**
 * @summary The closure. Authorizes a plane mutation, or refuses with a reason.
 *
 * Order is load-bearing. Presence is checked before shape, shape before content, and the
 * pre-mutation ordering before freshness — so a receipt minted DURING a mutation is reported as
 * `receipt-not-pre-mutation` rather than as whatever else it also happens to violate. A receipt that
 * arrives after the first mutation cannot be repaired by being recent.
 *
 * @param {Object}       options
 * @param {Object|null}  options.receipt                  The presented receipt, or `null`/absent.
 * @param {String}       options.selectedStageReceiptId   Identity the selection sub bound.
 * @param {String}       options.observedTargetConfigDigest Digest over the target's CURRENT resolved container config.
 * @param {String}       options.now                      ISO instant of this decision.
 * @param {Number}       options.maxReceiptAgeMs          How old a receipt may be and still carry an activation.
 * @param {String|null} [options.firstMutationAt=null]    ISO instant the first mutation occurred, when one has.
 * @returns {{decision: String, reason: String|null, receiptAgeMs: Number|null}}
 */
export function authorizeActivation({
    receipt,
    selectedStageReceiptId,
    observedTargetConfigDigest,
    now,
    maxReceiptAgeMs,
    firstMutationAt = null
} = {}) {
    const refuse = reason => ({decision: ACTIVATION_DECISION.refuse, reason, receiptAgeMs: null});

    if (!receipt || typeof receipt !== 'object') {
        return refuse(REFUSAL_REASON.noReceipt)
    }

    const observedInstant = parseInstant(receipt.observedAt),
          nowInstant      = parseInstant(now);

    // An unreadable clock on either side makes every downstream comparison meaningless. It is a
    // malformed receipt rather than a stale one: we cannot say it is old, only that we cannot say.
    if (observedInstant === null || nowInstant === null) {
        return refuse(REFUSAL_REASON.receiptMalformed)
    }

    if (typeof receipt.stageReceiptId !== 'string' || receipt.stageReceiptId.length === 0 ||
        typeof receipt.targetConfigDigest !== 'string' || receipt.targetConfigDigest.length === 0) {
        return refuse(REFUSAL_REASON.receiptMalformed)
    }

    if (receipt.preflightRestorable !== true || receipt.verdictCode !== RESTORABLE_VERDICT) {
        return refuse(REFUSAL_REASON.preflightNotRestorable)
    }

    // Checked BEFORE freshness. A receipt produced after the plane was already touched does not
    // describe the pre-transition state at all, and no amount of recency changes that.
    if (firstMutationAt !== null) {
        const mutationInstant = parseInstant(firstMutationAt);

        if (mutationInstant === null || observedInstant >= mutationInstant) {
            return refuse(REFUSAL_REASON.receiptNotPreMutation)
        }
    }

    const receiptAgeMs = nowInstant - observedInstant;

    // A future-dated receipt is not fresh, it is unexplained. Treated as stale rather than accepted,
    // because the alternative is that a clock skew or a forged instant buys unlimited validity.
    if (!Number.isFinite(maxReceiptAgeMs) || receiptAgeMs < 0 || receiptAgeMs > maxReceiptAgeMs) {
        return refuse(REFUSAL_REASON.receiptStale)
    }

    if (receipt.stageReceiptId !== selectedStageReceiptId) {
        return refuse(REFUSAL_REASON.stageBindingMismatch)
    }

    // The binding that distinguishes a complete activation from a half-applied one. Compared against
    // the target's RESOLVED CONTAINER CONFIG — never its image, revision label, or checkout, all
    // three of which read current while the running contract is stale.
    if (receipt.targetConfigDigest !== observedTargetConfigDigest) {
        return refuse(REFUSAL_REASON.targetBindingMismatch)
    }

    return {decision: ACTIVATION_DECISION.authorize, reason: null, receiptAgeMs}
}
