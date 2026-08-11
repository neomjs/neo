#!/usr/bin/env node
/**
 * @summary One-shot migration script that renames canonical Neo maintainer identities
 * across the SQLite Native Edge Graph and ChromaDB memory metadata.
 *
 * This handles stable GitHub handle de-versioning while preserving model-version
 * facts in `learn/agentos/ModelStats.md` and AgentIdentity capability fields:
 *
 * - `@neo-opus-4-7` → `@neo-opus-ada`
 * - `@neo-gemini-3-1-pro` → `@neo-gemini-pro`
 * - `@neo-claude-opus` → `@neo-opus-grace`
 *
 * The migration updates identity-keyed graph columns, mirrored JSON fields, and
 * Chroma metadata only. It deliberately does not rewrite memory documents,
 * message bodies, summaries, or other historical prose.
 *
 * Usage:
 *   node ai/scripts/migrations/renameAgentIdentities.mjs                # dry-run (default)
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --apply        # commit migration
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --db <path>    # override SQLite path
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --host <host>  # override ChromaDB host
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --port <port>  # override ChromaDB port
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --graph-only   # skip ChromaDB
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --chroma-only  # skip SQLite graph
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --memory-only  # update neo-agent-memory only
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --session-only # update neo-agent-sessions only
 *   node ai/scripts/migrations/renameAgentIdentities.mjs --help
 *
 * Idempotent: re-running after `--apply` is safe. If both old and new graph nodes
 * exist, the old node is merged into the new node and the old `createdAt` is
 * preserved on the canonical node.
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
const neoRoot    = path.resolve(__dirname, '../../..');

export const IDENTITY_RENAMES = Object.freeze([
    Object.freeze({
        fromNodeId: '@neo-opus-4-7',
        toNodeId  : '@neo-opus-ada',
        fromUserId: 'neo-opus-4-7',
        toUserId  : 'neo-opus-ada'
    }),
    Object.freeze({
        fromNodeId: '@neo-gemini-3-1-pro',
        toNodeId  : '@neo-gemini-pro',
        fromUserId: 'neo-gemini-3-1-pro',
        toUserId  : 'neo-gemini-pro'
    }),
    Object.freeze({
        fromNodeId: '@neo-claude-opus',
        toNodeId  : '@neo-opus-grace',
        fromUserId: 'neo-claude-opus',
        toUserId  : 'neo-opus-grace'
    })
]);

const COLLECTION_MEMORY  = 'neo-agent-memory';
const COLLECTION_SESSION = 'neo-agent-sessions';
const BATCH_SIZE         = 500;

const IDENTITY_METADATA_KEYS = new Set([
    'agentIdentity',
    'agentIdentityNodeId',
    'agentIdentityNodeIds',
    'agentIdentities',
    'agentIds',
    'assignee',
    'assignees',
    'author',
    'canonicalIdentityId',
    'coordinator',
    'coordinator_recommendation',
    'deliveredTo',
    'from',
    'githubLogin',
    'grantedBy',
    'id',
    'identity',
    'identityLogin',
    'identityLogins',
    'owner',
    'participatingAgents',
    'recipient',
    'recipients',
    'requiredA2aMailboxAddress',
    'requiredGithubLogin',
    'sender',
    'sentBy',
    'siblingOf',
    'source',
    'sourceAgentIdentities',
    'target',
    'to',
    'userId'
]);

registerNeoChromaEmbeddingFunctions();

/**
 * @summary Parses CLI flags for the identity rename migration runner.
 * @param {String[]} argv Node process argv array.
 * @returns {Object}
 */
export function parseArgs(argv) {
    const args = {
        apply     : false,
        chromaOnly: false,
        db        : null,
        graphOnly : false,
        help      : false,
        // null = "resolve from the KB server config at run time": the config transitively pulls
        // the Neo class system, so its import is LAZY inside main() behind the bootstrap — flag
        // parsing (and `--help`) must stay runnable in a bare fresh process.
        host       : null,
        memoryOnly : false,
        port       : null,
        sessionOnly: false
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--apply')             args.apply = true;
        else if (arg === '--chroma-only')  args.chromaOnly = true;
        else if (arg === '--graph-only')   args.graphOnly = true;
        else if (arg === '--help')         args.help = true;
        else if (arg === '--memory-only')  args.memoryOnly = true;
        else if (arg === '--session-only') args.sessionOnly = true;
        else if (arg === '--db')           args.db = argv[++i];
        else if (arg === '--host')         args.host = argv[++i];
        else if (arg === '--port')         args.port = Number(argv[++i]);
        else {
            console.error(`Unknown argument: ${arg}`);
            args.help = true;
        }
    }

    if (args.graphOnly && args.chromaOnly) {
        console.error('Cannot combine --graph-only and --chroma-only.');
        args.help = true;
    }
    if (args.memoryOnly && args.sessionOnly) {
        console.error('Cannot combine --memory-only and --session-only.');
        args.help = true;
    }

    return args;
}

