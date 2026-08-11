#!/usr/bin/env node
/**
 * @summary One-shot migration script that backfills `userId: 'shared'` metadata on
 * legacy ChromaDB records lacking the `userId` key, and promotes core-swarm session
 * summaries to the shared visibility contract.
 *
 * Context: the Multi-Tenant Identity rollout added
 * `where: {userId}` filters to all reads in `SummaryService` and `MemoryService`.
 * Per ChromaDB's documented filter semantics, records lacking the `userId` key
 * are invisible to ANY where-clause that mentions `userId` (no `$exists` operator).
 * Legacy records (812 summaries + ~9700 memories on the canonical instance)
 * have no `userId` key, so they're silently filtered out for every stdio agent.
 *
 * The accompanying read-path change in this PR (`SHARED_USER_ID` sentinel +
 * additive `$or` filter) tolerates legacy data ONCE this runner has tagged it.
 * Without running this script, the new filter is functionally a no-op against
 * existing untagged data — same zero-results behavior as today.
 *
 * **Idempotent.** Safe to run multiple times. Memory records that already have a `userId`
 * key are skipped. Session-summary records are updated when they either lack `userId` OR
 * list a named core-swarm maintainer in `participatingAgents` but are not already tagged
 * as shared. Re-running tags only newly-arrived migration debt, if any.
 *
 * **Metadata-only.** No re-embedding. Embeddings are preserved as-is. Only the
 * `userId` metadata key is added or updated.
 *
 * **Operates on both memory and summary collections.** Default config targets the
 * unified ChromaDB instance (port 8000).
 *
 * Usage:
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs                # dry-run (default)
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --apply        # commit the migration
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --host <host>  # override ChromaDB host
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --port <port>  # override ChromaDB port
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --memory-only  # tag only neo-agent-memory
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --session-only # tag only neo-agent-sessions
 *   node ai/scripts/migrations/backfillChromaSharedUserId.mjs --help
 *
 * @see ai/mcp/server/shared/services/RequestContextService.mjs
 * @see ai/services/memory-core/SummaryService.mjs
 * @plane in-plane
 */

import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    createDynamicTextEmbeddingFunction,
    registerNeoChromaEmbeddingFunctions
} from '../../services/shared/vector/chromaClientPrimitives.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// MUST match `SHARED_USER_ID` exported from `ai/mcp/server/shared/services/RequestContextService.mjs`.
// Hardcoded (vs imported) because that module transitively pulls in the Neo class system, which
// needs the runtime global before any class module evaluates — and THIS module's import scope
// (plus the `--help` path) must stay runnable in a bare fresh process. A real migration run
// bootstraps Neo lazily inside main() for config resolution only; module scope stays
// bootstrap-free. The sync invariant (script literal == service export) is asserted by the
// `SHARED_USER_ID is in sync with the migration runner script's hardcoded copy` test in
// `test/playwright/unit/ai/mcp/server/shared/services/RequestContextService.spec.mjs`,
// which reads this script as text + regex-extracts the constant + compares against the import.
const SHARED_USER_ID = 'shared';

// MUST match `CORE_SWARM_USER_IDS` exported from RequestContextService. Duplicated here for
// the same no-Neo-bootstrap reason as SHARED_USER_ID above; unit tests enforce the sync.
const CORE_SWARM_USER_IDS = Object.freeze([
    'neo-opus-ada',
    'neo-opus-grace',
    'neo-opus-vega',
    'neo-gemini-pro',
    'neo-gpt'
]);

const COLLECTION_MEMORY  = 'neo-agent-memory';
const COLLECTION_SESSION = 'neo-agent-sessions';
const BATCH_SIZE         = 500;

registerNeoChromaEmbeddingFunctions();

