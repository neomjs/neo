/**
 * Memory Core stored-embedding repair — extraction-with-re-embed.
 *
 * Memory Core Chroma collections suffer metadata/vector-index DIVERGENCE: many metadata rows are
 * present (and queryable via the vectors that DO exist), but their stored vectors are absent from the
 * HNSW persisted index, so `collection.get({include:['embeddings']})` fails `Error finding id` for those
 * ids (e.g. neo-agent-memory had ~13,917 of 18,848 vectors missing). `defragChromaDB`'s
 * shadow/parking promotion is therefore DISABLED for MC, because it extracts via `include:['embeddings']`.
 *
 * This module supplies the missing extraction half: partition each collection's ids into intact-vector
 * vs missing-vector, extract intact rows with their stored embeddings, and **re-embed** the missing-vector
 * rows from their DOCUMENTS (which still materialize — only the embedding fetch fails). Recovered batches
 * can either be retained in a merged `{ids, embeddings, documents, metadatas}` buffer or streamed into a
 * resumable shadow collection. A missing-vector row with no recoverable document/embedding is reported as
 * a structured `unrecoverable` entry (`{id, reason, message?}`; counts surfaced, never silently dropped —
 * the fail-loud discipline).
 *
 * The live shadow run + canonical promotion is operator/env-gated (out of scope without
 * explicit authorization); this module is the pure extraction logic, unit-tested against mocked Chroma.
 *
 * @module Neo.ai.scripts.maintenance.repairMemoryCoreStoredEmbeddings
 * @plane in-plane
 */

import {bytesToTokens}              from '../../services/memory-core/helpers/consumerFrictionHelper.mjs';
import {resolveTurnDocumentForRead} from '../../services/memory-core/helpers/turnDocumentText.mjs';

/**
 * @summary Extracts a Memory Core collection's data for a shadow rebuild, RE-EMBEDDING the rows whose
 * stored vectors are missing from the HNSW index.
 *
 * Intact-vector rows keep their stored embeddings. Missing-vector rows are re-embedded from their
 * documents via `embedFn`. A missing-vector row that returns no document (or is absent from the
 * metadata read) is `unrecoverable` — surfaced with reason metadata and counts, not dropped.
 *
 * @param {Object}     options
 * @param {Object}     options.collection       Chroma collection handle (`.get({ids, include})`).
 * @param {String[]}   options.allIds           Every metadata id in the collection (from the coverage audit).
 * @param {String[]}   options.missingVectorIds Ids whose vectors are absent from the HNSW index (coverage audit).
 * @param {Function}   options.embedFn          `(documents: String[]) => Promise<Number[][]>` — re-embed a batch
 *                                               (e.g. `TextEmbeddingService.embedTexts` bound to the MC provider).
 * @param {Number}     [options.batchSize=1000] Chroma `.get` / embed batch size.
 * @param {String[]}   [options.skipIds=[]] IDs already durably loaded into a resumable shadow collection.
 * @param {Boolean}    [options.collectData=true] False streams batches through `onDataBatch` without retaining all vectors in memory.
 * @param {Function}   [options.onDataBatch] Optional async sink for each recovered batch.
 * @param {Function}   [options.onProgress] Optional callback receiving 10%-bucket progress events:
 *                                           `{phase, percent, processed, total, counts}`.
 * @returns {Promise<Object>} Extraction result with data buffers, structured unrecoverable entries,
 *   an ids-only `unrecoverableIds` projection, and repair counts.
 */
