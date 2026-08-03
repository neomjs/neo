/**
 * @module ai/services/shared/captureReceipt
 * @summary The vocabulary a backup receipt uses to say what a row count MEANS, and the single rule
 * that derives a verdict from it.
 *
 * A count of `0` answers "how many rows did I write". It does not answer "was there a corpus here",
 * and the two questions have the same answer shape. Live evidence: 4 of 36 bundles in one store carry
 * `expected: 0, exported: 0` with the message `"Export complete."`, across four separate dates.
 *
 * **Three facts, three axes — never one enum.** The predecessor of this module collapsed them onto a
 * single `captured | empty | unavailable` value and was Drop+Superseded for it. Collapsing means any
 * two of the facts cannot be stated at once, and it forced a changed collection identity to be read
 * as data loss. Neo's own re-embed disproves that reading: `VectorService` rebuilds the corpus into a
 * shadow collection and promotes it with a two-rename transaction — live → parking, shadow →
 * canonical — so **every healthy re-embed changes the canonical collection's identity with nothing
 * lost**. A restore does the same, by dropping and re-resolving. An identity that changes is a
 * statement about lineage; loss is a different proposition needing its own evidence.
 *
 * So the receipt records the facts orthogonally and derives exactly one thing from them.
 *
 * **Read completeness is NOT an axis here, and its absence is the same rule applied to itself.** An
 * earlier revision carried `readCompleteness: complete | unavailable`, and nothing in the substrate
 * could ever emit `unavailable`: `#exportCollection` throws `PARTIAL_COLLECTION_EXPORT` on
 * `exported !== expected` and the graph exporter does the same, so a partial read aborts the capture
 * and never reaches a receipt. A vocabulary value nothing can emit is a promise the contract cannot
 * keep — the reason `partial` was excluded in the first place — so the whole axis is gone until a
 * producer exists AND the publication contract authorizes a bounded read. Every published receipt
 * describes a complete read by construction; that guarantee lives in the abort, not in a field that
 * only ever prints one value.
 *
 * **This module answers PROVENANCE, not survivability, and its claim is named `provenEmpty` for it.**
 * It means "the facts establish there was genuinely nothing to capture". Whether a bundle carries
 * recoverable payload is a different proposition with a different owner —
 * {@link module:ai/services/memory-core/helpers/bundleIntegrity} — which classifies a zero-row export
 * as `status: 'empty'` and disqualifies it as a recovery source no matter WHY it is zero. The two
 * never contradict because they never claim the same thing: a `zero + changed` source is not
 * `provenEmpty` (the facts do not support the claim) and its bundle is still `empty` (nothing to
 * restore).
 *
 * **Why the lexical separation lands HERE and not on the older field.** Both blocks originally said
 * `empty` about the same zero, and the obvious repair was to rename the survivability status to
 * something like `zero-rows`. That was implemented, and it was wrong: `integrity[].status` is a
 * persisted wire value matched by exact string in readers that are already deployed, so a bundle
 * written with a new token reads to them as having no zero-row subsystem at all — `restorable: true`
 * for a bundle holding nothing. Compatibility is one-directional by construction. This field is the
 * one nothing has persisted yet, so it is the only one that can still be renamed for free, and it
 * absorbs the whole distinction.
 *
 * @see https://github.com/neomjs/neo/issues/16404
 */

/**
 * Did the source hold rows? A measurement, never a judgement.
 *
 * `unestablished` is the answer when the producer handed over something that is not a row count —
 * absent, `NaN`, `Infinity`, or negative. It is a THIRD answer on purpose: coercing a malformed
 * observation to `0` manufactures affirmative evidence of emptiness out of a broken instrument, which
 * is the same conflation this module exists to break, one layer earlier.
 * @type {Object}
 */
export const ROW_STATE = Object.freeze({
    populated    : 'populated',
    zero         : 'zero',
    unestablished: 'unestablished'
});

/**
 * Is this the same source that the comparison bundle observed?
 *
 * `unknown` is structural, not defensive: first run, a comparison bundle swept away by retention, and
 * any capture whose predecessor recorded no identity all land here honestly. It is what lets an
 * unmeasured event degrade instead of breaking the verdict.
 * @type {Object}
 */
