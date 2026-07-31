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
 * a structured `unrecoverable` entry (`{id, reason, retryable, message?}`; counts surfaced, never silently
 * dropped — the fail-loud discipline). `retryable` is the classifier-stamped fate: `true` for transient
 * provider failures a later pass can fix, `false` for content/config problems no retry can recover.
 *
 * The live shadow run + canonical promotion is operator/env-gated (out of scope without
 * explicit authorization); this module is the pure extraction logic, unit-tested against mocked Chroma.
 *
 * @module Neo.ai.scripts.maintenance.repairMemoryCoreStoredEmbeddings
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
 * @param {Object}     [options.embedRetry] Bounded-retry forwarding for the re-embed leg
 *                                           (`{attempts, backoffMs, wait}` — see `embedRecoverableDocuments`).
 * @param {Number}     [options.expectedDimension] Per-element vector dimension check for the re-embed leg.
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
    onProgress,
    embedRetry,
    expectedDimension
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
    let   stoppedEarly  = false;

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
            const {embeddings, failedIndexes, failures, stoppedEarly: batchStoppedEarly} = await embedRecoverableDocuments({embedFn, ids: reEmbedIds, documents: reEmbedDocs, ...embedRetry, expectedDimension});
            const batchData                                                              = {ids: [], embeddings: [], documents: [], metadatas: []};

            stoppedEarly ||= Boolean(batchStoppedEarly);

            for (const failure of failures) {
                recordUnrecoverable({
                    unrecoverable,
                    counts,
                    id       : reEmbedIds[failure.index],
                    reason   : failure.reason,
                    retryable: failure.retryable,
                    message  : failure.message
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
        stoppedEarly,
        counts
    };
}

/**
 * Reason→fate map for reasons the classifier does not stamp inline (content problems and the
 * static classes). `true` marks failures a later pass can fix; `false` marks problems no retry
 * can recover. Consumers read the stamped `retryable` flag on each entry and never re-derive
 * fate from reason strings — a second mapping would drift. Unknown reasons default to `false`:
 * never promise a resume will fix what the classifier cannot vouch for.
 * @type {Object}
 */
const RETRYABLE_BY_REASON = {
    'document-empty'            : false,
    'document-invalid'          : false,
    'document-missing'          : false,
    'embedding-config-terminal' : false,
    'embedding-input-rejected'  : false,
    'embedding-provider-error'  : true,
    'embedding-result-malformed': true,
    'embedding-unknown'         : false,
    'metadata-row-missing'      : false
};

/**
 * @summary Records one unrecoverable row while keeping the fail-loud counter in sync.
 * @param {Object} options
 * @param {Array} options.unrecoverable Mutable structured unrecoverable entry buffer.
 * @param {Object} options.counts Mutable extraction counters.
 * @param {String} options.id Row id.
 * @param {String} options.reason Stable reason code.
 * @param {Boolean} [options.retryable] Explicit fate from the failure classifier; falls back to the reason map.
 * @param {String} [options.message] Operator-readable reason detail.
 * @returns {void}
 */
function recordUnrecoverable({unrecoverable, counts, id, reason, retryable, message} = {}) {
    unrecoverable.push(createUnrecoverableEntry({id, reason, retryable, message}));
    counts.unrecoverable++;
}

/**
 * @summary Creates the structured unrecoverable row shape consumed by defrag diagnostics.
 * @param {Object} options
 * @param {String} options.id Row id.
 * @param {String} options.reason Stable reason code.
 * @param {Boolean} [options.retryable] Explicit fate; falls back to the reason map, then `false`.
 * @param {String} [options.message] Operator-readable reason detail.
 * @returns {Object} Structured unrecoverable row entry, fate-stamped via `retryable`.
 */
function createUnrecoverableEntry({id, reason, retryable, message} = {}) {
    const entry = {id, reason, retryable: retryable ?? RETRYABLE_BY_REASON[reason] ?? false};

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
 * Network/transport error codes marking a failure provider-transient: the provider (or the path
 * to it) is struggling, the documents are fine, and a later attempt can succeed. The
 * connection-refused class is exactly what a provider outage throws.
 * @type {Set<String>}
 */
const TRANSIENT_NETWORK_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN',
    'ETIMEDOUT', 'EPIPE',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'
]);

