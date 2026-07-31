/**
 * Memory Core vector-store rebuild — full re-embed from an old store into a FRESH one.
 *
 * Cross-store, one-shot, operator-run: reads ids + documents + metadatas from the SOURCE
 * Chroma (stored vectors are deliberately ignored — a version-incompatible index cannot be
 * trusted and the rebuild targets one uniform embedding model), re-embeds every document
 * against the canonical embedding endpoint, and streams the batches into the TARGET store.
 *
 * Composes `extractMemoryCoreCollectionData` in its degenerate case (`missingVectorIds = allIds`):
 * that module owns batching, resume (`skipIds`), fail-loud `unrecoverable` reporting, and
 * progress. This script owns clients, the collection loop, the embed function, and receipts.
 *
 * Deliberately NOT integrated: AiConfig (both stores are named explicitly via argv — a rebuild
 * must never inherit an ambient URL and hit the wrong store) and the heavy-maintenance lease
 * (source access is read-only; the target is a pre-resident fresh store with no competing
 * scheduler).
 *
 * STDOUT carries exactly one structured receipt JSON; progress goes to STDERR.
 *
 * @module Neo.ai.scripts.maintenance.rebuildMemoryCoreVectorStore
 */

import {program}                                                     from 'commander';
import {ChromaClient}                                                from 'chromadb';
import {fileURLToPath}                                               from 'url';
import {extractMemoryCoreCollectionData, truncateToEmbedTokenBudget} from './repairMemoryCoreStoredEmbeddings.mjs';

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
 * @summary Builds the embed function: token-budget truncation + batched calls to an
 * OpenAI-compatible /v1/embeddings endpoint using the canonical model identifier.
 * @param {Object}  options
 * @param {String}  options.url        Embeddings endpoint
 * @param {String}  options.model      Model identifier (the one the servers use)
 * @param {Number}  [options.batch=8]  Inputs per request
 * @param {Function} [options.fetchImpl=fetch]
 * @returns {Function} `(documents: String[]) => Promise<Number[][]>`
 */
export function createEmbedFn({url, model, batch = 8, fetchImpl = fetch}) {
    return async documents => {
        const out = [];
        for (let i = 0; i < documents.length; i += batch) {
            const input = documents.slice(i, i + batch).map(doc => truncateToEmbedTokenBudget(doc));
            const res   = await fetchImpl(url, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify({model, input})
            });
            if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
            const json = await res.json();
            // The API may return items out of order; index is authoritative.
            const sorted = [...json.data].sort((a, b) => a.index - b.index);
            out.push(...sorted.map(item => item.embedding));
        }
        return out;
    };
}

/**
 * @summary Rebuilds the named collections from source into target with a full re-embed.
 *
 * Resumable: ids already present in the target are skipped, so a crashed run continues
 * where it stopped. The receipt is fail-loud — every unrecoverable row is listed, and
 * `ok` is false unless targetAfter + unrecoverable === source for every collection.
 *
 * @param {Object}   options
 * @param {Object}   options.sourceClient  ChromaClient (or compatible) for the OLD store
 * @param {Object}   options.targetClient  ChromaClient (or compatible) for the FRESH store
 * @param {String[]} options.collections   Collection names to rebuild
 * @param {Function} options.embedFn       `(documents) => embeddings`
 * @param {Number}   [options.getBatch=500]  Source read / re-embed chunk size
 * @param {Number}   [options.limit=0]       Pilot mode: only the first N ids per collection
 * @param {Boolean}  [options.dryRun=false]  Count and plan only; no embeds, no writes
 * @param {Function} [options.log=console.error]
 * @returns {Promise<Object>} `{ok, collections: [{name, source, targetBefore, targetAfter, reEmbedded, resumedExisting, unrecoverable}]}`
 */
export async function rebuildCollections({sourceClient, targetClient, collections, embedFn, getBatch = 500, limit = 0, dryRun = false, log = console.error}) {
    const receipt = {ok: true, collections: []};

    for (const name of collections) {
        const sourceCol = await sourceClient.getCollection({name});
        let   allIds    = await readAllIds(sourceCol);
        const source    = allIds.length;

        if (limit > 0) allIds = allIds.slice(0, limit);

        const targetCol    = await targetClient.getOrCreateCollection({name});
        const skipIds      = await readAllIds(targetCol);
        const targetBefore = skipIds.length;
        const entry        = {name, source, planned: allIds.length, targetBefore};

        log(`[rebuild] ${name}: source=${source} planned=${allIds.length} targetBefore=${targetBefore}${dryRun ? ' (dry-run)' : ''}`);

        if (dryRun) {
            receipt.collections.push({...entry, dryRun: true});
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
            onDataBatch     : async batch => {
                await targetCol.add({ids: batch.ids, embeddings: batch.embeddings, documents: batch.documents, metadatas: batch.metadatas});
            },
            onProgress: ({phase, percent}) => log(`[rebuild] ${name}: ${phase} ${percent}%`)
        });

        const targetAfter = (await readAllIds(targetCol)).length;
        const done        = {
            ...entry,
            targetAfter,
            reEmbedded     : result.counts.reEmbedded,
            resumedExisting: result.counts.resumedExisting ?? 0,
            unrecoverable  : result.unrecoverable ?? []
        };

        // Fail-loud reconciliation: every planned id is in the target or named unrecoverable.
        if (targetAfter + done.unrecoverable.length < entry.planned) {
            receipt.ok = false;
            done.error = 'reconciliation-shortfall';
        }
        if (done.unrecoverable.length > 0) receipt.ok = false;

        receipt.collections.push(done);
        log(`[rebuild] ${name}: done targetAfter=${targetAfter} reEmbedded=${done.reEmbedded} unrecoverable=${done.unrecoverable.length}`);
    }

    return receipt;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
    program
        .requiredOption('--source-url <url>', 'OLD store Chroma URL (read-only source)')
        .requiredOption('--target-url <url>', 'FRESH store Chroma URL (rebuild target)')
        .requiredOption('--collections <csv>', 'comma-separated collection names')
        .option('--embed-url <url>', 'OpenAI-compatible embeddings endpoint', 'http://127.0.0.1:1234/v1/embeddings')
        .option('--embed-model <id>', 'embedding model identifier', 'text-embedding-qwen3-embedding-8b')
        .option('--embed-batch <n>', 'inputs per embed request', v => parseInt(v, 10), 8)
        .option('--get-batch <n>', 'source read chunk size', v => parseInt(v, 10), 500)
        .option('--limit <n>', 'pilot mode: first N ids per collection', v => parseInt(v, 10), 0)
        .option('--dry-run', 'count and plan only', false)
        .parse();

    const opts = program.opts();

    if (opts.sourceUrl === opts.targetUrl) {
        console.error('[rebuild] FATAL: --source-url and --target-url must differ (fail-closed).');
        process.exit(1);
    }

    const receipt = await rebuildCollections({
        sourceClient: new ChromaClient({path: opts.sourceUrl}),
        targetClient: new ChromaClient({path: opts.targetUrl}),
        collections : opts.collections.split(',').map(s => s.trim()).filter(Boolean),
        embedFn     : createEmbedFn({url: opts.embedUrl, model: opts.embedModel, batch: opts.embedBatch}),
        getBatch    : opts.getBatch,
        limit       : opts.limit,
        dryRun      : Boolean(opts.dryRun)
    });

    console.log(JSON.stringify(receipt, null, 2));
    process.exit(receipt.ok ? 0 : 1);
}