export const LINEAGE = Object.freeze({same: 'same', changed: 'changed', unknown: 'unknown'});

/**
 * @summary Compares one source's identity against the same source in the previous published bundle.
 *
 * Identity, not name. The name is stable across a promotion by construction — that is what promotion
 * IS — so a name comparison would report continuity across exactly the event that breaks it.
 *
 * @param {Object}       options
 * @param {String|null} [options.currentId]  Identity observed during this capture.
 * @param {String|null} [options.previousId] Identity the comparison bundle recorded for the same source.
 * @returns {String} A `LINEAGE` value.
 */
export function deriveLineage({currentId = null, previousId = null} = {}) {
    if (!currentId || !previousId) {
        return LINEAGE.unknown
    }

    return currentId === previousId ? LINEAGE.same : LINEAGE.changed
}

/**
 * @summary Derives `provenEmpty` — the only verdict this module produces — from the recorded facts.
 *
 * **`provenEmpty` requires both axes to line up: a measured zero, and a continuous lineage.** Any
 * other combination leaves the facts standing rather than collapsing them, because every other
 * combination has a reading in which the corpus was fine:
 *
 * - `zero + changed` — the source was replaced between captures. A promotion or restore does this
 *   deliberately; so does a loss. The receipt says which facts it saw and refuses to guess.
 * - `zero + unknown` — nothing to compare against. First run looks exactly like this.
 * - `unestablished + *` — the count is not a measurement, so it cannot evidence a measurement's
 *   conclusion. A broken instrument reads as no evidence, never as evidence of nothing.
 * - `populated + *` — rows are self-evidencing; a source that returns rows was not empty.
 *
 * @param {Object} options
 * @param {String} options.rowState A `ROW_STATE` value.
 * @param {String} options.lineage  A `LINEAGE` value.
 * @returns {Boolean} Whether the facts support the single claim "this source was genuinely empty".
 */
export function derivesProvenEmpty({rowState, lineage} = {}) {
    return rowState === ROW_STATE.zero
        && lineage  === LINEAGE.same
}

/**
 * @summary Assembles one source's receipt entry from its measured facts.
 *
 * Deliberately does NOT take a verdict argument. Callers supply what they observed; the derivation is
 * this module's and stays in one place, so a second consumer cannot invent a fourth reading of the
 * same three facts.
 *
 * **A malformed count is rejected, never repaired.** Absent, `NaN`, `Infinity` and negative values do
 * not describe a number of rows, so they cannot stand in for one: they classify as
 * `ROW_STATE.unestablished`, and `rowCount` reports the raw finite observation or `null` when the
 * producer supplied nothing a number could be read from. An earlier revision coalesced all four to
 * `0`, which let a broken exporter plus an unchanged identity derive `empty: true` — a positive claim
 * of emptiness assembled entirely out of the absence of evidence.
 *
 * @param {Object}       options
 * @param {String}       options.source        Stable label for the source (collection name / `native-graph`).
 * @param {Number}       options.rowCount      Rows the export actually wrote.
 * @param {String|null} [options.collectionId] Identity observed this capture; `null` when unobservable.
 * @param {String|null} [options.previousId]   Identity the comparison bundle recorded.
 * @param {String|null} [options.comparedBundle] Bundle name the comparison ran against.
 * @returns {Object} The receipt entry, carrying every fact plus the derived `provenEmpty` claim.
 */
export function buildSourceReceipt({
    source,
    rowCount,
    collectionId   = null,
    previousId     = null,
    comparedBundle = null
} = {}) {
    const measured = Number.isFinite(rowCount) && rowCount >= 0,
          lineage  = deriveLineage({currentId: collectionId, previousId});

    let rowState;

    if (!measured) {
        rowState = ROW_STATE.unestablished
    } else {
        rowState = rowCount > 0 ? ROW_STATE.populated : ROW_STATE.zero
    }

    return {
        source,
        rowCount   : Number.isFinite(rowCount) ? rowCount : null,
        rowState,
        lineage,
        collectionId,
        comparedBundle,
        provenEmpty: derivesProvenEmpty({rowState, lineage})
    }
}