export async function extractMemoryCoreCollectionData({
    collection,
    allIds = [],
    missingVectorIds = [],
    embedFn,
    batchSize = 1000,
    skipIds = [],
    collectData = true,
    onDataBatch,
    onProgress
} = {}) {
    if (typeof embedFn !== 'function') {
        throw new Error('extractMemoryCoreCollectionData: embedFn (documents -> embeddings) is required');
    }

    const missingSet = new Set(missingVectorIds);
    const skipSet    = new Set(skipIds);
    const intactIds  = allIds.filter(id => !missingSet.has(id) && !skipSet.has(id));
    const missingIds = missingVectorIds.filter(id => !skipSet.has(id));
    const data       = {ids: [], embeddings: [], documents: [], metadatas: []};
    const counts     = {total: allIds.length, intact: 0, reEmbedded: 0, unrecoverable: 0};

    if (skipSet.size > 0) {
        counts.resumedExisting = skipSet.size;
    }

    const reportIntactProgress  = createTenPercentProgressReporter({phase: 'intact-extract', total: intactIds.length, onProgress});
    const reportMissingProgress = createTenPercentProgressReporter({phase: 'missing-reembed', total: missingIds.length, onProgress});

    onProgress?.({phase: 'start', percent: 0, processed: 0, total: allIds.length, counts: {...counts}});

    async function emitDataBatch(batchData) {
        if (batchData.ids.length === 0) {
            return
        }

        if (collectData) {
            data.ids.push(...batchData.ids);
            data.embeddings.push(...batchData.embeddings);
            data.documents.push(...batchData.documents);
            data.metadatas.push(...batchData.metadatas);
        }

        if (typeof onDataBatch === 'function') {
            await onDataBatch(batchData, {counts: {...counts}});
        }
    }

    // 1. Intact rows — extract with their stored embeddings (these vectors exist in the HNSW index).
    for (let i = 0; i < intactIds.length; i += batchSize) {
        const batchIds  = intactIds.slice(i, i + batchSize);
        const got       = await collection.get({ids: batchIds, include: ['embeddings', 'documents', 'metadatas']});
        const batchData = {ids: [], embeddings: [], documents: [], metadatas: []};

        for (let j = 0; j < (got.ids?.length || 0); j++) {
            batchData.ids.push(got.ids[j]);
            batchData.embeddings.push(got.embeddings[j]);
            batchData.documents.push(got.documents?.[j] ?? '');
            batchData.metadatas.push(got.metadatas?.[j] ?? {});
            counts.intact++;
        }

        await emitDataBatch(batchData);
        reportIntactProgress({processed: Math.min(i + batchIds.length, intactIds.length), counts});
    }

    // 2. Missing-vector rows — re-embed from documents (their stored embeddings cannot be fetched).
    const unrecoverable = [];

    for (let i = 0; i < missingIds.length; i += batchSize) {
        const batchIds = missingIds.slice(i, i + batchSize);
        // documents + metadatas DO materialize for missing-vector ids; only `embeddings` fails.
        const got      = await collection.get({ids: batchIds, include: ['documents', 'metadatas']});
        const returned = new Set(got.ids || []);

        // An id that did not even come back from the metadata read is unrecoverable.
        for (const id of batchIds) {
            if (!returned.has(id)) {
                recordUnrecoverable({
                    unrecoverable,
                    counts,
                    id,
                    reason : 'metadata-row-missing',
                    message: 'id was absent from the Chroma documents/metadatas read'
                });
            }
        }

        const reEmbedIds = [], reEmbedDocs = [], reEmbedMetas = [];

        for (let j = 0; j < (got.ids?.length || 0); j++) {
            // Field↔document de-dup: a dropped turn-document (falsy doc + turn metadata) is reconstructed
            // from its split metadata so its missing vector is recovered, not marked unrecoverable. Non-turn
            // rows and present documents are unchanged — the empty/missing classification below still applies.
            let doc = got.documents?.[j];
            if (!doc && got.metadatas?.[j]?.type === 'agent-interaction') {
                doc = resolveTurnDocumentForRead({documents: [], metadata: got.metadatas[j]});
            }
            const documentProblem = getDocumentProblem(doc);

            if (documentProblem) {
                recordUnrecoverable({
                    unrecoverable,
                    counts,
                    id     : got.ids[j],
                    reason : documentProblem.reason,
                    message: documentProblem.message
                });
                continue;
            }
            reEmbedIds.push(got.ids[j]);
            reEmbedDocs.push(doc);
            reEmbedMetas.push(got.metadatas?.[j] ?? {});
        }

        if (reEmbedDocs.length > 0) {
            const {embeddings, failedIndexes, failures} = await embedRecoverableDocuments({embedFn, ids: reEmbedIds, documents: reEmbedDocs});
            const batchData                             = {ids: [], embeddings: [], documents: [], metadatas: []};

            for (const failure of failures) {
                recordUnrecoverable({
                    unrecoverable,
                    counts,
                    id     : reEmbedIds[failure.index],
                    reason : failure.reason,
                    message: failure.message
                });
            }

            for (let j = 0; j < reEmbedIds.length; j++) {
                if (failedIndexes.has(j)) {
                    continue;
                }

                batchData.ids.push(reEmbedIds[j]);
                batchData.embeddings.push(embeddings[j]);
                batchData.documents.push(reEmbedDocs[j]);
                batchData.metadatas.push(reEmbedMetas[j]);
                counts.reEmbedded++;
            }

            await emitDataBatch(batchData);
        }

        reportMissingProgress({processed: Math.min(i + batchIds.length, missingIds.length), counts});
    }

    onProgress?.({phase: 'complete', percent: 100, processed: allIds.length, total: allIds.length, counts: {...counts}});

    return {
        data,
        unrecoverable,
        unrecoverableIds: unrecoverable.map(entry => entry.id),
        counts
    };
}