function printUsage() {
    console.log(`
Usage: node ai/scripts/migrations/renameAgentIdentities.mjs [options]

Renames versioned Neo maintainer handles across graph identity metadata and
ChromaDB metadata without touching historical document/message text.

Options:
  (no flags)         Dry-run mode — print the migration plan without committing
  --apply            Commit the migration
  --db <path>        Override SQLite graph path (default: .neo-ai-data/sqlite/memory-core-graph.sqlite)
  --host <host>      Override ChromaDB host (default: the KB server config's chroma endpoint; NEO_CHROMA_HOST binds through its leaf)
  --port <port>      Override ChromaDB port (default: the KB server config's chroma endpoint; NEO_CHROMA_PORT binds through its leaf)
  --graph-only       Update only the SQLite Native Edge Graph
  --chroma-only      Update only ChromaDB metadata
  --memory-only      Update only neo-agent-memory Chroma metadata
  --session-only     Update only neo-agent-sessions Chroma metadata
  --help             Print this usage message
`);
}

/**
 * @summary Rewrites identity tokens inside a string value.
 * @param {String} value Source string.
 * @returns {String}
 */
export function rewriteIdentityString(value) {
    return IDENTITY_RENAMES.reduce((text, rename) => {
        return text
            .replaceAll(rename.fromNodeId, rename.toNodeId)
            .replaceAll(rename.fromUserId, rename.toUserId);
    }, value);
}

/**
 * @summary Rewrites identity tokens in a value known to represent identity metadata.
 * @param {*} value Metadata value.
 * @returns {*}
 */
export function rewriteIdentityValue(value) {
    if (typeof value === 'string') {
        return rewriteIdentityString(value);
    }
    if (Array.isArray(value)) {
        return value.map(item => rewriteIdentityValue(item));
    }
    if (value && typeof value === 'object') {
        return rewriteIdentityFields(value);
    }
    return value;
}

/**
 * @summary Rewrites only identity-keyed fields inside graph/Chroma metadata objects.
 * @param {*} value Source metadata value.
 * @returns {*}
 */
export function rewriteIdentityFields(value) {
    if (Array.isArray(value)) {
        return value.map(item => {
            if (item && typeof item === 'object') return rewriteIdentityFields(item);
            return item;
        });
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (IDENTITY_METADATA_KEYS.has(key)) {
            out[key] = rewriteIdentityValue(child);
        } else if (child && typeof child === 'object') {
            out[key] = rewriteIdentityFields(child);
        } else {
            out[key] = child;
        }
    }
    return out;
}

/**
 * @summary Returns true when JSON serialization differs after identity metadata rewrite.
 * @param {*} before Source value.
 * @param {*} after Rewritten value.
 * @returns {Boolean}
 */
function changedJson(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * @summary Rewrites a SQLite row `user_id` column if it stores an old user id.
 * @param {String|null} userId Source user id.
 * @returns {String|null}
 */
function rewriteUserIdColumn(userId) {
    if (typeof userId !== 'string') return userId;
    const match = IDENTITY_RENAMES.find(rename => userId === rename.fromUserId || userId === rename.fromNodeId);
    if (!match) return userId;
    return userId.startsWith('@') ? match.toNodeId : match.toUserId;
}

/**
 * @summary Parses graph JSON defensively for migration reads.
 * @param {String} raw JSON string from SQLite.
 * @returns {Object}
 */
function parseGraphData(raw) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`Invalid graph JSON row: ${e.message}`);
    }
}

/**
 * @summary Merges an old AgentIdentity node into the current canonical node data.
 * @param {Object} oldData Old node data.
 * @param {Object} targetData Canonical node data.
 * @returns {Object}
 */
function mergeIdentityNodeData(oldData, targetData) {
    const merged = rewriteIdentityFields({...targetData});
    merged.id = rewriteIdentityString(String(merged.id));
    merged.properties = {...(merged.properties || {})};

    const oldCreatedAt = oldData?.properties?.createdAt;
    if (oldCreatedAt) {
        merged.properties.createdAt = oldCreatedAt;
    }

    return merged;
}

