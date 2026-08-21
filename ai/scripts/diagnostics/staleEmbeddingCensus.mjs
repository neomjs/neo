#!/usr/bin/env node
/**
 * @module ai/scripts/diagnostics/staleEmbeddingCensus
 * @summary Counts knowledge-base rows whose vectors were built from a superseded provider-input
 * format, per tenant, with the cause split out. It never writes to the corpus — no embed, no upsert,
 * no delete — and the only file it touches is the `--json` report path when one is supplied.
 *
 * ## Why this script exists rather than a query
 *
 * The provider input a chunk presents to the embedding provider is DERIVED and is not a member of a
 * chunk's `hashInputs`, so changing that format leaves every chunk id unchanged. Re-ingestion
 * recomputes the same id, finds the row present, and skips it — the stale vector survives, and no id,
 * content or metadata comparison separates it from a correct one. `helpers/embeddingInputFormat`
 * therefore stamps each row with the format's identity, and the ABSENCE of that stamp is what names a
 * row written before the stamp existed.
 *
 * Absence is not expressible as a filter. ChromaDB has no `$exists` operator, so a row missing a key
 * is invisible to every `where` clause that mentions it, and `$ne` fails for the same reason. This is
 * recorded independently in `ai/scripts/migrations/backfillChromaSharedUserId.mjs`, twice in
 * `ai/services/memory-core/MemoryService.mjs`, and in `HealthService`'s own scan
 * (*"Chroma where-filters cannot reliably falsify absent metadata-key cases across versions"*). A
 * filtered version of this census would report zero affected rows against a corpus full of them and
 * read as a clean bill of health — so the scan shape is a constraint, not an implementation detail.
 *
 * ## What the numbers mean
 *
 * `scanned` is every row read. `stale` splits into `pre-marker` (the field is absent — written before
 * the stamp existed) and `format-changed` (present but naming a superseded format). `current` is the
 * remainder, and `scanned === stale + current` always holds, so a row can never be silently dropped
 * between two runs. Ids are capped and a truncated list says so: a capped list that read as complete
 * would let a repair stop early while reporting success.
 *
 * Detection is O(corpus) metadata reads. The targeting this buys is in what gets RE-EMBEDDED, never
 * in what gets scanned — a ~87k-chunk corpus is ~44 pages of metadata against days of provider
 * compute for a full rebuild.
 *
 * Usage:
 *   node ai/scripts/diagnostics/staleEmbeddingCensus.mjs                    # every tenant
 *   node ai/scripts/diagnostics/staleEmbeddingCensus.mjs --tenant <id>      # one tenant
 *   node ai/scripts/diagnostics/staleEmbeddingCensus.mjs --ids <n>          # id cap per tenant (default 20)
 *   node ai/scripts/diagnostics/staleEmbeddingCensus.mjs --json <path>      # also write the census as JSON
 *   node ai/scripts/diagnostics/staleEmbeddingCensus.mjs --help
 */

// The Neo class system first: every `ai/services/**` module is a `Neo.setupClass` class, and
// `ai/Env.mjs` gatekeeps at module scope, so a service import before this line throws
// `ReferenceError: Neo is not defined`. Two lines, and they are the convention every
// service-touching script under `ai/scripts/**` already follows.
import Neo                           from '../../../src/Neo.mjs';
import                                    '../../../src/core/_export.mjs';

import {EMBEDDING_INPUT_FORMAT_ID}   from '../../services/knowledge-base/helpers/embeddingInputFormat.mjs';
import {
    emptyStaleEmbeddingCensus,
    foldStaleEmbeddingCensus,
    mergeStaleEmbeddingCensus
}                                    from '../../services/knowledge-base/helpers/staleEmbeddingCensus.mjs';
import ChromaManager from '../../services/knowledge-base/ChromaManager.mjs';
import fs            from 'fs-extra';

// `ChromaManager` rather than a raw `chromadb` client, deliberately. The migration scripts under
// `ai/scripts/migrations/` construct their own client because they must target arbitrary hosts; this
// diagnostic reads the deployment it runs on, so going through the service layer inherits its
// connection retry, collection-swap awareness and collection-not-found handling instead of
// reimplementing three of them badly.

const PAGE_SIZE = 2000;

/**
 * Parses the flags this script accepts, refusing anything it does not understand.
 *
 * Refuses rather than ignores: a mistyped `--tenant` silently censusing every tenant would report a
 * number the operator did not ask for, and they would have no way to tell from the output.
 * @param {String[]} argv Raw arguments.
 * @returns {{tenant: String|null, idLimit: Number, json: String|null, help: Boolean}}
 */