/**
 * @summary Classifies one embed-call failure into a stable reason + fate + routing class.
 *
 * A fate bit is only as useful as its cause classifier: collapsing 401, 429, timeouts, and 5xx
 * into one "provider error" recreates unrecoverable-ambiguity under a new label. The `routing`
 * tells the retry engine WHAT to do; `reason` + `retryable` tell the receipt reader WHY it
 * stopped and whether a later pass can fix it:
 *
 * - `transient` (retryable): 408/429/5xx, network/timeout codes, malformed provider results —
 *   whole-batch retry with backoff can fix these; splitting them multiplies calls against a
 *   struggling provider.
 * - `config` (terminal): 401/403/404 — credential/route problems no retry or split can fix; the
 *   engine stops immediately instead of burning budget against a misconfiguration.
 * - `document` (terminal): remaining 4xx (400/413/422…) — the provider rejected INPUT; a single
 *   split pass isolates the offending document(s) so the rest of the batch still recovers.
 * - `unknown` (terminal): everything else — isolated like `document` (the historical
 *   oversized-document class throws plain errors), but never retried across rounds. Unknown is
 *   never optimistic.
 *
 * @param {Error} error Provider, transport, or shape error (may carry `httpStatus` / `code`).
 * @returns {{reason: String, retryable: Boolean, routing: String}}
 */
export function classifyEmbedFailure(error) {
    const status = error?.httpStatus;

    if (status === 401 || status === 403 || status === 404) {
        return {reason: 'embedding-config-terminal', retryable: false, routing: 'config'};
    }

    if (status === 408 || status === 429 || status >= 500) {
        return {reason: 'embedding-provider-error', retryable: true, routing: 'transient'};
    }

    if (status >= 400) {
        return {reason: 'embedding-input-rejected', retryable: false, routing: 'document'};
    }

    if (error?.unrecoverableReason === 'embedding-result-malformed') {
        return {reason: 'embedding-result-malformed', retryable: true, routing: 'transient'};
    }

    if (TRANSIENT_NETWORK_CODES.has(error?.code) || TRANSIENT_NETWORK_CODES.has(error?.cause?.code) ||
        error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return {reason: 'embedding-provider-error', retryable: true, routing: 'transient'};
    }

    return {reason: 'embedding-unknown', retryable: false, routing: 'unknown'};
}

/**
 * @summary Embeds a batch under ONE bounded attempt budget, routing failures by cause.
 *
 * The engine retires two historical failure modes at once: per-range retry budgets (which
 * amplified a persistent outage multiplicatively down the split tree) and split-on-any-failure
 * (which multiplied calls against an already-saturated provider). Routing instead:
 *
 * - **Transient failures retry the WHOLE remaining batch** with doubling backoff between rounds,
 *   never splitting — a persistent outage costs exactly `attempts` embed calls, then stops with
 *   `stoppedEarly: true` and every remaining document recorded retryable.
 * - **Config failures (401/403/404) stop the whole operation immediately** — no further budget
 *   is burned against a misconfiguration; every remaining document records terminal.
 * - **Document/unknown failures get ONE split-isolation pass** (halving from the known-failed
 *   set — the failed full-batch call is never repeated): survivors recover, offenders record
 *   terminal at their exact index. Bounded at ~2n calls, once, with no retry inside the tree.
 * - **Element validation**: every returned vector must be a non-empty numeric array (and match
 *   `expectedDimension` when given). Sparse or wrong-shape results become per-document
 *   retryable failures — never `undefined` vectors handed to the caller.
 *
 * @param {Object}   options
 * @param {Function} options.embedFn Embedding function (`documents => vectors`; throws on failure).
 * @param {String[]} options.ids Row ids paired with `documents`.
 * @param {String[]} options.documents Documents to embed.
 * @param {Number}   [options.attempts=1] Attempt budget for the WHOLE operation (`1` = the
 *                                        historical single-pass contract).
 * @param {Number}   [options.backoffMs=1000] Base backoff between rounds, doubling per round.
 * @param {Function} [options.wait] `ms => Promise` — injectable for tests; defaults to setTimeout.
 * @param {Number}   [options.expectedDimension] When set, every vector must have this length.
 * @returns {Promise<{embeddings: Number[][], failedIndexes: Set<Number>,
 *                    failures: Array<{index: Number, reason: String, retryable: Boolean, message: String}>,
 *                    stoppedEarly: Boolean, attemptsUsed: Number}>}
 */
