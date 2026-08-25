/**
 * @summary Rebuilds the provider input for a stored row, so a stale vector can be re-embedded by id.
 *
 * **Why a row can be repaired at all.** `helpers/chunkRowMetadata.buildChunkRowMetadata` copies every
 * chunk field into the row's metadata, and the upsert stores no `documents` — so the provider input
 * is not on the row, but the fields it is built from are. This module inverts that copy for exactly
 * the fields {@link buildEmbeddingInputText} reads, which is what lets a repair target ids from the
 * census instead of advancing `parserVersion` and re-embedding the whole corpus.
 *
 * **The inversion is not free, and getting it wrong is silent.** The writer serialises `null` as the
 * STRING `'null'`. Replayed literally, a chunk whose `className` was null rebuilds as the truthy
 * `'null'`, and `chunk.className || ''` yields `in null` where the original produced `in `. The
 * repaired row would then carry a current marker over a vector built from a string no ingestion ever
 * produced — undetectable by construction, and strictly worse than the stale vector it replaced.
 * So the reversal is a correctness requirement, not tidiness: see {@link rebuildChunkFromRowMetadata}.
 *
 * Pure and storage-free, matching the split `helpers/staleEmbeddingCensus` uses: the caller supplies
 * rows, this module decides what their provider input should be. That keeps the fidelity property
 * testable without a Chroma daemon or a provider.
 *
 * @module ai/services/knowledge-base/helpers/staleEmbeddingRepair
 */

import {
    buildEmbeddingInputText,
    EMBEDDING_INPUT_CHUNK_FIELDS,
    EMBEDDING_INPUT_FORMAT_METADATA_KEY
}                          from './embeddingInputFormat.mjs';
import {classifyRowFormat} from './staleEmbeddingCensus.mjs';

// The projected field set is the FORMAT's, imported rather than restated. A copy here would be a
// second authority: a field the format starts reading would change the format id (marking rows
// stale) while this projection dropped it, so the repair would write a vector built from a string
// ingestion never produces — a current marker over a wrong vector, invisible to every census.
export {EMBEDDING_INPUT_CHUNK_FIELDS};

/**
 * @summary Inverts the row-metadata copy for the fields the provider-input format reads.
 *
 * `'null'` maps back to `null` because that is what the writer serialised, and the difference is
 * load-bearing rather than cosmetic — see the module docblock. The one irreducible ambiguity is a
 * chunk field whose genuine value was the string `'null'`: it was truthy when the vector was first
 * built and becomes falsy here. That case is pathological (a `className` literally named `null`),
 * it is recorded rather than guessed at, and {@link planStaleEmbeddingRepair} does not attempt to
 * detect it — no information survives on the row that could.
 *
 * Fields absent from the metadata stay absent rather than becoming `undefined` keys, so a rebuilt
 * chunk compares equal to the branch the format actually took.
 *
 * @param {Object} [metadata] One row's stored metadata.
 * @returns {Object} A chunk-shaped object carrying only the format-relevant fields.
 */
export function rebuildChunkFromRowMetadata(metadata) {
    const chunk = {};

    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return chunk
    }

    for (const field of EMBEDDING_INPUT_CHUNK_FIELDS) {
        if (!Object.hasOwn(metadata, field)) {
            continue
        }

        const value = metadata[field];

        chunk[field] = (value === 'null') ? null : value
    }

    return chunk
}

/**
 * @summary Builds the provider input a stored row's vector SHOULD have been built from.
 * @param {Object} [metadata] One row's stored metadata.
 * @returns {String} Provider input text under the current format.
 */
export function rebuildEmbeddingInputFromRowMetadata(metadata) {
    return buildEmbeddingInputText(rebuildChunkFromRowMetadata(metadata));
}

/**
 * @summary Selects the rows a repair run should re-embed, and the text to send for each.
 *
 * Selection reuses {@link classifyRowFormat} rather than restating the predicate, so the repair can
 * never target a population the census does not report — the two numbers an operator compares before
 * and after have to come from one instrument, or "repaired" is an inference.
 *
 * A row that classifies as current is skipped, which is the idempotence primitive end to end: a
 * repaired row carries the current marker, so a second run selects nothing and a bounded repair
 * cannot become a loop that spends provider compute forever.
 *
 * `emptyInput` rows are reported rather than embedded. A chunk with no name and no body rebuilds to
 * a header-only string; embedding it would spend provider compute to store a vector of nothing and
 * then stamp it current, which would hide the row from every future census.
 *
 * @param {Object} options
 * @param {Array<{id: String, metadata: Object}>} options.rows Scanned rows, in any order.
 * @param {String} [options.currentFormatId] Format identity to compare against.
 * @param {Number} [options.limit=Infinity] Maximum rows to select for one run.
 * @returns {{targets: Array<{id: String, text: String, cause: String}>, selectedCount: Number, skippedCurrentCount: Number, emptyInputIds: String[], limitReached: Boolean}}
 */
export function planStaleEmbeddingRepair({rows, currentFormatId, limit = Infinity}) {
    const plan = {
        targets            : [],
        selectedCount      : 0,
        skippedCurrentCount: 0,
        emptyInputIds      : [],
        limitReached       : false
    };

    for (const row of rows || []) {
        const cause = currentFormatId === undefined
            ? classifyRowFormat(row?.metadata)
            : classifyRowFormat(row?.metadata, currentFormatId);

        if (cause === null) {
            plan.skippedCurrentCount++;
            continue
        }

        if (plan.targets.length >= limit) {
            plan.limitReached = true;
            continue
        }

        const chunk = rebuildChunkFromRowMetadata(row?.metadata);

        // Decided on the FIELDS, not by pattern-matching the rendered string. The format interpolates
        // missing fields as `undefined`, so a row with nothing on it renders as
        // `undefined: undefined in ` — a non-empty string that a text-shape check reads as embeddable.
        // A row with no name and no body cannot produce a meaningful vector, and embedding it would
        // spend provider compute to store a vector of nothing and then stamp it current, hiding the
        // row from every future census.
        if (!chunk.name && !chunk.description && !chunk.content) {
            plan.emptyInputIds.push(row?.id);
            continue
        }

        const text = rebuildEmbeddingInputFromRowMetadata(row?.metadata);

        plan.targets.push({id: row?.id, text, cause});
        plan.selectedCount++
    }

    return plan
}

/**
 * @summary Whether a row's stored marker already names the current format.
 * @param {Object} [metadata] One row's stored metadata.
 * @param {String} currentFormatId The format identity to compare against.
 * @returns {Boolean} True when the row needs no repair.
 */
export function rowCarriesCurrentFormat(metadata, currentFormatId) {
    return metadata?.[EMBEDDING_INPUT_FORMAT_METADATA_KEY] === currentFormatId;
}
