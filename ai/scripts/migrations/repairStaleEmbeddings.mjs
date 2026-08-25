#!/usr/bin/env node
/**
 * @module ai/scripts/migrations/repairStaleEmbeddings
 * @summary Re-embeds knowledge-base rows whose vectors were built from a superseded provider-input
 * format, targeting ids from the census rather than advancing `parserVersion`. Dry-run by default;
 * `--apply` is the only path that calls a provider or writes to the corpus.
 *
 * ## Why a targeted repair rather than a generation bump
 *
 * The census names the affected rows but cannot fix them, and nothing else in the repository
 * re-embeds a row whose format marker is absent or superseded:
 *
 * - a `parserVersion` advance re-mints every chunk id, so it re-embeds the WHOLE corpus rather than
 *   the affected subset — days of provider compute on a live plane — and nothing schedules it;
 * - an `EMBEDDING_POISON_STRATEGY_FAMILY` bump scopes poison/suppression evidence only and re-embeds
 *   nothing here;
 * - ordinary re-ingestion recomputes the same id, finds the row present, and skips it, because the
 *   provider input is derived and is not a member of a chunk's `hashInputs`.
 *
 * So the repair has to select by id and rewrite the vector in place.
 *
 * ## What makes a repair safe rather than merely effective
 *
 * **The vector and the marker land in one write.** Each batch is a single `collection.upsert` that
 * carries ids, embeddings and metadatas together. A row that carried a CURRENT marker over an OLD
 * vector would be undetectable by construction — invisible to every future census — which is worse
 * than the state this lane started in, so the marker is never stamped by a separate call.
 *
 * **The row's existing metadata is preserved, not rebuilt.** The upsert spreads the row's stored
 * metadata and overwrites only the format marker. Rebuilding metadata from the reconstructed chunk
 * would carry only the fields the provider-input format reads and would silently drop `tenantId` and
 * everything else, which turns a repair into data loss.
 *
 * **Dry-run is the default and it calls no provider.** A runner that spends provider compute on an
 * accidental invocation is not shippable.
 *
 * **A partial run reports its remainder.** A repair that stops early while reading as complete is
 * the failure mode this lane keeps producing.
 *
 * Usage:
 *   node ai/scripts/migrations/repairStaleEmbeddings.mjs                     # dry-run, every tenant
 *   node ai/scripts/migrations/repairStaleEmbeddings.mjs --tenant <id>       # dry-run, one tenant
 *   node ai/scripts/migrations/repairStaleEmbeddings.mjs --limit <n>         # cap rows per run
 *   node ai/scripts/migrations/repairStaleEmbeddings.mjs --apply             # embed and write
 *   node ai/scripts/migrations/repairStaleEmbeddings.mjs --help
 */

// The Neo class system first: every `ai/services/**` module is a `Neo.setupClass` class, and
// `ai/Env.mjs` gatekeeps at module scope, so a service import before this line throws
// `ReferenceError: Neo is not defined`.
import Neo from '../../../src/Neo.mjs';
import        '../../../src/core/_export.mjs';

import {
    EMBEDDING_INPUT_FORMAT_ID,
    EMBEDDING_INPUT_FORMAT_METADATA_KEY
}                                  from '../../services/knowledge-base/helpers/embeddingInputFormat.mjs';
import {planStaleEmbeddingRepair}  from '../../services/knowledge-base/helpers/staleEmbeddingRepair.mjs';
import {
    emptyStaleEmbeddingCensus,
    foldStaleEmbeddingCensus,
    mergeStaleEmbeddingCensus
}                                  from '../../services/knowledge-base/helpers/staleEmbeddingCensus.mjs';

const
    PAGE_SIZE          = 2000,
    DEFAULT_BATCH_SIZE = 64;

/**
 * @summary Parses the flags this script accepts, refusing anything it does not understand.
 *
 * Refuses rather than ignores, matching the census: a mistyped `--tenant` that silently widened the
 * scope would spend provider compute on rows the operator did not ask about.
 * @param {String[]} argv Raw arguments.
 * @returns {{tenant: String|null, apply: Boolean, limit: Number, batchSize: Number, help: Boolean}}
 */
