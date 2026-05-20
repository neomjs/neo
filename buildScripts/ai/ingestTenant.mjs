// Neo namespace bootstrap (entry-point invariant) — KB data-plane CLI.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo                          from '../../src/Neo.mjs';
import * as core                    from '../../src/core/_export.mjs';
import InstanceManager              from '../../src/manager/Instance.mjs';
import fs                           from 'fs';
import readline                     from 'readline';
import KB_Config                    from '../../ai/mcp/server/knowledge-base/config.mjs';
import KB_ChromaManager             from '../../ai/services/knowledge-base/ChromaManager.mjs';
import KB_IngestionService          from '../../ai/services/knowledge-base/KnowledgeBaseIngestionService.mjs';
import KB_LifecycleService          from '../../ai/services/knowledge-base/DatabaseLifecycleService.mjs';
import {withHeavyMaintenanceLease}  from '../../ai/daemons/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module buildScripts/ai/ingestTenant
 *
 * @summary Phase 2C bulk-facade CLI (`npm run ai:ingest-tenant`) for Cloud-Native KB Ingestion.
 *
 * Streams `parsed-chunk-v1` JSONL records (one record per line) from a file or stdin into the
 * Knowledge Base via {@link Neo.ai.services.knowledge-base.KnowledgeBaseIngestionService}. This is
 * the bulk data-plane counterpart to the `ingest_source_files` MCP small-batch facade (#11634):
 * initial tenant onboarding (5k–50k chunks) and large `git push` hook bursts exceed the #10572
 * MCP work-volume gate (`aiConfig.mcpSyncMaxChunks`), so the CLI calls `ingestSourceFiles` with
 * `viaMcp: false` — an explicit opt-in to long-running bulk work that bypasses that gate.
 *
 * Records are flushed in batches (`--batch-size`, default 500) so a multi-thousand-record push
 * streams incrementally rather than materializing the whole corpus in memory. The heavy work is
 * wrapped in the shared heavy-maintenance lease so a bulk ingest cannot collide with `ai:sync-kb`
 * or the orchestrator's `kbSync` task on the unified Chroma `knowledge-base` collection.
 *
 * Usage: `npm run ai:ingest-tenant <tenantId> (--from-file <path.jsonl> | --from-stdin) [--batch-size <n>]`
 *
 * @see https://github.com/neomjs/neo/issues/11635
 * @see https://github.com/neomjs/neo/issues/11624
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
    console.error('Usage: npm run ai:ingest-tenant <tenantId> (--from-file <path.jsonl> | --from-stdin) [--batch-size <n>]');
}

/**
 * @summary Async-generates `parsed-chunk-v1` records from a JSONL file or stdin, line by line.
 * @param {Object} args Parsed CLI options.
 * @yields {{record: Object, lineNo: Number}|{parseError: String, lineNo: Number}}
 */
async function* readJsonlRecords(args) {
    const input = args.fromStdin ? process.stdin : fs.createReadStream(args.fromFile, 'utf8');
    const rl    = readline.createInterface({input, crlfDelay: Infinity});
    let lineNo  = 0;

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

    KB_Config.data.debug = true;
    console.log(`⏳ ai:ingest-tenant — tenant='${args.tenantId}', source=${args.fromStdin ? 'stdin' : args.fromFile}, batchSize=${args.batchSize}`);

    let outcome;

    try {
        outcome = await withHeavyMaintenanceLease(
            async () => {
                await KB_LifecycleService.ready();
                await KB_ChromaManager.ready();
                await KB_IngestionService.ready();
                console.log('✅ KB services ready. Streaming parsed-chunk-v1 records...');

                const totals = {ingested: 0, embeddingsGenerated: 0, deleted: 0, batches: 0, parseErrors: 0, errors: []};
                let batch    = [];

                const flushBatch = async () => {
                    if (batch.length === 0) return;

                    totals.batches++;
                    const pending = batch;
                    batch = [];

                    // Bulk path: viaMcp:false bypasses the #10572 work-volume gate (#11635 Phase 2C).
                    const summary = await KB_IngestionService.ingestSourceFiles({
                        tenantId: args.tenantId,
                        files   : pending,
                        viaMcp  : false
                    });

                    totals.ingested            += summary.ingested;
                    totals.embeddingsGenerated += summary.embeddingsGenerated;
                    totals.deleted             += summary.deleted;

                    if (summary.errors?.length) {
                        totals.errors.push(...summary.errors);
                    }

                    console.log(`   batch ${totals.batches}: ${summary.ingested} ingested, ${summary.embeddingsGenerated} embedded` +
                        (summary.errors?.length ? `, ${summary.errors.length} error(s)` : ''));
                };

                for await (const {record, parseError, lineNo} of readJsonlRecords(args)) {
                    if (parseError) {
                        totals.parseErrors++;
                        totals.errors.push({
                            code   : 'KB_INGEST_CLI_JSONL_PARSE_FAILED',
                            message: `Line ${lineNo}: ${parseError}`
                        });
                        continue;
                    }

                    batch.push(record);

                    if (batch.length >= args.batchSize) {
                        await flushBatch();
                    }
                }

                await flushBatch();
                return totals;
            },
            {owner: 'kbIngest', reason: 'manual-cli', metadata: {script: 'buildScripts/ai/ingestTenant.mjs', tenantId: args.tenantId}}
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

ingestTenant();
