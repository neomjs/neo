/**
 * Memory Core vector-store rebuild — re-embed into a fresh target with provenance-checked,
 * id-set-reconciled, fail-loud receipts.
 *
 * Cross-store, operator-run: reads ids + documents + metadatas from the SOURCE Chroma collection
 * (stored vectors are deliberately ignored — a version-incompatible index cannot be trusted and
 * the rebuild targets one uniform embedding model), re-embeds every document against the named
 * embeddings endpoint, and streams the batches into the TARGET collection.
 *
 * The SOURCE BOUNDARY is decided by the governing migration ticket, never here: this runner is a
 * mechanism that the chosen source feeds. It composes `extractMemoryCoreCollectionData` in its
 * degenerate case (`missingVectorIds = allIds`): that module owns batching, resume (`skipIds`),
 * cause-classified bounded retry, and fate-stamped failure entries. This script owns clients,
 * identity/provenance checks, the collection loop, the drained embed function, id-set
 * reconciliation, and the receipt.
 *
 * Deliberately NOT integrated: AiConfig (both stores are named explicitly via argv — a rebuild
 * must never inherit an ambient URL and hit the wrong store) and the heavy-maintenance lease
 * (source access is read-only; the target is an operator-named store).
 *
 * STDOUT carries exactly one structured receipt JSON; progress goes to STDERR. Exit code is `0`
 * only when every collection reconciled with zero failures.
 *
 * @module Neo.ai.scripts.maintenance.rebuildMemoryCoreVectorStore
 */

import {program}                         from 'commander';
import {ChromaClient}                    from 'chromadb';
import {fileURLToPath}                   from 'url';
import {extractMemoryCoreCollectionData} from './repairMemoryCoreStoredEmbeddings.mjs';

/**
 * @summary Reads every id of a collection, paginated.
 * @param {Object} collection Chroma collection handle
 * @param {Number} [pageSize=2000]
 * @returns {Promise<String[]>}
 */
export async function readAllIds(collection, pageSize = 2000) {
    const ids = [];
    for (let offset = 0; ; offset += pageSize) {
        const page = await collection.get({limit: pageSize, offset, include: []});
        const got  = page.ids || [];
        ids.push(...got);
        if (got.length < pageSize) break;
    }
    return ids;
}

/**
 * @summary Builds the embed function: batched, concurrency-capped calls to an OpenAI-compatible
 * `/v1/embeddings` endpoint that ALWAYS drain and ALWAYS validate.
 *
 * Two guarantees the failure engine upstream depends on:
 *
 * - **Drained**: workers never throw mid-pool. Every in-flight request settles before the call
 *   resolves or rejects, so a retry round can never overlap orphaned requests from the previous
 *   one — configured concurrency is a hard bound, not a hope. On any chunk failure the call
 *   rejects AFTER the drain with the first failure as its cause (carrying `httpStatus` when the
 *   provider answered), annotated with how many chunks failed.
 * - **Validated**: the response must carry exactly one embedding per input at authoritative,
 *   duplicate-free indexes. Sparse, duplicated, or wrong-shape results reject with the malformed
 *   marker — this function never resolves with `undefined` holes.
 *
 * @param {Object}  options
 * @param {String}  options.url        Embeddings endpoint
 * @param {String}  options.model      Model identifier (the exact id the servers use)
 * @param {Number}  [options.batch=8]  Inputs per request
 * @param {Number}  [options.concurrency=6] Requests in flight
 * @param {Function} [options.fetchImpl=fetch]
 * @returns {Function} `(documents: String[]) => Promise<Number[][]>`
 */