/**
 * @summary Inserts or updates the target AgentIdentity node before edge rewrites.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} rename Rename descriptor.
 * @param {Boolean} apply True to write, false for dry-run.
 * @param {Object} stats Mutable stats object.
 */
function ensureTargetIdentityNode(db, rename, apply, stats) {
    const oldRow    = db.prepare('SELECT id, user_id, data FROM Nodes WHERE id = ?').get(rename.fromNodeId);
    const targetRow = db.prepare('SELECT id, user_id, data FROM Nodes WHERE id = ?').get(rename.toNodeId);

    if (!oldRow && !targetRow) {
        stats.graph.skipped.push(`missing:${rename.fromNodeId}`);
        return;
    }

    if (!oldRow && targetRow) {
        const targetData = parseGraphData(targetRow.data);
        const nextData   = rewriteIdentityFields(targetData);
        const nextUserId = rewriteUserIdColumn(targetRow.user_id);

        if (changedJson(targetData, nextData) || nextUserId !== targetRow.user_id) {
            if (apply) {
                db.prepare('UPDATE Nodes SET user_id = ?, data = ? WHERE id = ?')
                    .run(nextUserId, JSON.stringify(nextData), targetRow.id);
            }
            stats.graph.nodeMetadataRowsUpdated++;
        }
        return;
    }

    const oldData  = parseGraphData(oldRow.data);
    const nextData = targetRow
        ? mergeIdentityNodeData(oldData, parseGraphData(targetRow.data))
        : rewriteIdentityFields({...oldData, id: rename.toNodeId});

    if (targetRow) {
        if (apply) {
            db.prepare('UPDATE Nodes SET user_id = ?, data = ? WHERE id = ?')
                .run(rewriteUserIdColumn(targetRow.user_id) || rename.toUserId, JSON.stringify(nextData), rename.toNodeId);
        }
        stats.graph.nodesMerged++;
    } else {
        if (apply) {
            db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
                .run(rename.toNodeId, rewriteUserIdColumn(oldRow.user_id) || rename.toUserId, JSON.stringify(nextData));
        }
        stats.graph.nodesInserted++;
    }
}

/**
 * @summary Rewrites or drops edges that structurally point at the old identity node.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} rename Rename descriptor.
 * @param {Boolean} apply True to write, false for dry-run.
 * @param {Object} stats Mutable stats object.
 */
function rewriteIdentityEdges(db, rename, apply, stats) {
    const edges = db.prepare(
        'SELECT id, user_id, source, target, type, data FROM Edges WHERE source = ? OR target = ?'
    ).all(rename.fromNodeId, rename.fromNodeId);

    for (const edge of edges) {
        const nextSource = edge.source === rename.fromNodeId ? rename.toNodeId : edge.source;
        const nextTarget = edge.target === rename.fromNodeId ? rename.toNodeId : edge.target;
        const duplicate  = db.prepare(
            'SELECT id FROM Edges WHERE source = ? AND target = ? AND type = ? AND id != ?'
        ).get(nextSource, nextTarget, edge.type, edge.id);

        if (duplicate) {
            if (apply) {
                db.prepare('DELETE FROM Edges WHERE id = ?').run(edge.id);
            }
            stats.graph.edgesDropped++;
            stats.graph.duplicateCollisions++;
            continue;
        }

        const data = rewriteIdentityFields(parseGraphData(edge.data));
        data.source = nextSource;
        data.target = nextTarget;

        if (apply) {
            db.prepare('UPDATE Edges SET user_id = ?, source = ?, target = ?, data = ? WHERE id = ?')
                .run(rewriteUserIdColumn(edge.user_id), nextSource, nextTarget, JSON.stringify(data), edge.id);
        }
        stats.graph.edgesRewritten++;
    }
}

/**
 * @summary Rewrites identity metadata in all graph rows after structural node moves.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Boolean} apply True to write, false for dry-run.
 * @param {Object} stats Mutable stats object.
 */
