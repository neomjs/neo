/**
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) — KB data-plane CLI.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo                 from '../../../src/Neo.mjs';
import AiConfig            from '../../config.mjs';
import * as core           from '../../../src/core/_export.mjs';
import InstanceManager     from '../../../src/manager/Instance.mjs';
import fs                  from 'fs';
import readline            from 'readline';
import {pathToFileURL}     from 'url';
import KB_Config           from '../../mcp/server/knowledge-base/config.mjs';
import KB_ChromaManager    from '../../services/knowledge-base/ChromaManager.mjs';
import KB_IngestionService from '../../services/knowledge-base/IngestionService.mjs';
import KB_LifecycleService from '../../services/knowledge-base/DatabaseLifecycleService.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module ai/scripts/maintenance/ingestTenant
 *
 * @summary Bulk-facade CLI (`npm run ai:ingest-tenant`) for Cloud-Native KB Ingestion.
 *
 * Streams `parsed-chunk-v1` JSONL records (one record per line) from a file or stdin into the
 * Knowledge Base via {@link Neo.ai.services.knowledge-base.IngestionService}. This is
 * the bulk data-plane counterpart to the `ingest_source_files` MCP small-batch facade:
 * initial tenant onboarding (5k–50k chunks) and large `git push` hook bursts exceed the
 * MCP work-volume gate (`aiConfig.mcpSyncMaxChunks`), so the CLI calls `ingestSourceFiles` with
 * `viaMcp: false` — an explicit opt-in to long-running bulk work that bypasses that gate.
 *
 * Records are flushed in batches (`--batch-size`, default 500) so a multi-thousand-record push
 * streams incrementally rather than materializing the whole corpus in memory. The heavy work is
 * wrapped in the shared heavy-maintenance lease so a bulk ingest cannot collide with `ai:sync-kb`
 * or the orchestrator's `kbSync` task on the unified Chroma `knowledge-base` collection.
 *
 * `parseArgs`, `readJsonlRecords`, and `runIngest` are exported as pure, dependency-injectable
 * units; the CLI auto-runs only when invoked directly (the `import.meta` main guard), so the
 * module can be imported substrate-free by unit tests.
 *
 * Usage: `npm run ai:ingest-tenant -- <tenantId> (--from-file <path.jsonl> | --from-stdin) [--batch-size <n>]`
 */

const DEFAULT_BATCH_SIZE = 500;

/**
 * @summary Parses the CLI argv into a structured options object.
 * @param {String[]} argv `process.argv.slice(2)`.
 * @returns {{tenantId: String|null, fromFile: String|null, fromStdin: Boolean, batchSize: Number}}
 */
function parseArgs(argv) {
    const args       = {tenantId: null, fromFile: null, fromStdin: false, batchSize: DEFAULT_BATCH_SIZE};
    const positional = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--from-file') {
            args.fromFile = argv[++i];
        } else if (arg === '--from-stdin') {
            args.fromStdin = true;
        } else if (arg === '--batch-size') {
            args.batchSize = Number(argv[++i]);
        } else if (!arg.startsWith('--')) {
            positional.push(arg);
        }
    }

    args.tenantId = positional[0] || null;
    return args;
}

/**
 * @summary Prints CLI usage to stderr.
 * @returns {void}
 */
function printUsage() {
    console.error('Usage: npm run ai:ingest-tenant -- <tenantId> (--from-file <path.jsonl> | --from-stdin) [--batch-size <n>]');
}

/**
 * @summary Async-generates `parsed-chunk-v1` records from a JSONL stream, one record per line.
 *
 * Takes the readable stream directly (not a file path) so unit tests can drive it with an
 * in-memory `Readable`. Blank lines are skipped; a line that fails `JSON.parse` yields a
 * `parseError` entry instead of throwing, so one malformed line never aborts the stream.
 *
 * @param {ReadableStream} input A readable stream of UTF-8 JSONL text (a file stream or stdin).
 * @yields {{record: Object, lineNo: Number}|{parseError: String, lineNo: Number}}
 */
async function* readJsonlRecords(input) {
    const rl     = readline.createInterface({input, crlfDelay: Infinity});
    let   lineNo = 0;

    for await (const line of rl) {
        lineNo++;
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            yield {record: JSON.parse(trimmed), lineNo};
        } catch (error) {
            yield {parseError: error.message, lineNo};
        }
    }
}

/**
 * @summary Batches an async stream of parsed records and ingests each batch, aggregating a summary.
 *
 * Pure orchestration: `ingestFn` is injected so unit tests can verify batching, error handling,
 * and summary aggregation without the Knowledge Base substrate. JSONL `parseError` entries are
 * counted and recorded as structured errors; valid records are flushed in `batchSize` groups.
 *
 * @param {Object}        options
 * @param {AsyncIterable} options.records  Async iterable of `readJsonlRecords` entries.
 * @param {Number}        options.batchSize Records per `ingestFn` call.
 * @param {Function}      options.ingestFn `async (files) => summary` — ingests one batch.
 * @param {Function}     [options.onBatch] `(batchNumber, summary) => void` progress callback.
 * @returns {Promise<{ingested: Number, embeddingsGenerated: Number, deleted: Number, batches: Number, parseErrors: Number, errors: Array}>}
 */
