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
 * @see https://github.com/neomjs/neo/issues/16404
 */

/**
 * Did the source hold rows? A measurement, never a judgement.
 * @type {Object}
 */
export const ROW_STATE = Object.freeze({populated: 'populated', zero: 'zero'});

/**
 * Did the read reach everything the source claimed to hold?
 *
 * `partial` is deliberately ABSENT. Every partial read in this substrate is converted into a thrown
 * abort — `#exportCollection` throws `PARTIAL_COLLECTION_EXPORT` on `exported !== expected`, and the
 * graph exporter does the same — so no published bundle can carry it. A vocabulary value nothing can
 * emit is a promise the contract cannot keep; the value gets added when a producer exists AND the
 * publication contract authorizes a bounded read, not before.
 * @type {Object}
 */
export const READ_COMPLETENESS = Object.freeze({complete: 'complete', unavailable: 'unavailable'});

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
 * @summary Derives `empty` — the only verdict this module produces — from the three axes.
 *
 * **`empty` requires all three to line up: no rows, a complete read, and a continuous lineage.** Any
 * other combination leaves the facts standing rather than collapsing them, because every other
 * combination has a reading in which the corpus was fine:
 *
 * - `zero + complete + changed` — the source was replaced between captures. A promotion or restore
 *   does this deliberately; so does a loss. The receipt says which facts it saw and refuses to guess.
 * - `zero + complete + unknown` — nothing to compare against. First run looks exactly like this.
 * - `zero + unavailable + *` — the read did not complete, so the zero describes the read, not the store.
 * - `populated + *` — rows are self-evidencing; a source that returns rows was not empty.
 *
 * @param {Object} options
 * @param {String} options.rowState          A `ROW_STATE` value.
 * @param {String} options.readCompleteness  A `READ_COMPLETENESS` value.
 * @param {String} options.lineage           A `LINEAGE` value.
 * @returns {Boolean} Whether the facts support the single claim "this source was genuinely empty".
 */
export function derivesEmpty({rowState, readCompleteness, lineage} = {}) {
    return rowState         === ROW_STATE.zero
        && readCompleteness === READ_COMPLETENESS.complete
        && lineage          === LINEAGE.same
}

/**
 * @summary Assembles one source's receipt entry from its measured facts.
 *
 * Deliberately does NOT take a verdict argument. Callers supply what they observed; the derivation is
 * this module's and stays in one place, so a second consumer cannot invent a fourth reading of the
 * same three facts.
 *
 * @param {Object}       options
 * @param {String}       options.source        Stable label for the source (collection name / `native-graph`).
 * @param {Number}       options.rowCount      Rows the export actually wrote.
 * @param {Boolean}      options.readComplete  Whether the read reached everything the source claimed.
 * @param {String|null} [options.collectionId] Identity observed this capture; `null` when unobservable.
 * @param {String|null} [options.previousId]   Identity the comparison bundle recorded.
 * @param {String|null} [options.comparedBundle] Bundle name the comparison ran against.
 * @returns {Object} The receipt entry, carrying every fact plus the derived `empty` claim.
 */
export function buildSourceReceipt({
    source,
    rowCount,
    readComplete,
    collectionId   = null,
    previousId     = null,
    comparedBundle = null
} = {}) {
    const rowState         = Number.isFinite(rowCount) && rowCount > 0 ? ROW_STATE.populated : ROW_STATE.zero,
          readCompleteness = readComplete ? READ_COMPLETENESS.complete : READ_COMPLETENESS.unavailable,
          lineage          = deriveLineage({currentId: collectionId, previousId});

    return {
        source,
        rowCount: Number.isFinite(rowCount) ? rowCount : 0,
        rowState,
        readCompleteness,
        lineage,
        collectionId,
        comparedBundle,
        empty   : derivesEmpty({rowState, readCompleteness, lineage})
    }
}