/**
 * @summary Records one unrecoverable row while keeping the fail-loud counter in sync.
 * @param {Object} options
 * @param {Array} options.unrecoverable Mutable structured unrecoverable entry buffer.
 * @param {Object} options.counts Mutable extraction counters.
 * @param {String} options.id Row id.
 * @param {String} options.reason Stable reason code.
 * @param {String} [options.message] Operator-readable reason detail.
 * @returns {void}
 */
function recordUnrecoverable({unrecoverable, counts, id, reason, message} = {}) {
    unrecoverable.push(createUnrecoverableEntry({id, reason, message}));
    counts.unrecoverable++;
}

/**
 * @summary Creates the structured unrecoverable row shape consumed by defrag diagnostics.
 * @param {Object} options
 * @param {String} options.id Row id.
 * @param {String} options.reason Stable reason code.
 * @param {String} [options.message] Operator-readable reason detail.
 * @returns {Object} Structured unrecoverable row entry.
 */
function createUnrecoverableEntry({id, reason, message} = {}) {
    const entry = {id, reason};

    if (message) {
        entry.message = message;
    }

    return entry
}

/**
 * @summary Classifies missing-vector rows whose documents cannot be re-embedded.
 * @param {*} document Document value returned by Chroma.
 * @returns {{reason: String, message: String}|null}
 */
function getDocumentProblem(document) {
    if (document === null || document === undefined) {
        return {
            reason : 'document-missing',
            message: 'document field was missing from the Chroma metadata read'
        }
    }

    if (typeof document !== 'string') {
        return {
            reason : 'document-invalid',
            message: `document field was ${typeof document}, expected string`
        }
    }

    if (document.trim().length === 0) {
        return {
            reason : 'document-empty',
            message: 'document field was empty'
        }
    }

    return null
}

/**
 * @summary Embeds a batch; on failure, binary-splits to isolate the failing document(s) and re-batches the survivors.
 * @param {Object} options
 * @param {Function} options.embedFn Embedding function.
 * @param {String[]} options.ids Row ids paired with `documents`.
 * @param {String[]} options.documents Documents to embed.
 * @returns {Promise<{embeddings: Number[][], failedIndexes: Set<Number>,
 *                    failures: Array<{index: Number, reason: String, message: String}>}>}
 */
export async function embedRecoverableDocuments({embedFn, ids, documents} = {}) {
    const embeddings = new Array(documents.length);
    const failures   = [];

    // Embed the widest range that succeeds as a single batch; on failure, binary-split to isolate
    // the failing document(s) and RE-BATCH the survivors — rather than degrading the whole batch to
    // 1-by-1 single embeds, which forfeits the provider's batch parallelism on the failure path
    // (the graph-recovery slowdown a single oversized doc caused). Failures stay attributed to their
    // exact source index. Common case (few bad docs in a batch): O(log n) extra batch calls vs the
    // old O(n) singles; pathological all-fail is bounded near ~2x calls — an acceptable trade for
    // the far-more-common single-bad-apple path.
    await embedRange(0, documents.length);

    return {embeddings, failedIndexes: new Set(failures.map(failure => failure.index)), failures};

    async function embedRange(start, end) {
        const slice = documents.slice(start, end);

        if (slice.length === 0) {
            return;
        }

        try {
            const vectors = await embedFn(slice);

            if (!Array.isArray(vectors) || vectors.length !== slice.length) {
                throw createEmbeddingResultError(`embedFn returned ${Array.isArray(vectors) ? vectors.length : 'non-array'} embeddings for ${slice.length} documents`);
            }

            for (let i = 0; i < slice.length; i++) {
                embeddings[start + i] = vectors[i];
            }
        } catch (error) {
            if (slice.length === 1) {
                failures.push({
                    index  : start,
                    reason : getEmbeddingFailureReason(error),
                    message: error?.message || String(error)
                });
                return;
            }

            const mid = start + Math.floor(slice.length / 2);
            await embedRange(start, mid);
            await embedRange(mid, end);
        }
    }
}

/**
 * @summary Creates a provider-result shape error that can survive batch-to-single isolation.
 * @param {String} message Error message.
 * @returns {Error}
 */
function createEmbeddingResultError(message) {
    const error = new Error(message);

    error.unrecoverableReason = 'embedding-result-malformed';

    return error
}

/**
 * @summary Maps a per-document embedding failure to a stable unrecoverable reason code.
 * @param {Error} error Provider or shape error.
 * @returns {String}
 */
function getEmbeddingFailureReason(error) {
    return error?.unrecoverableReason || 'embedding-provider-error'
}

