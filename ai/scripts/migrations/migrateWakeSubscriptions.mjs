#!/usr/bin/env node
/**
 * @summary One-shot migration script that patches legacy bridge-daemon wake subscriptions
 * to eliminate hardcoded fallbacks and adopt identity-template-based route metadata.
 *
 * Legacy `bridge-daemon` wake subscriptions can contain hardcoded or stale
 * route metadata when they were not seeded from the owning identity. This
 * script updates existing `WAKE_SUBSCRIPTION` nodes by pulling the canonical
 * explicit metadata from `identityRoots.mjs`, with the durable `AgentIdentity`
 * row as a fallback for out-of-tree identities.
 *
 * **Usage**:
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs             # dry-run (default)
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --apply     # commit the migration
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --db <path> # override SQLite path
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --help      # print usage
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {IDENTITIES} from '../../graph/identityRoots.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');

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
Usage: node ai/scripts/migrations/migrateWakeSubscriptions.mjs [options]

Options:
  (no flags)     Dry-run mode — print the migration plan without committing
  --apply        Commit the migration atomically in a single transaction
  --db <path>    Override SQLite file path (default: .neo-ai-data/sqlite/memory-core-graph.sqlite)
  --help         Print this usage message
`);
}

/**
 * @summary Resolves the canonical wake route template for an AgentIdentity.
 *
 * `identityRoots.mjs` is the source of truth for first-party Neo identities; the durable graph row
 * remains a fallback for local or out-of-tree identities that are not part of the committed roster.
 *
 * @param {String} agentId AgentIdentity node id.
 * @param {Object} agentData Parsed durable AgentIdentity graph node.
 * @returns {Object|undefined} Subscription template.
 */
function resolveSubscriptionTemplate(agentId, agentData) {
    const sourceIdentity = IDENTITIES.find(identity => identity.id === agentId),
          sourceTemplate = sourceIdentity?.properties?.subscriptionTemplate;

    return sourceTemplate || agentData.properties?.subscriptionTemplate;
}

export function runMigration(db, apply) {
    const stats = {
        subscriptionsPatched: 0,
        subscriptionsSkipped: 0
    };

    const work = () => {
        // Find all WAKE_SUBSCRIPTION nodes
        const subs = db.prepare(`SELECT id, data FROM Nodes WHERE json_extract(data, '$.label') = ?`).all('WAKE_SUBSCRIPTION');

        for (const sub of subs) {
            let data;
            try {
                data = JSON.parse(sub.data);
            } catch (e) {
                console.warn(`  [SKIP] Invalid JSON in subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            const props = data.properties || {};
            if (props.harnessTarget !== 'bridge-daemon') {
                stats.subscriptionsSkipped++;
                continue;
            }

            const agentId = props.agentIdentity;
            if (!agentId) {
                stats.subscriptionsSkipped++;
                continue;
            }

            // Get owner AgentIdentity
            const agentRow = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(agentId);
            if (!agentRow) {
                console.warn(`  [SKIP] Owner ${agentId} missing for subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            let agentData;
            try {
                agentData = JSON.parse(agentRow.data);
            } catch (e) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const template = resolveSubscriptionTemplate(agentId, agentData);
            if (!template || !template.harnessTargetMetadata || !template.harnessTargetMetadata.appName) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const expectedMetadata = template.harnessTargetMetadata,
                  currentMetadata  = props.harnessTargetMetadata || {},
                  metadataPatch    = {};

            for (const [key, value] of Object.entries(expectedMetadata)) {
                if (currentMetadata[key] !== value) {
                    metadataPatch[key] = value;
                }
            }

            if (Object.keys(metadataPatch).length > 0) {
                const delta = Object.entries(metadataPatch)
                    .map(([key, value]) => `${key}: ${currentMetadata[key] !== undefined ? currentMetadata[key] : 'none'} → ${value !== undefined ? value : 'none'}`)
                    .join(', ');

                console.log(`  [PATCH] Subscription ${sub.id} (Owner: ${agentId}) | ${delta}`);

                if (apply) {
                    props.harnessTargetMetadata = {
                        ...currentMetadata,
                        ...metadataPatch
                    };
                    data.properties = props;

                    db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(data), sub.id);
                }
                stats.subscriptionsPatched++;
            } else {
                stats.subscriptionsSkipped++;
            }
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
    console.log(`[migrateWakeSubscriptions] target: ${dbPath}`);
    console.log(`[migrateWakeSubscriptions] mode:   ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log();

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, {verbose: null});

    try {
        const stats = runMigration(db, args.apply);

        console.log();
        console.log(`[migrateWakeSubscriptions] summary:`);
        console.log(`  subscriptions patched: ${stats.subscriptionsPatched}`);
        console.log(`  subscriptions skipped: ${stats.subscriptionsSkipped}`);

        if (!args.apply) {
            console.log();
            console.log(`[migrateWakeSubscriptions] DRY-RUN complete. No changes applied.`);
            console.log(`[migrateWakeSubscriptions] Re-run with --apply to commit.`);
        } else {
            console.log();
            console.log(`[migrateWakeSubscriptions] APPLY complete. Migration committed.`);
        }
    } finally {
        db.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[migrateWakeSubscriptions] FATAL:', err);
        process.exit(1);
    });
}
