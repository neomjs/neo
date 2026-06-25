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
 * rows from their DOCUMENTS (which still materialize — only the embedding fetch fails). The merged
 * `{ids, embeddings, documents, metadatas}` then feeds defrag's existing `addCollectionData` →
 * `validateLoadedCollection` → promote, unchanged. A missing-vector row with no recoverable document is
 * reported as `unrecoverable` (counts surfaced, never silently dropped — the fail-loud discipline).
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
 * metadata read) is `unrecoverable` — surfaced with counts, not dropped.
 *
 * @param {Object}     options
 * @param {Object}     options.collection       Chroma collection handle (`.get({ids, include})`).
 * @param {String[]}   options.allIds           Every metadata id in the collection (from the coverage audit).
 * @param {String[]}   options.missingVectorIds Ids whose vectors are absent from the HNSW index (coverage audit).
 * @param {Function}   options.embedFn          `(documents: String[]) => Promise<Number[][]>` — re-embed a batch
 *                                               (e.g. `TextEmbeddingService.embedTexts` bound to the MC provider).
 * @param {Number}     [options.batchSize=1000] Chroma `.get` / embed batch size.
 * @param {Function}   [options.onProgress] Optional callback receiving 10%-bucket progress events:
 *                                           `{phase, percent, processed, total, counts}`.
 * @returns {Promise<{data: {ids: String[], embeddings: Number[][], documents: String[], metadatas: Object[]},
 *                    unrecoverable: String[],
 *                    counts: {total: Number, intact: Number, reEmbedded: Number, unrecoverable: Number}}>}
 */
export async function extractMemoryCoreCollectionData({
    collection,
    allIds = [],
    missingVectorIds = [],
    embedFn,
    batchSize = 1000,
    onProgress
} = {}) {
    if (typeof embedFn !== 'function') {
        throw new Error('extractMemoryCoreCollectionData: embedFn (documents -> embeddings) is required');
    }

    const missingSet = new Set(missingVectorIds);
    const intactIds  = allIds.filter(id => !missingSet.has(id));
    const data       = {ids: [], embeddings: [], documents: [], metadatas: []};
    const counts     = {total: allIds.length, intact: 0, reEmbedded: 0, unrecoverable: 0};

    const reportIntactProgress  = createTenPercentProgressReporter({phase: 'intact-extract', total: intactIds.length, onProgress});
    const reportMissingProgress = createTenPercentProgressReporter({phase: 'missing-reembed', total: missingVectorIds.length, onProgress});

    onProgress?.({phase: 'start', percent: 0, processed: 0, total: allIds.length, counts: {...counts}});

    // 1. Intact rows — extract with their stored embeddings (these vectors exist in the HNSW index).
    for (let i = 0; i < intactIds.length; i += batchSize) {
        const batchIds = intactIds.slice(i, i + batchSize);
        const got      = await collection.get({ids: batchIds, include: ['embeddings', 'documents', 'metadatas']});

        for (let j = 0; j < (got.ids?.length || 0); j++) {
            data.ids.push(got.ids[j]);
            data.embeddings.push(got.embeddings[j]);
            data.documents.push(got.documents?.[j] ?? '');
            data.metadatas.push(got.metadatas?.[j] ?? {});
            counts.intact++;
        }

        reportIntactProgress({processed: Math.min(i + batchIds.length, intactIds.length), counts});
    }

    // 2. Missing-vector rows — re-embed from documents (their stored embeddings cannot be fetched).
    const unrecoverable = [];

    for (let i = 0; i < missingVectorIds.length; i += batchSize) {
        const batchIds = missingVectorIds.slice(i, i + batchSize);
        // documents + metadatas DO materialize for missing-vector ids; only `embeddings` fails.
        const got      = await collection.get({ids: batchIds, include: ['documents', 'metadatas']});
        const returned = new Set(got.ids || []);

        // An id that did not even come back from the metadata read is unrecoverable.
        for (const id of batchIds) {
            if (!returned.has(id)) {
                unrecoverable.push(id);
                counts.unrecoverable++;
            }
        }

        const reEmbedIds = [], reEmbedDocs = [], reEmbedMetas = [];

        for (let j = 0; j < (got.ids?.length || 0); j++) {
            const doc = got.documents?.[j];
            if (!doc) {
                unrecoverable.push(got.ids[j]);
                counts.unrecoverable++;
                continue;
            }
            reEmbedIds.push(got.ids[j]);
            reEmbedDocs.push(doc);
            reEmbedMetas.push(got.metadatas?.[j] ?? {});
        }

        if (reEmbedDocs.length > 0) {
            const embeddings = await embedFn(reEmbedDocs);

            if (!Array.isArray(embeddings) || embeddings.length !== reEmbedDocs.length) {
                throw new Error(`extractMemoryCoreCollectionData: embedFn returned ${Array.isArray(embeddings) ? embeddings.length : 'non-array'} embeddings for ${reEmbedDocs.length} documents`);
            }

            for (let j = 0; j < reEmbedIds.length; j++) {
                data.ids.push(reEmbedIds[j]);
                data.embeddings.push(embeddings[j]);
                data.documents.push(reEmbedDocs[j]);
                data.metadatas.push(reEmbedMetas[j]);
                counts.reEmbedded++;
            }
        }

        reportMissingProgress({processed: Math.min(i + batchIds.length, missingVectorIds.length), counts});
    }

    onProgress?.({phase: 'complete', percent: 100, processed: allIds.length, total: allIds.length, counts: {...counts}});

    return {
        data,
        unrecoverable,
        counts
    };
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