function rewriteGraphMetadataRows(db, apply, stats) {
    for (const row of db.prepare('SELECT id, user_id, data FROM Nodes').all()) {
        const data       = parseGraphData(row.data);
        const nextData   = rewriteIdentityFields(data);
        const nextUserId = rewriteUserIdColumn(row.user_id);

        if (nextUserId !== row.user_id || changedJson(data, nextData)) {
            if (apply) {
                db.prepare('UPDATE Nodes SET user_id = ?, data = ? WHERE id = ?')
                    .run(nextUserId, JSON.stringify(nextData), row.id);
            }
            stats.graph.nodeMetadataRowsUpdated++;
        }
    }

    for (const row of db.prepare('SELECT id, user_id, data FROM Edges').all()) {
        const data       = parseGraphData(row.data);
        const nextData   = rewriteIdentityFields(data);
        const nextUserId = rewriteUserIdColumn(row.user_id);

        if (nextUserId !== row.user_id || changedJson(data, nextData)) {
            if (apply) {
                db.prepare('UPDATE Edges SET user_id = ?, data = ? WHERE id = ?')
                    .run(nextUserId, JSON.stringify(nextData), row.id);
            }
            stats.graph.edgeMetadataRowsUpdated++;
        }
    }
}

/**
 * @summary Removes the old identity node after all incoming/outgoing edges moved.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} rename Rename descriptor.
 * @param {Boolean} apply True to write, false for dry-run.
 * @param {Object} stats Mutable stats object.
 */
function deleteOldIdentityNode(db, rename, apply, stats) {
    const oldRow = db.prepare('SELECT id FROM Nodes WHERE id = ?').get(rename.fromNodeId);
    if (!oldRow) return;

    if (apply) {
        db.prepare('DELETE FROM Nodes WHERE id = ?').run(rename.fromNodeId);
    }
    stats.graph.nodesDeleted++;
}

/**
 * @summary Runs the SQLite graph portion of the identity rename migration.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Boolean} apply True to write, false for dry-run.
 * @returns {Object}
 */
export function runGraphMigration(db, apply) {
    const stats = {
        graph: {
            duplicateCollisions    : 0,
            edgeMetadataRowsUpdated: 0,
            edgesDropped           : 0,
            edgesRewritten         : 0,
            nodeMetadataRowsUpdated: 0,
            nodesDeleted           : 0,
            nodesInserted          : 0,
            nodesMerged            : 0,
            skipped                : []
        }
    };

    const work = () => {
        for (const rename of IDENTITY_RENAMES) {
            ensureTargetIdentityNode(db, rename, apply, stats);
            rewriteIdentityEdges(db, rename, apply, stats);
            deleteOldIdentityNode(db, rename, apply, stats);
        }
        rewriteGraphMetadataRows(db, apply, stats);
    };

    if (apply) {
        db.transaction(work)();
    } else {
        work();
    }

    return stats.graph;
}

/**
 * @summary Finds Chroma records whose metadata still contains old identity tokens.
 * @param {Object} collection Chroma collection.
 * @returns {Promise<Object>}
 */
export async function findChromaMetadataUpdates(collection) {
    const updates = [];
    let   scanned = 0;
    let   offset  = 0;

    while (true) {
        const batch = await collection.get({
            limit  : BATCH_SIZE,
            offset,
            include: ['metadatas']
        });

        if (!batch.ids || batch.ids.length === 0) break;

        batch.ids.forEach((id, index) => {
            const metadata = batch.metadatas[index] || {};
            const next     = rewriteIdentityFields(metadata);
            scanned++;

            if (changedJson(metadata, next)) {
                updates.push({id, metadata: next});
            }
        });

        if (batch.ids.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
    }

    return {scanned, updates};
}

/**
 * @summary Applies Chroma metadata updates in bounded batches.
 * @param {Object} collection Chroma collection.
 * @param {Object[]} updates Update records.
 * @returns {Promise<Number>}
 */
async function applyChromaMetadataUpdates(collection, updates) {
    let applied = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const slice = updates.slice(i, i + BATCH_SIZE);
        await collection.update({
            ids      : slice.map(record => record.id),
            metadatas: slice.map(record => record.metadata)
        });
        applied += slice.length;
        process.stdout.write(`\r    updated ${applied}/${updates.length}`);
    }
    process.stdout.write('\n');
    return applied;
}

/**
 * @summary Processes one Chroma collection in dry-run or apply mode.
 * @param {Object} client ChromaDB client.
 * @param {String} collectionName Collection name.
 * @param {Boolean} apply True to write, false for dry-run.
 * @returns {Promise<Object>}
 */