async function runIngest({records, batchSize, ingestFn, onBatch}) {
    const totals = {ingested: 0, embeddingsGenerated: 0, deleted: 0, batches: 0, parseErrors: 0, errors: []};
    let   batch  = [];

    const flushBatch = async () => {
        if (batch.length === 0) return;

        totals.batches++;
        const pending = batch;
        batch = [];

        const summary = await ingestFn(pending);

        totals.ingested            += summary.ingested            || 0;
        totals.embeddingsGenerated += summary.embeddingsGenerated || 0;
        totals.deleted             += summary.deleted             || 0;

        if (summary.errors?.length) {
            totals.errors.push(...summary.errors);
        }

        onBatch?.(totals.batches, summary);
    };

    for await (const {record, parseError, lineNo} of records) {
        if (parseError) {
            totals.parseErrors++;
            totals.errors.push({
                code   : 'KB_INGEST_CLI_JSONL_PARSE_FAILED',
                message: `Line ${lineNo}: ${parseError}`
            });
            continue;
        }

        batch.push(record);

        if (batch.length >= batchSize) {
            await flushBatch();
        }
    }

    await flushBatch();
    return totals;
}

/**
 * @summary CLI entry point — streams a tenant's parsed-chunk-v1 JSONL into the Knowledge Base.
 * @returns {Promise<void>}
 */
async function ingestTenant() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.tenantId || (!args.fromFile && !args.fromStdin) || (args.fromFile && args.fromStdin)) {
        printUsage();
        process.exit(1);
    }

    if (!Number.isInteger(args.batchSize) || args.batchSize < 1) {
        console.error(`❌ Invalid --batch-size '${args.batchSize}'; must be a positive integer.`);
        process.exit(1);
    }

    if (args.fromFile && !fs.existsSync(args.fromFile)) {
        console.error(`❌ --from-file path does not exist: ${args.fromFile}`);
        process.exit(1);
    }

    // Enable debug logging for ingest visibility. B4-safe activation: drive NEO_DEBUG via the
    // Provider override API, never mutate the read-only reactive Provider.
    KB_Config.setEnvOverride('NEO_DEBUG', true);
    console.log(`⏳ ai:ingest-tenant — tenant='${args.tenantId}', source=${args.fromStdin ? 'stdin' : args.fromFile}, batchSize=${args.batchSize}`);

    let outcome;

    try {
        outcome = await withHeavyMaintenanceLease(
            async () => {
                await KB_LifecycleService.ready();
                await KB_ChromaManager.ready();
                await KB_IngestionService.ready();
                console.log('✅ KB services ready. Streaming parsed-chunk-v1 records...');

                const input = args.fromStdin ? process.stdin : fs.createReadStream(args.fromFile, 'utf8');

                return runIngest({
                    records  : readJsonlRecords(input),
                    batchSize: args.batchSize,
                    // Bulk path: viaMcp:false bypasses the MCP work-volume gate for tenant-scale ingestion.
                    ingestFn: files => KB_IngestionService.ingestSourceFiles({tenantId: args.tenantId, files, viaMcp: false}),
                    onBatch : (batchNumber, summary) => console.log(
                        `   batch ${batchNumber}: ${summary.ingested} ingested, ${summary.embeddingsGenerated} embedded` +
                        (summary.errors?.length ? `, ${summary.errors.length} error(s)` : '')
                    )
                });
            },
            {
                leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
                owner       : 'kbIngest',
                reason      : 'manual-cli',
                staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
                metadata    : {script: 'ai/scripts/maintenance/ingestTenant.mjs', tenantId: args.tenantId}
            }
        );
    } catch (error) {
        console.error('❌ ai:ingest-tenant failed:', error);
        process.exit(1);
    }

    if (outcome.status === 'held') {
        const held = outcome.lease;
        console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}). Re-invoke once it completes.`);
        process.exit(0);
    }

    const totals = outcome.result;
    console.log(`✅ ai:ingest-tenant complete — tenant='${args.tenantId}': ${totals.ingested} ingested, ` +
        `${totals.embeddingsGenerated} embedded, ${totals.deleted} deleted across ${totals.batches} batch(es); ` +
        `${totals.parseErrors} JSONL parse error(s), ${totals.errors.length} total error(s).`);
    console.log(JSON.stringify({tenantId: args.tenantId, ...totals}, null, 2));

    process.exit(totals.errors.length > 0 ? 1 : 0);
}

// Auto-run only when invoked directly as the CLI — not when imported by unit tests.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    ingestTenant();
}

export {parseArgs, readJsonlRecords, runIngest};
