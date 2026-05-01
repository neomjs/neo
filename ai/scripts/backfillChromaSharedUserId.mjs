#!/usr/bin/env node
/**
 * @summary One-shot migration script that backfills `userId: 'shared'` metadata on
 * pre-#10145 ChromaDB records lacking the `userId` key, restoring tenant-aware read
 * access to the legacy commons.
 *
 * Context: #10556. The Multi-Tenant Identity rollout (#10145, #10000) added
 * `where: {userId}` filters to all reads in `SummaryService` and `MemoryService`.
 * Per ChromaDB's documented filter semantics, records lacking the `userId` key
 * are invisible to ANY where-clause that mentions `userId` (no `$exists` operator).
 * Pre-#10145 records (812 summaries + ~9700 memories on the canonical instance)
 * have no `userId` key, so they're silently filtered out for every stdio agent.
 *
 * The accompanying read-path change in this PR (`SHARED_USER_ID` sentinel +
 * additive `$or` filter) tolerates legacy data ONCE this runner has tagged it.
 * Without running this script, the new filter is functionally a no-op against
 * existing untagged data — same zero-results behavior as today.
 *
 * **Idempotent.** Safe to run multiple times. Records that already have a `userId`
 * key (any value) are skipped. Re-running tags only newly-arrived untagged records,
 * if any.
 *
 * **Metadata-only.** No re-embedding. Embeddings are preserved as-is. Only the
 * `userId` metadata key is added.
 *
 * **Operates on both memory and summary collections.** Default config targets the
 * federated Memory Core ChromaDB instance (port 8001); the unified-mode KB
 * instance is intentionally NOT touched (KB collections are not subject to the
 * Memory Core tenant filter).
 *
 * Usage:
 *   node ai/scripts/backfillChromaSharedUserId.mjs                # dry-run (default)
 *   node ai/scripts/backfillChromaSharedUserId.mjs --apply        # commit the migration
 *   node ai/scripts/backfillChromaSharedUserId.mjs --host <host>  # override ChromaDB host
 *   node ai/scripts/backfillChromaSharedUserId.mjs --port <port>  # override ChromaDB port
 *   node ai/scripts/backfillChromaSharedUserId.mjs --memory-only  # tag only neo-agent-memory
 *   node ai/scripts/backfillChromaSharedUserId.mjs --session-only # tag only neo-agent-sessions
 *   node ai/scripts/backfillChromaSharedUserId.mjs --help
 *
 * @see #10556 — the Fat Ticket; ACs covered by this script + the read-path PR
 * @see #10017 — adjacent SQLite Native Edge Graph migration (different storage layer)
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// MUST match `SHARED_USER_ID` exported from `ai/mcp/server/shared/services/RequestContextService.mjs`.
// Hardcoded (vs imported) because that module transitively pulls in the Neo class system, which
// requires a bootstrap this standalone script intentionally avoids — keeping the migration runner
// dependency-light and fast to invoke. The sync invariant (script literal == service export) is
// asserted by the `SHARED_USER_ID is in sync with the migration runner script's hardcoded copy`
// test in `test/playwright/unit/ai/mcp/server/shared/services/RequestContextService.spec.mjs`,
// which reads this script as text + regex-extracts the constant + compares against the import.
const SHARED_USER_ID = 'shared';

const COLLECTION_MEMORY  = 'neo-agent-memory';
const COLLECTION_SESSION = 'neo-agent-sessions';
const BATCH_SIZE         = 500;

function parseArgs(argv) {
    const args = {
        apply       : false,
        help        : false,
        host        : 'localhost',
        port        : 8001,
        memoryOnly  : false,
        sessionOnly : false
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply')             args.apply = true;
        else if (a === '--help')         args.help = true;
        else if (a === '--memory-only')  args.memoryOnly = true;
        else if (a === '--session-only') args.sessionOnly = true;
        else if (a === '--host')         args.host = argv[++i];
        else if (a === '--port')         args.port = Number(argv[++i]);
        else {
            console.error(`Unknown argument: ${a}`);
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
Usage: node ai/scripts/backfillChromaSharedUserId.mjs [options]

Backfills userId='${SHARED_USER_ID}' on pre-#10145 ChromaDB records lacking the
userId key, restoring tenant-aware read access to legacy data.

Options:
  (no flags)         Dry-run mode — print the migration plan without committing
  --apply            Commit the migration (calls collection.update on all matched ids)
  --host <host>      Override ChromaDB host (default: localhost)
  --port <port>      Override ChromaDB port (default: 8001)
  --memory-only      Tag only the neo-agent-memory collection
  --session-only     Tag only the neo-agent-sessions collection
  --help             Print this usage message

Idempotent: records with any existing userId value are skipped.
Metadata-only: no re-embedding; existing embeddings are preserved.
`);
}

/**
 * Iterates a Chroma collection in batches, accumulating ids of records that lack
 * a `userId` metadata key.
 *
 * @param {Object} collection ChromaDB collection wrapper
 * @returns {Promise<{untaggedIds: String[], totalScanned: Number, alreadyTagged: Number}>}
 */