export function parseArgs(argv) {
    const options = {tenant: null, apply: false, limit: Infinity, batchSize: DEFAULT_BATCH_SIZE, help: false};

    const requireValue = (flag, value) => {
        if (typeof value !== 'string' || value.trim() === '') {
            throw new Error(`${flag} expects a non-empty value`);
        }

        return value
    };

    const requirePositiveInt = (flag, raw) => {
        const value = Number(raw);

        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${flag} expects a positive integer`);
        }

        return value
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--apply') {
            options.apply = true
        } else if (arg === '--tenant') {
            options.tenant = requireValue(arg, argv[++i])
        } else if (arg === '--limit') {
            options.limit = requirePositiveInt(arg, argv[++i])
        } else if (arg === '--batch') {
            options.batchSize = requirePositiveInt(arg, argv[++i])
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }

    return options
}

/**
 * @summary Pages a collection's metadata and folds each page into a running census.
 *
 * Metadata only: the classification needs one field, and pulling vectors would make the measurement
 * cost as much as the work it measures. Absence of the marker is the discriminator and ChromaDB has
 * no `$exists`, so this is a scan by necessity rather than by preference.
 *
 * @param {Object} collection Chroma collection handle.
 * @param {Object|null} where Optional tenant scope.
 * @param {Number} [idLimit=0] Ids to retain on the census.
 * @returns {Promise<{census: Object, rows: Array<{id: String, metadata: Object}>}>}
 */
export async function scanCollection(collection, where, idLimit = 0) {
    let census = emptyStaleEmbeddingCensus(),
        offset = 0;

    const rows = [];

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

        const pageRows = ids.map((id, index) => ({id, metadata: page.metadatas?.[index]}));

        rows.push(...pageRows);

        census = mergeStaleEmbeddingCensus(
            census,
            foldStaleEmbeddingCensus({rows: pageRows, idLimit}),
            idLimit
        );

        // A short page ends the walk; a full page might be the last one, so the loop asks again and
        // exits on the empty answer.
        offset += ids.length
    }

    return {census, rows}
}

/**
 * @summary Re-embeds one batch and writes vectors plus markers in a single upsert.
 *
 * The metadata written is the row's STORED metadata with only the format marker overwritten. It is
 * not rebuilt from the reconstructed chunk: that object carries only the fields the provider-input
 * format reads, so rebuilding would drop `tenantId` and every other stored field.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {Array<{id: String, text: String}>} options.targets Rows to repair.
 * @param {Map<String,Object>} options.metadataById Stored metadata, keyed by row id.
 * @param {Function} options.embed Receives the batch's texts, returns their vectors.
 * @returns {Promise<String[]>} The ids whose vector and marker landed together.
 */
export async function repairBatch({collection, targets, metadataById, embed}) {
    if (targets.length === 0) {
        return []
    }

    const embeddings = await embed(targets.map(target => target.text));

    // A provider that returns a different count than it was asked for must not be zipped against the
    // batch by index — that would pair vectors with the wrong rows and stamp every one of them
    // current, which is silent corruption rather than a failed run.
    if (!Array.isArray(embeddings) || embeddings.length !== targets.length) {
        throw new Error(
            `repairStaleEmbeddings: provider returned ${embeddings?.length ?? 0} embedding(s) for ${targets.length} input(s)`
        );
    }

    await collection.upsert({
        ids      : targets.map(target => target.id),
        embeddings,
        metadatas: targets.map(target => ({
            ...(metadataById.get(target.id) || {}),
            [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID
        }))
    });

    return targets.map(target => target.id)
}

/**
 * @summary Repairs every planned target in batches, stopping at the first failed batch.
 *
 * Stopping is deliberate. A provider or daemon that has started failing will keep failing, and
 * continuing would spend compute to accumulate errors; the remainder is returned so the caller can
 * report it rather than letting a short run read as a complete one.
 *
 * @param {Object} options
 * @param {Object} options.collection Chroma collection handle.
 * @param {Array<{id: String, text: String}>} options.targets Rows to repair.
 * @param {Map<String,Object>} options.metadataById Stored metadata, keyed by row id.
 * @param {Function} options.embed Receives a batch's texts, returns their vectors.
 * @param {Number} [options.batchSize=DEFAULT_BATCH_SIZE] Rows per provider request.
 * @returns {Promise<{repairedIds: String[], remainingIds: String[], failure: Error|null}>}
 */
export async function repairTargets({
    collection, targets, metadataById, embed, batchSize = DEFAULT_BATCH_SIZE, shouldYield = () => false
}) {
    const repairedIds = [];

    for (let index = 0; index < targets.length; index += batchSize) {
        // Consulted at the BATCH boundary, which is the only point where stopping is safe: each batch
        // is one upsert carrying vectors and markers together, so yielding between batches leaves no
        // half-written row. The remainder is returned rather than swallowed — a yielded run is
        // partial, and a partial run that reported success would be the failure this lane keeps
        // producing.
        if (index > 0 && shouldYield()) {
            return {
                repairedIds,
                remainingIds: targets.slice(index).map(target => target.id),
                failure     : null,
                yielded     : true
            }
        }

        const batch = targets.slice(index, index + batchSize);

        try {
            repairedIds.push(...await repairBatch({collection, targets: batch, metadataById, embed}))
        } catch (failure) {
            return {
                repairedIds,
                remainingIds: targets.slice(index).map(target => target.id),
                failure,
                yielded     : false
            }
        }
    }

    return {repairedIds, remainingIds: [], failure: null, yielded: false}
}

/**
 * @summary Prints one census block.
 * @param {String} label Scope label.
 * @param {Object} census Census to render.
 * @returns {void}
 */
function report(label, census) {
    console.log(`\n${label}`);
    console.log(`  scanned          ${census.scannedCount}`);
    console.log(`  stale            ${census.staleCount}`);
    console.log(`    pre-marker     ${census.byCause['pre-marker']}`);
    console.log(`    format-changed ${census.byCause['format-changed']}`);
    console.log(`  current          ${census.currentCount}`);

    // The invariant that makes two runs comparable: if it fails, a shrinking stale count is not
    // evidence of repair.
    if (census.staleCount + census.currentCount !== census.scannedCount) {
        console.log('  ⚠️  scanned !== stale + current — a row classified into neither bucket');
    }
}

/**
 * @summary Reports stale rows the repair cannot reconstruct, as unrepaired residue.
 *
 * Separate from the informational pre-run line because this is a terminal disposition: these rows are
 * stale, were not repaired, and no re-run will reach them — the reconstruction has nothing to work
 * with. Naming them here and exiting non-zero is what stops "the run finished" from being read as
 * "the corpus is clean".
 *
 * @param {String[]} emptyInputIds Ids whose stored metadata carries no name and no body.
 * @returns {void}
 */
function reportUnrepairable(emptyInputIds) {
    console.error(
        `\n  UNREPAIRED       ${emptyInputIds.length} stale row(s) cannot be reconstructed — their stored ` +
        'metadata carries no name and no body, so no provider input can be rebuilt for them. They stay ' +
        'stale and a re-run will not reach them.'
    );
    console.error(`                   ${emptyInputIds.slice(0, 10).join(', ')}${emptyInputIds.length > 10 ? ' …' : ''}`);
}

/**
 * @summary Entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        console.log('node ai/scripts/migrations/repairStaleEmbeddings.mjs [--tenant <id>] [--limit <n>] [--batch <n>] [--apply]');
        return
    }

    // Lazy, so importing this module for its exported helpers never reaches the service graph. The
    // specs drive `scanCollection` / `repairTargets` against a fake collection, and a static import
    // here would pull ChromaManager and the memory-core embedding service into every one of them.
    const {default: ChromaManager}        = await import('../../services/knowledge-base/ChromaManager.mjs'),
          {default: TextEmbeddingService} = await import('../../services/memory-core/TextEmbeddingService.mjs'),
          {default: KBRecorderService}    = await import('../../services/knowledge-base/KBRecorderService.mjs'),
          {default: aiConfig}             = await import('../../mcp/server/knowledge-base/config.mjs'),
          {default: mcConfig}             = await import('../../mcp/server/memory-core/config.mjs');

    console.log(`Provider-input format in force: ${EMBEDDING_INPUT_FORMAT_ID}`);
    console.log(`mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);

    const collection = await ChromaManager.getKnowledgeBaseCollection();

    // A missing collection must report "nothing was measured" rather than an empty census, which
    // would read as a clean corpus.
    if (!collection) {
        console.error('knowledge-base collection unavailable — nothing was measured');
        process.exitCode = 1;
        return
    }

    const
        where          = options.tenant ? {tenantId: options.tenant} : null,
        label          = options.tenant ? `tenant ${options.tenant}` : 'all tenants',
        {census, rows} = await scanCollection(collection, where),
        plan           = planStaleEmbeddingRepair({rows, limit: options.limit});

    report(`${label} — before`, census);

    console.log(`\n  selected         ${plan.selectedCount}`);

    if (plan.limitReached) {
        console.log(`  limit reached    yes — ${census.staleCount - plan.selectedCount} stale row(s) not selected this run`);
    }

    if (plan.emptyInputIds.length > 0) {
        console.log(`  un-embeddable    ${plan.emptyInputIds.length} row(s) carry no name and no body: ${plan.emptyInputIds.slice(0, 10).join(', ')}`);
    }

    if (!options.apply) {
        console.log('\nDRY-RUN — no provider request was made and nothing was written. Re-run with --apply to commit.');
        return
    }

    // "Nothing to repair" is a claim about the whole stale population, so it may only be reached when
    // nothing was selected AND nothing was found unreconstructable. A run that selected zero targets
    // while holding stale rows it cannot rebuild is an UNREPAIRED residue, not a clean sweep — and
    // exiting 0 on it is how a partial state comes to wear the terminal phrase.
    if (plan.selectedCount === 0) {
        if (plan.emptyInputIds.length === 0) {
            console.log('\nnothing to repair.');
            return
        }

        reportUnrepairable(plan.emptyInputIds);

        // The after-census still runs: the operator compares two numbers from one instrument, and
        // omitting it here would leave the residue unquantified against the corpus.
        report(`${label} — after`, (await scanCollection(collection, where)).census);
        process.exitCode = 1;
        return
    }

    const metadataById = new Map(rows.map(row => [row.id, row.metadata]));

    const {
        createLeaseYieldVoter,
        resolveHeavyMaintenanceLeasePath,
        withHeavyMaintenanceLease
    } = await import('../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs');

    // Days of provider compute is exactly the class the shared lease exists to serialise, so this
    // takes the same ownership every other heavy KB script takes rather than racing the
    // orchestrator's own kbSync. `KBRecorderService` is passed as the provider-activity recorder so
    // the operator and recovery plane can see the work while it runs — an unrecorded multi-day
    // provider burn is indistinguishable from a hung plane.
    const outcome = await withHeavyMaintenanceLease(
        acquisition => repairTargets({
            collection,
            targets: plan.targets,
            metadataById,
            embed  : texts => TextEmbeddingService.embedTexts(texts, mcConfig.embeddingProvider, {
                operationLabel          : 'knowledge base stale-embedding repair',
                operationStage          : 'kb-stale-embedding-repair',
                providerActivityRecorder: KBRecorderService,
                service                 : 'knowledge-base'
            }),
            batchSize  : options.batchSize,
            shouldYield: createLeaseYieldVoter(acquisition)?.vote ?? (() => false)
        }),
        {
            leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: aiConfig.orchestrator.dataDir}),
            owner       : 'kbStaleEmbeddingRepair',
            reason      : 'manual-cli',
            staleAfterMs: aiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/migrations/repairStaleEmbeddings.mjs'}
        }
    );

    // A HELD lease is not a completed run and must not read as one: nothing was repaired, and the
    // stale population is untouched.
    if (outcome.status === 'held') {
        const held = outcome.lease;

        console.error(
            `\n  DEFERRED         heavy-maintenance lease held by '${held?.owner}' ` +
            `(reason='${held?.reason}', pid=${held?.pid}, acquiredAt=${held?.acquiredAt}). Nothing was repaired.`
        );
        process.exitCode = 1;
        return
    }

    const {repairedIds, remainingIds, failure, yielded} = outcome.result;

    console.log(`\n  repaired         ${repairedIds.length}`);

    if (yielded) {
        // A cooperative yield is PARTIAL. Re-running resumes, but this run did not finish.
        console.error(`  YIELDED          released the lease at a batch boundary; ${remainingIds.length} row(s) not repaired this run.`);
        process.exitCode = 1;
    }

    if (failure) {
        // Reported as a remainder with a count, never as a completed run.
        console.error(`  FAILED mid-run   ${remainingIds.length} row(s) not repaired: ${failure.message}`);
        process.exitCode = 1;
    }

    // The after-census comes from the same instrument as the before-census, so "repaired" is a
    // measurement rather than an inference.
    const {census: after} = await scanCollection(collection, where);

    report(`${label} — after`, after);

    if (after.staleCount > 0) {
        console.log(`\n  ${after.staleCount} stale row(s) remain — re-run to continue.`);
    }

    // Residue survives into the terminal disposition even when every SELECTED row repaired. Rows that
    // could not be reconstructed are stale, were not repaired, and a re-run will not reach them, so a
    // success exit would tell the operator the corpus is clean when it is not.
    if (plan.emptyInputIds.length > 0) {
        reportUnrepairable(plan.emptyInputIds);
        process.exitCode = 1;
    }
}

// Guarded so a spec can import the helpers above without the script connecting to anything.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(`repairStaleEmbeddings failed: ${error.message}`);
        process.exitCode = 1;
    });
}