function parseArgs(argv) {
    const args = {
        apply: false,
        help : false,
        // null = "resolve from the KB server config at run time": the config transitively pulls
        // the Neo class system, so its import is LAZY inside main() behind the bootstrap — flag
        // parsing (and `--help`) must stay runnable in a bare fresh process.
        host       : null,
        port       : null,
        memoryOnly : false,
        sessionOnly: false,
        debugHidden: false
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply')             args.apply = true;
        else if (a === '--help')         args.help = true;
        else if (a === '--memory-only')  args.memoryOnly = true;
        else if (a === '--session-only') args.sessionOnly = true;
        else if (a === '--debug-hidden') args.debugHidden = true;
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
Usage: node ai/scripts/migrations/backfillChromaSharedUserId.mjs [options]

Backfills userId='${SHARED_USER_ID}' on pre-#10145 ChromaDB records lacking the
userId key, restoring tenant-aware read access to legacy data.

Options:
  (no flags)         Dry-run mode — print the migration plan without committing
  --apply            Commit the migration (calls collection.update on all matched ids)
  --host <host>      Override ChromaDB host (default: the KB server config's chroma endpoint; NEO_CHROMA_HOST binds through its leaf)
  --port <port>      Override ChromaDB port (default: the KB server config's chroma endpoint; NEO_CHROMA_PORT binds through its leaf)
  --memory-only      Tag only the neo-agent-memory collection
  --session-only     Tag only the neo-agent-sessions collection
  --debug-hidden     Diagnostic dump of records to investigate parser shapes
  --help             Print this usage message

Idempotent: memory records with any existing userId value are skipped; session
summaries involving core swarm peers are promoted to userId='${SHARED_USER_ID}'.
Metadata-only: no re-embedding; existing embeddings are preserved.
`);
}

/**
 * @param {String|null|undefined} input
 * @returns {String|undefined}
 */
function normalizeUserId(input) {
    if (input == null) return undefined;
    const str = String(input);
    return str.startsWith('@') ? str.slice(1) : str;
}

/**
 * @param {String|String[]|null|undefined} input
 * @returns {String[]}
 */
function parseAgentList(input) {
    if (input == null) return [];

    const values = Array.isArray(input) ? input : String(input).split(',');
    return values
        .map(value => {
            let str = String(value).trim();
            // Remove agent wrappers like " (Antigravity)"
            str = str.replace(/\s*\(.*?\)\s*/g, '');
            // Lowercase to normalize e.g. "Neo-Gemini-Pro" to "neo-gemini-pro"
            str = str.toLowerCase();
            return normalizeUserId(str);
        })
        .filter(Boolean);
}

/**
 * @param {String|String[]|null|undefined} participatingAgents
 * @returns {Boolean}
 */
function hasCoreSwarmParticipant(participatingAgents) {
    const participants = new Set(parseAgentList(participatingAgents));
    return CORE_SWARM_USER_IDS.some(userId => participants.has(userId));
}

/**
 * Iterates a Chroma collection in batches, accumulating ids of records that need
 * the `userId: shared` metadata tag.
 *
 * @param {Object} collection ChromaDB collection wrapper
 * @param {Object} options
 * @param {Boolean} [options.promoteCoreSwarmSummaries=false]
 * @param {Boolean} [options.debugHidden=false]
 * @returns {Promise<{tagRecords: Object[], totalScanned: Number, alreadyTagged: Number, untagged: Number, alreadyShared: Number, coreSwarmParticipant: Number}>}
 */
async function findRecordsToTag(collection, {promoteCoreSwarmSummaries = false, debugHidden = false} = {}) {
    const tagRecords           = [];
    let   totalScanned         = 0;
    let   alreadyTagged        = 0;
    let   untagged             = 0;
    let   alreadyShared        = 0;
    let   coreSwarmParticipant = 0;
    let   batchOffset          = 0;

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
            const userId           = metadata && metadata.userId;
            const normalizedUserId = normalizeUserId(userId);
            const missingUserId    = userId === undefined || userId === null || userId === '';
            const hasCorePeer      = promoteCoreSwarmSummaries && hasCoreSwarmParticipant(metadata?.participatingAgents);

            if (missingUserId) {
                untagged++;
            } else {
                alreadyTagged++;
            }

            if (normalizedUserId === SHARED_USER_ID) {
                alreadyShared++;
            }
            if (hasCorePeer) {
                coreSwarmParticipant++;
            }

            if (normalizedUserId !== SHARED_USER_ID && (missingUserId || hasCorePeer)) {
                tagRecords.push({id, metadata: metadata || {}});
                if (debugHidden && hasCorePeer && !missingUserId) {
                    console.log(`[DEBUG] Hidden Record Identified (will be tagged): ID=${id}, userId=${userId}, participatingAgents=${metadata?.participatingAgents}`);
                }
            } else if (debugHidden && promoteCoreSwarmSummaries && !hasCorePeer && metadata?.participatingAgents) {
                // Check if it might have been missed due to shape variation
                const rawParticipants = String(metadata.participatingAgents);
                if (CORE_SWARM_USER_IDS.some(u => rawParticipants.includes(u))) {
                    console.log(`[DEBUG] Potential Parser Miss: ID=${id}, userId=${userId}, participatingAgents=${metadata.participatingAgents}`);
                }
            }
        });

        if (batch.ids.length < BATCH_SIZE) break;
        batchOffset += BATCH_SIZE;
    }

    return {tagRecords, totalScanned, alreadyTagged, untagged, alreadyShared, coreSwarmParticipant};
}

/**
 * Tags the given records with `userId: SHARED_USER_ID`. Metadata-only update;
 * embeddings are preserved by ChromaDB's `update` semantics, and all existing
 * metadata keys are preserved in the update payload.
 *
 * @param {Object}   collection ChromaDB collection wrapper
 * @param {Object[]} records    Records to tag: `{id, metadata}`
 * @returns {Promise<Number>} Count of tagged records
 */
async function tagRecords(collection, records) {
    if (records.length === 0) return 0;

    // Update in batches to stay under any chroma payload limits + give visible progress.
    let tagged = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const slice     = records.slice(i, i + BATCH_SIZE);
        const ids       = slice.map(record => record.id);
        const metadatas = slice.map(record => ({...record.metadata, userId: SHARED_USER_ID}));

        await collection.update({ids, metadatas});
        tagged += slice.length;
        process.stdout.write(`\r    tagged ${tagged}/${records.length}`);
    }
    process.stdout.write('\n');
    return tagged;
}

async function processCollection(client, collectionName, args) {
    const apply = args.apply;
    console.log(`\n[${collectionName}]`);

    const embeddingFunction = createDynamicTextEmbeddingFunction();

    const collection = await client.getOrCreateCollection({
        name             : collectionName,
        embeddingFunction
    });

    const total = await collection.count();
    console.log(`  total records: ${total}`);

    const promoteCoreSwarmSummaries                                                                              = collectionName === COLLECTION_SESSION;
    const {tagRecords: recordsToTag, totalScanned, alreadyTagged, untagged, alreadyShared, coreSwarmParticipant} = await findRecordsToTag(collection, {
        promoteCoreSwarmSummaries,
        debugHidden: args.debugHidden
    });
    console.log(`  scanned:                  ${totalScanned}`);
    console.log(`  already tagged:           ${alreadyTagged}`);
    console.log(`  already shared:           ${alreadyShared}`);
    console.log(`  untagged:                 ${untagged}`);
    if (promoteCoreSwarmSummaries) {
        console.log(`  core swarm participants:  ${coreSwarmParticipant}`);
    }
    console.log(`  to tag:                   ${recordsToTag.length}`);

    if (recordsToTag.length === 0) {
        console.log(`  → no work needed for this collection`);
        return {totalScanned, alreadyTagged, alreadyShared, untagged, coreSwarmParticipant, tagged: 0, plannedTags: 0};
    }

    if (!apply) {
        console.log(`  → DRY-RUN: would tag ${recordsToTag.length} records with userId='${SHARED_USER_ID}'`);
        return {totalScanned, alreadyTagged, alreadyShared, untagged, coreSwarmParticipant, tagged: 0, plannedTags: recordsToTag.length};
    }

    console.log(`  → APPLY: tagging ${recordsToTag.length} records...`);
    const tagged = await tagRecords(collection, recordsToTag);
    return {totalScanned, alreadyTagged, alreadyShared, untagged, coreSwarmParticipant, tagged, plannedTags: recordsToTag.length};
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        process.exit(0);
    }

    // The KB server config OWNS the chroma endpoint (default + the NEO_CHROMA_* env bindings) —
    // consumed at the use site. Its import chain evaluates Neo class modules, which need the
    // runtime global first, so the bootstrap + config import are LAZY and sequenced here: the
    // module import and the `--help` path above stay runnable in a bare fresh process.
    if (args.host == null || args.port == null) {
        await import('../../../src/Neo.mjs');
        await import('../../../src/core/_export.mjs');
        const {default: kbConfig} = await import('../../mcp/server/knowledge-base/config.mjs');
        args.host ??= kbConfig.host;
        args.port ??= kbConfig.port;
    }

    const targetMemory  = !args.sessionOnly;
    const targetSession = !args.memoryOnly;

    console.log(`[backfillChromaSharedUserId] target host: ${args.host}:${args.port}`);
    console.log(`[backfillChromaSharedUserId] mode:        ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[backfillChromaSharedUserId] sentinel:    userId='${SHARED_USER_ID}'`);
    console.log(`[backfillChromaSharedUserId] collections: ${[targetMemory && COLLECTION_MEMORY, targetSession && COLLECTION_SESSION].filter(Boolean).join(', ')}`);

    const {ChromaClient} = await import('chromadb');
    const client         = new ChromaClient({host: args.host, port: args.port, ssl: false});

    // Quick reachability check
    try {
        await client.heartbeat();
    } catch (e) {
        console.error(`[backfillChromaSharedUserId] FATAL: cannot reach ChromaDB at ${args.host}:${args.port}: ${e.message}`);
        process.exit(1);
    }

    const summary = {memory: null, session: null};

    if (targetMemory) {
        summary.memory = await processCollection(client, COLLECTION_MEMORY, args);
    }
    if (targetSession) {
        summary.session = await processCollection(client, COLLECTION_SESSION, args);
    }

    console.log(`\n[backfillChromaSharedUserId] summary:`);
    if (summary.memory) {
        console.log(`  memory:  scanned=${summary.memory.totalScanned}, already=${summary.memory.alreadyTagged}, ${args.apply ? `tagged=${summary.memory.tagged}` : `would-tag=${summary.memory.plannedTags}`}`);
    }
    if (summary.session) {
        console.log(`  session: scanned=${summary.session.totalScanned}, already=${summary.session.alreadyTagged}, core-swarm=${summary.session.coreSwarmParticipant}, ${args.apply ? `tagged=${summary.session.tagged}` : `would-tag=${summary.session.plannedTags}`}`);
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
