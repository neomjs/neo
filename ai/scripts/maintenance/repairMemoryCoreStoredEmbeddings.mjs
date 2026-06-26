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
 */

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
            const doc             = got.documents?.[j],
                  documentProblem = getDocumentProblem(doc);

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
 * @summary Embeds a batch, falling back to per-document isolation when the batch fails.
 * @param {Object} options
 * @param {Function} options.embedFn Embedding function.
 * @param {String[]} options.ids Row ids paired with `documents`.
 * @param {String[]} options.documents Documents to embed.
 * @returns {Promise<{embeddings: Number[][], failedIndexes: Set<Number>,
 *                    failures: Array<{index: Number, reason: String, message: String}>}>}
 */
async function embedRecoverableDocuments({embedFn, ids, documents} = {}) {
    try {
        const embeddings = await embedFn(documents);

        if (!Array.isArray(embeddings) || embeddings.length !== documents.length) {
            throw createEmbeddingResultError(`embedFn returned ${Array.isArray(embeddings) ? embeddings.length : 'non-array'} embeddings for ${documents.length} documents`);
        }

        return {embeddings, failedIndexes: new Set(), failures: []}
    } catch {
        const embeddings = new Array(documents.length);
        const failures   = [];

        for (let i = 0; i < documents.length; i++) {
            try {
                const single = await embedFn([documents[i]]);

                if (!Array.isArray(single) || single.length !== 1) {
                    throw createEmbeddingResultError(`single embed returned ${Array.isArray(single) ? single.length : 'non-array'} embeddings`);
                }

                embeddings[i] = single[0];
            } catch (error) {
                failures.push({
                    index  : i,
                    reason : getEmbeddingFailureReason(error),
                    message: error?.message || String(error)
                });
            }
        }

        return {embeddings, failedIndexes: new Set(failures.map(failure => failure.index)), failures}
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
