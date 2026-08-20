/**
 * @summary Finds rows whose vectors were built from a provider-input format that is no longer current.
 *
 * **Why a scan and not a query.** The discriminator is the ABSENCE of a metadata field, and ChromaDB
 * has no `$exists` operator — a row missing a key is invisible to every `where` clause that mentions
 * that key, and `$ne` does not rescue it for the same reason. This repository has learned that four
 * times already and written it down each time:
 *
 * - `ai/scripts/migrations/backfillChromaSharedUserId.mjs` — untagged rows *"are invisible to ANY
 *   where-clause that mentions `userId` (no `$exists` operator)"*;
 * - `ai/services/memory-core/MemoryService.mjs` — *"ChromaDB does not support `$exists: false`,
 *   handled post-query"*, twice;
 * - `ai/services/memory-core/HealthService.mjs` — *"Chroma where-filters cannot reliably falsify
 *   absent metadata-key cases across versions, so this method scans metadata directly instead of
 *   inferring from `$ne`"*.
 *
 * A filtered version of this module would return zero affected rows against a corpus full of them
 * and read as a clean bill of health. That is the failure this lane keeps producing, so the shape is
 * a deliberate constraint rather than an implementation detail.
 *
 * **What the scan costs, stated rather than implied.** Detection reads metadata for every row in the
 * tenant's corpus — O(corpus), not a targeted lookup. The targeting this ticket buys is in what gets
 * RE-EMBEDDED, never in what gets scanned. At the existing page size a ~87k-chunk corpus is ~44
 * pages of metadata, which is negligible against the days of provider compute a full re-embed costs.
 *
 * Pure and storage-free: the caller supplies pages, this module classifies them. That keeps the
 * arithmetic testable without a Chroma daemon, which is the same split
 * `helpers/embeddingDispatchPlan` uses for the dispatch plan.
 *
 * @module ai/services/knowledge-base/helpers/staleEmbeddingCensus
 */

import {EMBEDDING_INPUT_FORMAT_ID, EMBEDDING_INPUT_FORMAT_METADATA_KEY}
                              from './embeddingInputFormat.mjs';

/**
 * @summary Why one row is considered stale, or `null` when it is current.
 *
 * Two causes, kept separate because they mean different things to an operator and because a merged
 * count cannot answer "did my repair run work?":
 *
 * - `pre-marker` — the field is absent. The row predates the marker, so its vector was built from an
 *   unknown format. This is the population a format change leaves behind.
 * - `format-changed` — the field is present and names a different format. The row was written by a
 *   known-but-superseded format, so a later change is detectable the same way the first one was.
 *
 * A row whose marker matches the current id returns `null` and is never selected. That is the
 * idempotence guarantee: a repaired row carries the current id, so a second pass skips it.
 *
 * @param {Object} [metadata] One row's stored metadata.
 * @param {String} [currentFormatId=EMBEDDING_INPUT_FORMAT_ID] The format identity to compare against.
 * @returns {String|null} `'pre-marker'`, `'format-changed'`, or `null` when current.
 */
export function classifyRowFormat(metadata, currentFormatId = EMBEDDING_INPUT_FORMAT_ID) {
    // A non-object row is treated as pre-marker rather than skipped. It cannot prove it carries the
    // current format, and the direction of a wrong answer matters: re-embedding a row that did not
    // need it costs compute, while skipping one that did leaves a stale vector nothing will ever
    // look at again.
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return 'pre-marker'
    }

    const stored = metadata[EMBEDDING_INPUT_FORMAT_METADATA_KEY];

    if (stored === undefined || stored === null || stored === '') {
        return 'pre-marker'
    }

    return stored === currentFormatId ? null : 'format-changed'
}

/**
 * @summary Folds scanned pages into a census: how many rows are stale, why, and which ids.
 *
 * **Ids are bounded and the bound is reported.** A corpus can have more affected rows than any
 * caller wants in one array, so `idLimit` caps what is collected while `staleCount` keeps counting.
 * A truncated list that did not say so would read as the complete work set, and a repair driven off
 * it would stop early while reporting success — the "no silent partial repair" failure in its
 * detection half.
 *
 * @param {Object} options
 * @param {Array<{id: String, metadata: Object}>} options.rows Scanned rows, in any order.
 * @param {String} [options.currentFormatId=EMBEDDING_INPUT_FORMAT_ID] Format identity to compare against.
 * @param {Number} [options.idLimit=1000] Maximum ids to collect.
 * @returns {{scannedCount: Number, staleCount: Number, currentCount: Number, byCause: Object, staleIds: String[], idsTruncated: Boolean}}
 */
export function foldStaleEmbeddingCensus({rows, currentFormatId = EMBEDDING_INPUT_FORMAT_ID, idLimit = 1000}) {
    const census = {
        scannedCount: 0,
        staleCount  : 0,
        currentCount: 0,
        byCause     : {'pre-marker': 0, 'format-changed': 0},
        staleIds    : [],
        idsTruncated: false
    };

    for (const row of rows || []) {
        census.scannedCount++;

        const cause = classifyRowFormat(row?.metadata, currentFormatId);

        if (cause === null) {
            census.currentCount++;
            continue
        }

        census.staleCount++;
        census.byCause[cause]++;

        if (census.staleIds.length < idLimit) {
            census.staleIds.push(row?.id)
        } else {
            census.idsTruncated = true
        }
    }

    return census
}

/**
 * @summary Merges two censuses, so a paginated scan can accumulate without re-folding everything.
 *
 * Exists because the page loop and the census have different owners: the loop knows how to page a
 * collection, this module knows what a page means. Merging in the loop by hand is how the two
 * drift.
 *
 * @param {Object} left Census so far.
 * @param {Object} right Census for the next page.
 * @param {Number} [idLimit=1000] Maximum ids the merged census may carry.
 * @returns {Object} Merged census.
 */
export function mergeStaleEmbeddingCensus(left, right, idLimit = 1000) {
    const staleIds = left.staleIds.concat(right.staleIds).slice(0, idLimit);

    return {
        scannedCount: left.scannedCount + right.scannedCount,
        staleCount  : left.staleCount + right.staleCount,
        currentCount: left.currentCount + right.currentCount,
        byCause     : {
            'pre-marker'    : left.byCause['pre-marker'] + right.byCause['pre-marker'],
            'format-changed': left.byCause['format-changed'] + right.byCause['format-changed']
        },
        staleIds,
        // Truncation is sticky AND re-derived: either input already overflowed, or the concatenation
        // did. Carrying only the inputs' flags would lose the case where two under-limit pages merge
        // into an over-limit list.
        idsTruncated: left.idsTruncated || right.idsTruncated ||
            (left.staleIds.length + right.staleIds.length) > idLimit
    }
}

/**
 * @summary The empty census, so a caller with zero pages reports a measurement rather than absence.
 * @returns {Object} A census with every counter at zero.
 */
export function emptyStaleEmbeddingCensus() {
    return {
        scannedCount: 0,
        staleCount  : 0,
        currentCount: 0,
        byCause     : {'pre-marker': 0, 'format-changed': 0},
        staleIds    : [],
        idsTruncated: false
    }
}
