#!/usr/bin/env node
/**
 * @summary One-shot migration script that normalizes graph identity state by merging
 * legacy alias `AgentIdentity` nodes into their canonical counterparts and
 * purging test-fixture nodes that leaked into the production SQLite graph.
 *
 * Canonical swarm identities use `@neo-opus-ada`, `@neo-gemini-pro`,
 * and `@tobiu` nodes with full metadata (`githubLogin`, `modelFamily`,
 * `accountType`). Earlier seeding left behind `@opus` and `@gemini` as
 * orphan alias nodes with null metadata. Additionally, historical unit-test
 * fixture nodes such as `AGENT:alice` and `AGENT:bob` can persist in the live
 * SQLite graph. This script consolidates them.
 *
 * **Usage**:
 *   node ai/scripts/migrations/normalizeGraphIdentities.mjs             # dry-run (default)
 *   node ai/scripts/migrations/normalizeGraphIdentities.mjs --apply     # commit the migration
 *   node ai/scripts/migrations/normalizeGraphIdentities.mjs --db <path> # override SQLite path
 *   node ai/scripts/migrations/normalizeGraphIdentities.mjs --help      # print usage
 *
 * **Idempotent**: re-running after `--apply` is a safe no-op. The script detects
 * already-purged aliases / test fixtures and skips them with a logged no-op notice.
 *
 * **Atomicity**: `--apply` wraps all writes in a single SQLite transaction. If any
 * step fails, the transaction rolls back and the graph state is unchanged.
 *
 * **Duplicate-edge handling**: when an alias edge would duplicate an existing canonical
 * edge (same source, target, type), the alias edge is dropped rather than rewritten.
 * This preserves unique-edge invariants and handles the (rare) case where history
 * wrote both alias-sourced and canonical-sourced edges for the same semantic relation.
 *
 * **What this script does NOT do**:
 *   - ChromaDB metadata updates (orthogonal substrate; Chroma `userId` metadata rows
 *     referencing `@opus`/`@gemini` remain as-is. Not load-bearing for mailbox routing
 *     but a secondary cleanup if/when empirical demand surfaces.)
 *   - DreamService / Retrospective daemon reindexing (memories/summaries referencing
 *     the aliases become stale pointers; accept the staleness as low-frequency read path)
 *   - Hot-reload in a running MCP process (restart harnesses after `--apply` to pick
 *     up the clean graph state)
 *   - Identity RENAME re-keying (e.g. `@neo-claude-opus` → `@neo-opus-grace`): re-keying a renamed
 *     identity's `user_id`-scoped rows (`AGENT_MEMORY` / `MEMORY` / `SESSION`) + their Chroma
 *     metadata is `renameAgentIdentities.mjs`'s job (its `IDENTITY_RENAMES` + the all-node/edge
 *     `user_id` sweep `rewriteGraphMetadataRows`), NOT this script's. This one only merges legacy
 *     *alias* `AgentIdentity` nodes + re-points their edges; it does not touch memory-row RLS scope.
 *
 * @see learn/agentos/tooling/MemoryCoreMcpAuth.md §Identity Normalization Migration
 * @plane in-plane
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');

/**
 * Canonical alias map. Key = alias node ID (to be merged / deleted).
 * Value = canonical node ID (the surviving node that inherits the alias's edges).
 *
 * Verified against `ai/graph/identityRoots.mjs` IDENTITIES array at script-authoring
 * time. If `identityRoots.mjs` gains new canonical identities in the future, this map
 * may need extension for any corresponding legacy aliases.
 */
const ALIAS_MAP = {
    '@opus'  : '@neo-opus-ada',
    '@gemini': '@neo-gemini-pro'
};

/**
 * Test-fixture nodes that leaked into production SQLite from unit test runs
 * before the isolation boundary was hardened. These represent no real agent
 * and should not exist in the live graph. Purging them cascades to any
 * remaining orphan edges via the SQLite FK constraint (`ON DELETE CASCADE`).
 */
const PURGE_NODES = ['AGENT:alice', 'AGENT:bob', 'AGENT:charlie'];

function parseArgs(argv) {
    const args = {apply: false, db: null, help: false};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply')       args.apply = true;
        else if (a === '--help')   args.help = true;
        else if (a === '--db')     args.db = argv[++i];
        else {
            console.error(`Unknown argument: ${a}`);
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
Usage: node ai/scripts/migrations/normalizeGraphIdentities.mjs [options]

Options:
  (no flags)     Dry-run mode — print the migration plan without committing
  --apply        Commit the migration atomically in a single transaction
  --db <path>    Override SQLite file path (default: .neo-ai-data/sqlite/memory-core-graph.sqlite)
  --help         Print this usage message

What it does:
  1. Merge \`@opus\` → \`@neo-opus-ada\` (rewrite edges, delete alias node)
  2. Merge \`@gemini\` → \`@neo-gemini-pro\` (rewrite edges, delete alias node)
  3. Purge \`AGENT:alice\` + \`AGENT:bob\` (test-fixture leakage, cascade-delete edges)

After \`--apply\`, restart all MCP harnesses so their in-memory cache picks up the
clean graph state. Long-running processes started before \`--apply\` will have stale
references to the deleted alias nodes until they restart.
`);
}