/**
 * @summary Truncates a UTF-8 string to at most `maxBytes` bytes without ever splitting a multi-byte char.
 * Pure; the byte-budget primitive under {@link truncateToEmbedTokenBudget}.
 *
 * @param {String} text The source string.
 * @param {Number} maxBytes Maximum UTF-8 byte length.
 * @returns {String} `text` unchanged when already within budget, else the longest char-aligned prefix that fits.
 */
export function truncateToByteBudget(text, maxBytes) {
    const buffer = Buffer.from(text, 'utf8');

    if (buffer.length <= maxBytes) {
        return text;
    }

    let end = Math.max(0, maxBytes);

    // A UTF-8 continuation byte matches 0b10xxxxxx; back off so a multi-byte char is never cut in half.
    while (end > 0 && (buffer[end] & 0xC0) === 0x80) {
        end--;
    }

    return buffer.subarray(0, end).toString('utf8');
}

/**
 * Safety margin on the truncate budget. `bytesToTokens` (≈3 bytes/token) UNDER-estimates tokens for dense
 * content (CJK/emoji run fewer bytes/token), so a naive prefix sized at the raw estimate can still exceed
 * the real provider budget. Shaving the byte budget lands a dense prefix safely under budget — raising
 * dense-content recovery instead of degrading it to `unrecoverable`.
 * @type {Number}
 */
const EMBED_TRUNCATE_SAFETY_FACTOR = 0.9;

/**
 * @summary Truncates a document to a context-bounded prefix that fits the embedding token budget, so an
 * oversized Memory Core document gets *a* (slightly lossy) vector and stays searchable rather than falling
 * out of recovery as `unrecoverable`.
 *
 * This is the truncate-to-context FLOOR: it eliminates the oversized-document `unrecoverable` class with
 * minimal blast by embedding a bounded prefix. The trade-off is fidelity — the document's tail is dropped;
 * the higher-fidelity chunk-and-aggregate strategy (embed each chunk, store sub/aggregate vectors) is a
 * deferred follow-up. A genuinely-unembeddable document (empty, or a truncated prefix the provider still
 * rejects) is unaffected here and degrades cleanly to the existing `unrecoverable` classification.
 *
 * The token estimate reuses the shared {@link bytesToTokens} heuristic (the SSOT for the bytes→tokens
 * ratio) and derives the byte budget from that same ratio, so the heuristic is never re-implemented.
 * No-op (returns `text`) when already within budget or when `maxTokens` is not a positive number.
 *
 * @param {String} text The document to embed.
 * @param {Number} maxTokens The embedding token budget (e.g. `AiConfig.localModels.embedding.safeProcessingLimitTokens`).
 * @returns {String} `text` when within budget, else a char-aligned prefix estimated to fit `maxTokens`.
 */
export function truncateToEmbedTokenBudget(text, maxTokens) {
    if (typeof text !== 'string' || !Number.isFinite(maxTokens) || maxTokens <= 0) {
        return text;
    }

    const totalBytes = Buffer.byteLength(text, 'utf8');

    if (bytesToTokens(totalBytes) <= maxTokens) {
        return text;
    }

    // Derive the byte budget from the heuristic's own ratio (no duplicated magic constant), apply the
    // dense-content safety margin (see EMBED_TRUNCATE_SAFETY_FACTOR), then shave any residual rounding edge.
    const bytesPerToken = totalBytes / Math.max(1, bytesToTokens(totalBytes));
    let   maxBytes      = Math.max(1, Math.floor(maxTokens * bytesPerToken * EMBED_TRUNCATE_SAFETY_FACTOR)),
          truncated     = truncateToByteBudget(text, maxBytes);

    while (truncated.length > 0 && bytesToTokens(Buffer.byteLength(truncated, 'utf8')) > maxTokens) {
        maxBytes  = Math.floor(maxBytes * 0.9);
        truncated = truncateToByteBudget(text, maxBytes);
    }

    return truncated;
}

/**
 * @summary Creates a 10%-bucket progress callback wrapper for long repair phases.
 * @param {Object} options
 * @param {String} options.phase Progress phase label.
 * @param {Number} options.total Total rows in the phase.
 * @param {Function} [options.onProgress] Progress sink.
 * @returns {Function}
 */
function createTenPercentProgressReporter({phase, total, onProgress} = {}) {
    let nextPercent = 10;

    return ({processed, counts} = {}) => {
        if (typeof onProgress !== 'function' || total <= 0) {
            return
        }

        const percent = Math.min(100, Math.floor((processed / total) * 100)),
              bucket  = Math.floor(percent / 10) * 10;

        if (bucket < nextPercent) {
            return
        }

        onProgress({phase, percent: bucket, processed, total, counts: {...counts}});
        nextPercent = bucket + 10;
    }
}

export default extractMemoryCoreCollectionData;