async function processChromaCollection(client, collectionName, apply) {
    console.log(`\n[${collectionName}]`);
    const embeddingFunction = createDynamicTextEmbeddingFunction();
    const collection        = await client.getOrCreateCollection({
        name: collectionName,
        embeddingFunction
    });

    const total              = await collection.count();
    const {scanned, updates} = await findChromaMetadataUpdates(collection);

    console.log(`  total records: ${total}`);
    console.log(`  scanned:       ${scanned}`);
    console.log(`  to update:     ${updates.length}`);

    if (updates.length === 0) {
        console.log('  → no work needed');
        return {scanned, planned: 0, applied: 0};
    }

    if (!apply) {
        console.log(`  → DRY-RUN: would update ${updates.length} metadata record(s)`);
        return {scanned, planned: updates.length, applied: 0};
    }

    console.log(`  → APPLY: updating ${updates.length} metadata record(s)...`);
    const applied = await applyChromaMetadataUpdates(collection, updates);
    return {scanned, planned: updates.length, applied};
}

/**
 * @summary Runs the ChromaDB metadata portion of the identity rename migration.
 * @param {Object} args Parsed CLI args.
 * @returns {Promise<Object>}
 */
async function runChromaMigration(args) {
    const {ChromaClient} = await import('chromadb');
    const client         = new ChromaClient({host: args.host, port: args.port, ssl: false});

    try {
        await client.heartbeat();
    } catch (e) {
        throw new Error(`cannot reach ChromaDB at ${args.host}:${args.port}: ${e.message}`);
    }

    const targetMemory  = !args.sessionOnly;
    const targetSession = !args.memoryOnly;
    const summary       = {memory: null, session: null};

    if (targetMemory) {
        summary.memory = await processChromaCollection(client, COLLECTION_MEMORY, args.apply);
    }
    if (targetSession) {
        summary.session = await processChromaCollection(client, COLLECTION_SESSION, args.apply);
    }

    return summary;
}

/**
 * @summary CLI entrypoint for the identity rename migration.
 * @returns {Promise<void>}
 */
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

    const dbPath = args.db || path.resolve(neoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
    console.log(`[renameAgentIdentities] mode:        ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[renameAgentIdentities] graph:       ${args.chromaOnly ? 'skip' : dbPath}`);
    console.log(`[renameAgentIdentities] chroma:      ${args.graphOnly ? 'skip' : `${args.host}:${args.port}`}`);
    console.log(`[renameAgentIdentities] renames:     ${IDENTITY_RENAMES.map(r => `${r.fromNodeId} → ${r.toNodeId}`).join(', ')}`);

    if (!args.chromaOnly) {
        const Database = (await import('better-sqlite3')).default;
        const db       = new Database(dbPath, {verbose: null});
        try {
            const graphStats = runGraphMigration(db, args.apply);
            console.log('\n[SQLite graph]');
            console.log(`  nodes inserted:          ${graphStats.nodesInserted}`);
            console.log(`  nodes merged:            ${graphStats.nodesMerged}`);
            console.log(`  nodes deleted:           ${graphStats.nodesDeleted}`);
            console.log(`  edges rewritten:         ${graphStats.edgesRewritten}`);
            console.log(`  edges dropped (dupes):   ${graphStats.edgesDropped}`);
            console.log(`  duplicate collisions:    ${graphStats.duplicateCollisions}`);
            console.log(`  node metadata updated:   ${graphStats.nodeMetadataRowsUpdated}`);
            console.log(`  edge metadata updated:   ${graphStats.edgeMetadataRowsUpdated}`);
            console.log(`  skipped:                 ${graphStats.skipped.length}`);
        } finally {
            db.close();
        }
    }

    let chromaSummary = null;
    if (!args.graphOnly) {
        chromaSummary = await runChromaMigration(args);
    }

    console.log('\n[renameAgentIdentities] summary:');
    if (!args.chromaOnly) {
        console.log(`  graph:  ${args.apply ? 'applied' : 'dry-run complete'}`);
    }
    if (chromaSummary?.memory) {
        console.log(`  memory: scanned=${chromaSummary.memory.scanned}, ${args.apply ? `updated=${chromaSummary.memory.applied}` : `would-update=${chromaSummary.memory.planned}`}`);
    }
    if (chromaSummary?.session) {
        console.log(`  session: scanned=${chromaSummary.session.scanned}, ${args.apply ? `updated=${chromaSummary.session.applied}` : `would-update=${chromaSummary.session.planned}`}`);
    }

    if (!args.apply) {
        console.log('\n[renameAgentIdentities] DRY-RUN complete. No changes applied.');
        console.log('[renameAgentIdentities] Re-run with --apply to commit.');
    } else {
        console.log('\n[renameAgentIdentities] APPLY complete. Restart MCP harnesses to refresh identity caches.');
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === __filename) {
    main().catch(err => {
        console.error('[renameAgentIdentities] FATAL:', err);
        process.exit(1);
    });
}