async function findUntaggedRecords(collection) {
    const untaggedIds = [];
    let totalScanned  = 0;
    let alreadyTagged = 0;
    let batchOffset   = 0;

    while (true) {
        const batch = await collection.get({
            limit  : BATCH_SIZE,
            offset : batchOffset,
            include: ['metadatas']
        });

        if (!batch.ids || batch.ids.length === 0) break;

        batch.ids.forEach((id, index) => {
            const metadata = batch.metadatas[index];
            totalScanned++;

            // Treat both missing key AND empty-string as untagged. Mirrors the
            // COALESCE(...) IS NULL OR = '' pattern in HealthService graph-side checker.
            const userId = metadata && metadata.userId;
            if (userId === undefined || userId === null || userId === '') {
                untaggedIds.push(id);
            } else {
                alreadyTagged++;
            }
        });

        if (batch.ids.length < BATCH_SIZE) break;
        batchOffset += BATCH_SIZE;
    }

    return {untaggedIds, totalScanned, alreadyTagged};
}

/**
 * Tags the given record ids with `userId: SHARED_USER_ID`. Metadata-only update;
 * embeddings are preserved by ChromaDB's `update` semantics.
 *
 * @param {Object}   collection ChromaDB collection wrapper
 * @param {String[]} ids        Record ids to tag
 * @returns {Promise<Number>} Count of tagged records
 */
async function tagRecords(collection, ids) {
    if (ids.length === 0) return 0;

    // Update in batches to stay under any chroma payload limits + give visible progress.
    let tagged = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const slice    = ids.slice(i, i + BATCH_SIZE);
        const metadatas = slice.map(() => ({userId: SHARED_USER_ID}));

        await collection.update({ids: slice, metadatas});
        tagged += slice.length;
        process.stdout.write(`\r    tagged ${tagged}/${ids.length}`);
    }
    process.stdout.write('\n');
    return tagged;
}

async function processCollection(client, collectionName, apply) {
    console.log(`\n[${collectionName}]`);

    // Suppress noisy chromadb-js deserialization warnings; the dummy embedding-function
    // package isn't installed locally but `.get`/`.update` don't need it (metadata-only).
    const origWarn   = console.warn;
    console.warn     = () => {};
    const dummyEmbFn = {
        generate    : async () => [],
        name        : 'dynamic_text_embedding_service',
        getConfig   : () => ({}),
        constructor : {buildFromConfig: () => dummyEmbFn}
    };

    try {
        const collection = await client.getOrCreateCollection({
            name             : collectionName,
            embeddingFunction: dummyEmbFn
        });

        const total = await collection.count();
        console.log(`  total records: ${total}`);

        const {untaggedIds, totalScanned, alreadyTagged} = await findUntaggedRecords(collection);
        console.log(`  scanned:       ${totalScanned}`);
        console.log(`  already tagged: ${alreadyTagged}`);
        console.log(`  to tag:        ${untaggedIds.length}`);

        if (untaggedIds.length === 0) {
            console.log(`  → no work needed for this collection`);
            return {totalScanned, alreadyTagged, tagged: 0, plannedTags: 0};
        }

        if (!apply) {
            console.log(`  → DRY-RUN: would tag ${untaggedIds.length} records with userId='${SHARED_USER_ID}'`);
            return {totalScanned, alreadyTagged, tagged: 0, plannedTags: untaggedIds.length};
        }

        console.log(`  → APPLY: tagging ${untaggedIds.length} records...`);
        const tagged = await tagRecords(collection, untaggedIds);
        return {totalScanned, alreadyTagged, tagged, plannedTags: untaggedIds.length};
    } finally {
        console.warn = origWarn;
    }
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        process.exit(0);
    }

    const targetMemory  = !args.sessionOnly;
    const targetSession = !args.memoryOnly;

    console.log(`[backfillChromaSharedUserId] target host: ${args.host}:${args.port}`);
    console.log(`[backfillChromaSharedUserId] mode:        ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[backfillChromaSharedUserId] sentinel:    userId='${SHARED_USER_ID}'`);
    console.log(`[backfillChromaSharedUserId] collections: ${[targetMemory && COLLECTION_MEMORY, targetSession && COLLECTION_SESSION].filter(Boolean).join(', ')}`);

    const {ChromaClient} = await import('chromadb');
    const client = new ChromaClient({host: args.host, port: args.port, ssl: false});

    // Quick reachability check
    try {
        await client.heartbeat();
    } catch (e) {
        console.error(`[backfillChromaSharedUserId] FATAL: cannot reach ChromaDB at ${args.host}:${args.port}: ${e.message}`);
        process.exit(1);
    }

    const summary = {memory: null, session: null};

    if (targetMemory) {
        summary.memory = await processCollection(client, COLLECTION_MEMORY, args.apply);
    }
    if (targetSession) {
        summary.session = await processCollection(client, COLLECTION_SESSION, args.apply);
    }

    console.log(`\n[backfillChromaSharedUserId] summary:`);
    if (summary.memory) {
        console.log(`  memory:  scanned=${summary.memory.totalScanned}, already=${summary.memory.alreadyTagged}, ${args.apply ? `tagged=${summary.memory.tagged}` : `would-tag=${summary.memory.plannedTags}`}`);
    }
    if (summary.session) {
        console.log(`  session: scanned=${summary.session.totalScanned}, already=${summary.session.alreadyTagged}, ${args.apply ? `tagged=${summary.session.tagged}` : `would-tag=${summary.session.plannedTags}`}`);
    }

    if (!args.apply) {
        console.log(`\n[backfillChromaSharedUserId] DRY-RUN complete. No changes applied.`);
        console.log(`[backfillChromaSharedUserId] Re-run with --apply to commit.`);
    } else {
        console.log(`\n[backfillChromaSharedUserId] APPLY complete. Migration committed.`);
    }
}

main().catch(err => {
    console.error('[backfillChromaSharedUserId] FATAL:', err);
    process.exit(1);
});