export function createEmbedFn({url, model, batch = 8, concurrency = 6, fetchImpl = fetch}) {
    return async documents => {
        const chunks = [];
        for (let i = 0; i < documents.length; i += batch) {
            chunks.push({at: i, docs: documents.slice(i, i + batch)});
        }

        const out      = new Array(documents.length);
        const failures = [];
        let   next     = 0;

        const worker = async () => {
            while (next < chunks.length) {
                const chunk = chunks[next++];

                try {
                    const res = await fetchImpl(url, {
                        method : 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body   : JSON.stringify({model, input: chunk.docs})
                    });

                    if (!res.ok) {
                        const error = new Error(`embed HTTP ${res.status}`);
                        error.httpStatus = res.status;
                        throw error;
                    }

                    const json = await res.json();
                    const data = Array.isArray(json?.data) ? json.data : null;

                    if (!data || data.length !== chunk.docs.length) {
                        throw malformedError(`provider returned ${data ? data.length : 'no'} embeddings for ${chunk.docs.length} inputs`);
                    }

                    const seen = new Set();

                    for (const item of data) {
                        // The index is authoritative — but only when it is a real, in-range,
                        // duplicate-free integer. Anything else is a malformed result, never a
                        // silent hole.
                        if (!Number.isInteger(item?.index) || item.index < 0 || item.index >= chunk.docs.length || seen.has(item.index)) {
                            throw malformedError(`provider returned an invalid or duplicate embedding index (${item?.index})`);
                        }
                        seen.add(item.index);
                        out[chunk.at + item.index] = item.embedding;
                    }
                } catch (error) {
                    failures.push(error);
                }
            }
        };

        await Promise.all(Array.from({length: Math.min(concurrency, chunks.length) || 1}, worker));

        if (failures.length > 0) {
            // Rejection happens strictly AFTER the pool drained: the retry engine above may fire
            // its next round immediately without ever exceeding the concurrency bound.
            const primary = failures.find(failure => failure.httpStatus !== undefined) ?? failures[0];
            primary.message = `${primary.message} (${failures.length}/${chunks.length} chunks failed, pool drained)`;
            throw primary;
        }

        return out;
    };
}

function malformedError(message) {
    const error = new Error(message);
    error.unrecoverableReason = 'embedding-result-malformed';
    return error;
}

/**
 * @summary Groups per-row failure entries into per-reason receipts.
 *
 * The binary verdict an operator needs ("resume, or repair configuration/source?") is a
 * projection of these rows, not a separate schema field: new reason codes become new array
 * entries, and reconciliation stays a single sum over `count`.
 *
 * @param {Object[]} entries Structured extractor entries (`{id, reason, retryable, message?}`)
 * @param {Number}   [sampleCap=10] Ids retained per reason — enough to eyeball, never a dump
 * @returns {Object[]} `[{reason, count, retryable, sampleIds}]`, largest count first
 */
export function groupFailureReceipts(entries, sampleCap = 10) {
    const byReason = new Map();

    for (const entry of entries) {
        let row = byReason.get(entry.reason);

        if (!row) {
            row = {reason: entry.reason, count: 0, retryable: entry.retryable === true, sampleIds: []};
            byReason.set(entry.reason, row);
        }

        row.count++;

        if (row.sampleIds.length < sampleCap) {
            row.sampleIds.push(entry.id);
        }
    }

    return [...byReason.values()].sort((a, b) => b.count - a.count);
}

/**
 * @summary Validates CLI options before any client is constructed. Pure — testable without a process.
 * @param {Object} opts Parsed commander options.
 * @returns {String[]} Human-readable errors; empty when valid.
 */
export function validateCliOptions(opts) {
    const errors  = [];
    const urlLike = value => /^https?:\/\//.test(value);

    if (!urlLike(opts.sourceUrl ?? '')) errors.push(`--source-url must be an http(s) URL, got "${opts.sourceUrl}"`);
    if (!urlLike(opts.targetUrl ?? '')) errors.push(`--target-url must be an http(s) URL, got "${opts.targetUrl}"`);
    if (opts.sourceUrl && opts.sourceUrl === opts.targetUrl) errors.push('--source-url and --target-url must differ (fail-closed; identity is additionally verified per collection UUID)');
    if (!urlLike(opts.embedUrl ?? '')) errors.push(`--embed-url must be an http(s) URL, got "${opts.embedUrl}"`);
    if (!(opts.collections ?? '').split(',').map(s => s.trim()).filter(Boolean).length) errors.push('--collections must name at least one collection');

    for (const [flag, min] of [['embedBatch', 1], ['embedConcurrency', 1], ['embedAttempts', 1], ['embedBackoff', 0], ['getBatch', 1], ['limit', 0], ['expectDims', 0]]) {
        const value = opts[flag];
        if (value !== undefined && (!Number.isInteger(value) || value < min)) {
            errors.push(`--${flag.replace(/[A-Z]/g, c => '-' + c.toLowerCase())} must be an integer >= ${min}, got "${value}"`);
        }
    }

    return errors;
}