function requireValue(flag, value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${flag} expects a non-empty value`);
    }

    return value
}

export function parseArgs(argv) {
    const options = {tenant: null, idLimit: 20, json: null, help: false};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--tenant') {
            // A missing value here is the dangerous one: `?? null` used to mean "all tenants", so a
            // typo silently WIDENED the scope of the measurement instead of refusing it. `--ids`
            // already fails loud one branch down; this matches it.
            options.tenant = requireValue(arg, argv[++i])
        } else if (arg === '--ids') {
            options.idLimit = Number(argv[++i]);

            if (!Number.isInteger(options.idLimit) || options.idLimit < 0) {
                throw new Error('--ids expects a non-negative integer');
            }
        } else if (arg === '--json') {
            // A missing value used to mean "no report", so `--json` with a fat-fingered path wrote
            // nothing and still exited 0 — a silent no-op where the caller asked for a file.
            options.json = requireValue(arg, argv[++i])
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }

    return options
}

/**
 * Pages a collection's metadata and folds each page into a running census.
 *
 * Metadata only — `include: ['metadatas']` deliberately omits embeddings and documents, because the
 * classification needs one field and pulling vectors would make a diagnostic read cost as much as the
 * work it is measuring.
 * @param {Object} collection Chroma collection handle.
 * @param {Object|null} where Optional tenant scope.
 * @param {Number} idLimit Ids to retain.
 * @returns {Promise<Object>} The census.
 */
export async function censusCollection(collection, where, idLimit) {
    let census = emptyStaleEmbeddingCensus(),
        offset = 0;

    for (;;) {
        const page = await collection.get({
            limit  : PAGE_SIZE,
            offset,
            include: ['metadatas'],
            ...(where ? {where} : {})
        });

        const ids = page?.ids || [];

        if (ids.length === 0) {
            break
        }

        census = mergeStaleEmbeddingCensus(
            census,
            foldStaleEmbeddingCensus({
                rows: ids.map((id, index) => ({id, metadata: page.metadatas?.[index]})),
                idLimit
            }),
            idLimit
        );

        // A short page ends the walk; a full page might be the last one, so the loop asks again and
        // exits on the empty answer. `ids.length === limit` cannot distinguish "exactly full" from
        // "truncated", and guessing there would silently stop a census one page early.
        offset += ids.length
    }

    return census
}

/**
 * Prints one census block.
 * @param {String} label Scope label.
 * @param {Object} census Census to render.
 * @returns {void}
 */
function report(label, census) {
    const pct = census.scannedCount > 0 ? ((census.staleCount / census.scannedCount) * 100).toFixed(1) : '0.0';

    console.log(`\n${label}`);
    console.log(`  scanned          ${census.scannedCount}`);
    console.log(`  stale            ${census.staleCount} (${pct}%)`);
    console.log(`    pre-marker     ${census.byCause['pre-marker']}`);
    console.log(`    format-changed ${census.byCause['format-changed']}`);
    console.log(`  current          ${census.currentCount}`);

    if (census.staleIds.length > 0) {
        console.log(`  sample ids       ${census.staleIds.join(', ')}${census.idsTruncated ? ' … (truncated)' : ''}`);
    }

    // Stated as an invariant rather than assumed, because it is the property that makes two runs
    // comparable: if it ever fails, a shrinking stale count is not evidence of repair.
    if (census.staleCount + census.currentCount !== census.scannedCount) {
        console.log('  ⚠️  scanned !== stale + current — a row classified into neither bucket');
    }
}

/**
 * Entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log('node ai/scripts/diagnostics/staleEmbeddingCensus.mjs [--tenant <id>] [--ids <n>] [--json <path>]');
        return
    }

    console.log(`Provider-input format in force: ${EMBEDDING_INPUT_FORMAT_ID}`);
    console.log('Rows without the format field predate it and are counted as pre-marker.');

    const collection = await ChromaManager.getKnowledgeBaseCollection();

    // A missing collection must report "nothing was measured" rather than an empty census, which
    // would read as a clean corpus — the exact false-clean this whole lane keeps producing.
    //
    // Bounded deliberately: this detects an ABSENT collection handle. A daemon that is reachable but
    // erroring, or one whose page read throws mid-walk, is not covered here — those surface as a
    // thrown error from the walk rather than as this line.
    if (!collection) {
        console.error('knowledge-base collection unavailable — nothing was measured');
        process.exitCode = 1;
        return
    }

    const census = await censusCollection(
        collection,
        options.tenant ? {tenantId: options.tenant} : null,
        options.idLimit
    );

    report(options.tenant ? `tenant ${options.tenant}` : 'all tenants', census);

    if (options.json) {
        await fs.outputJson(options.json, {
            observedAt : new Date().toISOString(),
            formatId   : EMBEDDING_INPUT_FORMAT_ID,
            tenantScope: options.tenant ?? null,
            census
        }, {spaces: 4});
        console.log(`\nwrote ${options.json}`);
    }
}

// Guarded so a spec can import `parseArgs` / `censusCollection` without the script connecting to
// anything. An unguarded top-level call would make importing this module a live Chroma attempt.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(`staleEmbeddingCensus failed: ${error.message}`);
        process.exitCode = 1;
    });
}