/**
 * Core migration routine. Reads current state, plans rewrites + deletions, optionally
 * applies them inside an atomic transaction.
 *
 * @param {Object} db — open SQLite connection
 * @param {Boolean} apply — when true, commit the migration; when false, dry-run only
 * @returns {{edgesRewritten: Number, edgesDropped: Number, nodesDeleted: Number, duplicateCollisions: Number, skipped: String[]}}
 */
function runMigration(db, apply) {
    const stats = {
        edgesRewritten     : 0,
        edgesDropped       : 0,
        nodesDeleted       : 0,
        duplicateCollisions: 0,
        skipped            : []
    };

    const work = () => {
        // --- Phase 1: alias merge ---
        for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
            const canonicalRow = db.prepare('SELECT id FROM Nodes WHERE id = ?').get(canonical);
            if (!canonicalRow) {
                console.warn(`  [SKIP] canonical node ${canonical} missing — cannot merge ${alias}`);
                stats.skipped.push(`canonical-missing:${canonical}`);
                continue;
            }

            const aliasRow = db.prepare('SELECT id FROM Nodes WHERE id = ?').get(alias);
            if (!aliasRow) {
                console.log(`  [NO-OP] ${alias} already purged (idempotent)`);
                stats.skipped.push(`alias-absent:${alias}`);
                continue;
            }

            const aliasEdges = db.prepare(
                'SELECT id, source, target, type FROM Edges WHERE source = ? OR target = ?'
            ).all(alias, alias);

            console.log(`  [MERGE] ${alias} → ${canonical}: ${aliasEdges.length} edge(s) to process`);

            for (const edge of aliasEdges) {
                const newSource = edge.source === alias ? canonical : edge.source;
                const newTarget = edge.target === alias ? canonical : edge.target;

                const duplicate = db.prepare(
                    'SELECT id FROM Edges WHERE source = ? AND target = ? AND type = ? AND id != ?'
                ).get(newSource, newTarget, edge.type, edge.id);

                if (duplicate) {
                    console.log(`    [DROP]  edge ${edge.id.slice(0, 8)} (${edge.type}): duplicate of ${duplicate.id.slice(0, 8)}`);
                    if (apply) {
                        db.prepare('DELETE FROM Edges WHERE id = ?').run(edge.id);
                    }
                    stats.edgesDropped++;
                    stats.duplicateCollisions++;
                } else {
                    console.log(`    [REWRITE] edge ${edge.id.slice(0, 8)} (${edge.type}): ${edge.source} → ${newSource}, ${edge.target} → ${newTarget}`);
                    if (apply) {
                        db.prepare('UPDATE Edges SET source = ?, target = ? WHERE id = ?').run(newSource, newTarget, edge.id);
                    }
                    stats.edgesRewritten++;
                }
            }

            console.log(`    [DELETE] alias node ${alias}`);
            if (apply) {
                db.prepare('DELETE FROM Nodes WHERE id = ?').run(alias);
            }
            stats.nodesDeleted++;
        }

        // --- Phase 2: test-fixture purge ---
        for (const nodeId of PURGE_NODES) {
            const row = db.prepare('SELECT id FROM Nodes WHERE id = ?').get(nodeId);
            if (!row) {
                console.log(`  [NO-OP] ${nodeId} already purged (idempotent)`);
                stats.skipped.push(`purge-absent:${nodeId}`);
                continue;
            }

            const edgeCount = db.prepare(
                'SELECT COUNT(*) AS c FROM Edges WHERE source = ? OR target = ?'
            ).get(nodeId, nodeId).c;

            console.log(`  [PURGE] ${nodeId}: deleting node (cascades to ${edgeCount} edge(s))`);
            if (apply) {
                db.prepare('DELETE FROM Nodes WHERE id = ?').run(nodeId);
            }
            stats.nodesDeleted++;
        }
    };

    if (apply) {
        const transaction = db.transaction(work);
        transaction();
    } else {
        work();
    }

    return stats;
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        process.exit(0);
    }

    const dbPath = args.db || path.resolve(neoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
    console.log(`[normalizeGraphIdentities] target: ${dbPath}`);
    console.log(`[normalizeGraphIdentities] mode:   ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log();

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, {verbose: null});

    try {
        const stats = runMigration(db, args.apply);

        console.log();
        console.log(`[normalizeGraphIdentities] summary:`);
        console.log(`  edges rewritten:       ${stats.edgesRewritten}`);
        console.log(`  edges dropped (dupes): ${stats.edgesDropped}`);
        console.log(`  nodes deleted:         ${stats.nodesDeleted}`);
        console.log(`  duplicate collisions:  ${stats.duplicateCollisions}`);
        console.log(`  skipped (no-ops):      ${stats.skipped.length}`);

        if (!args.apply) {
            console.log();
            console.log(`[normalizeGraphIdentities] DRY-RUN complete. No changes applied.`);
            console.log(`[normalizeGraphIdentities] Re-run with --apply to commit.`);
        } else {
            console.log();
            console.log(`[normalizeGraphIdentities] APPLY complete. Migration committed.`);
            console.log(`[normalizeGraphIdentities] Restart all MCP harnesses to pick up clean graph state.`);
        }
    } finally {
        db.close();
    }
}

main().catch(err => {
    console.error('[normalizeGraphIdentities] FATAL:', err);
    process.exit(1);
});