/**
 * @summary Rebuilds the named collections from source into target with a full re-embed,
 * provenance checks, and id-set reconciliation.
 *
 * Resumable: planned ids already present in the target are skipped, so a crashed or partial run
 * continues where it stopped and a re-run retries exactly the missing rows. Fail-loud: `ok` is
 * true only when every planned id landed in the target (or the collection was refused before any
 * work, which is `ok: false` by definition).
 *
 * Identity and provenance:
 * - source and target resolving to the SAME collection UUID are refused — two spellings of one
 *   host must never "reconcile" a no-op as success;
 * - the receipt records endpoint URLs, both collection UUIDs, the embedding model, and the
 *   expected dimension, so a later reader can tell WHAT was rebuilt against WHAT;
 * - reconciliation is id-set based: `missingAfterRun` (planned ids in neither target nor the
 *   failure list — must be zero even when counts happen to match) and `targetOnly` ids (present
 *   in the target but not the source) are reported. Target-only ids do NOT fail the run: a live
 *   plane legitimately receives new writes during a rebuild — they are observability, not error.
 *
 * @param {Object}   options
 * @param {Object}   options.sourceClient  ChromaClient (or compatible) for the source store
 * @param {Object}   options.targetClient  ChromaClient (or compatible) for the target store
 * @param {String[]} options.collections   Collection names to rebuild
 * @param {Function} options.embedFn       `(documents) => embeddings`
 * @param {Object}   [options.provenance]  `{sourceUrl, targetUrl, model, expectedDimension}` for the receipt
 * @param {Number}   [options.getBatch=500]  Source read / re-embed chunk size
 * @param {Number}   [options.limit=0]       Pilot mode: only the first N ids per collection
 * @param {Boolean}  [options.dryRun=false]  Count and plan only; performs NO write of any kind
 * @param {Object}   [options.embedRetry]    Bounded-retry forwarding (`{attempts, backoffMs, wait}`)
 * @param {Number}   [options.expectedDimension] Per-element dimension check forwarded to the extractor
 * @param {Function} [options.log=console.error]
 * @returns {Promise<Object>} `{ok, collections: [...]}` — see the per-collection shape in the receipt
 */