export async function embedRecoverableDocuments({
    embedFn,
    ids,
    documents,
    attempts = 1,
    backoffMs = 1000,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    expectedDimension
} = {}) {
    const embeddings  = new Array(documents.length);
    const failures    = [];
    const maxAttempts = Math.max(1, attempts);

    let stoppedEarly = false;
    let attemptsUsed = 0;
    let pending      = documents.map((_, index) => index);

    const recordFailure = (index, {reason, retryable}, message) => {
        failures.push({index, reason, retryable, message});
    };

    const elementProblem = vector => {
        if (!Array.isArray(vector) || vector.length === 0 || typeof vector[0] !== 'number') {
            return 'element is not a numeric vector';
        }
        if (expectedDimension && vector.length !== expectedDimension) {
            return `element dimension ${vector.length}, expected ${expectedDimension}`;
        }
        return null;
    };

    for (let round = 1; round <= maxAttempts && pending.length > 0; round++) {
        attemptsUsed = round;

        try {
            const docs    = pending.map(index => documents[index]);
            const vectors = await embedFn(docs);

            if (!Array.isArray(vectors) || vectors.length !== docs.length) {
                throw createEmbeddingResultError(`embedFn returned ${Array.isArray(vectors) ? vectors.length : 'non-array'} embeddings for ${docs.length} documents`);
            }

            const malformed = [];

            pending.forEach((origIndex, j) => {
                const problem = elementProblem(vectors[j]);

                if (problem) {
                    malformed.push({origIndex, problem});
                } else {
                    embeddings[origIndex] = vectors[j];
                }
            });

            if (malformed.length === 0) {
                pending = [];
                break;
            }

            // Malformed elements are provider-transient: retry them next round; at budget end
            // they record retryable (a later pass can fix them) — never as silent undefineds.
            pending = malformed.map(entry => entry.origIndex);

            if (round === maxAttempts) {
                stoppedEarly = true;
                for (const {origIndex, problem} of malformed) {
                    recordFailure(origIndex, {reason: 'embedding-result-malformed', retryable: true}, problem);
                }
                pending = [];
            } else {
                await wait(backoffMs * 2 ** (round - 1));
            }
        } catch (error) {
            const classification = classifyEmbedFailure(error);

            if (classification.routing === 'transient') {
                if (round === maxAttempts) {
                    stoppedEarly = true;
                    for (const index of pending) {
                        recordFailure(index, classification, error?.message || String(error));
                    }
                    pending = [];
                } else {
                    await wait(backoffMs * 2 ** (round - 1));
                }
                continue;
            }

            if (classification.routing === 'config') {
                for (const index of pending) {
                    recordFailure(index, classification, error?.message || String(error));
                }
                pending = [];
                break;
            }

            // document / unknown routing: one bounded isolation pass from the known-failed set.
            if (pending.length === 1) {
                recordFailure(pending[0], classification, error?.message || String(error));
            } else {
                const mid = Math.floor(pending.length / 2);
                await isolate(pending.slice(0, mid));
                await isolate(pending.slice(mid));
            }
            pending = [];
            break;
        }
    }

    return {embeddings, failedIndexes: new Set(failures.map(failure => failure.index)), failures, stoppedEarly, attemptsUsed};

    async function isolate(indexes) {
        if (indexes.length === 0) {
            return;
        }

        const docs = indexes.map(index => documents[index]);

        try {
            const vectors = await embedFn(docs);

            if (!Array.isArray(vectors) || vectors.length !== docs.length) {
                throw createEmbeddingResultError(`embedFn returned ${Array.isArray(vectors) ? vectors.length : 'non-array'} embeddings for ${docs.length} documents`);
            }

            indexes.forEach((origIndex, j) => {
                const problem = elementProblem(vectors[j]);

                if (problem) {
                    recordFailure(origIndex, {reason: 'embedding-result-malformed', retryable: true}, problem);
                } else {
                    embeddings[origIndex] = vectors[j];
                }
            });
        } catch (error) {
            if (indexes.length === 1) {
                recordFailure(indexes[0], classifyEmbedFailure(error), error?.message || String(error));
                return;
            }

            const mid = Math.floor(indexes.length / 2);

            await isolate(indexes.slice(0, mid));
            await isolate(indexes.slice(mid));
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