export async function rebuildCollections({
    sourceClient,
    targetClient,
    collections,
    embedFn,
    provenance = {},
    getBatch = 500,
    limit = 0,
    dryRun = false,
    embedRetry,
    expectedDimension,
    log = console.error
}) {
    const receipt = {ok: true, dryRun, provenance: {...provenance, expectedDimension}, collections: []};

    for (const name of collections) {
        const sourceCol = await sourceClient.getCollection({name});

        // Dry-run must not create anything: probe the target read-only and report absence
        // instead of materializing an empty collection as a side effect of "counting".
        let targetCol = null;

        if (dryRun) {
            try {
                targetCol = await targetClient.getCollection({name});
            } catch {
                targetCol = null;
            }
        } else {
            targetCol = await targetClient.getOrCreateCollection({name});
        }

        const entry = {
            name,
            sourceCollectionId: sourceCol.id ?? null,
            targetCollectionId: targetCol?.id ?? null
        };

        // Semantic identity check: two DIFFERENT URLs can still resolve to one store (localhost
        // vs 127.0.0.1 vs a LAN alias). Same collection UUID = same collection; a "rebuild" onto
        // itself would skip everything and bless a no-op as success.
        if (targetCol && sourceCol.id && sourceCol.id === targetCol.id) {
            receipt.ok = false;
            receipt.collections.push({...entry, error: 'source-and-target-are-the-same-collection', ok: false});
            log(`[rebuild] ${name}: REFUSED — source and target resolve to the same collection (${sourceCol.id})`);
            continue;
        }

        let   allIds = await readAllIds(sourceCol);
        const source = allIds.length;

        if (limit > 0) allIds = allIds.slice(0, limit);

        const targetIds  = targetCol ? await readAllIds(targetCol) : [];
        const sourceSet  = new Set(allIds);
        const targetSet  = new Set(targetIds);
        const skipIds    = allIds.filter(id => targetSet.has(id));
        const targetOnly = targetIds.filter(id => !sourceSet.has(id));

        Object.assign(entry, {
            source,
            planned     : allIds.length,
            targetBefore: targetIds.length,
            targetOnly  : {count: targetOnly.length, sampleIds: targetOnly.slice(0, 10)}
        });

        log(`[rebuild] ${name}: source=${source} planned=${allIds.length} targetBefore=${targetIds.length} targetOnly=${targetOnly.length}${dryRun ? ' (dry-run)' : ''}`);

        if (dryRun) {
            receipt.collections.push({...entry, wouldCreateTarget: !targetCol, resumedExisting: skipIds.length, ok: true});
            continue;
        }

        const result = await extractMemoryCoreCollectionData({
            collection      : sourceCol,
            allIds,
            missingVectorIds: allIds,
            embedFn,
            batchSize       : getBatch,
            skipIds,
            collectData     : false,
            embedRetry,
            expectedDimension,
            onDataBatch     : async batch => {
                await targetCol.add({ids: batch.ids, embeddings: batch.embeddings, documents: batch.documents, metadatas: batch.metadatas});
            },
            onProgress: ({phase, percent}) => log(`[rebuild] ${name}: ${phase} ${percent}%`)
        });

        // Id-set reconciliation: counts can lie (a contaminated target inflates them); only the
        // set proves every planned id is accounted for — landed in the target or named failed.
        const afterSet  = new Set(await readAllIds(targetCol));
        const failedSet = new Set((result.unrecoverable ?? []).map(failure => failure.id));
        const missing   = allIds.filter(id => !afterSet.has(id) && !failedSet.has(id));

        const failed       = groupFailureReceipts(result.unrecoverable ?? []);
        const failedCount  = failed.reduce((sum, row) => sum + row.count, 0);
        const resumable    = failed.filter(row => row.retryable).reduce((sum, row) => sum + row.count, 0);
        const stoppedEarly = Boolean(result.stoppedEarly);

        const done = {
            ...entry,
            targetAfter    : afterSet.size,
            reEmbedded     : result.counts.reEmbedded,
            resumedExisting: result.counts.resumedExisting ?? 0,
            failed,
            stoppedEarly,
            missingAfterRun: {count: missing.length, sampleIds: missing.slice(0, 10)},
            ok             : missing.length === 0 && failedCount === 0
        };

        if (!done.ok) receipt.ok = false;

        receipt.collections.push(done);
        log(`[rebuild] ${name}: done targetAfter=${done.targetAfter} reEmbedded=${done.reEmbedded} failed=${failedCount} (${resumable} resumable, ${failedCount - resumable} terminal)${stoppedEarly ? ' STOPPED-EARLY' : ''} missing=${missing.length}`);
    }

    return receipt;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
    program
        .requiredOption('--source-url <url>', 'source store Chroma URL (read-only)')
        .requiredOption('--target-url <url>', 'target store Chroma URL')
        .requiredOption('--collections <csv>', 'comma-separated collection names')
        .option('--embed-url <url>', 'OpenAI-compatible embeddings endpoint', 'http://127.0.0.1:1234/v1/embeddings')
        .option('--embed-model <id>', 'embedding model identifier', 'text-embedding-qwen3-embedding-8b')
        .option('--embed-batch <n>', 'inputs per embed request', v => parseInt(v, 10), 8)
        .option('--embed-concurrency <n>', 'embed requests in flight', v => parseInt(v, 10), 6)
        .option('--embed-attempts <n>', 'attempt budget per re-embed batch (transient failures retry whole-batch with backoff)', v => parseInt(v, 10), 3)
        .option('--embed-backoff <ms>', 'base backoff between attempts, doubling per attempt', v => parseInt(v, 10), 1000)
        .option('--expect-dims <n>', 'per-element vector dimension check (0 disables)', v => parseInt(v, 10), 4096)
        .option('--get-batch <n>', 'source read chunk size', v => parseInt(v, 10), 500)
        .option('--limit <n>', 'pilot mode: first N ids per collection', v => parseInt(v, 10), 0)
        .option('--dry-run', 'count and plan only; performs no write of any kind', false)
        .parse();

    const opts   = program.opts();
    const errors = validateCliOptions(opts);

    if (errors.length > 0) {
        for (const error of errors) console.error(`[rebuild] INVALID: ${error}`);
        process.exit(2);
    }

    const expectedDimension = opts.expectDims > 0 ? opts.expectDims : undefined;

    const receipt = await rebuildCollections({
        sourceClient: new ChromaClient({path: opts.sourceUrl}),
        targetClient: new ChromaClient({path: opts.targetUrl}),
        collections : opts.collections.split(',').map(s => s.trim()).filter(Boolean),
        embedFn     : createEmbedFn({url: opts.embedUrl, model: opts.embedModel, batch: opts.embedBatch, concurrency: opts.embedConcurrency}),
        provenance  : {sourceUrl: opts.sourceUrl, targetUrl: opts.targetUrl, model: opts.embedModel},
        getBatch    : opts.getBatch,
        limit       : opts.limit,
        dryRun      : Boolean(opts.dryRun),
        embedRetry  : {attempts: opts.embedAttempts, backoffMs: opts.embedBackoff},
        expectedDimension
    });

    console.log(JSON.stringify(receipt, null, 2));
    process.exit(receipt.ok ? 0 : 1);
}
